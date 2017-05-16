import 'source-map-support/register';
import * as ms from 'ms';
import * as uuid from 'uuid';
import { setTimeout, clearTimeout } from 'timers';
import { RedisClient } from 'redis';
import { promisifyAll } from 'bluebird';
import { ScriptHelper } from './script-helper';

export interface Handler {
  (arg: any): Promise<void>;
}

export interface HATimerOptions {
  queue: string;
  queueSplitCount?: number;
  pullCount?: number;
  idlePullDelay?: number;
}

export class HATimer {
  private redisClient: RedisClient;
  private sliceLua: ScriptHelper;
  private pullTimerId: NodeJS.Timer;
  private handlersMap: {[event: string]: Handler[]} = {};
  private opts: HATimerOptions;
  private installed: boolean = false;

  constructor({
    queue,
    queueSplitCount = 1,
    pullCount = 64,
    idlePullDelay = 1000
  }: HATimerOptions) {
    this.opts = {
      queue,
      queueSplitCount: Math.max(1, queueSplitCount),
      pullCount,
      idlePullDelay
    };
  }

  install(redisClient: RedisClient): void {
    // TODO: Use logger
    // console.log('Installed');
    this.redisClient = promisifyAll(redisClient);
    this.sliceLua = new ScriptHelper({
      luaPath: `${__dirname}/../lua/slice.lua`,
      redisClient: this.redisClient
    });
    this.installed = true;
    this.setTimerLoop();
  }

  uninstall(): void {
    // TODO: Use logger
    // console.log('Uninstalled');
    this.installed = false;
    clearTimeout(this.pullTimerId);
  }

  private async setTimerLoop(): Promise<void> {
    let pullCount;
    try {
      pullCount = await this.pullAndDispatch();
    } catch (e) {

      // TODO: handle this
      // TODO: Use logger
      // console.log(e);
    }
    if (!this.installed) return;
    this.pullTimerId = setTimeout(() => this.setTimerLoop(), this.opts.idlePullDelay as number);
  }

  private getQueueKey(index: number) {
    return `${this.opts.queue}:${index}`;
  }

  private getHashedQueueKey(id: string): string {
    const queueIndex = parseInt(id.slice(0, 8), 16) % (this.opts.queueSplitCount || 1);
    return this.getQueueKey(queueIndex);
  }

  private async getNextQueue(): Promise<string> {
    let queueIndex = 0;
    if (this.opts.queueSplitCount && this.opts.queueSplitCount > 1) {
      const seq = await this.redisClient.incrAsync(`${this.opts.queue}:seq`);
      queueIndex = seq % this.opts.queueSplitCount;
    }
    return this.getQueueKey(queueIndex);
  }

  private getMessageKey(id: string): string {
    return `${this.opts.queue}:msg:${id}`
  }

  async addEvent(event: string, arg: any, delay: number | string): Promise<string> {
    if (typeof delay === 'string') {
      delay = ms(delay) as number;
    }

    if (isNaN(delay)) {
      throw new Error('Delay is invalid');
    }

    const emittedAt = Date.now() + delay;
    const id = uuid();
    const payload = JSON.stringify({event, arg});
    await this.redisClient.setAsync(this.getMessageKey(id), payload);
    await this.redisClient.zaddAsync(this.getHashedQueueKey(id), emittedAt, id);

    // TODO: Use logger
    // console.log(`Added event ${id} to ${this.getHashedQueueKey(id)}`);
    return id;
  }

  async removeEvent(id: string): Promise<void> {
    const removedKeyNum = await this.redisClient.zremAsync(this.getHashedQueueKey(id), id);
    if (!removedKeyNum) {

      // TODO: Handle this case
    }

    const removedMsgNum = await this.redisClient.delAsync(this.getMessageKey(id));
    if (!removedMsgNum) {

      // TODO: Handle this case
    }
  }

  registerHandler(event: string, handler: Handler): void {
    const handlers = this.handlersMap[event] = this.handlersMap[event] || [];
    handlers.push(handler);

    // TODO: Use logger
    // console.log(`Registered handler for ${event}`)
  }

  private async pullAndDispatch(): Promise<number> {
    const queueKey = await this.getNextQueue();
    const ids: string[] = await this.sliceLua.runScript(1, queueKey, Date.now(),
      this.opts.pullCount);

    // TODO: Use logger
    // ids.length && console.log(`Pulled events ${ids} from ${queueKey}`);
    await Promise.all(ids.map(async id => {
      const payload = await this.redisClient.getAsync(this.getMessageKey(id));
      if (!payload) {

        // TODO: Need warning
        // console.warn(`payload is ${payload}`);
        return;
      }

      await this.redisClient.delAsync(this.getMessageKey(id));
      const data = JSON.parse(payload);
      const handlers = this.handlersMap[data.event];
      if (!handlers) {

        // FIXME: Messages are thrown away.
        // console.warn(`no handlers`);
        return;
      }

      // TODO: Enable user to set custom handler
      await Promise.all(handlers.map(handler => handler(data.arg)))
    }));
    return ids.length;
  }
}

import 'source-map-support/register';
import { RedisClient } from 'redis';
import * as ms from 'ms';
import * as uuid from 'node-uuid';

export interface Handler {
  (arg: any): Promise<void>;
}

export class HATimer {
  private fetchTimer: NodeJS.Timer;
  private key: string = 'test-queue';
  private handlersMap: {[event: string]: Handler[]} = {};

  constructor(private redisClient: RedisClient) {
  }

  private messageKey(id: string): string {
    return `${this.key}:msg:${id}`
  };

  install(): void {
    this.fetchTimer = setInterval(() => {
      this.fetchAndDispatch();
    }, 100);
  }

  uninstall(): void {
    clearInterval(this.fetchTimer);
  }

  async addEvent(event: string, arg: any, delay: number | string): Promise<string> {
    if (typeof delay === 'string') {
      delay = ms(delay) as number;
    }

    if (isNaN(delay)) {
      // TODO: make own error type
      throw new Error('Delay is invalid');
    }

    const emittedAt = Date.now() + delay;
    const id = uuid();
    const payload = JSON.stringify({event, arg});
    await this.redisClient.setAsync(this.messageKey(id), payload);
    await this.redisClient.zaddAsync(this.key, emittedAt, id);
    return id;
  }

  async removeEvent(id: string): Promise<void> {
    const removedKeyNum = await this.redisClient.zremAsync(this.key, id);
    if (!removedKeyNum) {
      // TODO: handle this case
    }

    const removedMsgNum = await this.redisClient.delAsync(this.messageKey(id));
    if (!removedMsgNum) {
      // TODO: handle this case
    }
  }

  registerHandler(event: string, handler: Handler): void {
    const handlers = this.handlersMap[event] = this.handlersMap[event] || [];
    handlers.push(handler);
  }

  private async fetchAndDispatch(): Promise<void> {
    // TODO: zrange and zremrange should be atomic
    const ids = await this.redisClient.zrangebyscoreAsync(this.key, '-inf', Date.now(),
      'limit', 0, 100);
    await this.redisClient.zremrangebyrankAsync(this.key, 0, ids.length);
    await Promise.all(ids.map(async id => {
      const payload = await this.redisClient.getAsync(this.messageKey(id));
      if (!payload) {
        return;
      }

      await this.redisClient.delAsync(this.messageKey(id));
      const data = JSON.parse(payload);
      const handlers = this.handlersMap[data.event];
      if (!handlers) {
        // FIXME: Messages are thrown away.
        return;
      }

      await Promise.all(handlers.map(handler => handler(data.arg)))
    }));
  }
}

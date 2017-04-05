import { RedisClient } from 'redis';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

export class ScriptHelper {
  private redisClient: RedisClient;
  private lua: string;
  private hash: string;

  constructor({luaPath, redisClient}: {
    luaPath: string;
    redisClient: RedisClient;
  }) {
    this.lua = readFileSync(luaPath, {encoding: 'utf8'});
    this.generateHash();
    this.redisClient = redisClient;
  }

  private generateHash(): void {
    this.hash = createHash('sha1')
      .update(this.lua)
      .digest('hex');
  }

  async runScript(...args: any[]): Promise<any> {
    let result;
    try {
      result = await this.redisClient.evalshaAsync(this.hash, ...args);
    } catch (e) {
      if (/NOSCRIPT/.test(e.message)) {
        result = await this.redisClient.eval(this.lua, ...args);
      } else {
        throw e;
      }
    }
    return result;
  }
}
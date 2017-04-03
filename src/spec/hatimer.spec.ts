import * as fakeRedis from 'fakeredis';
import { promisifyAll, delay } from 'bluebird';
import { HATimer } from '../index';

function asyncHelper(assertion: () => Promise<void>): (done) => void {
  return done => assertion().then(done, done.fail);
}

describe('HATimer', () => {
  const redisClient = promisifyAll(fakeRedis).createClient(null, null, {fast: true});
  let timer: HATimer;

  beforeEach(() => {
    timer = new HATimer({
      redisClient, 
      queue: 'test',
      idlePullDelay: 10
    });
    timer.install();

    // Fakeredis doesn't support evalsha. Fake code below imitates slice.lua
    spyOn(redisClient, 'evalshaAsync').and.callFake(async (hash, numKey, key, current, count) => {
      // If zcard is not invoked, zrangebyscore would fail. This could be a bug of fakeredis.  
      await redisClient.zcardAsync(key);
      const ids = await redisClient.zrangebyscoreAsync(key, '-inf', current, 'limit', 0, count);
      await redisClient.zremrangebyrankAsync(key, 0, ids.length);
      return ids;
    });
  });

  afterEach(asyncHelper(async () => {
    timer.uninstall();
    await redisClient.flushdbAsync();
  }));

  it('should deliver an event', asyncHelper(async () => {
    const arg = {bar: 1};
    const spy = jasmine.createSpy('handler');
    timer.registerHandler('foo', spy);
    await timer.addEvent('foo', arg, 0);
    await delay(50);
    expect(spy).toHaveBeenCalledWith(arg);
  }));

  it('should not deliver a same event more than twice', asyncHelper(async () => {
    const spy = jasmine.createSpy('handler');
    timer.registerHandler('foo', spy);
    await timer.addEvent('foo', null, 0);
    await delay(50);
    expect(spy).toHaveBeenCalledTimes(1);
  }));

  it('should recognize a string format delay', asyncHelper(async () => {
    const spy = jasmine.createSpy('handler');
    timer.registerHandler('foo', spy);
    await timer.addEvent('foo', null, '0s');
    await delay(50);
    expect(spy).toHaveBeenCalled();
  }));

  it('should remove an event', asyncHelper(async () => {
    const spy = jasmine.createSpy('handler');
    timer.registerHandler('foo', spy);
    const id = await timer.addEvent('foo', null, 50);
    await timer.removeEvent(id);
    await delay(50);
    expect(spy).not.toHaveBeenCalled();
  }));
});

describe('HATimer Queue Split', () => {
  const redisClient = promisifyAll(fakeRedis).createClient(null, null, {fast: true});
  let timer: HATimer;

  beforeEach(() => {
    timer = new HATimer({
      redisClient, 
      queue: 'test',
      queueSplitCount: 8,
      idlePullDelay: 10
    });
    timer.install();

    // Fakeredis doesn't support evalsha. Fake code below imitates slice.lua
    spyOn(redisClient, 'evalshaAsync').and.callFake(async (hash, numKey, key, current, count) => {
      // If zcard is not invoked, zrangebyscore would fail. This could be a bug of fakeredis.  
      await redisClient.zcardAsync(key);
      const ids = await redisClient.zrangebyscoreAsync(key, '-inf', current, 'limit', 0, count);
      await redisClient.zremrangebyrankAsync(key, 0, ids.length);
      return ids;
    });
  });

  afterEach(asyncHelper(async () => {
    timer.uninstall();
    await redisClient.flushdbAsync();
  }));

  it('should deliver an event', asyncHelper(async () => {
    const arg = {bar: 1};
    const spy = jasmine.createSpy('handler');
    timer.registerHandler('foo', spy);
    await timer.addEvent('foo', arg, 0);
    await delay(100);
    expect(spy).toHaveBeenCalledWith(arg);
  }));
});

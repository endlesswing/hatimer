import * as fakeRedis from 'fakeredis';
import { promisifyAll, delay } from 'bluebird';
import { HATimer } from '../index';

function asyncHelper(assertion: () => Promise<void>): (done) => void {
  return done => assertion().then(done, done.fail);
}

describe('HATimer', () => {
  const redisMock: any = promisifyAll(fakeRedis);
  let timer: HATimer;

  beforeEach(() => {
    timer = new HATimer(redisMock.createClient());
    timer.install();
  });

  afterEach(() => {
    timer.uninstall();
  });

  it('should deliver an event', asyncHelper(async () => {
    const arg = {bar: 1};
    await timer.addEvent('foo', arg, 1);
    await new Promise(resolve => {
      timer.registerHandler('foo', async o => {
        expect(o).toEqual(arg);
        resolve();
      });
    });
  }));

  it('should not deliver a same event more than twice', asyncHelper(async () => {
    const spy = jasmine.createSpy('handler');
    await timer.addEvent('foo', null, 1);
    timer.registerHandler('foo', spy);
    await delay(250);
    expect(spy).toHaveBeenCalledTimes(1);
  }));

  it('should recognize a string format delay', asyncHelper(async () => {
    const spy = jasmine.createSpy('handler');
    await timer.addEvent('foo', null, '0.01s');
    timer.registerHandler('foo', spy);
    await delay(200);
    expect(spy).toHaveBeenCalled();
  }));

  it('should remove an event', asyncHelper(async () => {
    const spy = jasmine.createSpy('handler');
    const id = await timer.addEvent('foo', null, 1);
    await timer.removeEvent(id);
    timer.registerHandler('foo', spy);
    await delay(200);
    expect(spy).not.toHaveBeenCalled();
  }));
});

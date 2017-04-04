export function asyncHelper(assertion: () => Promise<void>): (done) => void {
  return done => assertion().then(done, done.fail);
}
'use strict';

const childProcess = require('child_process');
const gulp = require('gulp');
const jasmine = require('gulp-jasmine');
const istanbul = require('gulp-istanbul');
const remapIstanbul = require('remap-istanbul/lib/gulpRemapIstanbul');
const jasmineConsoleReporter = require('jasmine-console-reporter');

function compileTypescript(done) {
  childProcess.exec('tsc -p ' + process.cwd(), (err, stdout, stderr) => {
    err && console.error(err);
    console.log(stdout.toString());
    console.error(stderr.toString());
    done(err);
  });
}

function compileTypescriptQuietly(done) {
  childProcess.exec('tsc -p ' + process.cwd() + ' --noEmitOnError', (err, stdout, stderr) => {
    stdout && console.log(stdout.toString());
    stderr && console.error(stderr.toString());
    done();
  });
}

function watch() {
  gulp.watch(['./src/**/*.ts'], ['build-quietly']);
}

function clean(done) {
  var del = require('del');
  del(['./dist', './node_modules'], done);
}

function runTest() {
  gulp.src('./dist/spec/*.js')
    .pipe(jasmine({
      reporter: new jasmineConsoleReporter({
        colors: 1,
        cleanStack: 1,
        verbosity: 4,
        listStyle: 'indent',
        activity: false
      })
    }));
}

function testLoop() {
  gulp.watch('./src/**/*.ts', ['run-test']);
}

function preIstanbulTask() {
  return gulp.src(['dist/**/*.js'])
    .pipe(istanbul())
    .pipe(istanbul.hookRequire());
}

function istanbulTask() {
  return gulp.src(['dist/spec/*.js'])
    .pipe(jasmine())
    .pipe(istanbul.writeReports());
}

function remapIstanbulTask() {
  return gulp.src('coverage/coverage-final.json')
    .pipe(remapIstanbul({
      reports: {
        html: 'coverage/remap-report',
        'lcovonly': 'coverage/lcov-remap.info'
      }
    }));
}

gulp.task('build', compileTypescript);
gulp.task('build-quietly', compileTypescriptQuietly);
gulp.task('watch', ['build-quietly'], watch);
gulp.task('clean', clean);
gulp.task('run-test', ['build'], runTest);
gulp.task('test-loop', testLoop);
gulp.task('pre-coverage', ['build'], preIstanbulTask);
gulp.task('coverage-js', ['pre-coverage'], istanbulTask);
gulp.task('coverage', ['coverage-js'], remapIstanbulTask);
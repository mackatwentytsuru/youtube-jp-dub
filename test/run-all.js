/**
 * run-all.js — 全テストを順に実行する
 *
 * 実行: node test/run-all.js
 *
 * 各テストはグローバル（self / document / Date.now）を差し替えるため、
 * 干渉を避けて別プロセスで実行する。
 */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const tests = ['rate-estimator.test.js', 'captions.test.js', 'scheduler.test.js'];

let failed = 0;
for (const t of tests) {
  console.log('\n========== ' + t + ' ==========');
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, t)], {
      encoding: 'utf8',
    });
    process.stdout.write(out);
  } catch (e) {
    if (e.stdout) process.stdout.write(e.stdout);
    failed += 1;
  }
}

console.log('\n==============================');
console.log(failed === 0 ? 'ALL TEST FILES PASSED' : failed + ' TEST FILE(S) FAILED');
process.exit(failed > 0 ? 1 : 0);

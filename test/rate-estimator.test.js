/**
 * rate-estimator.test.js — 速度見積りロジックを検証する
 *
 * 実行: node test/rate-estimator.test.js
 */
'use strict';
global.self = global;
require('../src/content/rate-estimator.js');
const re = self.YJD.rateEstimator;

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) {
    pass += 1;
    console.log('  OK   ' + label);
  } else {
    fail += 1;
    console.log('  FAIL ' + label + (detail ? '  -> ' + detail : ''));
  }
}
const near = (a, b) => Math.abs(a - b) < 0.02;

// --- estimateDurationMs ---------------------------------------------------
(function duration() {
  console.log('[1] estimateDurationMs');
  // 70字 ÷ 7cps ＝ 10秒（rate 1.0）
  check('70字/rate1.0 ≈ 10000ms', near(re.estimateDurationMs('あ'.repeat(70), 1.0), 10000), re.estimateDurationMs('あ'.repeat(70), 1.0));
  // rate 2.0 で半分
  check('rate2.0 で半分', near(re.estimateDurationMs('あ'.repeat(70), 2.0), 5000), re.estimateDurationMs('あ'.repeat(70), 2.0));
})();

// --- computeRate ----------------------------------------------------------
(function compute() {
  console.log('[2] computeRate');
  // 枠なし(null) → 手動速度のまま
  check('windowMs=null → 手動速度', re.computeRate({ text: 'あ'.repeat(20), windowMs: null, manualRate: 1.3 }).rate === 1.3);
  // 枠 0 → 大幅遅延 → 最高速
  check('windowMs=0 → 最高速5.0', re.computeRate({ text: 'あ'.repeat(20), windowMs: 0, manualRate: 1.1 }).rate === 5.0);
  // 枠 マイナス（追いつき制御で遅延済み）→ 最高速
  check('windowMs<0 → 最高速5.0', re.computeRate({ text: 'あ'.repeat(20), windowMs: -4000, manualRate: 1.1 }).rate === 5.0);
  // 短文・広い枠 → 速くする必要なし → 手動速度（下限）
  check('短文/広い枠 → 手動速度(下限)', near(re.computeRate({ text: 'あ'.repeat(5), windowMs: 8000, manualRate: 1.1 }).rate, 1.1));
  // 長文・狭い枠 → 上限5.0に張り付く
  check('長文/狭い枠 → 上限5.0', near(re.computeRate({ text: 'あ'.repeat(100), windowMs: 2500, manualRate: 1.1 }).rate, 5.0));
  // 中程度 → 手動と上限の間
  const mid = re.computeRate({ text: 'あ'.repeat(20), windowMs: 2500, manualRate: 1.1 }).rate;
  check('中程度 → 1.1〜5.0の間', mid > 1.1 && mid < 5.0, 'rate=' + mid);
  // expectedMs は確定rateでの所要時間（正の値）
  check('expectedMs が正', re.computeRate({ text: 'あ'.repeat(40), windowMs: 2000, manualRate: 1.1 }).expectedMs > 0);
})();

console.log('');
console.log('rate-estimator: pass=' + pass + ' fail=' + fail);
process.exit(fail > 0 ? 1 : 0);

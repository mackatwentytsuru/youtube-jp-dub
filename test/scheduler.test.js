/**
 * scheduler.test.js — ダッキングの待ち行列・追いつき速度制御を検証する
 *
 * 実行: node test/scheduler.test.js
 */
'use strict';
const h = require('./scheduler-harness');

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
const SHORT = 'あ'.repeat(10);
const LONG = 'あ'.repeat(80);

// --- 1. 割り込みで読み上げを切らない（バグ②） ---------------------------
(function noMidSentenceCancel() {
  console.log('[1] 割り込みで読み上げを切らない');
  h.reset();
  h.emit('文Aです。', 3000); // 即読み上げ開始
  h.emit('文Bです。', 3000); // 読み上げ中に到着 → 待ち行列へ
  h.emit('文Cです。', 3000);
  check('まだ文Aだけ読まれている', h.ttsCalls.length === 1, 'calls=' + h.ttsCalls.length);
  check('割り込みでcancelしていない', h.cancelCount === 0, 'cancel=' + h.cancelCount);
  check('読み上げ中の文はA', h.ttsCalls[0].text === '文Aです。');
  h.endSpeech(); // A 完了 → B へ
  check('A完了後にBが読まれる', h.ttsCalls[1] && h.ttsCalls[1].text === '文Bです。');
  h.endSpeech(); // B 完了 → C へ
  check('B完了後にCが読まれる', h.ttsCalls[2] && h.ttsCalls[2].text === '文Cです。');
  check('全文が順番通り', h.ttsCalls.map((c) => c.text).join('|') === '文Aです。|文Bです。|文Cです。');
})();

// --- 2. キューが空になったら停止する -------------------------------------
(function drains() {
  console.log('[2] キューの完走と停止');
  h.reset();
  h.emit('一。', 3000);
  h.endSpeech();
  h.endSpeech(); // 余分な完了通知（キュー空）でも壊れない
  check('1文だけ読まれた', h.ttsCalls.length === 1, 'calls=' + h.ttsCalls.length);
  check('読み上げは停止状態', h.speaking === false);
  h.emit('二。', 3000); // 空キューに再投入 → すぐ読まれる
  check('再投入で読み上げ再開', h.ttsCalls.length === 2 && h.ttsCalls[1].text === '二。');
})();

// --- 3. 追いつき速度制御（バグ③） ---------------------------------------
(function catchUp() {
  console.log('[3] 遅れたら速度が上がる（追いつき制御）');
  h.reset();
  h.emit(LONG, 3000); // A: 即開始、lag≈0
  h.emit(LONG, 3000); // B: 待ち行列へ（enqueuedAt=0）
  const rateA = h.ttsCalls[0].rate;
  h.advance(9000); // A の読み上げに9秒かかったとする
  h.endSpeech(); // A 完了 → B。B の lag=9000、枠3000 → 大幅遅延
  const rateB = h.ttsCalls[1].rate;
  check('Aは通常〜中速', rateA < 5.0, 'rateA=' + rateA);
  check('Bは遅延ぶん速くなる(>A)', rateB > rateA, 'rateA=' + rateA + ' rateB=' + rateB);
  check('Bは最高速5.0に張り付く', Math.abs(rateB - 5.0) < 0.01, 'rateB=' + rateB);
})();

// --- 4. 短い字幕は速くしない（速くするだけ＝下限は手動速度） --------------
(function shortStaysManual() {
  console.log('[4] 短い字幕は基準速度のまま');
  h.reset({ rate: 1.2 });
  h.emit(SHORT, 6000); // 短文・広い枠 → 速くする必要なし
  check('基準速度1.2のまま', Math.abs(h.ttsCalls[0].rate - 1.2) < 0.01, 'rate=' + h.ttsCalls[0].rate);
})();

// --- 5. 大幅に遅れた古い文は読み飛ばす（安全弁） -------------------------
(function staleDrop() {
  console.log('[5] 大幅遅延した古い文の読み飛ばし');
  h.reset();
  h.emit('先頭。', 3000); // A: 即開始
  h.emit('古い文1。', 3000); // enqueuedAt=0
  h.emit('古い文2。', 3000); // enqueuedAt=0
  h.emit('最新。', 3000); // enqueuedAt=0
  h.advance(20000); // 20秒経過（MAX_QUEUE_LAG=15秒を超過）
  h.endSpeech(); // A完了 → pump: 15秒超の古い文を捨てて最新へ
  const spoken = h.ttsCalls.map((c) => c.text);
  check('古い文1,2は読み飛ばされた', spoken.indexOf('古い文1。') === -1 && spoken.indexOf('古い文2。') === -1, spoken.join('|'));
  check('最新の文は読まれる', spoken.indexOf('最新。') !== -1, spoken.join('|'));
})();

// --- 6. autoRate OFF なら常に手動速度 ------------------------------------
(function autoOff() {
  console.log('[6] autoRate OFF は手動速度固定');
  h.reset({ autoRate: false, rate: 1.5 });
  h.emit(LONG, 1000); // 長文・狭い枠でも…
  h.emit(LONG, 1000);
  h.advance(9000);
  h.endSpeech();
  check('1文目は手動速度1.5', Math.abs(h.ttsCalls[0].rate - 1.5) < 0.01, 'rate=' + h.ttsCalls[0].rate);
  check('2文目も手動速度1.5(遅延でも上げない)', Math.abs(h.ttsCalls[1].rate - 1.5) < 0.01, 'rate=' + h.ttsCalls[1].rate);
})();

// --- 7. pause方式は従来どおり1文ずつ ------------------------------------
(function pauseMode() {
  console.log('[7] pause方式');
  h.reset({ mode: 'pause' });
  h.emit('文1。', 3000);
  check('動画が一時停止される', h.video.paused === true);
  check('文1が読まれる', h.ttsCalls[0].text === '文1。');
  check('pauseでは手動速度', Math.abs(h.ttsCalls[0].rate - 1.1) < 0.01, 'rate=' + h.ttsCalls[0].rate);
  h.endSpeech(); // finishPause → 再生再開
  check('読み上げ完了で再生再開', h.video.paused === false);
})();

// --- 8. watchdog 用 expectedMs が渡る ------------------------------------
(function expectedMs() {
  console.log('[8] expectedMs（番犬タイマー用）');
  h.reset();
  h.emit('テスト文です。', 3000);
  check('expectedMs が正の値で渡る', h.ttsCalls[0].expectedMs > 0, 'expectedMs=' + h.ttsCalls[0].expectedMs);
})();

console.log('');
console.log('scheduler: pass=' + pass + ' fail=' + fail);
process.exit(fail > 0 ? 1 : 0);

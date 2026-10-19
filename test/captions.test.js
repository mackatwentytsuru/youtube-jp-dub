/**
 * captions.test.js — captionWatcher の文組み立てを検証する
 *
 * 実行: node test/captions.test.js
 * 依存無し（Node 標準のみ）。失敗があれば終了コード 1。
 */
'use strict';
const h = require('./captions-harness');

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

function texts() {
  return h.delivered.map((d) => d.text);
}

// --- 1. 通常: 行が伸びて句点で完成 → 重複なく1文 -------------------------
(function normalGrowth() {
  console.log('[1] 通常の伸び→句点完成');
  h.reset();
  h.tick(['これは'], 200);
  h.tick(['これはテスト'], 200);
  h.tick(['これはテストです。'], 200);
  // 字幕が消える → 残りを確定
  h.tick([], 200);
  const t = texts();
  check('1文だけ配信される', t.length === 1, JSON.stringify(t));
  check('内容が正しい', t[0] === 'これはテストです。', JSON.stringify(t));
})();

// --- 2. 重複バグ再現: 途中行をデバウンス確定 → さらに伸びる ---------------
(function duplicationRepro() {
  console.log('[2] 途中行のデバウンス確定後に伸びる（重複バグ再現）');
  h.reset();
  // 「これは」で伸びが2秒以上止まる → デバウンスで確定されてしまう
  h.hold(['これは'], 2400);
  // その後さらに伸びて句点完成
  h.tick(['これはテストです。'], 200);
  h.hold(['これはテストです。'], 2400);
  h.tick([], 200);
  const t = texts();
  const joined = t.join('|');
  check(
    '「これは」が二重に含まれない',
    !joined.includes('これはこれは'),
    JSON.stringify(t)
  );
  check(
    '最終的に「これはテストです。」が読まれる',
    joined.includes('これはテストです。') && !joined.includes('これはこれは'),
    JSON.stringify(t)
  );
})();

// --- 3. スクロール: 複数行が押し出される → 各行1回ずつ --------------------
(function scroll() {
  console.log('[3] 行スクロール');
  h.reset();
  h.tick(['第一文。'], 200);
  h.tick(['第一文。', '第二文。'], 200);
  h.tick(['第二文。', '第三文。'], 200);
  h.tick(['第三文。'], 200);
  h.tick([], 200);
  const t = texts();
  check('3文が配信される', t.length === 3, JSON.stringify(t));
  check(
    '各文が1回ずつ・順序通り',
    t[0] === '第一文。' && t[1] === '第二文。' && t[2] === '第三文。',
    JSON.stringify(t)
  );
})();

// --- 4. 1行に複数文 -------------------------------------------------------
(function multiSentence() {
  console.log('[4] 1行に複数文');
  h.reset();
  h.tick(['はい。いいえ。たぶん。'], 200);
  h.tick([], 200);
  const t = texts();
  check('3文に分割される', t.length === 3, JSON.stringify(t));
  check(
    '内容が正しい',
    t[0] === 'はい。' && t[1] === 'いいえ。' && t[2] === 'たぶん。',
    JSON.stringify(t)
  );
})();

// --- 5. 同一字幕の再描画（チラつき）で重複しない --------------------------
(function flicker() {
  console.log('[5] 同一字幕の再描画チラつき');
  h.reset();
  h.tick(['こんにちは。'], 200);
  h.tick([], 200); // 一瞬消える
  h.tick(['こんにちは。'], 200); // 同じ字幕が再描画
  h.tick([], 200);
  const t = texts();
  check('重複せず1文', t.length === 1, JSON.stringify(t));
})();

// --- 6. windowMs メタ: 配信間隔から推定される ----------------------------
(function windowMeta() {
  console.log('[6] windowMs メタの算出');
  h.reset();
  // 文1, 約3秒後 文2, 約3秒後 文3 ... と均等配信
  h.tick(['文一です。'], 200);
  h.hold(['文一です。'], 2800);
  h.tick(['文二ですよ。'], 200);
  h.hold(['文二ですよ。'], 2800);
  h.tick(['文三ですね。'], 200);
  h.hold(['文三ですね。'], 2800);
  h.tick([], 200);
  const d = h.delivered;
  const withWin = d.filter((x) => x.meta && x.meta.windowMs != null);
  check('後続の文に windowMs が付く', withWin.length >= 1, JSON.stringify(d.map((x) => x.meta)));
})();

// --- 結果 -----------------------------------------------------------------
console.log('');
console.log('captions: pass=' + pass + ' fail=' + fail);
process.exit(fail > 0 ? 1 : 0);

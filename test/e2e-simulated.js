/**
 * e2e-simulated.js — 実 Chromium 上で拡張コードを動かす Playwright E2E
 *
 * ライブ YouTube は自動操作ブラウザに字幕本文を配信しない（servable=false）ため、
 * 字幕DOM(.ytp-caption-segment)を擬似注入して captions.js / scheduler.js /
 * tts.js / rate-estimator.js を「実ブラウザ・実タイマー・実 speechSynthesis」で
 * 動かし、報告された3バグの修正を検証する。
 *
 * 実行: node test/e2e-simulated.js   （YJD_HEADLESS=1 でヘッドレス）
 */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS = [
  'src/content/rate-estimator.js',
  'src/content/tts.js',
  'src/content/captions.js',
  'src/content/subtitle-overlay.js',
  'src/content/scheduler.js',
];
const SETTINGS = {
  mode: 'ducking',
  rate: 1.1,
  autoRate: true,
  voiceURI: '',
  duckingVolume: 0.25,
  showSubtitles: true,
  subtitleFontSize: 24,
};

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
function doubledPhrase(s) {
  for (let len = 2; len <= Math.floor(s.length / 2); len++) {
    for (let i = 0; i + 2 * len <= s.length; i++) {
      if (s.substr(i, len) === s.substr(i + len, len)) return s.substr(i, len);
    }
  }
  return null;
}

(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yjd-sim-'));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: process.env.YJD_HEADLESS === '1',
    args: ['--mute-audio'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message ? e.message : e)));

  const fixtureUrl = 'file:///' + path.join(__dirname, 'fixture.html').replace(/\\/g, '/');
  await page.goto(fixtureUrl);
  for (const s of SCRIPTS) {
    await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, s), 'utf8') });
  }

  // 拡張をセットアップ。tts.speak をラップして {text,rate} を記録（実 tts は呼ぶ）。
  async function setupExtension() {
    await page.evaluate((settings) => {
      if (self.YJD && self.YJD.scheduler) self.YJD.scheduler.stop();
      const v = document.querySelector('video');
      try {
        Object.defineProperty(v, 'paused', { get: () => false, configurable: true });
      } catch (e) {
        /* 既に定義済み */
      }
      window.__ttsLog = [];
      if (!self.YJD.tts.__wrapped) {
        const real = self.YJD.tts.speak.bind(self.YJD.tts);
        self.YJD.tts.speak = function (text, opts) {
          window.__ttsLog.push({ text: text, rate: opts && opts.rate });
          return real(text, opts);
        };
        self.YJD.tts.__wrapped = true;
      }
      document.querySelector('.ytp-caption-window-container').innerHTML = '';
      self.YJD.scheduler.setup(v, settings);
      self.YJD.scheduler.start();
    }, SETTINGS);
  }

  // 字幕セグメントを擬似注入する（各文字列が1つの .ytp-caption-segment）。
  function setCaption(lines) {
    return page.evaluate((ls) => {
      const c = document.querySelector('.ytp-caption-window-container');
      c.innerHTML =
        '<div class="caption-window">' +
        ls.map((t) => '<span class="ytp-caption-segment">' + t + '</span>').join('') +
        '</div>';
    }, lines);
  }
  const ttsLog = () => page.evaluate(() => window.__ttsLog.slice());
  const wait = (ms) => page.waitForTimeout(ms);

  console.log('実ブラウザ:', await page.evaluate(() => navigator.userAgent.split(') ').pop()));

  // === シナリオ1: 重複読み（バグ①） ===
  console.log('\n[1] 伸びる字幕のデバウンス確定 → 重複しない');
  await setupExtension();
  await setCaption(['これは']);
  await wait(2700); // 伸び停止 → デバウンス確定
  await setCaption(['これはテストです。']);
  await wait(2700);
  await setCaption([]); // 字幕消滅
  await wait(1500);
  let log1 = await ttsLog();
  let texts1 = log1.map((x) => x.text);
  console.log('  読み上げ:', JSON.stringify(texts1));
  check('重複読みなし（同一連続なし）', texts1.every((t, i) => i === 0 || t !== texts1[i - 1]), JSON.stringify(texts1));
  check('文内フレーズ二重なし', texts1.every((t) => !doubledPhrase(t)), JSON.stringify(texts1));
  check('「これはテストです。」が読まれた', texts1.indexOf('これはテストです。') !== -1, JSON.stringify(texts1));

  // === シナリオ2: 割り込み非中断＋順番（バグ②） ===
  console.log('\n[2] 連続字幕を待ち行列で順番に最後まで読む');
  await setupExtension();
  // 1行に3文 → captions.js が3文に分割 → 一気に scheduler へ
  await setCaption(['一文目です。二文目です。三文目です。']);
  await wait(400);
  await setCaption([]); // 消滅で確定をフラッシュ
  // 実 tts / 番犬で待ち行列が順に処理されるのを待つ
  let log2 = [];
  for (let i = 0; i < 24; i++) {
    await wait(700);
    log2 = await ttsLog();
    if (log2.length >= 3) break;
  }
  let texts2 = log2.map((x) => x.text);
  console.log('  読み上げ:', JSON.stringify(texts2));
  check('3文すべて読まれた', texts2.length === 3, 'count=' + texts2.length);
  check(
    '順番通り（一→二→三）',
    texts2[0] === '一文目です。' && texts2[1] === '二文目です。' && texts2[2] === '三文目です。',
    JSON.stringify(texts2)
  );
  check('割り込みで文が欠落していない', new Set(texts2).size === texts2.length, JSON.stringify(texts2));

  // === シナリオ3: JSエラーが無いこと ===
  console.log('\n[3] 実行時エラー');
  check('pageerror なし', errors.length === 0, JSON.stringify(errors.slice(0, 5)));

  await ctx.close();
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch (e) {
    /* noop */
  }

  console.log('\ne2e-simulated: pass=' + pass + ' fail=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})();

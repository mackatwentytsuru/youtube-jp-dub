/**
 * e2e-youtube.js — 拡張機能を実 Chromium(同梱) に読み込み、YouTube で動作検証する
 *
 * 実行: node test/e2e-youtube.js [videoURL]
 * 環境変数: YJD_HEADLESS=1 でヘッドレス
 *
 * 広告スキップ・再生確認をしてから、字幕DOM／読み上げオーバーレイを観測する。
 */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EXT_PATH = path.resolve(__dirname, '..');
const VIDEO = process.argv[2] || 'https://www.youtube.com/watch?v=arj7oStGLkU';
const OBSERVE_MS = 45000;
const HEADLESS = process.env.YJD_HEADLESS === '1';

function doubledPhrase(s) {
  for (let len = 2; len <= Math.floor(s.length / 2); len++) {
    for (let i = 0; i + 2 * len <= s.length; i++) {
      if (s.substr(i, len) === s.substr(i + len, len)) return s.substr(i, len);
    }
  }
  return null;
}

/** ページ内の状態をまとめて取得する。 */
function snapshot() {
  const p = document.querySelector('.html5-video-player');
  const v = document.querySelector('video');
  const cont = document.querySelector('.ytp-caption-window-container');
  const segs = cont ? Array.from(cont.querySelectorAll('.ytp-caption-segment')) : [];
  return {
    paused: v ? v.paused : null,
    curT: v ? Number(v.currentTime.toFixed(1)) : null,
    adShowing: !!(p && p.classList.contains('ad-showing')),
    capContainer: !!cont,
    segCount: segs.length,
    segText: segs.map((s) => s.textContent).join(' / '),
    dub: ((document.querySelector('#yjd-subtitle') || {}).textContent || '').trim(),
    status: ((document.querySelector('#yjd-panel .yjd-status') || {}).textContent || '').trim(),
  };
}

(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yjd-e2e-'));
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(userDataDir, {
      headless: HEADLESS,
      viewport: { width: 1280, height: 820 },
      args: [
        '--disable-extensions-except=' + EXT_PATH,
        '--load-extension=' + EXT_PATH,
        '--autoplay-policy=no-user-gesture-required',
        '--mute-audio',
      ],
    });
  } catch (e) {
    console.log('FATAL: ブラウザ起動失敗:', e.message);
    process.exit(2);
  }

  const page = ctx.pages()[0] || (await ctx.newPage());
  const yjdLogs = [];
  const errors = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/YJD|ContinuousLearning/.test(t)) yjdLogs.push(t);
  });
  page.on('pageerror', (e) => errors.push(String(e && e.message ? e.message : e)));

  console.log('1) 動画を開く:', VIDEO);
  await page.goto(VIDEO, { waitUntil: 'domcontentloaded', timeout: 60000 });

  try {
    const consent = page
      .locator('button[aria-label*="Accept"], button:has-text("Accept all"), tp-yt-paper-button:has-text("Accept all")')
      .first();
    if (await consent.isVisible({ timeout: 4000 })) {
      await consent.click();
      console.log('   同意ダイアログを処理');
    }
  } catch (e) {
    /* なし */
  }

  let panelOk = false;
  try {
    await page.waitForSelector('#yjd-panel', { timeout: 45000 });
    panelOk = true;
    console.log('2) 拡張パネル #yjd-panel を確認');
  } catch (e) {
    console.log('2) NG: 拡張パネルが出ない');
  }

  // 再生開始 & 広告スキップ（最大40秒、実コンテンツが2秒以上進むまで）
  console.log('3) 再生開始・広告スキップ待ち…');
  const warmStart = Date.now();
  let playing = false;
  while (Date.now() - warmStart < 40000) {
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) {
        v.muted = true;
        if (v.paused) {
          const pr = v.play();
          if (pr && pr.catch) pr.catch(() => {});
        }
      }
      // 広告スキップボタンを押す
      const skip = document.querySelector(
        '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button'
      );
      if (skip) skip.click();
    });
    const s = await page.evaluate(snapshot);
    if (!s.adShowing && !s.paused && s.curT > 2) {
      playing = true;
      console.log('   再生中（本編 currentTime=' + s.curT + 's）');
      break;
    }
    await page.waitForTimeout(1000);
  }
  if (!playing) console.log('   注意: 本編の再生確認に至らず');

  // autoRate ON
  if (panelOk) {
    try {
      const cb = page.locator('#yjd-panel .yjd-autorate');
      if ((await cb.count()) > 0 && !(await cb.isChecked())) await cb.check();
      console.log('4) 速度の自動調整を ON');
    } catch (e) {
      console.log('4) autoRate トグル失敗:', e.message);
    }
  }

  // 観測
  console.log('5) ' + OBSERVE_MS / 1000 + '秒間 観測中…');
  const dubSeq = [];
  let lastDub = '';
  let maxSeg = 0;
  let sawCaptionDom = false;
  let sampleCaption = '';
  const statusSeq = [];
  const t0 = Date.now();
  let ticks = 0;
  while (Date.now() - t0 < OBSERVE_MS) {
    let s;
    try {
      s = await page.evaluate(snapshot);
    } catch (e) {
      break;
    }
    ticks += 1;
    if (s.capContainer) sawCaptionDom = true;
    if (s.segCount > maxSeg) maxSeg = s.segCount;
    if (s.segText && !sampleCaption) sampleCaption = s.segText;
    if (s.dub && s.dub !== lastDub) {
      dubSeq.push({ t: ((Date.now() - t0) / 1000).toFixed(1), text: s.dub });
      lastDub = s.dub;
    }
    if (s.status && statusSeq[statusSeq.length - 1] !== s.status) statusSeq.push(s.status);
    // 最初の数回は生データを出して切り分ける
    if (ticks <= 6) {
      console.log(
        '   t+' + ((Date.now() - t0) / 1000).toFixed(1) + 's ' + JSON.stringify(s)
      );
    }
    await page.waitForTimeout(700);
  }

  console.log('\n===== 結果 =====');
  console.log('パネル表示       :', panelOk ? 'OK' : 'NG');
  console.log('本編再生         :', playing ? 'OK' : 'NG');
  console.log('字幕DOM(.ytp-caption-window-container) :', sawCaptionDom ? 'あり' : 'なし');
  console.log('字幕セグメント最大数 :', maxSeg);
  console.log('字幕サンプル     :', sampleCaption || '(取得できず)');
  console.log('ステータス遷移   :', JSON.stringify(statusSeq));
  console.log('読み上げ文の数   :', dubSeq.length);
  dubSeq.forEach((d) => console.log('  [' + d.t + 's] ' + d.text));

  let dupConsec = 0;
  let dupPhrase = 0;
  for (let i = 0; i < dubSeq.length; i++) {
    if (i > 0 && dubSeq[i].text === dubSeq[i - 1].text) {
      dupConsec += 1;
      console.log('  ⚠ 連続重複: ' + dubSeq[i].text);
    }
    const ph = doubledPhrase(dubSeq[i].text);
    if (ph) {
      dupPhrase += 1;
      console.log('  ⚠ 文内フレーズ二重("' + ph + '"): ' + dubSeq[i].text);
    }
  }
  console.log('\n--- 判定 ---');
  console.log('連続重複       :', dupConsec === 0 ? 'OK (0件)' : 'NG (' + dupConsec + '件)');
  console.log('文内フレーズ二重:', dupPhrase === 0 ? 'OK (0件)' : '注意 (' + dupPhrase + '件)');
  console.log('JSエラー       :', errors.length === 0 ? 'OK (0件)' : 'NG (' + errors.length + '件)');
  errors.slice(0, 8).forEach((e) => console.log('   ' + e));
  console.log('YJDログ(末尾10):');
  yjdLogs.slice(-10).forEach((l) => console.log('   ' + l));

  await ctx.close();
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch (e) {
    /* noop */
  }

  const ok = panelOk && dupConsec === 0 && errors.length === 0 && dubSeq.length > 0;
  console.log('\n' + (ok ? 'E2E: PASS' : 'E2E: 要確認'));
  process.exit(ok ? 0 : 1);
})();

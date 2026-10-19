/**
 * render.js — ストア用画像の一括生成
 *
 * assets/icon.svg → icons/icon-{16,32,48,128}.png + store/assets/icon-300.png
 * promo.html の各スライド → store/assets/*.png
 *
 * 実行: node store/assets-src/render.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'store', 'assets');
const ICONS = path.join(ROOT, 'icons');

const ICON_SIZES = [
  { size: 16, out: path.join(ICONS, 'icon-16.png') },
  { size: 32, out: path.join(ICONS, 'icon-32.png') },
  { size: 48, out: path.join(ICONS, 'icon-48.png') },
  { size: 128, out: path.join(ICONS, 'icon-128.png') },
  { size: 300, out: path.join(OUT, 'icon-300.png') }, // Edge ストアロゴ用
];

const SLIDES = [
  { slide: 'hero', w: 1280, h: 800, out: 'screenshot-1.png' },
  { slide: 'modes', w: 1280, h: 800, out: 'screenshot-2.png' },
  { slide: 'small', w: 440, h: 280, out: 'promo-small.png' },
  { slide: 'marquee', w: 1400, h: 560, out: 'promo-marquee.png' },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // --- アイコン(SVG → 透過PNG各サイズ) ---
  // setContent だと file:// 画像の読み込みがブロックされるため、
  // file:// ページ(icon.html)経由で同一スキームから読み込む。
  const iconUrl =
    'file:///' + path.join(__dirname, 'icon.html').replace(/\\/g, '/');
  for (const { size, out } of ICON_SIZES) {
    await page.setViewportSize({ width: size, height: size });
    await page.goto(iconUrl + '?size=' + size);
    await page.waitForFunction(() => {
      const img = document.getElementById('icon');
      return img && img.complete && img.naturalWidth > 0;
    });
    await page.screenshot({ path: out, omitBackground: true });
    console.log('icon', size, '->', path.relative(ROOT, out));
  }

  // --- プロモ画像(promo.html の各スライド) ---
  const promoUrl =
    'file:///' + path.join(__dirname, 'promo.html').replace(/\\/g, '/');
  for (const { slide, w, h, out } of SLIDES) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(promoUrl);
    await page.evaluate((s) => {
      document.body.dataset.slide = s;
    }, slide);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(150); // フォント・SVG描画の安定待ち
    const outPath = path.join(OUT, out);
    await page.screenshot({ path: outPath });
    console.log(slide, `${w}x${h}`, '->', path.relative(ROOT, outPath));
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

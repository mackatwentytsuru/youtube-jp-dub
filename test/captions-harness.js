/**
 * captions-harness.js — captions.js を Node 上で駆動するテスト基盤
 *
 * 実ブラウザ無しで字幕DOMの変化を擬似し、captionWatcher が確定した文
 * （onConfirmed）を検証できるようにする。
 *
 * 使い方:
 *   const h = require('./captions-harness');
 *   h.reset();
 *   h.tick(['これは'], 200);        // 行配列と経過msを与えて1回ポーリング
 *   h.delivered  // → [{text, meta, at}]
 */
'use strict';
const path = require('path');

// --- グローバルのスタブ ---------------------------------------------------
global.self = global;

let fakeLines = []; // 現在画面に出ている .ytp-caption-segment テキスト配列
let mockNow = 0; // 擬似時計(ms)
let capturedTick = null; // captions.js が setInterval に渡した tick 関数

Date.now = () => mockNow;

global.setInterval = (fn) => {
  capturedTick = fn;
  return 1;
};
global.clearInterval = () => {};

global.document = {
  querySelector(sel) {
    if (sel !== '.ytp-caption-window-container') return null;
    return {
      querySelectorAll() {
        return fakeLines.map((t) => ({ textContent: t }));
      },
    };
  },
};

// captions.js を読み込む（self.YJD.captionWatcher を生やす）
require(path.join(__dirname, '..', 'src', 'content', 'captions.js'));
const captionWatcher = self.YJD.captionWatcher;

// --- ハーネス API ---------------------------------------------------------
let delivered = [];

function reset() {
  delivered = [];
  fakeLines = [];
  mockNow = 0;
  captionWatcher.start((text, meta) => {
    delivered.push({ text: text, meta: meta || {}, at: mockNow });
  });
}

/** 行配列をセットし、経過msを進めて1回 tick する。 */
function tick(lines, advanceMs) {
  fakeLines = Array.isArray(lines) ? lines.slice() : [];
  mockNow += advanceMs || 200;
  capturedTick();
}

/** 同じ行配列を totalMs ぶん 200ms 間隔で tick し続ける（伸びの停止を擬似）。 */
function hold(lines, totalMs) {
  let elapsed = 0;
  while (elapsed < totalMs) {
    tick(lines, 200);
    elapsed += 200;
  }
}

module.exports = {
  reset,
  tick,
  hold,
  get delivered() {
    return delivered;
  },
  get now() {
    return mockNow;
  },
};

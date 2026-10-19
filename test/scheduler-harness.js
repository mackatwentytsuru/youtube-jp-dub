/**
 * scheduler-harness.js — scheduler.js を Node 上で駆動するテスト基盤
 *
 * tts / subtitleOverlay / captionWatcher を擬似し、字幕到着（onCaption）と
 * 読み上げ完了（endSpeech）を手動で起こして、待ち行列・速度制御を検証する。
 */
'use strict';
const path = require('path');

global.self = global;

let mockNow = 0;
Date.now = () => mockNow;

// --- 擬似 tts -------------------------------------------------------------
const ttsCalls = []; // {text, rate, expectedMs}
let currentSpeech = null; // 進行中の speak の opts
let cancelCount = 0;

const tts = {
  speak(text, opts) {
    opts = opts || {};
    ttsCalls.push({ text: text, rate: opts.rate, expectedMs: opts.expectedMs });
    currentSpeech = opts;
    return {};
  },
  cancel() {
    cancelCount += 1;
    currentSpeech = null;
  },
};

// --- 擬似 subtitleOverlay / captionWatcher --------------------------------
const overlay = { show() {}, hide() {}, setFontSize() {} };

let capturedOnCaption = null;
const captionWatcher = {
  start(cb) {
    capturedOnCaption = cb;
  },
  stop() {
    capturedOnCaption = null;
  },
  resetMemory() {},
};

self.YJD = { tts: tts, subtitleOverlay: overlay, captionWatcher: captionWatcher };
require(path.join(__dirname, '..', 'src', 'content', 'rate-estimator.js'));
require(path.join(__dirname, '..', 'src', 'content', 'scheduler.js'));
const scheduler = self.YJD.scheduler;

// --- 擬似 video -----------------------------------------------------------
function makeVideo() {
  return {
    paused: false,
    volume: 1,
    play() {
      this.paused = false;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
    },
    addEventListener() {},
    removeEventListener() {},
  };
}

// --- ハーネス API ---------------------------------------------------------
function defaultSettings(over) {
  return Object.assign(
    {
      mode: 'ducking',
      rate: 1.1,
      autoRate: true,
      voiceURI: '',
      duckingVolume: 0.25,
      showSubtitles: true,
      subtitleFontSize: 24,
    },
    over || {}
  );
}

let video = null;

function reset(settingsOver) {
  mockNow = 0;
  video = makeVideo();
  scheduler.setup(video, defaultSettings(settingsOver));
  scheduler.start();
  // setup() 内の stop() が発する正常な cancel は数えない。
  // 計測対象は reset 後（字幕到着以降）の挙動のみ。
  ttsCalls.length = 0;
  currentSpeech = null;
  cancelCount = 0;
}

/** 字幕1文の到着を起こす。 */
function emit(text, windowMs) {
  if (!capturedOnCaption) throw new Error('captionWatcher not started');
  capturedOnCaption(text, { windowMs: windowMs == null ? null : windowMs });
}

/** 進行中の読み上げを「完了」させる（tts の onEnd 相当）。 */
function endSpeech() {
  const o = currentSpeech;
  currentSpeech = null;
  if (o && o.onEnd) o.onEnd();
}

/** 擬似時計を進める。 */
function advance(ms) {
  mockNow += ms;
}

module.exports = {
  reset,
  emit,
  endSpeech,
  advance,
  scheduler,
  get video() {
    return video;
  },
  get ttsCalls() {
    return ttsCalls;
  },
  get cancelCount() {
    return cancelCount;
  },
  get speaking() {
    return currentSpeech != null;
  },
};

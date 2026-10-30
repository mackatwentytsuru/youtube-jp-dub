/**
 * scheduler.js — 字幕と読み上げの同期
 *
 * captionWatcher から「確定した字幕テキスト」を受け取り、再生方式に応じて
 * 日本語を読み上げる。
 *  - ducking : 動画はそのまま再生。読み上げ中だけ元音声の音量を下げる。
 *  - pause   : 字幕が出たら動画を一時停止して読み上げ、完了後に再生再開。
 */
(function () {
  'use strict';

  const YJD = (self.YJD = self.YJD || {});

  const MAX_QUEUE_LAG_MS = 15000; // これ以上遅れた文は読み飛ばす（安全弁）

  let video = null;
  let settings = null;
  let running = false;
  let selfPaused = false; // pause方式で拡張が動画を止めているか
  let isDucked = false;
  let userVolume = 1;
  let queue = []; // ダッキング方式の読み上げ待ち行列
  let speaking = false; // ダッキングのキューを処理中か

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, Number(n) || 0));
  }

  /** ダッキングの読み上げ待ち行列を空にする。 */
  function clearQueue() {
    queue = [];
    speaking = false;
  }

  /** 動画と設定を割り当てる（start 前に呼ぶ）。 */
  function setup(videoEl, st) {
    stop();
    video = videoEl;
    settings = st;
    selfPaused = false;
    isDucked = false;
    if (settings) YJD.subtitleOverlay.setFontSize(settings.subtitleFontSize);
  }

  function start() {
    if (running || !video || !settings) return;
    running = true;
    video.addEventListener('pause', onVideoPause);
    video.addEventListener('seeked', onSeek);
    YJD.captionWatcher.start(onCaption);
  }

  function stop() {
    running = false;
    YJD.captionWatcher.stop();
    if (video) {
      video.removeEventListener('pause', onVideoPause);
      video.removeEventListener('seeked', onSeek);
    }
    YJD.tts.cancel();
    clearQueue();
    restoreVolume();
    if (selfPaused) {
      selfPaused = false;
      safePlay();
    }
    YJD.subtitleOverlay.hide();
  }

  function isRunning() {
    return running;
  }

  /** 実行中に設定を差し替える。再生方式が変わったら状態をリセットする。 */
  function updateSettings(newSettings) {
    const oldMode = settings ? settings.mode : null;
    settings = newSettings;
    YJD.subtitleOverlay.setFontSize(settings.subtitleFontSize);
    if (!settings.showSubtitles) YJD.subtitleOverlay.hide();
    if (oldMode && oldMode !== settings.mode) {
      YJD.tts.cancel();
      clearQueue();
      restoreVolume();
      if (selfPaused) {
        selfPaused = false;
        safePlay();
      }
    }
  }

  /** 確定字幕が届いたときの処理。meta.windowMs は字幕の推定表示時間枠。 */
  function onCaption(text, meta) {
    if (!running || !video || !text) return;
    if (video.paused && !selfPaused) return; // ユーザーが停止中

    if (settings.mode === 'pause') {
      // pause方式: 動画を止めて1文ずつ読む（時間制約なし → 常に手動速度）
      if (settings.showSubtitles) YJD.subtitleOverlay.show(text);
      selfPaused = true;
      try {
        video.pause();
      } catch (e) {
        /* noop */
      }
      YJD.tts.speak(text, {
        rate: settings.rate,
        expectedMs: estimateMs(text, settings.rate),
        voiceURI: settings.voiceURI,
        onEnd: finishPause,
        onError: finishPause,
      });
    } else {
      // ducking方式: 待ち行列に積み、順番に最後まで読み上げる（割り込みで切らない）
      queue.push({
        text: text,
        windowMs: meta && meta.windowMs != null ? meta.windowMs : null,
        enqueuedAt: Date.now(),
      });
      if (!speaking) pumpQueue();
    }
  }

  /** ダッキング: 待ち行列から1文取り出して読み上げる。完了で自分を再呼び出し。 */
  function pumpQueue() {
    if (!running || !settings || settings.mode !== 'ducking') {
      clearQueue();
      restoreVolume();
      YJD.subtitleOverlay.hide();
      return;
    }
    // 大幅に遅れた古い文は読み飛ばす（動画から取り残されないための安全弁）
    const now = Date.now();
    while (queue.length > 1 && now - queue[0].enqueuedAt > MAX_QUEUE_LAG_MS) {
      queue.shift();
    }
    if (queue.length === 0) {
      speaking = false;
      restoreVolume();
      YJD.subtitleOverlay.hide();
      return;
    }
    speaking = true;
    const item = queue.shift();
    duck();
    if (settings.showSubtitles) YJD.subtitleOverlay.show(item.text);

    // 速度: 自動調整ONなら「遅れ(lag)を差し引いた時間枠」に収まる速度を求める。
    // 行列が詰まっているほど lag が増え、速度が上がって追いつく。
    let rate = settings.rate;
    if (settings.autoRate && item.windowMs != null && YJD.rateEstimator) {
      const lag = Date.now() - item.enqueuedAt;
      const r = YJD.rateEstimator.computeRate({
        text: item.text,
        windowMs: item.windowMs - lag,
        manualRate: settings.rate,
      });
      rate = r.rate;
    }
    YJD.tts.speak(item.text, {
      rate: rate,
      expectedMs: estimateMs(item.text, rate),
      voiceURI: settings.voiceURI,
      onEnd: pumpQueue,
      onError: pumpQueue,
    });
  }

  /** 読み上げ所要時間の見積り(ms)。番犬タイマー用。 */
  function estimateMs(text, rate) {
    return YJD.rateEstimator
      ? YJD.rateEstimator.estimateDurationMs(text, rate)
      : 0;
  }

  /** pause方式: 読み上げ完了 → 動画を再生再開。 */
  function finishPause() {
    selfPaused = false;
    YJD.subtitleOverlay.hide();
    if (running && settings && settings.mode === 'pause') safePlay();
  }

  /** ユーザーが動画を停止したら発話も止める。 */
  function onVideoPause() {
    if (selfPaused) return; // 拡張が止めたものは無視
    YJD.tts.cancel();
    clearQueue();
    restoreVolume();
    YJD.subtitleOverlay.hide();
  }

  /** シーク時は発話を中断し、字幕の記憶をリセットする。 */
  function onSeek() {
    YJD.tts.cancel();
    clearQueue();
    restoreVolume();
    selfPaused = false;
    YJD.captionWatcher.resetMemory();
    YJD.subtitleOverlay.hide();
  }

  function duck() {
    if (!video || isDucked) return;
    userVolume = video.volume;
    video.volume = clamp(settings.duckingVolume, 0, 1);
    isDucked = true;
  }

  function restoreVolume() {
    if (video && isDucked) video.volume = userVolume;
    isDucked = false;
  }

  function safePlay() {
    if (!video) return;
    try {
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* noop */
    }
  }

  YJD.scheduler = { setup, start, stop, isRunning, updateSettings };
})();

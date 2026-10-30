/**
 * captions.js — 字幕DOMの監視（captionWatcher）
 *
 * YouTube プレイヤーの字幕（caption-bridge が日本語翻訳表示にしたもの）を
 * DOM から読み取る。観察の結果、字幕は次の構造を持つ:
 *   .ytp-caption-window-container > .caption-window > .ytp-caption-segment[]
 *   - 各 .ytp-caption-segment が字幕の「1行」に対応する
 *   - 最終行は単語が追記されながら伸びる
 *   - 行が3つ前後たまると、最も古い行が押し出されて消える
 *
 * 2段階で読み上げ単位を組み立てる:
 *  1) 行の確定 — 最終行より前は完成行として即確定、最終行は次の行が出る／
 *     字幕が消える／伸びが一定時間止まる、のいずれかで確定。行テキストで
 *     重複管理し、行の繰り上がりによる二重読みを防ぐ。
 *  2) 文の組み立て — 確定行をバッファに連結し、句点（。！？）で文に切り出す。
 *     字幕行は文の途中で切れるため、文単位にまとめて自然な読み上げにする。
 */
(function () {
  'use strict';

  const YJD = (self.YJD = self.YJD || {});

  const POLL_MS = 200;
  const LAST_LINE_DEBOUNCE_MS = 2000; // 最終行の伸びが止まって確定するまで
  const MAX_MEMORY = 200; // 重複判定で覚えておく行数
  const FORCE_FLUSH_LEN = 32; // 句点が来ないまま文を強制確定する文字数
  const RECENT_DELIVERED_MAX = 8; // 文の重複読みを防ぐため覚えておく直近の文数

  // 自動速度調整用: 文の配信間隔から「字幕の表示ペース」を実測する
  const MAX_WINDOW_SAMPLES = 12; // ペース推定に使う直近サンプル数
  const MIN_WINDOW_SAMPLES = 2; // 推定を始めるのに必要な最小サンプル数
  const MIN_WINDOW_MS = 400; // これ未満の配信間隔は同時発生とみなし無視
  const MAX_WINDOW_MS = 15000; // これ超の間隔は無音区間とみなし無視

  let timer = null;
  let onConfirmed = null;
  let spokenOrder = [];
  let spokenSet = new Set();
  let lastLineText = '';
  let lastLineSince = 0;
  let buffer = '';
  let lastDeliverAt = 0; // 直前に文を配信した時刻
  let lastDeliverLen = 0; // 直前に配信した文の文字数
  let windowSamples = []; // {charLen, windowMs} の直近リングバッファ
  let recentDelivered = []; // 直近に配信した文（重複読み防止）

  /** 現在の字幕を行（segment）配列として返す。 */
  function readLines() {
    const c = document.querySelector('.ytp-caption-window-container');
    if (!c) return [];
    return Array.from(c.querySelectorAll('.ytp-caption-segment'))
      .map((s) => s.textContent.replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 0);
  }

  /** 確定した1行をバッファに連結し、文がそろったら読み上げる。 */
  function emitLine(line) {
    if (!line || spokenSet.has(line)) return;
    spokenOrder.push(line);
    spokenSet.add(line);
    if (spokenOrder.length > MAX_MEMORY) {
      spokenSet.delete(spokenOrder.shift());
    }

    // バッファ末尾と重なる接頭辞は捨て、新規分だけを足す。
    // 「途中まで確定した行がさらに伸びた」ときの二重取り込み（重複読み）を防ぐ。
    appendFresh(line);

    // 句点ごとに文を切り出す（1行に複数文が入ることもある）
    let m;
    while ((m = buffer.match(/^([\s\S]*?[。！？])([\s\S]*)$/))) {
      const sentence = m[1].trim();
      buffer = m[2];
      if (sentence.length >= 3) deliver(sentence);
    }
    // 句点が来ないまま長くなったら強制的に区切る
    if (buffer.trim().length >= FORCE_FLUSH_LEN) {
      const s = buffer.trim();
      buffer = '';
      deliver(s);
    }
  }

  /** line のうち buffer 末尾と重複しない新規部分だけを buffer に足す。 */
  function appendFresh(line) {
    const max = Math.min(line.length, buffer.length);
    let overlap = 0;
    for (let n = max; n > 0; n--) {
      if (buffer.endsWith(line.slice(0, n))) {
        overlap = n;
        break;
      }
    }
    buffer += line.slice(overlap);
  }

  /** バッファに残った未確定分を読み上げる（字幕が途切れたとき）。 */
  function flushBuffer() {
    const s = buffer.trim();
    buffer = '';
    if (s.length >= 2) deliver(s);
  }

  function deliver(text) {
    if (!text || !onConfirmed) return;
    // 直近に配信した文と同一なら重複読みとみなしスキップする
    if (recentDelivered.indexOf(text) !== -1) return;
    recentDelivered.push(text);
    if (recentDelivered.length > RECENT_DELIVERED_MAX) recentDelivered.shift();

    const now = Date.now();
    // 直前の文が画面に出ていた実時間（＝文の配信間隔）をサンプルとして蓄積する。
    // これを文字数で割れば「字幕1文字あたりの表示ms」が実測でき、
    // 現在の文の時間枠（windowMs）を見積もれる。
    if (lastDeliverAt > 0 && lastDeliverLen > 0) {
      const gap = now - lastDeliverAt;
      if (gap >= MIN_WINDOW_MS && gap <= MAX_WINDOW_MS) {
        windowSamples.push({ charLen: lastDeliverLen, windowMs: gap });
        if (windowSamples.length > MAX_WINDOW_SAMPLES) windowSamples.shift();
      }
    }
    lastDeliverAt = now;
    lastDeliverLen = text.length;

    const msPerChar = getDisplayRateMsPerChar();
    const windowMs = msPerChar != null ? msPerChar * text.length : null;
    onConfirmed(text, { windowMs: windowMs });
  }

  /** 実測した「字幕1文字あたりの表示ms」を返す。データ不足なら null。 */
  function getDisplayRateMsPerChar() {
    if (windowSamples.length < MIN_WINDOW_SAMPLES) return null;
    let sumWin = 0;
    let sumLen = 0;
    for (let i = 0; i < windowSamples.length; i++) {
      sumWin += windowSamples[i].windowMs;
      sumLen += windowSamples[i].charLen;
    }
    if (sumLen <= 0) return null;
    return sumWin / sumLen;
  }

  function tick() {
    const lines = readLines();
    const now = Date.now();

    if (lines.length === 0) {
      // 字幕が消えた → 書きかけの最終行を確定し、残りを読み上げる
      if (lastLineText) {
        emitLine(lastLineText);
        lastLineText = '';
      }
      flushBuffer();
      return;
    }

    // 最終行より前は伸び終わった完成行 → 即確定
    for (let i = 0; i < lines.length - 1; i++) emitLine(lines[i]);

    // 最終行は書きかけ。伸びが止まって一定時間たてば確定する
    const last = lines[lines.length - 1];
    if (last !== lastLineText) {
      lastLineText = last;
      lastLineSince = now;
    } else if (now - lastLineSince >= LAST_LINE_DEBOUNCE_MS) {
      emitLine(last);
    }
  }

  /** 監視を開始する。確定した文ごとに callback(text) を呼ぶ。 */
  function start(callback) {
    stop();
    onConfirmed = callback;
    resetMemory();
    timer = setInterval(tick, POLL_MS);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    onConfirmed = null;
    resetMemory();
  }

  /** seek 後など、字幕の記憶をリセットする。 */
  function resetMemory() {
    spokenOrder = [];
    spokenSet = new Set();
    lastLineText = '';
    lastLineSince = 0;
    buffer = '';
    lastDeliverAt = 0;
    lastDeliverLen = 0;
    windowSamples = [];
    recentDelivered = [];
  }

  YJD.captionWatcher = { start, stop, resetMemory };
})();

/**
 * rate-estimator.js — 字幕の長さから読み上げ速度を見積もる
 *
 * 確定した日本語文の文字数と、その文が画面に出ている時間枠（windowMs）から、
 * 読み上げが枠内に収まる速度（rate）を計算する。ducking 方式の自動速度調整で
 * 使う。純粋関数・ステートレス。
 *
 * 方針: 「速くするだけ」。下限は手動設定速度（manualRate）、上限は MAX_AUTO_RATE。
 * クラウド音声の実効上限(2.0)は tts.js 側で最終 clamp する。
 */
(function () {
  'use strict';

  const YJD = (self.YJD = self.YJD || {});

  // rate 1.0 のとき日本語を1秒あたり何文字読むかの目安（実機で調整する）
  const JP_CPS_AT_RATE_1 = 7.0;
  // 自動調整で許容する最大速度（実効上限は音声依存。tts.js が最終 clamp する）
  const MAX_AUTO_RATE = 5.0;
  // 時間枠を少し余らせて確実に間に合わせるための係数
  const FIT_MARGIN = 0.95;

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, Number(n) || lo));
  }

  /**
   * text を rate で読み上げたときの所要時間(ms)を見積もる。
   * @param {string} text
   * @param {number} rate
   * @returns {number}
   */
  function estimateDurationMs(text, rate) {
    const len = (text && text.length) || 0;
    const r = Number(rate) || 1;
    return ((len / JP_CPS_AT_RATE_1) * 1000) / r;
  }

  /**
   * 字幕を windowMs 内に収める読み上げ速度を求める。
   * 「速くするだけ」なので下限は manualRate、上限は MAX_AUTO_RATE。
   * windowMs が null（推定不能）なら manualRate、0以下（遅延済み）なら最高速。
   * @param {{text:string, windowMs:?number, manualRate:number}} arg
   * @returns {{rate:number, expectedMs:number}}
   */
  function computeRate(arg) {
    arg = arg || {};
    const manualRate = Number(arg.manualRate) || 1;
    if (!arg.text || arg.windowMs == null) {
      // 時間枠が不明 → 速度を上げずに手動速度のまま
      return {
        rate: manualRate,
        expectedMs: estimateDurationMs(arg.text, manualRate),
      };
    }
    const windowMs = Number(arg.windowMs);
    if (!(windowMs > 0)) {
      // 時間枠を既に使い切っている（大幅に遅れている）→ 最高速で追いつく
      return {
        rate: MAX_AUTO_RATE,
        expectedMs: estimateDurationMs(arg.text, MAX_AUTO_RATE),
      };
    }
    const desired = estimateDurationMs(arg.text, 1.0) / (windowMs * FIT_MARGIN);
    const rate = clamp(desired, manualRate, MAX_AUTO_RATE);
    return { rate: rate, expectedMs: estimateDurationMs(arg.text, rate) };
  }

  YJD.rateEstimator = {
    JP_CPS_AT_RATE_1,
    MAX_AUTO_RATE,
    estimateDurationMs,
    computeRate,
  };
})();

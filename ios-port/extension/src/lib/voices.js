/**
 * voices.js — chrome.tts と speechSynthesis の音声一覧を統合する共通ヘルパー
 *
 * content script / popup の両方で読み込む。統合後の音声オブジェクト:
 *   { voiceURI, name, lang, localService, engine: 'ext' | 'page' }
 *  - ext  : chrome.tts の音声。voiceURI は 'ext:' + voiceName。
 *  - page : speechSynthesis の音声。voiceURI はそのまま。
 */
(function () {
  'use strict';

  const YJD = (self.YJD = self.YJD || {});

  function mapExtVoice(v) {
    return {
      voiceURI: 'ext:' + v.voiceName,
      name: v.voiceName,
      lang: v.lang || '',
      localService: !v.remote,
      engine: 'ext',
    };
  }

  function mapPageVoice(v) {
    return {
      voiceURI: v.voiceURI,
      name: v.name,
      lang: v.lang || '',
      localService: v.localService !== false,
      engine: 'page',
    };
  }

  /**
   * chrome.tts の音声一覧を取得して統合形式で返す。
   * popup/options では直接、content script では background 経由で取得する。
   * 使えない環境では空配列。
   */
  function fetchExtVoices() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== 'undefined' && chrome.tts && chrome.tts.getVoices) {
          chrome.tts.getVoices((vs) => resolve((vs || []).map(mapExtVoice)));
          return;
        }
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'yjd:tts-voices' }, (res) => {
            if (chrome.runtime.lastError || !res) {
              resolve([]);
              return;
            }
            resolve((res.voices || []).map(mapExtVoice));
          });
          return;
        }
      } catch (e) {
        /* fallthrough */
      }
      resolve([]);
    });
  }

  /** ext 音声を優先し、同名でない page 音声を後ろに足して返す。 */
  function mergeVoices(extVoices, pageVoicesRaw) {
    const merged = (extVoices || []).slice();
    const names = new Set(merged.map((v) => v.name));
    (pageVoicesRaw || []).forEach((v) => {
      if (!names.has(v.name)) merged.push(mapPageVoice(v));
    });
    return merged;
  }

  YJD.voices = { fetchExtVoices, mergeVoices, mapPageVoice };
})();

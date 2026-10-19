/**
 * tts.js — 読み上げエンジンのラッパー（chrome.tts + speechSynthesis の2系統）
 *
 * 2系統のエンジンを使い分ける:
 *  - ext  : chrome.tts（background 経由）。Edge ではローカル音声に加え
 *           Natural（オンライン）音声が使えるため、日本語では既定で優先。
 *           background で再生されるためタブ非アクティブでも継続する。
 *  - page : ページの speechSynthesis。chrome.tts が使えない場合のフォールバック。
 *
 * speak()/cancel() の呼び出し規約（onEnd/onError/expectedMs 番犬）は
 * scheduler.js から見て従来と同一。
 */
(function () {
  'use strict';

  const YJD = (self.YJD = self.YJD || {});

  const RESPEAK_DELAY_MS = 60; // speechSynthesis の cancel→speak バグ回避
  const MAX_LOCAL_RATE = 5; // ローカル音声で許容する最大 rate
  const MAX_REMOTE_RATE = 2; // クラウド音声は rate>2.0 で無音になるため上限
  const EVT_MSG = 'yjd:tts-event';

  let pageVoices = []; // SpeechSynthesisVoice[]（実発話用に生を保持）
  let extVoices = []; // 統合形式（YJD.voices.fetchExtVoices の結果）
  let mergedVoices = []; // UI 用の統合一覧
  let updateListeners = [];
  let current = null; // 進行中の発話状態 {engine, finished, watchdog, ...}
  let extSeq = 0; // ext 発話の識別子（遅延イベントの取り違え防止）

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, Number(n) || lo));
  }

  function rebuildMerged() {
    mergedVoices = YJD.voices.mergeVoices(extVoices, pageVoices);
    updateListeners.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        /* noop */
      }
    });
  }

  function loadPageVoices() {
    try {
      pageVoices = speechSynthesis.getVoices() || [];
    } catch (e) {
      pageVoices = [];
    }
    rebuildMerged();
  }

  function loadExtVoices() {
    YJD.voices.fetchExtVoices().then((vs) => {
      extVoices = vs;
      rebuildMerged();
    });
  }

  loadPageVoices();
  loadExtVoices();
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.addEventListener('voiceschanged', loadPageVoices);
  }

  /** 音声一覧が更新されたら呼ばれるリスナーを登録する（UI 再描画用）。 */
  function onVoicesUpdated(cb) {
    if (typeof cb === 'function') updateListeners.push(cb);
  }

  function getJapaneseVoices() {
    return mergedVoices.filter((v) => /^ja\b/i.test(v.lang || ''));
  }

  /** 全音声（統合形式）を返す。UI のセレクト用。 */
  function listVoices() {
    return mergedVoices.slice();
  }

  function hasJapaneseVoice() {
    return getJapaneseVoices().length > 0;
  }

  /**
   * voiceURI から音声を解決する。自動選択（'' や未発見）の優先順:
   * ext の Natural 日本語 → ext の日本語 → その他の日本語 → null。
   */
  function pickVoice(voiceURI) {
    if (voiceURI) {
      const found = mergedVoices.find((v) => v.voiceURI === voiceURI);
      if (found) return found;
    }
    const ja = getJapaneseVoices();
    return (
      ja.find((v) => v.engine === 'ext' && /natural/i.test(v.name)) ||
      ja.find((v) => v.engine === 'ext') ||
      ja[0] ||
      null
    );
  }

  /** 進行中状態を終了させる（onEnd/onError を一度だけ呼ぶ）。 */
  function makeState(engine, opts) {
    const state = {
      engine: engine,
      finished: false,
      watchdog: null,
      onEnd: opts.onEnd,
      onError: opts.onError,
    };
    state.clearWatchdog = function () {
      if (state.watchdog !== null) {
        window.clearTimeout(state.watchdog);
        state.watchdog = null;
      }
    };
    state.finish = function (cb, arg) {
      if (state.finished) return;
      state.finished = true;
      state.clearWatchdog();
      if (current === state) current = null;
      if (cb) cb(arg);
    };
    return state;
  }

  /** 高速時に終了イベントが来ない事故に備える番犬。強制打ち切り→onEnd。 */
  function armWatchdog(state, expectedMs, forceStop) {
    if (!expectedMs || expectedMs <= 0) return;
    const watchdogMs = expectedMs * 1.8 + 2000;
    state.watchdog = window.setTimeout(() => {
      if (state.finished || current !== state) return;
      try {
        forceStop();
      } catch (e) {
        /* noop */
      }
      state.finish(state.onEnd);
    }, watchdogMs);
  }

  // --- ext エンジン（chrome.tts / background 経由） ------------------------

  function extStop() {
    try {
      chrome.runtime.sendMessage({ type: 'yjd:tts-stop' }, () => {
        void chrome.runtime.lastError;
      });
    } catch (e) {
      /* noop */
    }
  }

  function speakExt(text, voice, opts) {
    const id = ++extSeq;
    const state = makeState('ext', opts);
    state.id = id;
    const maxRate = voice.localService ? MAX_LOCAL_RATE : MAX_REMOTE_RATE;
    current = state;
    try {
      chrome.runtime.sendMessage(
        {
          type: 'yjd:tts-speak',
          id: id,
          text: text,
          options: {
            voiceName: voice.name,
            lang: voice.lang || 'ja-JP',
            rate: clamp(opts.rate, 0.5, maxRate),
          },
        },
        () => {
          if (chrome.runtime.lastError) {
            state.finish(state.onError, new Error(chrome.runtime.lastError.message));
          }
        }
      );
    } catch (e) {
      state.finish(state.onError, e);
      return state;
    }
    if (opts.onStart) opts.onStart();
    armWatchdog(state, opts.expectedMs, extStop);
    return state;
  }

  // background からの終了通知を受ける
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== EVT_MSG) return;
      const state = current;
      if (!state || state.engine !== 'ext' || state.id !== msg.id) return;
      if (msg.event === 'end') {
        state.finish(state.onEnd);
      } else if (msg.event === 'error') {
        state.finish(state.onError, new Error(msg.errorMessage || 'tts-error'));
      } else {
        state.finish(null); // interrupted / cancelled は意図的な中断
      }
    });
  }

  // --- page エンジン（speechSynthesis） -----------------------------------

  function speakPage(text, voice, opts) {
    const state = makeState('page', opts);
    const u = new SpeechSynthesisUtterance(text);
    state.u = u;
    u.lang = 'ja-JP';
    const raw = voice ? pageVoices.find((v) => v.voiceURI === voice.voiceURI) : null;
    if (raw) u.voice = raw;
    const maxRate =
      raw && raw.localService === false ? MAX_REMOTE_RATE : MAX_LOCAL_RATE;
    u.rate = clamp(opts.rate, 0.5, maxRate);

    u.onstart = () => {
      if (opts.onStart) opts.onStart();
    };
    u.onend = () => {
      state.finish(state.onEnd);
    };
    u.onerror = (e) => {
      if (e && (e.error === 'interrupted' || e.error === 'canceled')) {
        state.finish(null);
        return;
      }
      state.finish(state.onError, e);
    };

    current = state;
    window.setTimeout(() => {
      if (current !== state) return;
      try {
        speechSynthesis.speak(u);
      } catch (e) {
        state.finish(state.onError, e);
        return;
      }
      armWatchdog(state, opts.expectedMs, () => speechSynthesis.cancel());
    }, RESPEAK_DELAY_MS);
    return state;
  }

  /**
   * テキストを読み上げる。直前の発話は中断される。
   * @param {string} text
   * @param {{rate?:number, voiceURI?:string, expectedMs?:number,
   *          onStart?:Function, onEnd?:Function, onError?:Function}} opts
   */
  function speak(text, opts) {
    opts = opts || {};
    cancel();
    const voice = pickVoice(opts.voiceURI);
    if (voice && voice.engine === 'ext') return speakExt(text, voice, opts);
    return speakPage(text, voice, opts);
  }

  /** 進行中の発話を中断する（両エンジン）。 */
  function cancel() {
    const state = current;
    current = null;
    if (state) {
      state.finished = true;
      state.clearWatchdog();
    }
    if (state && state.engine === 'ext') extStop();
    try {
      speechSynthesis.cancel();
    } catch (e) {
      /* noop */
    }
  }

  function isSpeaking() {
    if (current) return true;
    try {
      return speechSynthesis.speaking || speechSynthesis.pending;
    } catch (e) {
      return false;
    }
  }

  function reloadVoices() {
    loadPageVoices();
    loadExtVoices();
  }

  YJD.tts = {
    listVoices,
    getJapaneseVoices,
    hasJapaneseVoice,
    speak,
    cancel,
    isSpeaking,
    reloadVoices,
    onVoicesUpdated,
  };
})();

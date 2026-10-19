/**
 * background.js — chrome.tts による読み上げエンジン（service worker）
 *
 * content script からのメッセージで chrome.tts を叩く。
 * Edge では OS のローカル音声に加えて Natural（オンライン）音声が
 * chrome.tts 経由で使えるため、ページの speechSynthesis より音声が多い。
 * さらに background で再生するためタブが非アクティブでも読み上げが続く。
 *
 * メッセージ:
 *   yjd:tts-voices → sendResponse({voices})      音声一覧
 *   yjd:tts-speak  {id, text, options}           読み上げ開始（即 ack）
 *   yjd:tts-stop                                 全読み上げ停止
 * 終了通知:
 *   chrome.tabs.sendMessage(tabId, {type:'yjd:tts-event', id, event, errorMessage})
 *   event: 'end' | 'interrupted' | 'cancelled' | 'error'
 */
'use strict';

const EVT_MSG = 'yjd:tts-event';
const MIN_RATE = 0.1;
const MAX_RATE = 10; // chrome.tts の仕様上の上限

function clampRate(n) {
  const x = Number(n);
  if (!isFinite(x) || x <= 0) return 1;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, x));
}

/** 読み上げの終了系イベントを発話元タブへ通知する。 */
function notifyTab(tabId, id, event, errorMessage) {
  if (tabId == null) return;
  chrome.tabs.sendMessage(
    tabId,
    { type: EVT_MSG, id: id, event: event, errorMessage: errorMessage || '' },
    () => void chrome.runtime.lastError // タブが閉じられた場合のエラーは握りつぶす
  );
}

function speak(msg, sender) {
  const tabId = sender && sender.tab ? sender.tab.id : null;
  const o = msg.options || {};
  chrome.tts.speak(
    String(msg.text || ''),
    {
      voiceName: o.voiceName || undefined,
      lang: o.lang || undefined,
      rate: clampRate(o.rate),
      pitch: 1,
      volume: 1,
      enqueue: false,
      onEvent: (e) => {
        if (
          e.type === 'end' ||
          e.type === 'interrupted' ||
          e.type === 'cancelled' ||
          e.type === 'error'
        ) {
          notifyTab(tabId, msg.id, e.type, e.errorMessage);
        }
      },
    },
    () => {
      if (chrome.runtime.lastError) {
        notifyTab(tabId, msg.id, 'error', chrome.runtime.lastError.message);
      }
    }
  );
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'yjd:tts-voices') {
    chrome.tts.getVoices((voices) => sendResponse({ voices: voices || [] }));
    return true; // 非同期 sendResponse
  }
  if (msg.type === 'yjd:tts-speak') {
    speak(msg, sender);
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'yjd:tts-stop') {
    chrome.tts.stop();
    sendResponse({ ok: true });
    return;
  }
});

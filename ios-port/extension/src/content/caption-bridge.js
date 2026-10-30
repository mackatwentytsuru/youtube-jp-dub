/**
 * caption-bridge.js — MAIN world: YouTube プレイヤーの字幕制御
 *
 * timedtext API は POT 必須化により字幕本文が空で返るため使えない。代わりに、
 * プレイヤー自身（movie_player）に字幕を「日本語自動翻訳」で表示させ、
 * その DOM 字幕を ISOLATED 側（captions.js）が読み取る方式をとる。
 *
 * movie_player の内部API（setOption 等）は MAIN world からしか呼べないため、
 * 本ファイルが MAIN world で動き、CustomEvent でコマンドを受ける。
 *
 * 通信:
 *   ISOLATED → MAIN : 'yjd:cmd'   detail = JSON {cmd:'enable'|'disable', targetLang}
 *   MAIN → ISOLATED : 'yjd:event' detail = JSON {type:'ready'|'error', ...}
 */
(function () {
  'use strict';

  const DEBUG = false; // ストア版ではコンソール出力しない
  function log() {
    if (DEBUG) console.log.apply(console, ['[YJD]'].concat([].slice.call(arguments)));
  }
  log('caption-bridge.js (MAIN world) loaded');
  const CMD = 'yjd:cmd';
  const EVT = 'yjd:event';

  // 現在有効な要求ID。新しい enable / disable が来たら古い処理は破棄する。
  let currentReq = 0;

  function emit(payload) {
    document.dispatchEvent(new CustomEvent(EVT, { detail: JSON.stringify(payload) }));
  }

  function baseLang(code) {
    return String(code || '').toLowerCase().split('-')[0];
  }

  /** API メソッドを持つ movie_player 要素を返す。 */
  function getPlayer() {
    const p = document.getElementById('movie_player');
    return p && typeof p.getOption === 'function' ? p : null;
  }

  /** movie_player の API が使えるようになるまで待つ。 */
  function waitForPlayer(timeoutMs) {
    return new Promise((resolve) => {
      const now = getPlayer();
      if (now) {
        resolve(now);
        return;
      }
      let tries = 0;
      const limit = Math.ceil((timeoutMs || 15000) / 250);
      const t = setInterval(() => {
        tries += 1;
        const p = getPlayer();
        if (p) {
          clearInterval(t);
          resolve(p);
        } else if (tries > limit) {
          clearInterval(t);
          resolve(null);
        }
      }, 250);
    });
  }

  /** 翻訳元の字幕言語を選ぶ（英語優先、無ければ先頭）。 */
  function pickSourceLang(tracklist) {
    if (!tracklist || !tracklist.length) return null;
    const en = tracklist.find((t) => baseLang(t.languageCode) === 'en');
    return (en || tracklist[0]).languageCode;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** 字幕トラック一覧を粘り強く取得する（最大約12秒）。 */
  async function fetchTracklist(player) {
    for (let i = 0; i < 24; i++) {
      try {
        if (i === 0) player.loadModule('captions');
        const tl = player.getOption('captions', 'tracklist') || [];
        if (tl.length) return tl;
      } catch (e) {
        /* noop */
      }
      await sleep(500);
    }
    // フォールバック: ページ埋め込みの captionTracks から言語を拾う
    try {
      const pr = window.ytInitialPlayerResponse;
      const ct =
        pr &&
        pr.captions &&
        pr.captions.playerCaptionsTracklistRenderer &&
        pr.captions.playerCaptionsTracklistRenderer.captionTracks;
      if (ct && ct.length) {
        return ct.map((t) => ({ languageCode: t.languageCode, kind: t.kind || '' }));
      }
    } catch (e) {
      /* noop */
    }
    return [];
  }

  /** 字幕を targetLang（既定 ja）へ翻訳して表示させる。 */
  async function enableCaptions(targetLang, reqId) {
    currentReq = reqId;
    const player = await waitForPlayer(15000);
    if (currentReq !== reqId) return; // 待機中に新しい要求が来たら破棄
    if (!player) {
      emit({ type: 'error', message: 'player-unavailable', reqId: reqId });
      return;
    }

    const tracklist = await fetchTracklist(player);
    if (currentReq !== reqId) return;
    log('caption-bridge: tracklist件数=', tracklist.length);
    if (!tracklist.length) {
      emit({ type: 'error', message: 'no-captions', reqId: reqId });
      return;
    }

    const tgt = baseLang(targetLang || 'ja');
    const srcLang = pickSourceLang(tracklist);
    const srcBase = baseLang(srcLang);

    try {
      if (srcBase === tgt) {
        // 元から目的言語の字幕がある → そのまま表示
        player.setOption('captions', 'track', { languageCode: srcLang });
      } else {
        // 元言語 → 目的言語へ YouTube に自動翻訳させる
        player.setOption('captions', 'track', {
          languageCode: srcLang,
          translationLanguage: { languageCode: tgt },
        });
      }
    } catch (e) {
      emit({ type: 'error', message: 'setoption-failed:' + e.message, reqId: reqId });
      return;
    }

    emit({ type: 'ready', sourceLang: srcLang, translated: srcBase !== tgt, reqId: reqId });
  }

  /** 字幕表示を止める。進行中の enable も破棄する。 */
  function disableCaptions() {
    currentReq = -1;
    const player = getPlayer();
    if (!player) return;
    try {
      player.setOption('captions', 'track', {});
    } catch (e) {
      /* noop */
    }
    try {
      player.unloadModule('captions');
    } catch (e) {
      /* noop */
    }
  }

  document.addEventListener(CMD, (e) => {
    let msg;
    try {
      msg = JSON.parse(e.detail);
    } catch (err) {
      return;
    }
    if (msg.cmd === 'enable') enableCaptions(msg.targetLang, msg.reqId);
    else if (msg.cmd === 'disable') disableCaptions();
  });
})();

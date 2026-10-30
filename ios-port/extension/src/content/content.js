/**
 * content.js — 拡張のエントリ／オーケストレーター（ISOLATED world）
 *
 * 役割:
 *  - 起動時と SPA 動画切替（yt-navigate-finish）で初期化をやり直す
 *  - caption-bridge（MAIN world）に字幕の日本語翻訳表示を依頼する
 *  - scheduler を起動し、設定変更（パネル／ポップアップ）を反映する
 *
 * 字幕の取得・翻訳は YouTube プレイヤー自身が行うため、本拡張は
 * 翻訳処理を持たない（timedtext API は POT 必須化により使用不可）。
 */
(function () {
  'use strict';

  const DEBUG = false; // ストア版ではコンソール出力しない
  function log() {
    if (DEBUG) console.log.apply(console, ['[YJD]'].concat([].slice.call(arguments)));
  }
  log('content.js loaded; modules:', self.YJD ? Object.keys(self.YJD).join(',') : 'YJD MISSING');
  const YJD = self.YJD;
  const CMD = 'yjd:cmd';
  const EVT = 'yjd:event';
  const HIDE_CLASS = 'yjd-hide-yt-captions';

  let currentVideoId = null;
  let initToken = 0;

  /** watch ページなら videoId を、そうでなければ null を返す。 */
  function getVideoId() {
    try {
      const u = new URL(location.href);
      if (!u.pathname.startsWith('/watch')) return null;
      return u.searchParams.get('v');
    } catch (e) {
      return null;
    }
  }

  /** YouTube の <video> 要素が現れるまで待つ。 */
  function waitForVideo(token) {
    return new Promise((resolve) => {
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if (token !== initToken) {
          clearInterval(timer);
          resolve(null);
          return;
        }
        const v =
          document.querySelector('video.html5-main-video') ||
          document.querySelector('.html5-video-player video');
        if (v) {
          clearInterval(timer);
          resolve(v);
        } else if (tries > 40) {
          clearInterval(timer);
          resolve(null);
        }
      }, 250);
    });
  }

  /** showPanel 設定に従いパネルを取り付け／取り外す。 */
  function ensurePanel(settings) {
    if (settings.showPanel === false) {
      if (YJD.controlPanel.isMounted()) YJD.controlPanel.unmount();
      return;
    }
    if (!YJD.controlPanel.isMounted()) {
      YJD.controlPanel.mount(settings, YJD.tts.listVoices());
    }
  }

  /**
   * caption-bridge に字幕の翻訳表示を依頼し、ready / error を待つ。
   * reqId で要求と応答を相関させ、SPA遷移で残った古い要求への応答や
   * 第三者が発行したイベントは無視する。
   */
  function requestCaptions(targetLang, reqId) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        document.removeEventListener(EVT, handler);
        resolve(val);
      };
      const handler = (e) => {
        let msg;
        try {
          msg = JSON.parse(e.detail);
        } catch (err) {
          return;
        }
        if (msg.reqId !== reqId) return; // 対応しない応答は無視
        if (msg.type === 'ready') {
          finish({ ok: true, sourceLang: msg.sourceLang, translated: msg.translated });
        } else if (msg.type === 'error') {
          finish({ ok: false, error: msg.message });
        }
      };
      document.addEventListener(EVT, handler);
      document.dispatchEvent(
        new CustomEvent(CMD, {
          detail: JSON.stringify({ cmd: 'enable', targetLang: targetLang, reqId: reqId }),
        })
      );
      setTimeout(() => finish({ ok: false, error: 'timeout' }), 20000);
    });
  }

  /** caption-bridge に字幕表示の停止を依頼する。 */
  function disableCaptions() {
    document.dispatchEvent(
      new CustomEvent(CMD, { detail: JSON.stringify({ cmd: 'disable' }) })
    );
  }

  /** 動画1本ぶんの初期化。 */
  async function init() {
    const token = ++initToken;
    const videoId = getVideoId();
    log('init: videoId=', videoId);
    if (!videoId) return;
    currentVideoId = videoId;

    const settings = await YJD.storage.getSettings();
    if (token !== initToken) return;

    const video = await waitForVideo(token);
    log('init: video取得=', !!video, 'enabled=', settings.enabled);
    if (token !== initToken || !video) return;

    ensurePanel(settings);
    log('init: パネル設置=', YJD.controlPanel.isMounted());
    YJD.controlPanel.syncFromSettings(settings);

    if (!settings.enabled) {
      YJD.scheduler.stop();
      document.documentElement.classList.remove(HIDE_CLASS);
      YJD.controlPanel.setStatus('無効です。「吹き替えを有効化」で開始できます。');
      return;
    }

    YJD.controlPanel.setStatus('字幕を準備中…');
    const result = await requestCaptions(settings.targetLang || 'ja', token);
    log('init: 字幕準備結果=', JSON.stringify(result));
    if (token !== initToken) return;

    // 字幕準備の待機中(最大20秒)に設定が変わった可能性があるため再検証する
    const fresh = await YJD.storage.getSettings();
    if (token !== initToken || !fresh.enabled) return;

    if (!result.ok) {
      const msg =
        result.error === 'no-captions'
          ? 'この動画には字幕が付いていないため吹き替えできません。'
          : result.error === 'timeout'
          ? '字幕の準備がタイムアウトしました。ページを再読み込みしてください。'
          : '字幕の準備に失敗しました（' + result.error + '）。';
      YJD.controlPanel.setStatus(msg, 'warn');
      return;
    }

    // YouTube 純正字幕は読み取り用に表示させたまま、CSS で隠す
    document.documentElement.classList.add(HIDE_CLASS);

    YJD.scheduler.setup(video, fresh);
    YJD.scheduler.start();

    let msg = result.translated
      ? '吹き替え中（YouTube翻訳字幕: ' + (result.sourceLang || '?') + '→日本語）'
      : '吹き替え中（日本語字幕）';
    let level = '';
    if (!YJD.tts.hasJapaneseVoice()) {
      msg += ' ⚠日本語音声が見つかりません';
      level = 'warn';
    }
    YJD.controlPanel.setStatus(msg, level);
  }

  /** 設定変更（パネル／ポップアップ）を受けて反映する。 */
  function onSettingsChanged(settings) {
    if (getVideoId()) ensurePanel(settings);
    YJD.controlPanel.syncFromSettings(settings);
    if (!settings.enabled) {
      initToken++; // 字幕準備待ちの古い init() を無効化(OFF直後の無言再開を防ぐ)
      YJD.scheduler.stop();
      document.documentElement.classList.remove(HIDE_CLASS);
      disableCaptions();
      YJD.controlPanel.setStatus('無効です。「吹き替えを有効化」で開始できます。');
      return;
    }
    if (YJD.scheduler.isRunning()) {
      YJD.scheduler.updateSettings(settings); // 速度・声・方式などの即時反映
    } else {
      init(); // 無効→有効など、未準備の場合はやり直す
    }
  }

  /** SPA 遷移。動画が変わったら作り直し、watch 外へ出たら片付ける。 */
  function onNavigate() {
    const newId = getVideoId();
    if (newId === currentVideoId) return;
    YJD.scheduler.stop();
    document.documentElement.classList.remove(HIDE_CLASS);
    currentVideoId = newId;
    if (newId) {
      init();
    } else {
      disableCaptions();
      YJD.controlPanel.unmount();
    }
  }

  /** 声一覧が遅れて届いたらパネルのセレクトを更新する。 */
  function onVoicesChanged() {
    if (!YJD.controlPanel.isMounted()) return;
    YJD.storage.getSettings().then((s) => {
      YJD.controlPanel.setVoices(YJD.tts.listVoices(), s.voiceURI);
    });
  }

  // --- 起動 --------------------------------------------------------------
  YJD.storage.onSettingsChanged(onSettingsChanged);
  document.addEventListener('yt-navigate-finish', onNavigate);
  if (typeof speechSynthesis !== 'undefined' && speechSynthesis.addEventListener) {
    speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
  }
  YJD.tts.onVoicesUpdated(onVoicesChanged); // chrome.tts の音声一覧が届いたら再描画
  init();
})();

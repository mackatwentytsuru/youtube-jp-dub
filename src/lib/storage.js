/**
 * storage.js — 設定の永続化
 *
 * 全実行コンテキスト（content script / service worker / popup / options）で
 * クラシックスクリプトとして読み込み、グローバル名前空間 self.YJD に登録する。
 * 設定は chrome.storage.sync（端末間同期）に保存する。
 */
(function () {
  'use strict';

  const YJD = (self.YJD = self.YJD || {});

  /** ユーザー設定の既定値。新しいキーを足したら必ずここに既定を書く。 */
  const DEFAULTS = Object.freeze({
    enabled: true,          // 拡張のON/OFF
    mode: 'ducking',        // 再生方式: 'ducking'（ダッキング） | 'pause'（自動ポーズ）
    rate: 1.1,              // 読み上げ速度 0.5–2.0
    voiceURI: '',           // 選択した声のvoiceURI（'' = ja-JP を自動選択）
    duckingVolume: 0.25,    // ダッキング時に下げる元音声の音量 0–1
    showSubtitles: true,    // 日本語字幕オーバーレイの表示
    subtitleFontSize: 24,   // 字幕フォントサイズ(px)
    autoRate: false,        // ダッキング時、字幕の長さに応じて速度を自動で速める
    sourceLang: 'en',       // 翻訳元（既定: 英語）
    targetLang: 'ja',       // 翻訳先（既定: 日本語）
    showPanel: true,        // プレイヤー上のコントロールパネルを表示
    panelCollapsed: true,   // パネルを折りたたんだ状態で表示
  });

  const SETTINGS_KEY = 'settings';

  /** 既定値とマージした現在の設定を返す。 */
  async function getSettings() {
    const stored = await chrome.storage.sync.get(SETTINGS_KEY);
    return Object.assign({}, DEFAULTS, stored[SETTINGS_KEY] || {});
  }

  /** 部分更新。新しい設定オブジェクト全体を返す。 */
  async function setSettings(partial) {
    const current = await getSettings();
    const next = Object.assign({}, current, partial);
    await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
    return next;
  }

  /** 設定変更を監視。callback には完全な設定オブジェクトが渡る。 */
  function onSettingsChanged(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[SETTINGS_KEY]) {
        callback(Object.assign({}, DEFAULTS, changes[SETTINGS_KEY].newValue || {}));
      }
    });
  }

  YJD.storage = {
    DEFAULTS,
    getSettings,
    setSettings,
    onSettingsChanged,
  };
})();

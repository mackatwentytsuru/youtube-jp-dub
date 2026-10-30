/**
 * control-panel.js — YouTube プレイヤー上のコントロールパネル
 *
 * パネルは設定を直接 chrome.storage に書くだけ。設定変更の反映（scheduler への
 * 適用や他コンテキストとの同期）は content.js が storage.onChanged 経由で行う。
 * パネル自身の表示更新も content.js から syncFromSettings() で呼ばれる。
 */
(function () {
  'use strict';

  const YJD = (self.YJD = self.YJD || {});

  const TEMPLATE = [
    '<div class="yjd-panel-header">',
    '  <span class="yjd-panel-title">🎙 JP Dub</span>',
    '  <button class="yjd-panel-collapse" type="button">▼</button>',
    '</div>',
    '<div class="yjd-panel-body">',
    '  <label class="yjd-row"><span><input type="checkbox" class="yjd-enabled">吹き替えを有効化</span></label>',
    '  <div class="yjd-row"><span>方式</span>',
    '    <select class="yjd-mode">',
    '      <option value="ducking">ダッキング</option>',
    '      <option value="pause">自動ポーズ</option>',
    '    </select></div>',
    '  <div class="yjd-row"><span>基準速度 <b class="yjd-rate-val">1.1</b></span>',
    '    <input type="range" class="yjd-rate" min="0.5" max="2" step="0.1"></div>',
    '  <label class="yjd-row"><span><input type="checkbox" class="yjd-autorate">速度を自動調整（ダッキング）</span></label>',
    '  <div class="yjd-row"><span>声</span><select class="yjd-voice"></select></div>',
    '  <label class="yjd-row"><span><input type="checkbox" class="yjd-subs">日本語字幕を表示</span></label>',
    '  <div class="yjd-status"></div>',
    '</div>',
  ].join('');

  let root = null;
  let els = {};

  /** パネルをプレイヤーに取り付ける。 */
  function mount(settings, voices) {
    if (root && root.isConnected) return;
    const host = document.querySelector('.html5-video-player') || document.body;
    root = document.createElement('div');
    root.id = 'yjd-panel';
    root.innerHTML = TEMPLATE;
    host.appendChild(root);

    els = {
      header: root.querySelector('.yjd-panel-header'),
      collapse: root.querySelector('.yjd-panel-collapse'),
      enabled: root.querySelector('.yjd-enabled'),
      mode: root.querySelector('.yjd-mode'),
      rate: root.querySelector('.yjd-rate'),
      rateVal: root.querySelector('.yjd-rate-val'),
      autoRate: root.querySelector('.yjd-autorate'),
      voice: root.querySelector('.yjd-voice'),
      subs: root.querySelector('.yjd-subs'),
      status: root.querySelector('.yjd-status'),
    };

    populateVoices(voices);
    syncFromSettings(settings);
    bindEvents();
  }

  /** 折りたたみ状態を表示に反映する。 */
  function applyCollapsed(collapsed) {
    if (!root) return;
    root.classList.toggle('yjd-collapsed', collapsed);
    els.collapse.textContent = collapsed ? '▲' : '▼';
  }

  function bindEvents() {
    // ボタン click はヘッダーへバブルするため、ハンドラはヘッダーのみに付ける
    els.header.addEventListener('click', () => {
      const collapsed = !root.classList.contains('yjd-collapsed');
      applyCollapsed(collapsed);
      save({ panelCollapsed: collapsed });
    });
    els.enabled.addEventListener('change', () =>
      save({ enabled: els.enabled.checked })
    );
    els.mode.addEventListener('change', () => save({ mode: els.mode.value }));
    els.rate.addEventListener('input', () => {
      els.rateVal.textContent = Number(els.rate.value).toFixed(1);
    });
    els.rate.addEventListener('change', () =>
      save({ rate: parseFloat(els.rate.value) })
    );
    els.autoRate.addEventListener('change', () =>
      save({ autoRate: els.autoRate.checked })
    );
    els.voice.addEventListener('change', () =>
      save({ voiceURI: els.voice.value })
    );
    els.subs.addEventListener('change', () =>
      save({ showSubtitles: els.subs.checked })
    );
  }

  function save(partial) {
    YJD.storage.setSettings(partial).catch((e) =>
      console.warn('[YJD] 設定の保存に失敗:', e)
    );
  }

  /** 声セレクトを音声一覧で埋める。 */
  function populateVoices(voices) {
    if (!els.voice) return;
    els.voice.innerHTML = '';
    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = '自動 (日本語)';
    els.voice.appendChild(auto);
    (voices || []).forEach((v) => {
      const o = document.createElement('option');
      o.value = v.voiceURI;
      o.textContent = v.name + ' (' + v.lang + ')';
      els.voice.appendChild(o);
    });
  }

  /** 音声一覧を差し替える（voiceschanged 後の再描画用）。 */
  function setVoices(voices, currentVoiceURI) {
    populateVoices(voices);
    if (els.voice && hasOption(currentVoiceURI)) els.voice.value = currentVoiceURI;
  }

  function hasOption(value) {
    return els.voice && Array.from(els.voice.options).some((o) => o.value === value);
  }

  /** UI を設定値に同期させる。 */
  function syncFromSettings(s) {
    if (!root || !s) return;
    els.enabled.checked = !!s.enabled;
    els.mode.value = s.mode;
    els.rate.value = s.rate;
    els.rateVal.textContent = Number(s.rate).toFixed(1);
    els.autoRate.checked = !!s.autoRate;
    els.voice.value = hasOption(s.voiceURI) ? s.voiceURI : '';
    els.subs.checked = !!s.showSubtitles;
    applyCollapsed(!!s.panelCollapsed);
  }

  /** ステータス行を更新する。level: ''|'warn'|'error'。 */
  function setStatus(text, level) {
    if (!els.status) return;
    els.status.textContent = text || '';
    els.status.className = 'yjd-status' + (level ? ' yjd-status-' + level : '');
  }

  function isMounted() {
    return !!(root && root.isConnected);
  }

  function unmount() {
    if (root && root.parentElement) root.parentElement.removeChild(root);
    root = null;
    els = {};
  }

  YJD.controlPanel = {
    mount,
    unmount,
    syncFromSettings,
    setStatus,
    setVoices,
    isMounted,
  };
})();

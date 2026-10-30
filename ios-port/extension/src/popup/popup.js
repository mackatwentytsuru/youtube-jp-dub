/**
 * popup.js — ツールバーアイコンのポップアップUI
 *
 * content script と同じ chrome.storage.sync の設定を読み書きする。
 * 反映は YouTube タブ側の content.js が storage.onChanged で受け取る。
 */
(async function () {
  'use strict';

  const S = self.YJD.storage;
  const $ = (id) => document.getElementById(id);

  let settings = await S.getSettings();

  /** chrome.tts + speechSynthesis の声一覧を統合してセレクトへ反映する。 */
  async function loadVoices() {
    const pageVoices =
      (speechSynthesis.getVoices && speechSynthesis.getVoices()) || [];
    const extVoices = await self.YJD.voices.fetchExtVoices();
    const voices = self.YJD.voices.mergeVoices(extVoices, pageVoices);
    const sel = $('voice');
    sel.innerHTML = '';

    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = '自動 (日本語)';
    sel.appendChild(auto);

    voices.forEach((v) => {
      const o = document.createElement('option');
      o.value = v.voiceURI;
      o.textContent = v.name + ' (' + v.lang + ')';
      sel.appendChild(o);
    });

    if (Array.from(sel.options).some((o) => o.value === settings.voiceURI)) {
      sel.value = settings.voiceURI;
    }

    const hasJa = voices.some((v) => /^ja\b/i.test(v.lang || ''));
    if (voices.length && !hasJa) {
      $('hint').textContent =
        '⚠ この環境に日本語の音声が見つかりません。既定の声で読み上げます。';
    }
  }

  loadVoices();
  if (speechSynthesis.addEventListener) {
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
  }

  /** 設定値を各UI要素へ反映する。 */
  function render() {
    $('enabled').checked = !!settings.enabled;
    $('mode').value = settings.mode;
    $('rate').value = settings.rate;
    $('rateVal').textContent = Number(settings.rate).toFixed(1);
    $('autoRate').checked = !!settings.autoRate;
    $('subs').checked = !!settings.showSubtitles;
    $('showPanel').checked = settings.showPanel !== false;
  }
  render();

  async function save(partial) {
    settings = await S.setSettings(partial);
  }

  $('enabled').addEventListener('change', () =>
    save({ enabled: $('enabled').checked })
  );
  $('mode').addEventListener('change', () => save({ mode: $('mode').value }));
  $('rate').addEventListener('input', () => {
    $('rateVal').textContent = Number($('rate').value).toFixed(1);
  });
  $('rate').addEventListener('change', () =>
    save({ rate: parseFloat($('rate').value) })
  );
  $('autoRate').addEventListener('change', () =>
    save({ autoRate: $('autoRate').checked })
  );
  $('voice').addEventListener('change', () =>
    save({ voiceURI: $('voice').value })
  );
  $('subs').addEventListener('change', () =>
    save({ showSubtitles: $('subs').checked })
  );
  $('showPanel').addEventListener('change', () =>
    save({ showPanel: $('showPanel').checked })
  );
  $('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
})();

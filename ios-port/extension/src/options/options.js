/**
 * options.js — 詳細設定ページ
 *
 * ダッキング音量・字幕フォントサイズ・速度自動調整の保存を扱う。
 */
(async function () {
  'use strict';

  const S = self.YJD.storage;
  const $ = (id) => document.getElementById(id);

  let settings = await S.getSettings();

  /** 設定値をUIへ反映する。 */
  function render() {
    const duckPct = Math.round(settings.duckingVolume * 100);
    $('duck').value = duckPct;
    $('duckVal').textContent = duckPct + '%';
    $('font').value = settings.subtitleFontSize;
    $('fontVal').textContent = settings.subtitleFontSize + 'px';
    $('autoRate').checked = !!settings.autoRate;
  }
  render();

  $('duck').addEventListener('input', () => {
    $('duckVal').textContent = $('duck').value + '%';
  });
  $('duck').addEventListener('change', async () => {
    settings = await S.setSettings({
      duckingVolume: parseInt($('duck').value, 10) / 100,
    });
  });

  $('font').addEventListener('input', () => {
    $('fontVal').textContent = $('font').value + 'px';
  });
  $('font').addEventListener('change', async () => {
    settings = await S.setSettings({
      subtitleFontSize: parseInt($('font').value, 10),
    });
  });

  $('autoRate').addEventListener('change', async () => {
    settings = await S.setSettings({ autoRate: $('autoRate').checked });
  });
})();

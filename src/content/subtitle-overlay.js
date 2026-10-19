/**
 * subtitle-overlay.js — 日本語字幕オーバーレイ
 *
 * YouTube プレイヤー要素（.html5-video-player）内に字幕 div を挿入する。
 * プレイヤー内に入れることでフルスクリーン時も追従する。
 */
(function () {
  'use strict';

  const YJD = (self.YJD = self.YJD || {});

  const OVERLAY_ID = 'yjd-subtitle';
  let el = null;
  let fontSize = 24;

  /** プレイヤー要素を返す（無ければ null）。 */
  function getPlayer() {
    return document.querySelector('.html5-video-player');
  }

  /** 字幕 div を生成（または既存を取得）してプレイヤーに取り付ける。 */
  function ensureElement() {
    if (el && el.isConnected) return el;
    const player = getPlayer();
    if (!player) return null;

    el = document.getElementById(OVERLAY_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = OVERLAY_ID;
      el.className = 'yjd-subtitle';
    }
    if (el.parentElement !== player) player.appendChild(el);
    applyFontSize();
    return el;
  }

  function applyFontSize() {
    if (el) el.style.fontSize = fontSize + 'px';
  }

  /** 字幕フォントサイズ(px)を設定する。 */
  function setFontSize(px) {
    fontSize = Number(px) || 24;
    applyFontSize();
  }

  /** 字幕テキストを表示する。 */
  function show(text) {
    const node = ensureElement();
    if (!node) return;
    node.textContent = text || '';
    node.style.display = text ? 'block' : 'none';
  }

  /** 字幕を隠す。 */
  function hide() {
    if (el) {
      el.textContent = '';
      el.style.display = 'none';
    }
  }

  /** オーバーレイ要素を完全に取り除く。 */
  function destroy() {
    if (el && el.parentElement) el.parentElement.removeChild(el);
    el = null;
  }

  YJD.subtitleOverlay = { show, hide, setFontSize, destroy };
})();

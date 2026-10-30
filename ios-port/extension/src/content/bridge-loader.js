/**
 * bridge-loader.js — Safari用: caption-bridge.js をページ(MAIN world)へ注入する
 *
 * Safari は content_scripts の world:"MAIN" 未対応のため、web_accessible_resources
 * にした caption-bridge.js を <script> タグでページコンテキストに読み込む。
 * 通信は従来どおり document 上の CustomEvent なので他は無変更で動く。
 */
(function () {
  'use strict';
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const s = document.createElement('script');
  s.src = api.runtime.getURL('src/content/caption-bridge.js');
  s.onload = function () { s.remove(); };
  (document.head || document.documentElement).appendChild(s);
})();

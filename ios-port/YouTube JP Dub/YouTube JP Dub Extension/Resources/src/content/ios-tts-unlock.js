/**
 * ios-tts-unlock.js — iOS Safari 用: speechSynthesis の解禁
 *
 * iOS はユーザー操作(タップ)中に speak() を一度呼ぶまで、ページからの
 * 音声合成を無音で破棄する。最初のタップで無音の発話を流して解禁する。
 * 他プラットフォームでは無害(既に解禁済みのため何も変わらない)。
 */
(function () {
  'use strict';
  let done = false;
  function unlock() {
    if (done) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
      done = true;
      document.removeEventListener('touchend', unlock, true);
      document.removeEventListener('click', unlock, true);
    } catch (e) { /* noop */ }
  }
  document.addEventListener('touchend', unlock, true);
  document.addEventListener('click', unlock, true);
})();

# ストア申請ガイド(Chrome / Edge / Opera)

## 共通で必要なもの
- ZIPパッケージ: プロジェクト直下で `node_modules`, `test`, `docs`, `store`, `.git` を除いた
  ファイル一式(manifest.json, src/, styles/, icons/)を ZIP 化
- アイコン: icons/icon-128.png(ストア表示用)、16/32/48 は manifest 参照
- プライバシーポリシーの公開URL: `store/privacy-policy.md` を GitHub Pages か
  公開リポジトリの raw URL で公開して指定
- スクリーンショット: store/assets/screenshot-*.png(1280x800)
- プロモタイル(Chromeのみ): store/assets/promo-small.png(440x280)、
  store/assets/promo-marquee.png(1400x560、任意)

## データ使用の申告(全ストア共通の回答)
- 個人情報の収集: **なし**
- 閲覧履歴の収集: なし / 位置情報: なし / 認証情報: なし
- リモートコード実行: なし
- 権限の正当化:
  - `storage` — ユーザー設定(速度・声・方式)の保存
  - `tts` — 読み上げ音声の再生(拡張の中核機能)
  - `host: youtube.com` — 字幕の読み取りとプレイヤー上のコントロール表示
- 単一目的(single purpose)声明: 「YouTube動画の字幕を日本語音声で読み上げる(吹き替える)こと」

## Chrome Web Store
1. https://chrome.google.com/webstore/devconsole — 開発者登録(初回 $5)
2. 新しいアイテム → ZIP をアップロード
3. listing-ja.md / listing-en.md の内容を貼り付け(日本語を既定、英語を追加言語に)
4. カテゴリ: ユーザー補助機能。審査は通常1〜3営業日

## Microsoft Edge アドオン
1. https://partner.microsoft.com/dashboard/microsoftedge — 登録(**無料**)
2. 新しい拡張機能 → 同じ ZIP をアップロード(manifest そのまま動く)
3. 掲載情報は日本語+英語で入力。審査は通常〜7営業日
4. ※ Edge が最重要ターゲット(Natural音声)。ストア説明でも「Edgeなら高品質Natural音声」を強調

## Opera アドオン
1. https://addons.opera.com/developer/ — 登録(無料)
2. 同じ ZIP をアップロード(Chromium互換なのでそのまま動く)
3. 審査はやや遅め(1〜2週間)。優先度は低くて良い

## その他のChromium系
- Brave / Vivaldi / Arc — 独自ストアなし。Chrome Web Store をそのまま利用するため追加作業不要
- Whale(NAVER)— 韓国市場向け。必要になったら store.whale.naver.com

## 申請前チェックリスト
- [ ] manifest の version を上げた
- [ ] ZIP に node_modules/test/docs/store が入っていない
- [ ] スクリーンショットが最新UI
- [ ] プライバシーポリシーURLが生きている
- [ ] 新規プロファイルの Chrome/Edge で動作確認(字幕あり動画・なし動画・シーク・SPA遷移)

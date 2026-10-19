# YouTube JP Dub

**English** | [日本語](#日本語)

A Chrome / Edge extension (Manifest V3) that dubs English YouTube videos into Japanese. It reads YouTube's own auto-translated Japanese captions aloud with text-to-speech and can show them as a subtitle overlay. No account, no API key, no external server: everything runs in your browser. On Microsoft Edge it prefers the online "Natural" voices, which sound much more natural.

Built with [Claude Code](https://claude.com/claude-code).

> **Please read: YouTube terms and copyright.** This is an independent, unofficial project. It is not affiliated with, endorsed by, or sponsored by YouTube or Google. The extension does not download, record, or re-distribute any video or audio. It only reads the captions that YouTube shows in your own player and speaks them with your browser's voices. You are responsible for following the [YouTube Terms of Service](https://www.youtube.com/t/terms) and the copyright of the videos you watch. Use it for your own viewing, learning, or accessibility, and do not record or publish dubbed audio of content you do not have the rights to. Machine translation can be wrong.

## Features

- **Two playback modes** (switch from the on-player panel or the toolbar popup)
  - **Ducking**: the video keeps playing and the Japanese voice is laid over it at the caption timing. The original English audio is turned down while the voice speaks.
  - **Auto-pause**: the video pauses at every caption, the voice reads it, and playback resumes when it finishes. Always in sync, good for study.
- **Auto rate adjustment**: in Ducking mode, long captions are read faster (up to about 5x) so the speech fits the original timing and never drifts behind the video.
- **Speech rate control**: 0.5x to 2.0x base speed.
- **Voice selection** from the Japanese voices installed in your browser and OS.
- **Japanese subtitle overlay** that you can switch on and off.
- Settings are stored only in your browser (`chrome.storage`).

## How it works

Since 2024 YouTube's `timedtext` API requires a proof-of-origin token (POT), so caption text can no longer be fetched directly. Instead this extension asks the YouTube player itself to show captions auto-translated to Japanese, and reads the caption text from the player's DOM (`.ytp-caption-window-container`).

| Part | Technique |
|------|-----------|
| Captions | `movie_player.setOption` sets the player's captions to "Japanese (auto-translated)"; the displayed caption DOM is observed |
| Translation | Done by YouTube's own caption translation. The extension has no translation code and needs no API key |
| Speech | `chrome.tts` (service worker; supports Edge Natural voices and keeps speaking in background tabs) with a `speechSynthesis` fallback |
| Timing | A queue plus a rate estimator keep each spoken sentence inside its caption window |

## Install

It is not on the Chrome Web Store or Edge Add-ons yet. Load it as an unpacked extension:

1. Download or `git clone` this repository.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose this folder (the one with `manifest.json`).
5. Open a YouTube video that has English captions (for example a TED talk). A "JP Dub" panel appears at the top right of the player.

## Usage

- Use the **JP Dub** panel on the player or the toolbar icon.
- Turn on **Enable dubbing**. The extension prepares the captions and starts speaking.
- Speed, voice, playback mode, and subtitle display can be changed at any time; changes apply from the next sentence.
- Toolbar icon > **Advanced settings** has the ducking volume and the subtitle size.

## Limitations

- Videos with no captions at all (for example audio-only videos) cannot be dubbed. English captions or auto-generated captions are enough: YouTube's auto-translation turns them into Japanese.
- In Ducking mode captions are queued and read one by one to the end (a sentence is never cut off by the next one). If the Japanese is longer than the original line, speech falls behind; "auto rate adjustment" speeds it up to catch up. A sentence that is more than about 15 seconds late is skipped. Raise the base speed or use Auto-pause if this bothers you.
- Auto rate adjustment goes up to about 5x, but cloud voices (such as Google Japanese) are limited to 2.0x by their engine. For high speeds use local OS voices (such as Microsoft Japanese voices). Very high speeds are hard to understand.
- YouTube draws captions in steps, so sentence boundaries match the spoken units roughly, not perfectly.
- Caption reading depends on internal behavior of the YouTube player, so changes on YouTube's side may break the extension.
- Translation quality follows YouTube's auto-translation.

## Project layout

```
youtube-jp-dub/
├── manifest.json
├── src/
│   ├── background/   # chrome.tts engine (service worker)
│   ├── content/      # caption-bridge (MAIN world) + caption watching, sync, UI (ISOLATED)
│   ├── lib/          # storage.js (settings) / voices.js (merged voice list)
│   ├── popup/        # toolbar popup
│   └── options/      # advanced settings page
├── store/            # store listing material (descriptions, promo images, privacy policy)
├── test/             # logic tests (Node, no browser needed)
├── styles/
├── assets/           # icon.svg (master; PNGs are rendered by store/assets-src/render.js)
└── icons/
```

## Tests

The logic for caption building, rate estimation, and the speech queue is tested with plain Node (no dependencies):

```
npm test          # unit tests (Node)
```

There is also an end-to-end test that runs the extension in a real Chromium with a simulated caption DOM (needs Playwright):

```
npm install
npm run test:e2e
```

> Note: YouTube does not serve caption text to automated browsers (bot detection), so automatic tests against live YouTube are not possible. Do the final check in a normal Chrome or Edge.

## License

[MIT](LICENSE) © Yuki Tsuruoka

---

Made by Yuki Tsuruoka — stage visuals and live show production, building tools with Claude Code. Web: [otolume.com](https://otolume.com) / Instagram: [@tsuru614](https://www.instagram.com/tsuru614/) / YouTube: [channel](https://www.youtube.com/channel/UCYngpwyo7vGBIXBtKhh7z1g)

---

<a id="日本語"></a>

# YouTube JP Dub — 英語YouTube動画の日本語吹き替え

[English](#youtube-jp-dub) | **日本語**

英語のYouTube動画を日本語で吹き替える Chrome / Edge 拡張機能(Manifest V3)です。YouTube 自身が作る「日本語の自動翻訳字幕」を**音声で読み上げ**、**日本語字幕**として重ねて表示します。アカウント登録も APIキーも外部サーバーも要りません。すべてブラウザの中で動きます。Microsoft Edge では、より自然な Natural(オンライン)音声を優先して使います。

[Claude Code](https://claude.com/claude-code) で作りました。

> **ご注意: YouTube の規約と著作権について。** これは個人の非公式プロジェクトで、YouTube や Google とは関係がなく、承認も受けていません。この拡張は、動画や音声のダウンロード・録音・再配布をしません。あなたのプレイヤーに表示された字幕を読み取り、ブラウザの音声で読み上げるだけです。[YouTube 利用規約](https://www.youtube.com/t/terms)と、見る動画の著作権を守る責任は、使う人にあります。自分で見る・学ぶ・アクセシビリティのために使い、権利のない動画の吹き替え音声を録音・公開しないでください。機械翻訳なので、誤訳もあります。

## 主な機能

- **2つの再生方式**(プレイヤー上のパネルまたはポップアップで切替)
  - **ダッキング方式**: 動画を止めずに、字幕のタイミングで日本語を重ねて読み上げます。読み上げ中は元の英語音声を自動で小さくします。
  - **自動ポーズ方式**: セリフごとに動画を一時停止して読み上げ、終わると自動で再開します。完全に同期するので、学習向きです。
- **速度の自動調整**: ダッキング方式で、字幕が長い場面は読み上げを速め(最大約5倍速)、元のセリフの尺に収めます。読み上げが遅れていきません。
- **読み上げ速度の調整**: 基準速度 0.5〜2.0倍。
- **声の選択**: ブラウザと OS に入っている日本語音声から選べます。
- **日本語字幕オーバーレイ**の表示(オン・オフ可)。
- 設定はブラウザの中(`chrome.storage`)にだけ保存されます。

## 仕組み

YouTube の `timedtext` API は、2024年以降 POT(proof-of-origin token)が必須になり、字幕の文章を直接取得できなくなりました。そこでこの拡張は、**YouTube プレイヤー自身に「日本語の自動翻訳字幕」を表示させ、表示された字幕(`.ytp-caption-window-container`)を読み取ります**。

| 要素 | 採用技術 |
|------|---------|
| 字幕 | `movie_player.setOption` でプレイヤーの字幕を「日本語(自動翻訳)」に設定し、表示された字幕 DOM を監視 |
| 翻訳 | YouTube の字幕翻訳機能(プレイヤー側で実行)。拡張側に翻訳処理はなく、APIキーも不要 |
| 音声合成 | `chrome.tts`(service worker。Edge の Natural 音声に対応し、タブが裏でも読み続ける)+ `speechSynthesis` のフォールバック |
| 同期 | 待ち行列と速度の見積りで、1文ずつ字幕の時間内に収める |

## インストール

Chrome ウェブストアや Edge アドオンにはまだ出していません。「パッケージ化されていない拡張機能」として読み込みます。

1. このリポジトリをダウンロード、または `git clone` する。
2. `chrome://extensions`(Edge は `edge://extensions`)を開く。
3. 右上の **デベロッパー モード** をオンにする。
4. **パッケージ化されていない拡張機能を読み込む** を押し、このフォルダ(`manifest.json` があるフォルダ)を選ぶ。
5. 英語字幕のある YouTube 動画(例: TED Talk)を開く。プレイヤー右上に「JP Dub」のパネルが出ます。

## 使い方

- プレイヤー上の **JP Dub** パネル、またはツールバーのアイコンから操作します。
- **吹き替えを有効化** をオンにすると、字幕の準備 → 読み上げが始まります。
- 速度・声・再生方式・字幕表示はいつでも変えられ、次の発話から反映されます。
- ツールバーのアイコン →「詳細設定」で、ダッキング音量と字幕サイズを変えられます。

## 既知の制限

- 字幕が1つも付いていない動画(音声のみの動画など)は吹き替えできません。英語字幕や自動生成字幕があれば、YouTube の自動翻訳で日本語になって動きます。
- ダッキング方式では字幕を待ち行列に積み、1文ずつ最後まで順に読みます(途中で切れません)。日本語が元のセリフより長いと遅れていきますが、「速度の自動調整」で速度を上げて追いつきます。約15秒以上遅れた古い文は読み飛ばされます。気になるときは基準速度を上げるか、自動ポーズ方式にしてください。
- 「速度の自動調整」は最大約5倍速まで上げますが、Google 日本語などのクラウド音声は仕様上 2.0倍速までです。高速にしたいときは、OS のローカル音声(Microsoft 日本語音声など)をおすすめします。速すぎると聞き取りにくくなります。
- 字幕は YouTube プレイヤーが段階的に描くので、読み上げの区切りは発話の単位とおおむね合いますが、完全ではありません。
- 字幕の取得はプレイヤーの内部の動きに頼っているので、YouTube 側の変更で動かなくなることがあります。
- 翻訳の質は YouTube の自動翻訳しだいです。

## テスト

字幕の組み立て・速度の見積り・読み上げ待ち行列のロジックは、ブラウザなしの Node で試せます(依存ライブラリ不要)。

```
npm test          # ロジックのユニットテスト(Node)
```

実際の Chromium で拡張を動かす E2E テストもあります(Playwright を使い、字幕 DOM を擬似的に入れて確かめます)。

```
npm install
npm run test:e2e
```

> 注: ライブの YouTube に対する自動テストはできません。YouTube が自動操作のブラウザには字幕の文章を配信しない(bot 検知)ためです。最後の確認は、ふつうの Chrome / Edge で行ってください。

## ライセンス

[MIT](LICENSE) © Yuki Tsuruoka

---

作者: Yuki Tsuruoka — ステージ映像とライブ演出の制作。Claude Code でツールを作っています。Web: [otolume.com](https://otolume.com) / Instagram: [@tsuru614](https://www.instagram.com/tsuru614/) / YouTube: [チャンネル](https://www.youtube.com/channel/UCYngpwyo7vGBIXBtKhh7z1g)

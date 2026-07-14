# CinemaGazer (Chrome拡張版)

> 字幕情報から音声区間を抽出し、音声/非音声で再生速度を動的に切り替えることで極限的な高速動画鑑賞を可能にする Chrome 拡張。Netflix / Hulu / Disney+ / Amazon Prime Video に対応。事前データ処理不要で軽量。すぐ使えてすぐ鑑賞開始できます。

**🇬🇧 English version of this README is available below — please scroll down to the [English](#english) section.**

### 手短に説明！
- Netflix / Hulu / Disney+ / Amazon Prime Video を非常識なほど高速に動画鑑賞できる！たとえば30分もののアニメを10分以下で観るのも全然余裕！忙しい現代人に捧げます👍️
- 人間、物語を理解するときには　(1)セリフが理解できること　(2)物語の全てをちゃんと脳内に通過させること　が大切だと思うんだよね。だからAIに重要なシーンだけカットしてもらって要約する、なんてことはしない！セリフ（つまり字幕）があるところはそのセリフが理解できる速さで再生する。そしてセリフがないところは、ものすごい速さで再生する。それを自動的にやるのがこのCinemaGazer。
- セリフを耳で聞きたいなら2.0倍くらいが限界かな。でも字幕を目で見て理解するのでよければ、もっと3~5倍とかでも大丈夫かもね。
- もともとある字幕情報を用いるから、鑑賞前にデータ処理する必要もない。軽量で待ち時間なし。サクサク使えるよ！
- このくらいの極限的高速再生だと、字幕を読むために視線を動かすのはNG!画面中央に字幕を表示するから、ずっとぼーっと画面中央を眺めていればOK！
- **ときどき字幕と映像がずれたり、へんな字幕が出たりするけど、そのときはブラウザを再読み込みしてね！**
- 異常に高速再生するから、十分速いインターネット回線で使ってね！それでも読み込みが間に合わないときは、動画の画質を下げてみてね！
- 目まぐるしく情報が流れ込んでくるから、激しい点滅や目の疲れに注意してね！自己責任で使ってね！
- 高速鑑賞の効率は、動画の字幕の正確さ次第だよ！字幕がついていない動画には使えないし、字幕の付け方が雑な動画にはあまり意味がないよ！
- この下はAIが作った説明だから、全部読まなくていいよ！とりあえず使いたい人は「インストール」と「使い方」のところだけ読んでね。

---

これはヒューマンコンピュータインタラクション分野の国内学会 WISS 2011 と国際学会AVI2012 で発表された論文
[**CinemaGazer: a System for Watching Videos at Very High Speed**](https://arxiv.org/abs/1110.0864)
（栗原一貴, 2011）の提案手法を、現代のWebブラウザ環境（Netflix / Amazon Prime Video）で再現する Chrome 拡張です。

## インストール

### Chrome Web Store からインストール

👉 **[Chrome Web Store: CinemaGazer](https://chromewebstore.google.com/detail/cinemagazer/iogcniihehmjmclbhakekencmlplclii)**

ストアページで「Chromeに追加」を押すだけ。インストール後、Netflix を開いて再生すれば画面右上にHUDが表示されて動作開始します。Chromeなら自動でアップデートされます。

## 使い方

1. Netflix / Hulu / Disney+ / Prime Video で動画を再生
2. （Netflixは自動で字幕ON。その他はプレイヤー側で字幕をONにする。対応サービスは既定で有効）
3. 画面右上の表示で現在の速度と圧縮率を確認
4. 画面右上の表示をクリック or Chromeツールバーの拡張アイコンから設定を開く

### 設定項目（popup）

| 項目 | 内容 | 既定値 |
|---|---|---|
| 全体ON/OFF | 拡張の全機能 | ON |
| 音声区間の速度 | 字幕表示中に適用する再生速度 | 1.5× |
| 非音声区間の速度 | 字幕なし区間に適用する再生速度 | 4.0× |
| 高速化する最小非音声(秒) | この秒数より短い無字幕gapは高速化しない（短いポーズで切替えると見づらいため） | 0.4s |
| 字幕タイミング微調整 | 字幕と動画の体感ズレを補正（±5秒） | 0.0s |
| 字幕オーバーレイ | 動画中央に字幕を表示。ネイティブ字幕は非表示化 | OFF |
| 速度表示 | 画面右上の表示 | ON |
| Netflixで有効化 | Netflixで有効化 | ON |
| Huluで有効化 | Hulu (hulu.jp) で有効化 | ON |
| Disney+で有効化 | Disney+で有効化 | ON |
| Prime Videoで有効化 | Amazon Prime Videoで有効化（実験的） | ON |

## デモビデオ（元システム）

元論文の発表当時に公開されたデモ動画です。コンセプト・効果のイメージはこれらが最も分かりやすいです。

| | |
|---|---|
| [![CinemaGazer 日本語PV](https://img.youtube.com/vi/-_UZqVE-N8I/0.jpg)](https://www.youtube.com/watch?v=-_UZqVE-N8I) | [![CinemaGazer 活用例（日本語字幕）](https://img.youtube.com/vi/2NZ2ObN0CJc/0.jpg)](https://www.youtube.com/watch?v=2NZ2ObN0CJc) |
| **CinemaGazer 日本語PV** — システム紹介 | **CinemaGazer 活用例（日本語字幕）** — 実例 |
| [![CinemaGazer English PV](https://img.youtube.com/vi/3cjL78HFm1I/0.jpg)](https://www.youtube.com/watch?v=3cjL78HFm1I) | [![CinemaGazer Use Case (English Subtitles)](https://img.youtube.com/vi/A95q9DytflA/0.jpg)](https://www.youtube.com/watch?v=A95q9DytflA) |
| **CinemaGazer 英語PV** — System overview | **CinemaGazer 活用例（英語字幕）** — Use case |

## 主な機能

- **音声区間 / 非音声区間 で再生速度を自動切替**
- **HUD 表示**: 画面右上に「現在の状態（音声/非音声）・速度・全体の圧縮率」を常時表示。HUDをクリックすると設定popupが開く
- **字幕の中央オーバーレイ表示**（"centering"）。プレイヤー側のネイティブ字幕は自動的に非表示にして一本化
- **Netflix では字幕を自動でON**（プレイヤー内部APIで `setTimedTextTrack`）
- **サイト別ON/OFF**（既定: Netflix=ON, Prime=OFF）
- **字幕タイミング微調整**（±5秒）
- **同じ速度設定で再生するURLリンクをコピー** — popup の青いボタンで、現在の動画URL＋自分の速度設定をまとめた共有用URLをクリップボードにコピー。受け取った人がCinemaGazer導入済みなら、その人も同じ速度設定で再生開始できる
- 設定値は `chrome.storage.sync` でGoogleアカウント間同期

## 動作環境

| サイト | ステータス | 備考 |
|---|---|---|
| Netflix (`netflix.com`) | ✅ 安定 | 字幕は拡張が自動でONにする。既定ON |
| Hulu (`hulu.jp`) | ✅ 対応 | 字幕がビットマップ画像のため、字幕画像の表示を監視して発話区間を検出。既定ON |
| Disney+ (`disneyplus.com`) | ✅ 対応 | セグメント化WebVTTをXHR捕捉。既定ON |
| Amazon Prime Video (`primevideo.com`, `amazon.co.jp/gp/video/...`, `amazon.com/...`) | ⚠️ 実験的 | サーバサイド広告挿入で字幕のタイミングがズレることがある。既定ONだがpopupで無効化可能 |

> U-NEXT は字幕が映像に焼き込まれており（字幕データを取得できない）、本拡張の発話区間検出が原理的にできないため非対応。

字幕がOFFのコンテンツでは速度切替は無効化されます。

## アーキテクチャ

```
Chrome ブラウザ
├── content_scripts (manifest 経由)
│   ├── inject/interceptor.js  ── world: "MAIN"
│   │   └─ fetch / XMLHttpRequest をフックして字幕(TTML/VTT)を捕獲
│   │      Netflixでは setTimedTextTrack で字幕を自動ON
│   │
│   └── content/core.js         ── isolated world
│       ├─ adapter (netflix.js / prime.js) で <video> 要素を検出
│       ├─ window.postMessage で interceptor から字幕を受信 → パース
│       ├─ rAF ループで currentTime を見て speechRate / silentRate を選択
│       │  ── playbackRate guard で 500ms毎に再適用
│       ├─ HUD: 現在状態 / 速度 / 圧縮率を表示
│       └─ オーバーレイ: 動画中央に字幕を fade-in/out で描画
│
├── background.js (service worker)
│   └─ chrome.action.openPopup() (HUDクリック→popup起動)
│
└── popup/ (popup.html / popup.js / popup.css)
    └─ 設定UI。chrome.storage.sync に永続化
```

### 字幕パース対応形式

- **TTML / DFXP** (Netflix, Prime Video)
  - `ttp:tickRate` / `ttp:frameRate` を読んで時間単位を解決
  - `<div begin="...">` の累積オフセットを再帰的に処理
- **WebVTT**

## URLパラメータで設定を共有

popup下の **「🔗 同じ速度設定で再生するURLリンクをコピー」** ボタンを押すと、現在の動画URL＋速度設定を含むURLがクリップボードにコピーされます。

```
https://www.netflix.com/watch/82047157?ss=1.5&ns=4&ov=1
```

このURLをCinemaGazer導入済みの人に送ると、相手は **同じ速度設定** で動画を再生開始できます。例えば「このアニメは 音声2.0× / 非音声6.0× で見るのおすすめ」みたいな共有が可能。

| パラメータ | 設定 | 値 |
|---|---|---|
| `ss` | 音声区間の速度 | 0.5〜8.0 |
| `ns` | 非音声区間の速度 | 0.5〜16.0 |
| `mg` | 高速化する最小非音声(秒) | 0〜2 |
| `to` | 字幕タイミング微調整(秒) | -5〜5 |
| `ov` | 字幕オーバーレイ（中央表示） | 1/0 |
| `hud` | 速度表示 | 1/0 |
| `cg` | 拡張全体ON/OFF | 1/0 |

URLパラメータでの設定上書きは **そのタブ限り**（保存設定は変更されません）。リンクから動画を見終わって普通の動画ページに戻れば、自分の保存設定が再び有効になります。

DevToolsから直接URLを生成することもできます：

```js
CinemaGazer.makeShareUrl()
CinemaGazer.makeShareUrl({ speechRate: 2.0, silentRate: 8.0 })   // 一時的な上書き
```

## ディレクトリ構成

```
CinemaGazer/
├── manifest.json
├── background.js
├── content/
│   ├── core.js                 共通制御（字幕パース・速度切替・HUD・オーバーレイ）
│   ├── netflix.js              Netflix用 video 検出アダプタ
│   ├── prime.js                Prime Video用 video 検出アダプタ
│   └── overlay.css
├── inject/
│   └── interceptor.js          page-context: fetch/XHR フック + Netflix字幕自動ON
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── icons/
├── README.md
├── PRIVACY.md
└── STORE_SUBMISSION.md
```

## プライバシー

本拡張は個人情報を一切収集しません。字幕タイミング情報はユーザーのブラウザ内でのみ処理され、外部送信・保存はありません（設定値のみ `chrome.storage.sync` で同期）。詳細は [PRIVACY.md](./PRIVACY.md) を参照。

## トラブルシューティング

### HUD（右上の速度表示）が出ない
- popup の「Netflixで有効化」など対象サイトのトグルがONか
- `chrome://extensions` でエラーが出ていないか

### 速度切替が起きない（HUDが「字幕未取得」のまま）
- 動画再生を開始したか（再生開始時に字幕XMLが取得される）
- ページ自体をリロード後、再生してみる
- DevToolsコンソールで状態を確認:
  ```js
  CinemaGazer.info()    // content script 側の状態
  __cgDump()             // page world で観測したURL一覧
  ```

### 字幕が動画とズレる（特にPrime）
- popup の「字幕タイミング微調整」スライダーで補正
- それでも安定しない場合は Prime はOFFに

## 開発

ビルドツール不要のVanilla JavaScript。

```bash
# パッケージ化
zip -r cinemagazer-0.2.7.zip \
  manifest.json background.js \
  inject/ content/ popup/ icons/ \
  -x '*.tmp' -x '.DS_Store'

# シンタックスチェック
node --check background.js inject/interceptor.js content/core.js content/netflix.js content/prime.js popup/popup.js
python3 -c "import json; json.load(open('manifest.json'))"
```

## クレジット

- 元論文:
  - 栗原一貴 (2011). "CinemaGazer: a System for Watching Videos at Very High Speed". WISS 2011（ベストペーパー賞）. [arXiv:1110.0864](https://arxiv.org/abs/1110.0864)
  - Kazutaka Kurihara (2012). "CinemaGazer: A System for Watching Videos at Very High Speed," Proceedings of the 11th International Working Conference on Advanced Visual Interfaces (AVI'12), pp.108–115.
- Chrome拡張版: 栗原一貴（津田塾大学）

## ライセンス

MIT License。詳細は [LICENSE](./LICENSE) を参照。

## 連絡先

栗原一貴（津田塾大学）— kurihara@tsuda.ac.jp

---

<a id="english"></a>

# English

> A Chrome extension that enables **extremely fast video viewing** by dynamically switching playback rate between speech and non-speech intervals using subtitle timing. Supports Netflix / Hulu / Disney+ / Amazon Prime Video. No preprocessing required, lightweight — install and start watching right away.

### Quick intro!

- Watch Netflix / Hulu / Disney+ / Amazon Prime Video at ridiculously high speeds! For example, you can easily finish a 30-minute anime episode in under 10 minutes. Dedicated to busy modern people 👍
- I think the keys to understanding a story are: (1) being able to follow the dialogue, and (2) actually letting the entire story pass through your brain. So this tool does NOT use AI to "summarize the important scenes only" — instead, parts with dialogue (i.e. with subtitles) are played at a speed where you can still understand the speech, and parts without dialogue are played at an extremely high speed. CinemaGazer does this automatically.
- If you want to *listen* to the dialogue, around 2.0× is the practical limit. But if you're fine with *reading* the subtitles, 3–5× should still work.
- Because it uses the existing subtitle data, no preprocessing is needed before watching. Lightweight, no waiting time — snappy.
- At these extreme speeds, moving your eyes down to read subtitles is too slow! CinemaGazer can show subtitles in the **center** of the screen so you can just stare at the middle and read.
- **Sometimes subtitles get out of sync, or odd subtitles slip through — when that happens, just reload the browser tab.**
- Because playback is unusually fast, please use a sufficiently fast Internet connection. If loading still can't keep up, try lowering the video quality.
- Information will fly at you. Please be mindful of rapid flashing and eye fatigue. Use at your own discretion.
- The efficiency of fast viewing depends on the accuracy of the subtitles! It can't be used on videos without subtitles, and it's of little use on videos with sloppy subtitling.
- The rest of this README is AI-generated, so you don't have to read it all. If you just want to use it, jump to **Install** and **Usage**.

---

This is a Chrome extension that reproduces the method proposed in the paper [**CinemaGazer: a System for Watching Videos at Very High Speed**](https://arxiv.org/abs/1110.0864) (Kazutaka Kurihara, 2011), originally presented at WISS 2011 (a Japanese academic conference on Human-Computer Interaction) and AVI 2012, in the context of modern streaming services (Netflix / Amazon Prime Video).

## Install

### Install from the Chrome Web Store

👉 **[Chrome Web Store: CinemaGazer](https://chromewebstore.google.com/detail/cinemagazer/iogcniihehmjmclbhakekencmlplclii)**

Just hit "Add to Chrome" on the store page. After installation, open Netflix and start playback — a HUD should appear in the top-right corner. Chrome will auto-update the extension as new versions are released.

## Usage

1. Start playing a video on Netflix / Hulu / Disney+ / Prime Video.
2. (Netflix subtitles are auto-enabled. For the others, enable subtitles in the player. Supported services are enabled by default.)
3. The top-right indicator shows current rate and overall compression ratio.
4. Click the top-right indicator or the toolbar icon to open settings.

### Settings (popup)

| Setting | Description | Default |
|---|---|---|
| Master ON/OFF | Master switch for the extension | ON |
| Speech rate | Playback rate during subtitle intervals | 1.5× |
| Non-speech rate | Playback rate during non-subtitle intervals | 4.0× |
| Min non-speech gap | Skip-rate is only applied to non-speech gaps longer than this | 0.4s |
| Subtitle offset | Timing nudge for subtitles vs. video (±5s) | 0.0s |
| Subtitle overlay | Render subtitles in the center; hide native subtitles | OFF |
| Show indicator | Top-right speed indicator visibility | ON |
| Enable on Netflix | Enable on Netflix | ON |
| Enable on Hulu | Enable on Hulu (hulu.jp) | ON |
| Enable on Disney+ | Enable on Disney+ | ON |
| Enable on Prime Video | Enable on Amazon Prime Video (experimental) | ON |

## Demo videos (original system)

These demo videos were released by the original paper to illustrate the concept and the experience.

| | |
|---|---|
| [![CinemaGazer English PV](https://img.youtube.com/vi/3cjL78HFm1I/0.jpg)](https://www.youtube.com/watch?v=3cjL78HFm1I) | [![CinemaGazer Use Case (English Subtitles)](https://img.youtube.com/vi/A95q9DytflA/0.jpg)](https://www.youtube.com/watch?v=A95q9DytflA) |
| **CinemaGazer (English) PV** — System overview | **CinemaGazer use case (English subtitles)** |
| [![CinemaGazer 日本語PV](https://img.youtube.com/vi/-_UZqVE-N8I/0.jpg)](https://www.youtube.com/watch?v=-_UZqVE-N8I) | [![CinemaGazer 活用例（日本語字幕）](https://img.youtube.com/vi/2NZ2ObN0CJc/0.jpg)](https://www.youtube.com/watch?v=2NZ2ObN0CJc) |
| **CinemaGazer (Japanese) PV** | **CinemaGazer use case (Japanese subtitles)** |

## Features

- **Automatic playback rate switching between speech / non-speech intervals**
- **HUD**: Always-on top-right display of "current state (speech / non-speech) / current rate / overall compression ratio". Click the HUD to open the settings popup.
- **Centered subtitle overlay** ("centering"). The player's native subtitles are hidden so only the centered overlay shows.
- **Auto-enable subtitles on Netflix** (via the player's internal `setTimedTextTrack` API)
- **Per-site enable/disable** (default: Netflix = ON, Prime = OFF)
- **Subtitle timing offset adjustment** (±5s)
- **Copy a shareable link with your current speed settings** — the blue button in the popup copies the current video URL plus your speed settings to the clipboard. If the recipient also has CinemaGazer installed, they can start playback at the same speed settings as you.
- Settings synced across the user's Google account devices via `chrome.storage.sync`.

## Supported sites

| Site | Status | Notes |
|---|---|---|
| Netflix (`netflix.com`) | ✅ Stable | Subtitles are auto-enabled by the extension. |
| Amazon Prime Video (`primevideo.com`, `amazon.co.jp/gp/video/...`, `amazon.com/...`) | ⚠️ Experimental | Subtitle timing can drift on some titles, so off by default. Toggle in the popup. |

If subtitles are off on a given title, rate switching is disabled.

## Architecture

```
Chrome browser
├── content_scripts (declared in manifest)
│   ├── inject/interceptor.js  ── world: "MAIN"
│   │   └─ Hooks fetch / XMLHttpRequest to capture subtitle (TTML/VTT) bodies.
│   │      For Netflix, also calls setTimedTextTrack to auto-enable subtitles.
│   │
│   └── content/core.js         ── isolated world
│       ├─ Adapter (netflix.js / prime.js) finds the right <video> element.
│       ├─ Receives subtitles from interceptor via window.postMessage; parses.
│       ├─ rAF loop reads currentTime and picks speechRate / silentRate.
│       │  ── A 500ms guard re-applies the desired rate if the player resets it.
│       ├─ HUD: current state / rate / compression ratio.
│       └─ Overlay: fade-in/out subtitle rendered at the center of the video.
│
├── background.js (service worker)
│   └─ Forwards "open popup" requests via chrome.action.openPopup().
│
└── popup/ (popup.html / popup.js / popup.css)
    └─ Settings UI; persisted in chrome.storage.sync.
```

### Subtitle formats

- **TTML / DFXP** (Netflix, Prime Video): resolves time units from `ttp:tickRate` / `ttp:frameRate`; recursively accumulates `<div begin="...">` offsets.
- **WebVTT**

## Sharing settings via URL

Click the **"🔗 Copy link to play with the same settings"** button in the popup to copy the current video URL together with your speed settings to the clipboard:

```
https://www.netflix.com/watch/82047157?ss=1.5&ns=4&ov=1
```

If you send this URL to someone with CinemaGazer installed, they will start playback **with the same speed settings** as you. Useful for sharing recommendations like "watch this anime at speech 2.0× / non-speech 6.0×".

| Param | Setting | Range |
|---|---|---|
| `ss` | speech rate | 0.5–8.0 |
| `ns` | non-speech rate | 0.5–16.0 |
| `mg` | min non-speech gap (sec) | 0–2 |
| `to` | subtitle timing offset (sec) | -5 to 5 |
| `ov` | subtitle overlay (centered) | 1/0 |
| `hud` | show indicator | 1/0 |
| `cg` | master enable | 1/0 |

URL parameter overrides are **session-only** (your stored settings are not modified). Once you leave the URL with parameters, your saved settings take effect again.

You can also generate a URL directly from DevTools:

```js
CinemaGazer.makeShareUrl()
CinemaGazer.makeShareUrl({ speechRate: 2.0, silentRate: 8.0 })   // temporary override
```

## Directory layout

```
CinemaGazer/
├── manifest.json
├── background.js
├── content/
│   ├── core.js                 Common control (subtitle parsing / rate switching / HUD / overlay)
│   ├── netflix.js              Netflix <video> detection adapter
│   ├── prime.js                Prime Video <video> detection adapter
│   └── overlay.css
├── inject/
│   └── interceptor.js          page-context: fetch/XHR hook + auto-enable Netflix subtitles
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── icons/
├── README.md
├── PRIVACY.md
└── STORE_SUBMISSION.md
```

## Privacy

The extension collects **no personal data**. Subtitle timing data is parsed locally in your browser and never sent to any server. Only the user's settings are stored in `chrome.storage.sync` (synced across the user's own Google account devices). See [PRIVACY.md](./PRIVACY.md) for details.

## Troubleshooting

### Top-right HUD doesn't appear
- Make sure the per-site toggle (e.g. "Enable on Netflix") is on in the popup.
- Open `chrome://extensions/` and check for any errors on the CinemaGazer item.

### Rate switching doesn't happen (HUD stuck on "no subtitles")
- Has playback actually started? Subtitle XHR fires when playback begins.
- Reload the page, then start playback again.
- In DevTools console:
  ```js
  CinemaGazer.info()    // content-script side state
  __cgDump()             // URLs observed in the page world
  ```

### Subtitles drift out of sync (especially on Prime)
- Use the "Subtitle timing offset" slider in the popup.
- If it still won't stabilize, turn Prime off in the popup.

## Development

Vanilla JavaScript, no build step.

```bash
# Package
zip -r cinemagazer-0.2.14.zip \
  manifest.json background.js _locales \
  content/core.js content/netflix.js content/prime.js content/overlay.css \
  inject popup icons \
  -x '*.DS_Store' -x '*.tmp'

# Syntax checks
node --check background.js inject/interceptor.js content/core.js content/netflix.js content/prime.js popup/popup.js
python3 -c "import json; json.load(open('manifest.json'))"
```

## Credits

- Original paper:
  - Kazutaka Kurihara (2011). "CinemaGazer: a System for Watching Videos at Very High Speed". WISS 2011 (Best Paper Award). [arXiv:1110.0864](https://arxiv.org/abs/1110.0864)
  - Kazutaka Kurihara (2012). "CinemaGazer: A System for Watching Videos at Very High Speed," Proceedings of the 11th International Working Conference on Advanced Visual Interfaces (AVI'12), pp.108–115.
- Chrome extension port: Kazutaka Kurihara (Tsuda University)

## License

MIT License. See [LICENSE](./LICENSE).

## Contact

Kazutaka Kurihara (Tsuda University) — kurihara@tsuda.ac.jp

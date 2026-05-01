# CinemaGazer (Chrome拡張版)

> 字幕情報から発話区間を抽出し、発話/無音で再生速度を動的に切り替える Netflix / Prime Video 用の Chrome 拡張

WISS2011 ベストペーパー
[**CinemaGazer: a System for Watching Videos at Very High Speed**](https://arxiv.org/abs/1110.0864)
（栗原一貴, 2011）のコア手法を、現代のWebブラウザ環境（Netflix / Amazon Prime Video）で再現する Chrome 拡張です。

## なぜ"極限的な高速鑑賞"が成立するのか

長い動画には「実は字幕も声も無い」区間が大量に含まれます。風景・無言の演出・効果音だけのシーン――これらは **8〜16倍速で見ても情報損失が少ない**。一方で、人が話している区間まで一律に高速化すると言葉が追えなくなる。

CinemaGazer は、

- **字幕がある区間 = 発話扱い** → "理解できる速さ"（既定 1.5×）
- **字幕がない区間 = 無音扱い** → "飛ばせる速さ"（既定 4.0×）

を `video.playbackRate` で動的に切替えます。元論文のtwo-level fast-forwardingをそのまま現代のストリーミングサービスに適用した形です。

## 主な機能

- **発話区間 / 無音区間 で再生速度を自動切替**
- **HUD 表示**: 画面右上に「現在の状態（発話/無音）・速度・全体の圧縮率」を常時表示。HUDをクリックすると設定popupが開く
- **字幕の中央オーバーレイ表示**（"centering"）。プレイヤー側のネイティブ字幕は自動的に非表示にして一本化
- **Netflix では字幕を自動でON**（プレイヤー内部APIで `setTimedTextTrack`）
- **サイト別ON/OFF**（既定: Netflix=ON, Prime=OFF）
- **字幕タイミング微調整**（±5秒）
- 設定値は `chrome.storage.sync` でGoogleアカウント間同期

## 動作環境

| サイト | ステータス | 備考 |
|---|---|---|
| Netflix (`netflix.com`) | ✅ 安定 | 字幕は拡張が自動でONにする |
| Amazon Prime Video (`primevideo.com`, `amazon.co.jp/gp/video/...`, `amazon.com/...`) | ⚠️ 実験的 | コンテンツによって字幕のタイミングがズレることがあるため既定OFF。popup で有効化可能 |

字幕がOFFのコンテンツでは速度切替は無効化され、安全側で `speechRate` のまま再生されます。

## インストール

### 開発者モード（推奨：開発・テスト用）

1. このリポジトリをクローン or ZIP展開
2. Chrome で `chrome://extensions/` を開く
3. 右上の **デベロッパーモード** を ON
4. **「パッケージ化されていない拡張機能を読み込む」** → このフォルダを選択
5. Netflix を開いて再生 → 画面右上にHUDが出れば動作中

### Chrome Web Store（公開後）

予定: 後日Chrome Web Storeで公開（[STORE_SUBMISSION.md](./STORE_SUBMISSION.md) 参照）

## 使い方

1. Netflix / Prime Video で動画を再生
2. （Netflixは自動で字幕ON。Primeは手動で字幕をONに、popup で「Prime Video で有効化」もONに）
3. 画面右上のHUDで現在の速度と圧縮率を確認
4. HUDをクリック or Chromeツールバーの拡張アイコンから設定を開く

### 設定項目（popup）

| 項目 | 内容 | 既定値 |
|---|---|---|
| 全体ON/OFF | 拡張の全機能 | ON |
| 発話区間の速度 | 字幕表示中に適用する再生速度 | 1.5× |
| 無音区間の速度 | 字幕なし区間に適用する再生速度 | 4.0× |
| 高速化する最小無音(秒) | この秒数より短い無字幕gapは高速化しない（短いポーズで切替えると見づらいため） | 0.4s |
| 字幕タイミング微調整 | 字幕と動画の体感ズレを補正（±5秒） | 0.0s |
| 字幕オーバーレイ | 動画中央に字幕を表示。ネイティブ字幕は非表示化 | OFF |
| 速度表示 | 画面右上のHUD表示 | ON |
| Netflixで有効化 | サイト別ゲート | ON |
| Prime Videoで有効化 | サイト別ゲート（実験的） | OFF |

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

### HUDが出ない
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
zip -r cinemagazer-0.1.0.zip \
  manifest.json background.js \
  inject/ content/ popup/ icons/ \
  -x '*.tmp' -x '.DS_Store'

# シンタックスチェック
node --check background.js inject/interceptor.js content/core.js content/netflix.js content/prime.js popup/popup.js
python3 -c "import json; json.load(open('manifest.json'))"
```

## クレジット

- 元論文: 栗原一貴 (2011). "CinemaGazer: a System for Watching Videos at Very High Speed". WISS 2011 ベストペーパー賞. [arXiv:1110.0864](https://arxiv.org/abs/1110.0864)
- Chrome拡張版: 栗原一貴（津田塾大学）

## ライセンス

MIT License。詳細は [LICENSE](./LICENSE) を参照。

## 連絡先

栗原一貴（津田塾大学）— kurihara@tsuda.ac.jp

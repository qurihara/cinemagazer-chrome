# CinemaGazer Chrome拡張 — 開発引継ぎノート

最終更新: 2026-06-18 / 対応バージョン: **v0.3.4** (commit `fbc56df`)

このドキュメントは別PCでの開発継続・複数PC間での開発同期のためのまとめです。
コードや README には書ききれない「過去の痛い経験」「設計判断の理由」「未検証事項」「変遷の経緯」を集約しています。

---

## 0. すぐ知っておくべきこと（TL;DR）

- 著者: 栗原一貴（津田塾大学）。オリジナル CinemaGazer (WISS2011 best paper) の Chrome 拡張再実装
- Chrome Web Store 公開URL: https://chromewebstore.google.com/detail/cinemagazer/iogcniihehmjmclbhakekencmlplclii
- **ストア公開済みは v0.2.15**。`main` 先頭の **v0.3.x はまだ未提出**
- v0.3.x シリーズ:
  - **v0.3.0**: Disney+/Hulu/U-NEXT(実験的) + Prime DAI ズレ対策 (TextTracks経由) を初投入
  - **v0.3.1**: 広告終了後の XHR cue ドリフトを `adTimeOffset` で補正
  - **v0.3.2**: メディア切替/終了時の字幕状態リセット (Netflix除く)
  - **v0.3.3**: 広告後のネイティブ字幕二重表示の解消 + 非Netflixの中央表示を DOM 観察ベースに
  - **v0.3.4**: 詳細ページの自動プレビュー動画でエンジンを起動しない (isLikelyPreviewVideo)
- リモート: https://github.com/qurihara/cinemagazer-chrome

---

## 1. プロジェクト概要

### 何をしている拡張か
Netflix / Prime Video 等の **公式字幕タイミング情報** を取得し、
- 字幕が出ている区間（音声区間）= ゆっくり再生（既定 1.5×）
- 字幕が出ていない区間（非音声区間）= 高速再生（既定 4.0×）
で動的に `video.playbackRate` を切替える。

これにより「内容を理解しつつ視聴時間を圧縮」する CinemaGazer の元手法を、ストリーミングサービス上で再現する。

### 対応プラットフォーム

| サービス | 状態 | 既定 | 字幕ソース |
|---|---|---|---|
| Netflix | 正式サポート | ON | XHR インターセプト |
| Hulu (hulu.jp) | 正式サポート | ON | 画像字幕(image-presence): 字幕<img>のvisibility監視 |
| Disney+ | 正式サポート | ON | XHR セグメント化WebVTT (xhr-segmented) + MSE timestampOffset 補正 |
| Prime Video | 実験的 | ON | TextTrack優先 + XHR + DOM観察 + adTimeOffset 補正 |

> v0.3.9〜: 対応サービスは popup で既定ON（並びは Netflix / Hulu / Disney+ / Amazon）。Prime のみサーバサイド広告挿入による字幕ズレがあり popup ラベルに「実験的」を残す。

> **U-NEXT は対応対象外（撤退）**。実機診断で字幕が映像に焼き込まれた hardsub 配信と判明し（textTracks 空・字幕ファイル取得なし・DOM/canvas に字幕テキスト無し）、発話区間検出が原理的に不可能なため 2026-07-14 に撤退。アダプタ・host_permission・popup トグルを削除済み。

### 出版物
- 栗原一貴, 五十嵐健夫. "CinemaGazer: 字幕情報を利用した映像の高速鑑賞インタフェース". WISS2011 ベストペーパー
- 本拡張はその Chrome 版実装

---

## 2. リポジトリ構成

```
CinemaGazer/
├── manifest.json             # MV3, version 0.3.4
├── background.js             # service worker。設定の初期化のみ
├── inject/
│   └── interceptor.js        # page-world で fetch/XHR をフック
├── content/
│   ├── core.js               # 1053行。全アダプタ共通の制御エンジン
│   ├── netflix.js            # Netflix アダプタ
│   ├── prime.js              # Prime アダプタ + isAdPlaying + texttrack-preferred
│   ├── disneyplus.js         # Disney+ アダプタ（試作）
│   ├── hulu.js               # Hulu US/JP アダプタ（試作）
│   └── overlay.css           # 中央字幕オーバーレイ + HUD のスタイル
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── _locales/
│   ├── ja/messages.json
│   └── en/messages.json
└── icons/
```

---

## 3. アーキテクチャ概要

### 字幕ソースの3ルート

| ソース | 駆動契機 | 主な利用アダプタ | adTimeOffset補正 |
|---|---|---|---|
| `xhr` | interceptor が VTT/TTML/DFXP を post → `handleSubtitle()` | Netflix（既定）、Prime（fallback） | **YES**（本編タイムライン基準なので広告分を差し引く） |
| `texttrack` | `<video>.textTracks` の cuechange 観察 → `startTextTrackObserver()` | Prime（優先） | NO（ブラウザがメディア時刻で公開済み） |
| `image-presence` | 字幕ビットマップ画像 `<img>` の visibility を DOM 監視 → `isSubtitleImageVisible()` で発話区間判定 | Hulu (hulu.jp) | N/A（テキスト無し・実時間検出のみ。中央表示/圧縮率は非対応） |
| `dom`（フォールバック） | MutationObserver でネイティブ字幕DOMを観察 | 共通フォールバック + 非Netflixの中央表示テキスト | N/A |

### サイト有効化トグル
- 設定キー: `enableNetflix`(既定 ON), `enablePrime`/`enableDisneyplus`/`enableHulu`(全て既定 OFF)
- `SITE_ENABLE_KEY` マップで `adapter.name` → 設定キーを引く
- `isSiteEnabled(name)` がコア側の唯一の判定窓口

### 重要な設計原則: **Netflix path is protected**
v0.3.x の全修正で **Netflix の動作は無変更を保つ**ことを徹底:
- TextTrack 観察は Netflix では起動しない（adapter に subtitleStrategy 未設定）
- メディア切替時の字幕状態リセット (v0.3.2) は Netflix 除外（preload+URL-swap機構に任せる）
- 中央表示の DOM 観察優先 (v0.3.3) は 非Netflix のみ
- adTimeOffset は xhr ソースに適用されるが、Netflix のコンテンツに広告は無いので無害

---

## 4. v0.3.x シリーズの修正史

### v0.3.0 (a749c82) — 大規模拡張: 試作対応 4 サービス + Prime 広告対策初期版

#### Prime Video 広告ズレ対策（第1段階）
- **発端**: Prime は DAI (Dynamic Ad Insertion) で広告を本編ストリームにインライン挿入。`video.currentTime` は広告区間も連続して進むが、XHR で取った字幕 cue は本編タイムライン基準。広告が再生されると字幕が前ズレする
- **修正**: Prime アダプタを `subtitleStrategy: 'texttrack-preferred'` に切替。`<video>.textTracks` の cue はブラウザが DAI 挿入分を考慮したメディア時刻で公開
- **広告中の挙動**: `prime.js` の `isAdPlaying()` が広告UI（`atvwebplayersdk-ad-*` 等）の可視判定。広告中は `playbackRate = 1.0` に戻し、HUD は薄灰で「AD 1.00×」表示

#### Disney+ / Hulu 追加対応
Disney+ は正式サポート（`subtitleStrategy: 'xhr-segmented'`、既定 OFF）。Hulu (hulu.jp) は試作（`subtitleStrategy: 'image-presence'`、既定 OFF、popup ラベルに「実験的」明示）。hulu.jp は字幕がビットマップ画像なので、字幕 `<img>` の visibility を監視して発話区間だけを検出する（テキストは取れないため中央字幕表示・圧縮率は非対応）。

| アダプタ | ホスト | ファイル |
|---|---|---|
| `disneyplus` | `*.disneyplus.com` | `content/disneyplus.js` |
| `hulu` | `*.hulu.com`, `*.hulu.jp` | `content/hulu.js` |

### v0.3.1 (b27763c) — Fix subtitle drift after DAI ads

- **発覚した問題**: v0.3.0 の TextTrack 切替えだけでは不十分なケースが残った。TextTrack に cue が無い/不完全な場合 XHR にフォールバックするが、その XHR cue が本編タイムライン基準のままで広告分ズレる
- **修正**: 広告中に `video.currentTime` の進行量を `STATE.adTimeOffset` に積算 → cue 照合時刻から差し引く
  - 連続的進行量のみ積算（2秒以上のジャンプはシークとみなして無視）
  - `intervalSource === 'xhr'` のときだけ補正適用
- **新規 STATE**: `adTimeOffset`, `adLastTime`
- **リセットタイミング**: video の `loadstart` / `emptied` イベント + URL 変化

### v0.3.2 (7fa9c9d) — Subtitle lifecycle reset on media change/end

- **発覚した問題**: Prime 等で再生終了 / 作品切替時に前作品の cue が残り、新作品にプリロードされた cue が `pendingIntervals` に滞留 → 無関係字幕が流れる/終了後も字幕が残る
- **修正**: `attachVideo` 時の video に `loadstart` / `emptied` / `ended` リスナを付けて字幕状態と adTimeOffset をリセット
  - `pendingIntervals` があれば current に昇格
  - 無ければ clear、`hideOverlay()` 実行
- **Netflix は除外**: preload+URL-swap 機構と衝突して回帰するため `adapter.name === 'netflix'` のときは字幕状態を触らない
- **副次変更**: 字幕未捕捉warn から「Netflix側で」を削除し中立文言に

### v0.3.3 (df057b1) — Fix post-ad double subtitles + center drift

- **発覚した問題**:
  - **A**: 広告後にネイティブ字幕が再表示され、中央オーバーレイと **二重に出る**
  - **B**: 中央オーバーレイ (XHR cue 基準) だけ古い時刻の字幕を表示し続ける（adTimeOffset の補正残差）
- **修正 A**: tick の通常パスで `cg-overlay-active` クラスを再付与（広告中ブランチで剥がれたままになっていた）
- **修正 B**: **非Netflix** で DOM observer が動いていれば、中央オーバーレイのテキストは **ネイティブ字幕DOMの実テキスト**から取る（時刻は常に正しい）
  - 速度切替の判定や圧縮率計算は引き続き XHR cue（先読み利点を維持）
  - Netflix は従来どおり cue 基準（回帰防止）

### v0.3.4 (fbc56df) — Suppress engine/HUD on auto-preview videos

- **発覚した問題**: Prime や Netflix の詳細ページ等で、本編ではない自動プレビュー（トレーラー）が 0×0 / 微小 / 画面外の video 要素として再生される。エンジンが attach して HUD が出る、無意味に速度操作される
- **修正**: 新ヘルパ `isLikelyPreviewVideo(v)` を tick の入口で呼ぶ
  - 判定基準:
    - フルスクリーン中は対象外（本物のプレイヤー）
    - `offsetWidth === 0 || offsetHeight === 0` → プレビュー
    - 面積 < ビューポートの 15% → プレビュー
    - `bottom <= 0 || top >= viewportHeight` → 画面外
  - **muted では判定しない**（ミュートで字幕だけ追う実鑑賞は valid なため）
  - プレビュー判定時は `setRate(1.0)`、HUD/オーバーレイ非表示、`cg-overlay-active` 除去で return
- **Netflix 影響なし**: 通常 Netflix のプレイヤーはビューポートのほとんどを占有するので判定で素通り

---

## 5. 既知の未検証事項

### 5-1. Prime Video
- [ ] 広告**なし**コンテンツ: TextTrack 経路で従来同様に動くか（v0.2系からの回帰確認）
- [ ] 広告**あり**コンテンツ: 広告中→広告後の遷移で字幕がズレないか（v0.3.1+v0.3.3 の効果検証）
- [ ] `isAdPlaying()` セレクタの実環境マッチ確認
- [ ] 連続視聴で `adTimeOffset` が累積しすぎないか

### 5-2. Disney+
- [ ] `findVideo()` が本編 video を拾えるか
- [ ] 字幕 ON 時に `<video>.textTracks` から cue が読めるか（DRM 暗号化下で）
- [ ] `isWatchPage()` の正規表現が本編URLにマッチするか
- [ ] Disney+ にも DAI 広告はあるか（adTimeOffset 補正が必要か）

### 5-3. Hulu
- [ ] **hulu.com (US, Disney傘下)** と **hulu.jp (日本, HJ Holdings)** は別プレイヤー。両方の動作確認が必要
- [ ] hulu.com には広告挿入があるが、TextTrack 経路で吸収できるか
- [ ] hulu.jp で `<video>.textTracks` が cue を公開するか

### 5-4. 共通
- [ ] 各プラットフォームでユーザがプレイヤー側字幕をONにしていない場合の挙動
- [ ] 圧縮率・残り視聴時間表示が TextTrack 由来 cue で正しく出るか
- [ ] `isLikelyPreviewVideo()` の閾値（15% / 全画面判定）が各プラットフォームで適切か

---

## 6. 次にすべきこと（優先順位順）

### Step 1: 実機検証
1. 別PCに `git clone https://github.com/qurihara/cinemagazer-chrome.git`
2. `chrome://extensions` → デベロッパーモード → 「パッケージ化されていない拡張機能を読み込む」
3. **Netflix で従来どおり動くこと**を最初に確認（リグレッションがあれば最優先で修正）
4. Prime Video（広告なし→広告ありの順）
5. Disney+ / Hulu を popup でONにして順次確認
6. DevTools コンソールで `window.CinemaGazer.info()` を叩いて状態確認

### Step 2: 動作しないものは原因切り分け
- `STATE.adapter` が `registered` されているか
- `STATE.video` に正しい video が attach されているか
- `STATE.intervalSource` が何になっているか
- `video.textTracks` を直接列挙して cue が取れているか
- `STATE.adTimeOffset` の値が暴走していないか
- DOM フォールバックが効いているなら native subtitle selector を増やす

### Step 3: セレクタチューニング
各アダプタの `findVideo` と `core.js` の `NATIVE_SUBTITLE_SELECTORS` / `playerSel` を実環境のクラス名で更新。

### Step 4: ドキュメント
- README.md (ja/en) に Disney+（正式サポート）/Hulu（実験的）を追記
- 動作が安定したら Chrome Web Store の説明文も更新

### Step 5: Web Store 提出
- 動作が固まったら v0.3.x として提出
- 提出前にやること:
  - `manifest.json` の `version` を確認
  - zip 化: `zip -r cinemagazer-0.3.X.zip . -x "*.git*" "*.DS_Store" "HANDOVER.md"` (mac/Linux)
  - Chrome Web Store Developer Console から「新しいパッケージをアップロード」

---

## 7. 開発時の落とし穴（過去の痛い経験）

### 7-1. Edit ツールが日本語コメントを含む大きいファイルを truncate する
- 症状: Edit すると末尾が途中で切れて `SyntaxError: Unexpected end of input` になる
- core.js / popup.html / locale json で何度も発生
- 対策:
  - 大きな書き換えは **Python script で文字列置換** または **bash heredoc で全書き直し**
  - Edit 後は必ず `node --check` か `python -c "import json; json.load(...)"` で検証
  - 失敗したら `/tmp/*.bak` から復元

### 7-2. CRLF/LF
- Windows 側で git が自動的に CRLF 変換する → sandbox 側からは「modified」に見えることがある
- push には無関係なのでスルーしてOK

### 7-3. `.git/index.lock` / `.git/HEAD.lock` が残る
- ロックが残ると以降の git 操作が全部失敗する
- Windows CMD で `del .git\index.lock` `del .git\HEAD.lock`
- サンドボックスは unlink 権限が無いためロック削除ができない → Windows 側で削除する必要あり

### 7-4. `chrome.storage.sync` の DEFAULTS は **3箇所** にある
- `background.js` の `DEFAULTS`（最初の install 時に書き込まれる）
- `content/core.js` の `STATE.settings`（読み込み時のフォールバック）
- `popup/popup.js` の load 時のフォールバック（`s.xxx ?? ...`）
- どれか1箇所だけ変えると整合性が崩れる。新しい設定キーを足すときは **必ず3箇所同時**

### 7-5. v0.2.13 で overlay デフォルトを OFF→ON に変えたときの罠
- 旧 background.js が `overlayEnabled: false` を強制保存していたユーザの設定を上書きするため、`SCHEMA_VERSION = 2` のマイグレーションを足した
- 同パターンが今後また必要になるかもしれない

### 7-6. Netflix の次エピソード自動遷移
- Netflix は次エピソードの字幕XHRを **URL変化の直前** に先打ちすることがある
- そのまま `currentIntervals` を上書きすると視聴中エピソードに次エピ字幕が混入する
- 対策: `pendingIntervals` に保留して URL 変化で昇格させる方式（core.js 内に実装済み）
- **これは Netflix 固有のクセなので、他プラットフォームに移植しないこと**
- v0.3.2 のメディア切替リセットも Netflix だけ除外しているのはこの preload 機構と衝突するため

### 7-7. interceptor.js の Netflix 字幕 auto-enable
- `tryEnableNetflixSubs()` / `forceSubtitleRefresh()` は **netflix.com ホストでのみ動く**ように hostname ガード済み
- 新規プラットフォームでこの処理が走ることはない

### 7-8. v0.3.x で繰り返し直してきたパターン: 「広告中ブランチで状態が漏れる」
- v0.3.0 で導入した「adActive 時は早期 return」のブランチが、本来 tick の通常パスで維持される状態（`cg-overlay-active` クラス、HUD 表示、字幕表示など）を意図せず削除/保留する
- v0.3.3 では `cg-overlay-active` を通常パスで再付与することで広告後の二重字幕を解決
- 教訓: 早期 return ブランチでは「再開時に状態が壊れていないか」を必ず点検

### 7-9. 複数PC開発の同期
- 別PCで進んだ作業を pull するときは `git fetch && git log origin/main --oneline` で先行コミットを確認してから
- 自分の local commit が無ければ `git pull` で fast-forward
- 自分にも local commit があれば merge or rebase 判断（このリポジトリは merge ベース）

---

## 8. デバッグ用ユーティリティ

ページコンソールから:

```js
// 現在の状態スナップショット（アダプタ名・cue数・video・設定など）
window.CinemaGazer.info();

// interceptor の捕捉ログ
window.__cgDump();

// 同じ速度設定で再生するシェアURLを生成
window.CinemaGazer.makeShareUrl();
```

`STATE.intervalSource` の値で字幕ソースが判定できる:
- `'xhr'` = interceptor 経由（Netflix 標準モード）
- `'texttrack'` = `<video>.textTracks` 経由（Prime/Hulu 標準モード）
- `null` + `STATE.domObserverActive === true` = DOM 観察フォールバック

`STATE.adTimeOffset` で広告補正状態が分かる:
- `0` = 通常 / リセット直後
- 正の値 = 広告中に積算された秒数（cue 照合時刻から差し引かれる）

---

## 9. 設計判断の備忘録

### なぜ Prime は texttrack-preferred + adTimeOffset 補正 + DOM観察優先 の三重対策？
v0.3.x で見えてきたのは「単一の字幕ソースでは Prime DAI 環境を完璧にカバーできない」という現実：
- TextTrack: ブラウザがメディア時刻で出してくれるが、Prime の特定環境/コンテンツで cue が来ないことがある
- XHR: 入る場合は cue 配列が事前に手に入る（先読み/圧縮率計算可）が本編タイムライン基準
- DOM 観察: 常に「画面に出ている字幕」=正しい時刻だが、先読みできない

→ 速度判定/圧縮率は XHR cue（あれば adTimeOffset で補正）、中央表示は DOM 観察、TextTrack を補助に、という分担体制。

### なぜ Netflix は何も触らないのか？
- 既に v0.2 系で完成度が高い
- preload+URL-swap で次エピソードへスムーズ遷移する独自機構があり、汎用的な「メディア切替リセット」と衝突する
- 広告無し（プレミアム会員向け）が前提なので DAI 対策が不要

### なぜ新規 3 サービスは既定 OFF？
実環境での検証が不十分なため、誤動作で本編視聴を妨げないように。popup ラベルに「実験的」明示。

### なぜ adTimeOffset を 2 秒以下に制限？
シーク（ユーザの早送り/巻き戻し）で `currentTime` がジャンプしたときに広告区間と誤判定して暴走するのを防ぐ。広告は通常連続再生なので 1 フレームあたりの差分は 0.016〜0.033 秒程度。

### なぜ isLikelyPreviewVideo は muted で判定しない？
muted で字幕だけ追って高速視聴するのは valid な使い方なので、これを除外すると逆に困る。

---

## 10. その他リソース

- Chrome Web Store: https://chromewebstore.google.com/detail/cinemagazer/iogcniihehmjmclbhakekencmlplclii
- GitHub: https://github.com/qurihara/cinemagazer-chrome
- 著者 Web: https://www.unryu.org/
- 拡張内表示の著者リンク (popup credit): https://www.unryu.org/

---

## Appendix A: コミット履歴（直近）

```
fbc56df  v0.3.4  Suppress engine/HUD on auto-preview videos
df057b1  v0.3.3  Fix post-ad double subtitles + center drift
7fa9c9d  v0.3.2  Subtitle lifecycle reset on media change/end
b27763c  v0.3.1  Fix subtitle drift after DAI ads
a749c82  v0.3.0  Disney+/Hulu/U-NEXT (experimental) + Prime DAI ad-drift fix via TextTracks
dde0eaf          docs(en): mirror Japanese tip about lowering video quality if loading lags
1bf38b6          Update README.md
42843df  v0.2.15 revert author link to https://www.unryu.org/
f0c93ee  v0.2.14 change author link to https://unryu.org
```

ストア公開済みは **v0.2.15**。`main` 先頭の **v0.3.4 はまだ未提出**。

## Appendix B: 各バージョンで触ったファイル一覧

| ver | コミット | core.js | manifest | その他 |
|---|---|---|---|---|
| v0.3.0 | a749c82 | +173行 (TextTrack観察, 広告検知, SITE_ENABLE_KEY) | 0.3.0, ホスト追加 | 新アダプタ3つ, popup, locales, background |
| v0.3.1 | b27763c | +30行 (adTimeOffset 補正) | 0.3.1 | — |
| v0.3.2 | 7fa9c9d | +30行 (loadstart/ended リセット) | 0.3.2 | — |
| v0.3.3 | df057b1 | +14行 (cg-overlay-active 再付与, DOM優先) | 0.3.3 | — |
| v0.3.4 | fbc56df | +27行 (isLikelyPreviewVideo) | 0.3.4 | — |

— end —

# Chrome Web Store 提出ガイド (CinemaGazer 0.3.10)

> 対応サービス: Netflix / Hulu (hulu.jp) / Disney+ / Amazon Prime Video の4サービス。
> ZIP・バージョンは提出時点の最新に読み替えること（下記は 0.3.10 時点の記述）。

## 提出手順

1. **デベロッパー登録** (一度だけ)
   - https://chrome.google.com/webstore/devconsole/ にGoogleアカウントでログイン
   - $5の登録料を支払う (クレジットカード)
   - 連絡先情報・公開者の身分確認 (D-U-N-Sなどは個人なら不要)

2. **新規アイテムを作成**
   - 既存アイテム(CinemaGazer)を更新する場合は「パッケージ」タブから、新規なら「新しいアイテム」→ 最新版の `cinemagazer-<version>.zip` をアップロード
   - ZIP は本体リポジトリ(ストア用ファイルのみ、e2e/ や docs/ は含めない)から作成する

3. **ストア掲載情報を入力** (下記テンプレートを貼り付け)

4. **プライバシー → 権限の正当化** を入力 (下記テンプレートを貼り付け)

5. **プライバシーポリシー URL** を入力 (GitHubのMarkdownを公開して貼るのが最も簡単)

6. **公開**: 「審査用に送信」→ 通常1〜3日で審査

## ストア掲載情報テンプレート

### 説明文（短い説明 / Summary, 132文字以内）
```
字幕区間と非音声区間で再生速度を動的に切替え、Netflix / Hulu / Disney+ / Prime Video を高速で鑑賞できる拡張です。WISS2011論文の手法を実装。
```

### 詳細な説明（Description）
> [* 2026-07-15 却下対応(キーワードスパム)]: ドメインURLを全削除し、ブランド名の繰り返しを「対応サービス」1箇所に集約。marketing文は総称化。文体は現行のまま。
```
CinemaGazer は、動画の「字幕がある区間（音声）」と「字幕がない区間（非音声/効果音のみ）」を自動判別し、それぞれに異なる再生速度を適用することで、内容理解を保ったまま異常なほど高速に動画を鑑賞できるようにするChrome拡張です。

【手短に説明！】
・対応する動画配信サービスを非常識なほど高速に動画鑑賞できる！たとえば30分もののアニメを10分以下で観るのも全然余裕！忙しい現代人に捧げます👍️
・人間、物語を理解するときには　(1)セリフが理解できること　(2)物語の全てをちゃんと脳内に通過させること　が大切だと思うんだよね。だからAIに重要なシーンだけカットしてもらって要約する、なんてことはしない！セリフ（つまり字幕）があるところはそのセリフが理解できる速さで再生する。そしてセリフがないところは、ものすごい速さで再生する。それを自動的にやるのがこのCinemaGazer。
・セリフを耳で聞きたいなら2.0倍くらいが限界かな。でも字幕を目で見て理解するのでよければ、もっと3~5倍とかでも大丈夫かもね。
もともとある字幕情報を用いるから、鑑賞前にデータ処理する必要もない。軽量で待ち時間なし。サクサク使えるよ！
・このくらいの極限的高速再生だと、字幕を読むために視線を動かすのはNG!画面中央に字幕を表示するから、ずっとぼーっと画面中央を眺めていればOK！
ときどき字幕と映像がずれたり、へんな字幕が出たりするけど、そのときはブラウザを再読み込みしてね！
・異常に高速再生するから、十分速いインターネット回線で使ってね！
目まぐるしく情報が流れ込んでくるから、激しい点滅や目の疲れに注意してね！自己責任で使ってね！

【対応サービス】
Netflix、Hulu、Disney+、Amazon Prime Video に対応しています。字幕がONになっているコンテンツで動作します（Netflixでは自動でONにします）。Amazon Prime Video は字幕同期がコンテンツ依存で不安定な場合があります（実験的）。

【プライバシー】
本拡張は字幕タイミング情報をローカルでのみ処理し、外部サーバーへの送信や保存は一切行いません。
```

## English store listing (英語ロケール掲載欄用)

### Short description (Summary, <=132 chars)
```
Speeds up video on Netflix / Hulu / Disney+ / Prime Video by switching playback rate between subtitled and silent parts.
```

### Detailed description
> 2026-07-15 rejection fix (keyword spam): removed all domain URLs and reduced brand-name repetition to a single "Supported services" statement. Voice unchanged.
```
CinemaGazer is a Chrome extension that automatically distinguishes between video segments with subtitles (speech) and without subtitles (non-speech / sound effects only), and applies different playback speeds to each. This allows users to watch videos at extremely high speed while preserving comprehension.

[Quick intro!]
- Watch supported streaming services at ridiculously high speeds! For example, you can easily finish a 30-minute anime episode in under 10 minutes. Dedicated to busy modern people 👍
- I think the keys to understanding a story are: (1) being able to follow the dialogue, and (2) actually letting the entire story pass through your brain. So this tool does NOT use AI to "summarize the important scenes only" — instead, parts with dialogue (i.e. with subtitles) are played at a speed where you can still understand the speech, and parts without dialogue are played at an extremely high speed. CinemaGazer does this automatically.
- If you want to listen to the dialogue, around 2.0× is the practical limit. But if you're fine with reading the subtitles, 3–5× should still work.
- Because it uses the existing subtitle data, no preprocessing is needed before watching. Lightweight, no waiting time — snappy.
- At these extreme speeds, moving your eyes down to read subtitles is too slow! CinemaGazer can show subtitles in the center of the screen so you can just stare at the middle and read.
- Sometimes subtitles get out of sync, or odd subtitles slip through — when that happens, just reload the browser tab.
- Because playback is unusually fast, please use a sufficiently fast Internet connection.
- Information will fly at you. Please be mindful of rapid flashing and eye fatigue. Use at your own discretion.

[Features]
- Uses the official subtitle timing data already present in the video
- Plays speech segments at a “comprehensible speed” (default: 1.5×), and non-speech segments at a “skippable speed” (default: 4.0×)
- Displays the overall compression rate (i.e., how much viewing time is reduced; estimated on some services)
- Centers subtitles on the screen to minimize eye movement and reduce fatigue during long viewing sessions
- Automatically turns subtitles on where supported

[Supported services]
Works on Netflix, Hulu, Disney+, and Amazon Prime Video, for content with subtitles turned on (turned on automatically on Netflix). On Amazon Prime Video, subtitle sync can be unstable depending on the title (experimental).

[Privacy]
This extension processes subtitle timing information locally only.
No data is transmitted to or stored on external servers.
```

### Single purpose (English)
```
Dynamically switch playback speed based on a video's subtitle timing to support high-speed viewing.
```

### Permission justification — storage (English)
```
Used to save user settings such as playback rates to chrome.storage.sync so they persist across browser sessions.
```

### Permission justification — host permissions (English)
```
Needed to read the subtitle (TTML/VTT) responses that the players of the supported streaming services (Netflix / Hulu / Disney+ / Amazon Prime Video) load — via fetch/XHR — or to observe the on-screen subtitle display, in order to extract subtitle interval timing. It never accesses the video frames themselves or any personal information. Extracted timing is used only in memory and is never transmitted or stored.
```

### Privacy policy URL (English listing)
```
https://github.com/qurihara/cinemagazer-chrome/blob/main/PRIVACY.en.md
```

## カテゴリ・言語

### カテゴリ
- 「アクセシビリティ」または「動画」

### 言語
- 日本語 + 英語（必要なら追加翻訳）

## 権限の正当化（Permission Justifications）

### `storage` の正当化
```
ユーザーが設定した再生速度などの設定値を chrome.storage.sync に保存し、
ブラウザ起動間で永続化するために使用します。
```

### `host_permissions` の正当化（最重要）
各ホストごとに以下の文を提示：
```
対象の動画配信サービス(Netflix / Hulu / Disney+ / Amazon Prime Video)のプレイヤーが
ロードする字幕(TTML/VTT)レスポンスを fetch/XHR レベルで参照する、または画面上の字幕
表示状態を観察して、字幕区間タイミング情報を抽出するために必要です。動画フレーム自体や
個人情報には一切アクセスしません。抽出した情報はメモリ上でのみ使用し、外部送信・
保存は行いません。
```

### Single Purpose（単一の目的）
```
動画の字幕タイミング情報に基づいて再生速度を動的に切り替え、高速鑑賞を支援する。
```

### Remote Code（リモートコード）
- 「使用しない」を選択 (本拡張はリモートコードを実行しません)

### Data Usage 宣言
- 「個人を特定できる情報」「ヘルス情報」「金融情報」「位置情報」… 全部「No / 使用しない」
- 「ユーザーアクティビティ」: 「No」
- 「ウェブサイトコンテンツ」: 「Yes」 → 用途として「拡張機能の機能を提供するため、ユーザーのコンピューターでローカルに処理する」を選択

## プライバシーポリシー（最低限）

GitHubに `PRIVACY.md` を公開してそのURLを使うのが手早い。テンプレ：

```markdown
# CinemaGazer プライバシーポリシー

CinemaGazer (以下「本拡張」) は、ユーザーのプライバシーを尊重します。

## 収集する情報
本拡張は **いかなる個人情報も収集しません**。

本拡張がアクセスする情報は以下に限られます：
- 対象動画配信サービス(Netflix / Hulu / Disney+ / Amazon Prime Video)の字幕タイミング情報 — 再生速度の制御に必要
- ユーザーが設定した再生速度等の設定値 — chrome.storage.sync 上でのみ保存

これらは **すべてローカルブラウザ内で完結** し、外部サーバーへ送信されません。

## サードパーティ
本拡張はトラッキング、解析、広告、外部サービスへの通信を一切行いません。

## 連絡先
ご質問は以下まで:
kurihara@tsuda.ac.jp
```

## 提出前チェックリスト

- [ ] manifest.json のバージョンが提出物と正しいか
- [ ] `description` がストア説明文と整合しているか
- [ ] アイコン 16/48/128 が適切に表示されるか
- [ ] 開発者モードで読み込んで Netflix / Hulu / Disney+ / Prime で動作確認
- [ ] スクリーンショット (1280×800 推奨, 最低1枚) を準備
- [ ] プライバシーポリシーをWeb公開し、URL確定
- [ ] 連絡先メールが受信可能

## アップロード後のよくある差戻し理由

1. **権限の正当化が不十分** → 上のテンプレを丁寧に書く
2. **single purpose違反** → CinemaGazerは明確に単一目的なので問題なし
3. **「Webサイトコンテンツ」の用途未宣言** → Data Usage で必ず宣言
4. **プライバシーポリシーURLが404** → 公開ステータスを確認

## 公開後のアップデート

新バージョンを出す場合：
1. `manifest.json` の `version` を上げる (例: `0.3.6` → `0.3.7`)
2. 新しい ZIP を再パッケージ
3. デベロッパーコンソールから新バージョンをアップロード → 再審査

## 公開せずに「限定公開」もできる

- **限定公開**: 招待した人だけがインストール可能（テスト配布に有用）
- **非公開（自分だけ）**: 開発者本人のみ
- **公開**: 誰でも検索・インストール可能

最初は **限定公開** で身近な人にテストしてもらい、問題なければ公開、というフローが安心です。

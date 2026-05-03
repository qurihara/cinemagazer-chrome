# CinemaGazer for Netflix / Amazon Prime Video — 字幕情報を使ってストリーミング動画を極限まで速く見るChrome拡張

## ストーリー

私たちは死ぬまでにあとどれだけ映像メディアを見なければならないのでしょう。

NetflixやAmazon Prime Videoのような定額制ストリーミングサービスが普及し、家にいながら世界中の映像作品にアクセスできるようになった一方で、「見たい作品リスト」は積み上がるばかりで一向に消化が進まない、というのが現代人の実情ではないでしょうか。じっくり鑑賞すべき名作や重要なドキュメンタリーもあるでしょう。一方で「見るか見ないか判断が微妙だ……でもとりあえず一通り通しておきたい」という映像も増えてしまいます。

CinemaGazer は、そういう映像を **【本来の鑑賞体験を多少損ねてでも】淡々と高速に「通過」させるため** のChrome拡張です。

---

人間が物語を理解するうえで本質的なのは、(1) セリフがちゃんと追えること、そして (2) 物語の全体を脳内に通過させること、の2つだと考えています。だからこのツールは、流行りのAI要約のように「重要なシーンだけ抽出してダイジェストにする」ことはしません。物語そのものの形は壊さずに残し、その代わり「セリフがあるところは、なんとか理解できる速さで」「セリフがないところは、ものすごい速さで」自動的に再生速度を切り替えます。

具体的には、

- **字幕が表示されている区間 = 発話あり** → 既定で 1.5×（理解できる速さ）
- **字幕が表示されていない区間 = 発話なし** → 既定で 4.0×（飛ばせる速さ）

をリアルタイムに切り替えます。風景カット、無言の演出、効果音だけのシーン――こうした非発話区間は4倍速で流しても情報損失が驚くほど少なく、結果として30分のアニメを10分以下で観終えるようなことが普通に可能になります。セリフを耳で聞いて理解したいなら音声区間は 2.0× が現実的な上限ですが、字幕を目で読むだけでよければ 3〜5× でも追えます。非音声区間はかなり攻めて 6〜10× でも大丈夫です。

これは、私が 2011 年に WISS（ヒューマンコンピュータインタラクション分野の国内学会）でベストペーパー賞をいただいた論文 **「CinemaGazer: a System for Watching Videos at Very High Speed」**（[arXiv:1110.0864](https://arxiv.org/abs/1110.0864) / AVI 2012）で提案した *two-level fast-forwarding* の手法を、現代のWebストリーミングサービス上で再現したものです。

CinemaGazer 系列としては、以前 YouTube向けに公開した **「2FF: とても速く見られるYoutubeプレーヤー」**（[ProtoPedia: 596](https://protopedia.net/prototype/596)）がありますが、YouTube は自動字幕の精度がまだ厳しく、そこで音声認識的なアプローチが必要でした。今回の Netflix / Prime Video 版は、**両サービスが配信している公式の字幕データ（TTML / DFXP / WebVTT）をそのまま発話区間として利用**できるため、音声認識すら不要で、軽量・即起動・無設定で動く実装になっています。

---

使い方はとてもシンプルです。

1. Chrome Web Store から **CinemaGazer** をインストール（[ストアページ](https://chromewebstore.google.com/detail/cinemagazer/)）
2. Netflix もしくは Amazon Prime Video で動画を再生
3. 画面右上に小さなHUDが現れ、「いま発話区間か非発話区間か」「現在の再生倍速」「動画全体としての圧縮率（何％の時間で観終わるか）」が常時表示されます
4. HUDをクリックするか、Chromeツールバーの拡張アイコンから設定popupを開けば、音声区間の倍速・非音声区間の倍速・最小ギャップ秒数・字幕タイミング微調整などをお好みで調整できます

Netflix では字幕が自動でONになります。Amazon Prime Video のほうは作品によって字幕タイミングが微妙にズレることがあるため、現時点では「実験的サポート」とし、popupからユーザーが明示的に有効化する設計にしています。

ちょっと面白い機能として、popup下の **「🔗 同じ速度設定で再生するURLリンクをコピー」** ボタンがあります。これを押すと、いま開いている動画のURLに「あなたの速度設定」をクエリパラメータとして付与したリンクがクリップボードにコピーされます。たとえば

```
https://www.netflix.com/watch/82047157?ss=2.0&ns=6.0&ov=1
```

のようなURLを CinemaGazer 導入済みの友人に送れば、相手はあなたとまったく同じ速度設定でその作品の再生を始められます。「このアニメは音声 2.0× / 非音声 6.0× で観るのがオススメ」みたいな、**新しい鑑賞レコメンドの形** がこれで成立します。なお、URL経由で渡された設定はそのタブ限り（保存設定は変更されない）有効です。

---

技術的には、Chrome拡張の `world: "MAIN"` で page-context にスクリプトを注入し、`fetch` / `XMLHttpRequest` をフックして字幕（TTML / DFXP / WebVTT）の本体を捕獲します。Netflix では同時にプレイヤー内部APIの `setTimedTextTrack` を叩いて字幕を自動ONにしています。捕獲した字幕をパースして発話区間タイミングを取得し、`requestAnimationFrame` ループで `currentTime` を常時監視して `playbackRate` を 1.5× / 4.0× の間で切替える、という仕組みです。動画フレーム自体はDRMで保護されていますが、`HTMLMediaElement.playbackRate` と `currentTime` は両サービスで操作可能なので、再生制御だけで two-level fast-forwarding が成立します。

字幕タイミング情報は **すべてユーザーのブラウザ内ローカルでのみ処理** され、外部サーバーへの送信や保存は一切ありません。設定値だけが `chrome.storage.sync` 経由でユーザー自身のGoogleアカウントで同期されます。

ソースコードは GitHub で公開しています： [github.com/qurihara/cinemagazer-chrome](https://github.com/qurihara/cinemagazer-chrome) （MIT License）。ビルドツール不要のVanilla JavaScriptなので、興味のある方は読んだり改造したりも気軽にどうぞ。

---

**注意点・前提**

- Windows / Mac の Chrome で動作確認しています。
- 異常な速度で動画が流れるので、**十分速いインターネット回線** でお使いください。
- 目まぐるしく情報が流れ込んでくるため、**激しい点滅・眼精疲労にご注意** ください。自己責任でお楽しみください。
- ときどき字幕と映像がズレたり、変な字幕が混じったりすることがあります。そういうときはブラウザを再読み込みしてください。
- 本拡張は **字幕がついている作品** を前提に動作します。字幕OFFのコンテンツでは速度切替は無効化されます（速度切替の根拠が消えるため）。
- Amazon Prime Video は実験的サポートです。作品によってはタイミングがズレるので、popup の「字幕タイミング微調整」スライダーで補正してください。

---

**リンク**

- 🛒 Chrome Web Store: [chromewebstore.google.com/detail/cinemagazer/](https://chromewebstore.google.com/detail/cinemagazer/)
- 🐙 GitHub: [github.com/qurihara/cinemagazer-chrome](https://github.com/qurihara/cinemagazer-chrome)
- 📄 元論文（WISS 2011 / arXiv）: [arxiv.org/abs/1110.0864](https://arxiv.org/abs/1110.0864)
- 🎬 元システムのデモ動画（日本語PV）: [youtube.com/watch?v=-_UZqVE-N8I](https://www.youtube.com/watch?v=-_UZqVE-N8I)
- 🎬 元システムのデモ動画（活用例・日本語）: [youtube.com/watch?v=2NZ2ObN0CJc](https://www.youtube.com/watch?v=2NZ2ObN0CJc)
- 📝 系列の前作（YouTube版・2FF）: [protopedia.net/prototype/596](https://protopedia.net/prototype/596)

---

## メンバー

- **栗原 一貴**（@qurihara, 津田塾大学）
  - プロデューサー兼エンジニア

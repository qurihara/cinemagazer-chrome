# CinemaGazer E2E テスト

Chrome拡張のエンジン全段（注入 → アダプタ登録 → video検出 → cue取得 →
速度切替 → HUD/中央オーバーレイ）を、DRM不要のローカルtestbedで自動検証する。
実サービス（Netflix/Prime等）のアカウントもネットワークも不要。

## 仕組み

- `build-dev-ext.js`: 拡張本体を `dist-dev/` にコピーし、manifestに
  localhost向け content_script（`core.js` + `test-adapter.js`）を追加。
  **ストア用 manifest.json は無改変**。test-adapter は既定ONの `netflix` を
  名乗って有効化する（cinemagazer-mobile の testbed と同じハック）。
- `testbed/`: HTML5動画 + WebVTT字幕（音声区間 1–3s / 6–8s、無音 3–6s）。
  `sample.mp4` はリポジトリに含めない（初回ビルド時に隣の
  `cinemagazer-mobile/testbed/` から自動コピー）。
- `run-test.js`: Playwright(Chromium)に dist-dev をロードし、2シナリオを検証:
  1. デフォルト設定（音声1.5x / 無音4.0x）
  2. URLパラメータ設定共有（`?ss=2.0&ns=8.0`）

  各シナリオで ~26秒間 150ms間隔で `currentTime` / `playbackRate` /
  HUD / オーバーレイをサンプリングし、字幕タイムラインと突き合わせて判定。
  スクリーンショットを `shots/` に保存。

## 実行

```sh
cd e2e
npm install          # 初回のみ（playwright + chromium）
npx playwright install chromium   # 初回のみ
npm test
```

ヘッドレスで走る。ウィンドウを見たい時は `HEADED=1 npm test`。

## 注意

- エンジンのtickは requestAnimationFrame 駆動。ヘッドレス(new headless)では
  問題なく動くが、ヘッデッドで走らせる場合はウィンドウを完全に隠さないこと。
- 判定窓は `run-test.js` 冒頭の `SPEECH_WINDOWS` / `SILENCE_WINDOW`。
  `testbed/subs.vtt` を変えたら合わせて更新する。

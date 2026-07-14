# Chrome ウェブストア用スクリーンショット

Chrome ウェブストアの掲載用スクリーンショット（1280×800）とその生成ソース。日英2言語。

## 画像（各 1280×800、ストアにアップロードするもの）

| ファイル | 内容 |
|---|---|
| `cinemagazer-store-shot1.png` / `-en.png` | コンセプト。動画上の HUD（速度・圧縮率・残り時間）と中央字幕。 |
| `cinemagazer-store-shot2.png` / `-en.png` | 仕組み。音声=1.5×／非音声=4.0× の速度切替タイムライン。 |
| `cinemagazer-store-shot3.png` / `-en.png` | 設定画面。実物の popup を現行状態（4サービス全ON）でレンダリングしたもの＋対応サービス。 |

対応: Netflix / Hulu / Disney+ / Amazon Prime Video（Prime のみ実験的）。

## ソースと生成方法

- `shot1.html` / `shot2.html` / `shot3-ja.html`（および `-en` 版）: 各画像の HTML ソース。
- `popup-ja.png` / `popup-en.png`: shot3 が使う「実物 popup」の画像。`popup-cap.js` が
  実際の `popup/popup.html` + `popup.css` + `popup.js` を chrome API をモックしてレンダリングし撮影したもの。
- `popup-cap.js`: 実物 popup を日英で撮影する Playwright スクリプト。
- `render.js`: HTML を 1280×800・deviceScaleFactor=1 で PNG 化する Playwright スクリプト。

Playwright は `e2e/node_modules` のものを利用する（`$HOME/Desktop/claude_work/cinemagazer-chrome` を前提とした
絶対パスを含むため、環境が違う場合はスクリプト内のパスを調整すること）。

再生成の手順の目安:
1. `node popup-cap.js` で `popup-ja.png` / `popup-en.png` を更新（popup を変更した場合）。
2. `render.js` で各 HTML を PNG 化（出力先・対象ファイル名はスクリプト内で指定）。

## メモ

- 旧スクリーンショット（`images/screenshot-1-popup-*.png`, v0.2.8）は Netflix/Prime のみの古い内容のため、
  この新セット（4サービス・現行版）で置き換える。
- HUD・popup の文言は拡張の i18n（`_locales/ja`・`_locales/en`）に準拠。英語ロケールの Chrome では
  拡張 UI が自動で英語表示になる。

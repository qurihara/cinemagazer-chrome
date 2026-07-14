#!/usr/bin/env node
// CinemaGazer DEV: 拡張の自己リロードをトリガーする（.reload-tokenを更新）。
// dev-server.js が常駐し、対象タブに hot-reload content script が生きていること。
const fs = require('fs');
const path = require('path');
fs.writeFileSync(path.join(__dirname, '.reload-token'), String(Date.now()));
console.log('reload token bumped -> extension will chrome.runtime.reload() within ~1.5s');

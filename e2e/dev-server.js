#!/usr/bin/env node
// CinemaGazer DEV: 常駐ホットリロード用サーバ
//
// dist-dev の hot-reload content script が GET /cg-reload をポーリングし、
// 返り値(=.reload-tokenファイルのmtime)が変わると拡張を自己リロードする。
// トリガーは trigger-reload.js（.reload-tokenをtouch）。
//
// 使い方（セッション中1回、バックグラウンドで起動しっぱなしにする）:
//   node dev-server.js   （PORTは DEV_PORT で変更可, 既定 8124）
// 拡張リロードを起こす:
//   node trigger-reload.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.DEV_PORT || 8124);
const TOKEN = path.join(__dirname, '.reload-token');
// ポーリングごとのログは既定では出さない。DEV_VERBOSE を設定した時だけ出力する。
const VERBOSE = Boolean(process.env.DEV_VERBOSE);

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.url && req.url.startsWith('/cg-reload')) {
    let t = '0';
    try { t = String(Math.floor(fs.statSync(TOKEN).mtimeMs)); } catch (e) { /* no token yet */ }
    if (VERBOSE) {
      console.log(new Date().toISOString().slice(11, 19) + ' poll from ' + (req.headers.origin || '?') + ' token=' + t);
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(t);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('cg dev-server');
}).listen(PORT, '127.0.0.1', () => {
  console.log(`cg dev-server on http://localhost:${PORT}  (GET /cg-reload; trigger via trigger-reload.js)`);
});

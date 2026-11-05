// 解析 AoE4 重播檔（.rec）的指令流。實作在 dashboard/js/rec-parse.js（儀表板網頁也用同一份），
// 這裡只多處理 gzip 壓縮的輸入，讓 Node 腳本可以直接丟 Buffer 進來。
'use strict';
const zlib = require('zlib');
const shared = require('../dashboard/js/rec-parse.js');

function parseRec(input, opts) {
  let b = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (b[0] === 0x1f && b[1] === 0x8b) b = zlib.gunzipSync(b);
  return shared.parseRec(b, opts);
}

module.exports = { ...shared, parseRec };

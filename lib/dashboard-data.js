// 讀寫儀表板資料檔 dashboard/data/aoe4-data.js 與 aoe4-data.json（兩份內容相同）。
'use strict';
const fs = require('fs');
const path = require('path');

function readDashboard(root) {
  const file = path.join(root, 'dashboard', 'data', 'aoe4-data.js');
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw.replace(/^[\s\S]*?window\.AOE4_DATA\s*=\s*/, '').replace(/;\s*$/, ''));
}

function writeDashboard(root, data) {
  const dir = path.join(root, 'dashboard', 'data');
  const json = JSON.stringify(data);
  fs.writeFileSync(path.join(dir, 'aoe4-data.js'), '// AoE4 儀表板資料（格式說明見 資料格式.md）\nwindow.AOE4_DATA = ' + json + ';\n');
  fs.writeFileSync(path.join(dir, 'aoe4-data.json'), json);
}

module.exports = { readDashboard, writeDashboard };

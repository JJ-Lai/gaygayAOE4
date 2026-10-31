// Generic Relic Chunky parser (read-only). Usage: node chunky.js <file> [startOffset]
// Layout: "Relic Chunky\r\n\x1a\0" (16 bytes), u32 fileVersion, u32 platform,
// then chunks: char[4] type (FOLD/DATA), char[4] id, u32 version, u32 size, u32 nameLen, name[nameLen], payload[size]
const fs = require('fs');
const MAGIC = Buffer.from('Relic Chunky\r\n\x1a\0', 'latin1');

function parseChunks(buf, off, end, depth, out) {
  while (off + 20 <= end) {
    const type = buf.toString('latin1', off, off + 4);
    if (type !== 'FOLD' && type !== 'DATA') {
      // maybe another embedded Relic Chunky header
      if (buf.compare(MAGIC, 0, 16, off, off + 16) === 0) {
        const fv = buf.readUInt32LE(off + 16), pf = buf.readUInt32LE(off + 20);
        out.push({ depth, off, kind: 'HEADER', fileVersion: fv, platform: pf });
        off += 24; continue;
      }
      out.push({ depth, off, kind: 'STOP', reason: 'unknown tag ' + JSON.stringify(type) });
      return off;
    }
    const id = buf.toString('latin1', off + 4, off + 8);
    const ver = buf.readUInt32LE(off + 8);
    const size = buf.readUInt32LE(off + 12);
    const nameLen = buf.readUInt32LE(off + 16);
    const name = buf.toString('latin1', off + 20, off + 20 + nameLen).replace(/\0+$/, '');
    const dataOff = off + 20 + nameLen;
    const node = { depth, off, kind: type, id, ver, size, name, dataOff, dataEnd: dataOff + size };
    out.push(node);
    if (type === 'FOLD') parseChunks(buf, dataOff, dataOff + size, depth + 1, out);
    off = dataOff + size;
  }
  return off;
}

function parseFile(buf, start = 0) {
  const out = [];
  let off = start;
  if (buf.compare(MAGIC, 0, 16, off, off + 16) !== 0) throw new Error('no Relic Chunky magic at ' + off);
  out.push({ depth: 0, off, kind: 'HEADER', fileVersion: buf.readUInt32LE(off + 16), platform: buf.readUInt32LE(off + 20) });
  const endOff = parseChunks(buf, off + 24, buf.length, 0, out);
  return { chunks: out, endOff };
}

module.exports = { parseFile, parseChunks, MAGIC };

if (require.main === module) {
  const buf = fs.readFileSync(process.argv[2]);
  const start = parseInt(process.argv[3] || '0', 10);
  const { chunks, endOff } = parseFile(buf, start);
  for (const c of chunks) {
    const pad = '  '.repeat(c.depth);
    if (c.kind === 'HEADER') console.log(`${pad}@${c.off} HEADER fileVersion=${c.fileVersion} platform=${c.platform}`);
    else if (c.kind === 'STOP') console.log(`${pad}@${c.off} STOP ${c.reason}`);
    else console.log(`${pad}@${c.off} ${c.kind}${c.id} v${c.ver} size=${c.size} name=${JSON.stringify(c.name)}`);
  }
  console.log('parsed until', endOff, 'of', buf.length);
}

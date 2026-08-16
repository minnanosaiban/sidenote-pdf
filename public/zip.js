"use strict";
// 依存なしの最小ZIPライター（圧縮はSTORED＝無圧縮）。
// .mdファイル＋images/フォルダのような小規模な書き出し用途には十分な範囲だけ、
// ZIPフォーマット（APPNOTE.TXT）のローカルヘッダ・セントラルディレクトリ・EOCDを直接組み立てる。

const ZIP_CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = ZIP_CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ZIPのタイムスタンプはDOS形式（16bit日付＋16bit時刻）で持つ。厳密さは不要（解凍時に使われる程度）。
function toDosDateTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((Math.floor(d.getSeconds() / 2)) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

// files: [{ name: string, bytes: Uint8Array }] を1つのzip Blobにまとめる。
function buildZipBlob(files) {
  const now = toDosDateTime(new Date());
  const chunks = [];
  const centralEntries = [];
  let offset = 0;
  const push = (arr) => { chunks.push(arr); offset += arr.length; };

  files.forEach((file) => {
    const nameBytes = new TextEncoder().encode(file.name);
    const crc = crc32(file.bytes);
    const localOffset = offset;

    const local = new Uint8Array(30 + nameBytes.length);
    const ldv = new DataView(local.buffer);
    ldv.setUint32(0, 0x04034b50, true);   // ローカルファイルヘッダのシグネチャ
    ldv.setUint16(4, 20, true);           // 必要バージョン
    ldv.setUint16(6, 0, true);            // フラグ
    ldv.setUint16(8, 0, true);            // 圧縮方式=0(無圧縮/STORED)
    ldv.setUint16(10, now.time, true);
    ldv.setUint16(12, now.date, true);
    ldv.setUint32(14, crc, true);
    ldv.setUint32(18, file.bytes.length, true);   // 圧縮後サイズ=元サイズ（無圧縮のため）
    ldv.setUint32(22, file.bytes.length, true);   // 元サイズ
    ldv.setUint16(26, nameBytes.length, true);
    ldv.setUint16(28, 0, true);           // 拡張フィールド長=0
    local.set(nameBytes, 30);
    push(local);
    push(file.bytes);

    const central = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(central.buffer);
    cdv.setUint32(0, 0x02014b50, true);   // セントラルディレクトリのシグネチャ
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, now.time, true);
    cdv.setUint16(14, now.date, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, file.bytes.length, true);
    cdv.setUint32(24, file.bytes.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint32(38, 0, true);
    cdv.setUint32(42, localOffset, true);
    central.set(nameBytes, 46);
    centralEntries.push(central);
  });

  const centralStart = offset;
  centralEntries.forEach(push);
  const centralSize = offset - centralStart;

  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, centralStart, true);
  edv.setUint16(20, 0, true);
  push(eocd);

  return new Blob(chunks, { type: "application/zip" });
}

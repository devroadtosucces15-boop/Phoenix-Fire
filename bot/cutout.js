// Green-screen cut-out for the generated avatar. The model is told to paint the player on a flat bright-green backdrop;
// this removes that backdrop (only green connected to the picture's border, so a green detail inside the kit survives),
// softens the edge and returns a real transparent PNG. PNG only: no library, just the Workers/Node streams.
// Returns null whenever it cannot do the job cleanly, and the caller keeps the original picture instead.

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function inflate(bytes) {
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
  return new Uint8Array(out);
}
async function deflate(bytes) {
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
  return new Uint8Array(out);
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

// 8-bit, non-interlaced RGB or RGBA PNG → { w, h, px: Uint8ClampedArray(RGBA) }
export async function decodePng(bytes) {
  if (!bytes || bytes.length < 33 || SIG.some((b, i) => bytes[i] !== b)) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8, w = 0, h = 0, depth = 0, type = -1, interlace = 0; const idat = [];
  while (pos + 8 <= bytes.length) {
    const len = dv.getUint32(pos), name = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8)), data = bytes.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') { w = dv.getUint32(pos + 8); h = dv.getUint32(pos + 12); depth = bytes[pos + 16]; type = bytes[pos + 17]; interlace = bytes[pos + 20]; }
    else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
    pos += 12 + len;
  }
  if (!w || !h || w * h > 16e6 || depth !== 8 || interlace !== 0 || (type !== 2 && type !== 6) || !idat.length) return null;
  const bpp = type === 6 ? 4 : 3, stride = w * bpp;
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0)); let o = 0; for (const c of idat) { joined.set(c, o); o += c.length; }
  let raw; try { raw = await inflate(joined); } catch { return null; }
  if (raw.length < (stride + 1) * h) return null;
  const px = new Uint8ClampedArray(w * h * 4), prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = row[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (f !== 0) return null;
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) { const s = x * bpp, d = (y * w + x) * 4; px[d] = cur[s]; px[d + 1] = cur[s + 1]; px[d + 2] = cur[s + 2]; px[d + 3] = bpp === 4 ? cur[s + 3] : 255; }
    prev.set(cur);
  }
  return { w, h, px };
}

export async function encodePng(w, h, px) {
  const stride = w * 4, raw = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y++) raw.set(px.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const z = await deflate(raw);
  const chunk = (name, data) => { const b = new Uint8Array(12 + data.length), v = new DataView(b.buffer); v.setUint32(0, data.length); for (let i = 0; i < 4; i++) b[4 + i] = name.charCodeAt(i); b.set(data, 8); v.setUint32(8 + data.length, crc32(b.subarray(4, 8 + data.length))); return b; };
  const ihdr = new Uint8Array(13), iv = new DataView(ihdr.buffer); iv.setUint32(0, w); iv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 6;
  const parts = [new Uint8Array(SIG), chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const greenness = (px, i) => px[i + 1] - Math.max(px[i], px[i + 2]);

// Removes the border-connected green backdrop. Returns { png, removed } or null when the result would not be trustworthy.
export async function cutoutGreen(bytes) {
  const img = await decodePng(bytes); if (!img) return null;
  const { w, h, px } = img, n = w * h, bg = new Uint8Array(n), q = new Int32Array(n); let qh = 0, qt = 0;
  const isBg = (p) => { const i = p * 4; return px[i + 3] > 0 && px[i + 1] >= 90 && greenness(px, i) >= 40; };
  const push = (p) => { if (!bg[p] && isBg(p)) { bg[p] = 1; q[qt++] = p; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); } for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (qh < qt) { const p = q[qh++], x = p % w; if (x > 0) push(p - 1); if (x < w - 1) push(p + 1); if (p >= w) push(p - w); if (p < n - w) push(p + w); }
  const frac = qt / n; if (frac < 0.08 || frac > 0.9) return null;
  for (let p = 0; p < n; p++) if (bg[p]) px[p * 4 + 3] = 0;
  // two passes of edge softening: figure pixels touching the removed area lose their green spill and fade by how green they still are
  let edge = new Uint8Array(n);
  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x; if (px[p * 4 + 3] === 0) continue;
      const near = (x > 0 && (px[(p - 1) * 4 + 3] === 0 || edge[p - 1])) || (x < w - 1 && (px[(p + 1) * 4 + 3] === 0 || edge[p + 1])) || (y > 0 && (px[(p - w) * 4 + 3] === 0 || edge[p - w])) || (y < h - 1 && (px[(p + w) * 4 + 3] === 0 || edge[p + w]));
      if (near && !edge[p]) next[p] = 1;
    }
    for (let p = 0; p < n; p++) if (next[p]) { edge[p] = 1; const i = p * 4, g = greenness(px, i); if (g > 6) { px[i + 1] = Math.max(px[i], px[i + 2]) + 6; px[i + 3] = Math.max(0, Math.min(255, 255 - (g - 6) * 6)); } }
  }
  return { png: await encodePng(w, h, px), removed: frac };
}

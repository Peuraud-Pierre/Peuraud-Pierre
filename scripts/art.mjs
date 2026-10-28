// Generates the dithered / pixel / ASCII artwork of the profile README, in a
// dark and a light variant (*-dark.svg / *-light.svg):
//   assets/banner-*.svg        dithered ringed planet + pixel-font title
//   assets/h-*-*.svg           pixel section headers
//   assets/ascii-planet-*.svg  animated ASCII planet
// The pixel art is a palette PNG embedded in an SVG that adds twinkling stars.
// Pure Node, no dependencies: run `node scripts/art.mjs`.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const out = new URL("../assets/", import.meta.url);

// ---------- PNG (8-bit palette) ----------
const CRC = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4), crc = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type), data]);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(img, palette) {
  const { w, h, px } = img;
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) raw.set(px.subarray(y * w, (y + 1) * w), y * (w + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 3; // indexed color
  const plte = Buffer.from(palette.flatMap((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("PLTE", plte),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const canvas = (w, h, bg = 0) => ({ w, h, px: new Uint8Array(w * h).fill(bg) });
function rect(img, x, y, w, h, v) {
  for (let j = Math.max(0, y); j < Math.min(img.h, y + h); j++)
    img.px.fill(v, j * img.w + Math.max(0, x), j * img.w + Math.min(img.w, x + w));
}
function roundRect(img, x, y, w, h, r, v) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const dx = Math.max(r - i, i - (w - 1 - r), 0), dy = Math.max(r - j, j - (h - 1 - r), 0);
      if (dx * dx + dy * dy <= r * r) img.px[(y + j) * img.w + x + i] = v;
    }
}

// ---------- themes ----------
// The canvases hold palette indices; each theme maps them to colors.
const [BG, FG, MUTED, CARD, P1, P2, P3, V1, V2, V3, HB, S1, S2, S3, S4] = Array.from({ length: 15 }, (_, i) => i);
const THEMES = {
  dark: {
    palette: ["#000000", "#ffffff", "#a59fbd", "#17131f", "#4a4752", "#9d99a8", "#ffffff",
      "#3b2870", "#7c5cd6", "#cbb8ff", "#120f18", "#3a3348", "#5b4a8a", "#8b6fd6", "#d8ccff"],
    fg: "#ffffff", muted: "#a59fbd", accent: "#a78bfa", bg: "#000000", border: "#2e2640",
  },
  light: {
    palette: ["#ffffff", "#111111", "#6b6480", "#f1ecfa", "#cfcdd6", "#7d7a88", "#111111",
      "#dccffd", "#9b7be8", "#5b21b6", "#f5f2fb", "#e2dcef", "#c4b3f0", "#9b7be8", "#6d28d9"],
    fg: "#111111", muted: "#6b6480", accent: "#7c3aed", bg: "#ffffff", border: "#ddd3f3",
  },
};

// ---------- 5x7 pixel font ----------
const G = {
  A: ".###.#...##...#######...##...##...#", B: "####.#...##...#####.#...##...#####.",
  C: ".###.#...##....#....#....#...#.###.", D: "####.#...##...##...##...##...#####.",
  E: "######....#....####.#....#....#####", F: "######....#....####.#....#....#....",
  G: ".###.#...##....#.####...##...#.####", H: "#...##...##...#######...##...##...#",
  I: "#####..#....#....#....#....#..#####", J: "..###...#....#....#....#.#..#..##..",
  K: "#...##..#.#.#..##...#.#..#..#.#...#", L: "#....#....#....#....#....#....#####",
  M: "#...###.###.#.##.#.##...##...##...#", N: "#...###..##.#.##..###...##...##...#",
  O: ".###.#...##...##...##...##...#.###.", P: "####.#...##...#####.#....#....#....",
  Q: ".###.#...##...##...##.#.##..#..##.#", R: "####.#...##...#####.#.#..#..#.#...#",
  S: ".#####....#.....###.....#....#####.", T: "#####..#....#....#....#....#....#..",
  U: "#...##...##...##...##...##...#.###.", V: "#...##...##...##...##...#.#.#...#..",
  W: "#...##...##...##.#.##.#.##.#.#.#.#.", X: "#...##...#.#.#...#...#.#.#...##...#",
  Y: "#...##...#.#.#...#....#....#....#..", Z: "#####....#...#...#...#...#....#####",
  0: ".###.#...##..###.#.###..##...#.###.", 1: "..#...##....#....#....#....#...###.",
  2: ".###.#...#....#...#...#...#...#####", 3: "####.....#....#.###.....#....#####.",
  4: "...#...##..#.#.#..#.#####...#....#.", 5: "######....####.....#....##...#.###.",
  6: ".###.#....#....####.#...##...#.###.", 7: "#####....#...#...#...#....#....#...",
  8: ".###.#...##...#.###.#...##...#.###.", 9: ".###.#...##...#.####....#....#.###.",
  "?": ".###.#...#....#...#...#.........#..", "/": "....#....#...#...#...#...#....#....",
  "-": "................###................", ".": "................................#..",
  "·": ".................#.................", "~": "...........#...#.#.#...#...........",
  "_": "..............................#####", "!": "..#....#....#....#....#.........#..",
  ":": ".......#...............#..........", " ": "...................................",
};
// Draws text; each font pixel is sx*sy, `gap` px left between font pixels.
function text(img, str, x, y, sx, sy, v, gap = 0) {
  for (const ch of str.toUpperCase()) {
    const g = (G[ch] ?? G[" "]).padEnd(35, ".");
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 5; c++)
        if (g[r * 5 + c] === "#") rect(img, x + c * sx, y + r * sy, sx - gap, sy - gap, v);
    x += 6 * sx;
  }
  return x;
}
const textWidth = (str, sx) => str.length * 6 * sx - sx;

// ---------- noise ----------
let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const hash3 = (x, y, z) => {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
};
const smooth = (t) => t * t * (3 - 2 * t);
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = smooth(x - xi), v = smooth(y - yi), w = smooth(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const n = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return l(l(l(n(0, 0, 0), n(1, 0, 0), u), l(n(0, 1, 0), n(1, 1, 0), u), v),
           l(l(n(0, 0, 1), n(1, 0, 1), u), l(n(0, 1, 1), n(1, 1, 1), u), v), w);
}
const fbm = (x, y, z) => {
  let s = 0, a = 0.5, f = 1;
  for (let o = 0; o < 4; o++, a /= 2, f *= 2) s += a * noise3(x * f, y * f, z * f);
  return s;
};

// ---------- ringed planet ----------
// Orthographic view, screen y points down, z towards the viewer. Returns the
// brightness (0..1) of world point (x, y), planet radius 1.
const norm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const LIGHT = norm([-0.6, -0.7, 0.5]);
function ringNormal(tilt, roll) {
  const ny = Math.cos(tilt), nz = Math.sin(tilt);
  return [-ny * Math.sin(roll), ny * Math.cos(roll), nz];
}
let hitRing = false; // whether the last planet() sample landed on the ring
function planet(x, y, { spin = 0, ring = ringNormal(0.32, -0.3), r1 = 1.35, r2 = 2.15, tex = 0.7, ringTex = 1 } = {}) {
  const d2 = x * x + y * y;
  const zs = d2 < 1 ? Math.sqrt(1 - d2) : -Infinity;
  // ring hit
  let ringV = -1, zr = -Infinity;
  const z = -(ring[0] * x + ring[1] * y) / ring[2];
  const r = Math.hypot(x, y, z);
  if (r > r1 && r < r2) {
    zr = z;
    const bands = 1 - ringTex * 0.45 + ringTex * (0.45 * Math.sin(r * 23) * Math.sin(r * 7.3) + 0.25 * (fbm(r * 6, 0, 3) - 0.5));
    const edge = Math.min(1, (r - r1) * 8, (r2 - r) * 6);
    // planet shadow on the ring: ray from the ring point towards the light
    const t = -dot([x, y, z], LIGHT);
    const closest = Math.hypot(x + LIGHT[0] * t, y + LIGHT[1] * t, z + LIGHT[2] * t);
    const shadow = t > 0 && closest < 1 ? 0.12 : 1;
    ringV = Math.max(0, bands) * edge * shadow * 0.85;
  }
  hitRing = zr > zs;
  if (hitRing) return ringV;
  if (zs === -Infinity) return 0;
  const n = [x, y, zs];
  const c = Math.cos(spin), s = Math.sin(spin);
  const p = [n[0] * c + n[2] * s, n[1], -n[0] * s + n[2] * c];
  const albedo = 1 - tex * 0.65 + tex * fbm(p[0] * 2.2 + 9, p[1] * 2.2, p[2] * 2.2);
  // ring shadow on the planet
  const t = -dot(n, ring) / dot(LIGHT, ring);
  const q = [n[0] + LIGHT[0] * t, n[1] + LIGHT[1] * t, n[2] + LIGHT[2] * t];
  const rq = Math.hypot(...q);
  const ringShadow = t > 0 && rq > r1 && rq < r2 ? 0.35 : 1;
  const lit = Math.max(0, dot(n, LIGHT));
  return Math.min(1, (Math.pow(lit, 0.85) * albedo + 0.03) * ringShadow);
}

// ---------- twinkling stars ----------
// Pixel "plus" stars blinking at their own pace; `avoid` lists [x, y, w, h]
// boxes (title, cards...) to keep clear.
function stars(n, w, h, avoid = [], px = 3) {
  const list = [];
  while (list.length < n) {
    const x = Math.round(rand() * (w - 20) + 10), y = Math.round(rand() * (h - 20) + 10);
    if (avoid.some(([ax, ay, aw, ah]) => x > ax - 8 && x < ax + aw + 8 && y > ay - 8 && y < ay + ah + 8)) continue;
    list.push({ x, y, px: rand() < 0.3 ? px + 1 : px, violet: rand() < 0.55, dur: 1.8 + rand() * 3.2, delay: rand() * 4 });
  }
  return list;
}
function starsSvg(list, t) {
  return `<style>
    .tw { animation: tw ease-in-out infinite; opacity: 0.15; }
    @keyframes tw { 0%, 100% { opacity: 0.1; } 50% { opacity: 1; } }
  </style>
  ${list.map(({ x, y, px, violet, dur, delay }) =>
    `<path class="tw" style="animation-duration:${dur.toFixed(2)}s;animation-delay:-${delay.toFixed(2)}s" fill="${violet ? t.accent : t.fg}" d="M${x - px / 2} ${y - px * 1.5}h${px}v${px}h${px}v${px}h-${px}v${px}h-${px}v-${px}h-${px}v-${px}h${px}z"/>`).join("\n  ")}`;
}
// Palette PNG wrapped in an SVG (w x h display size) with stars on top.
const pngSvg = (img, t, w, h, starList) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <image width="${w}" height="${h}" style="image-rendering:pixelated" href="data:image/png;base64,${png(img, t.palette).toString("base64")}"/>
  ${starsSvg(starList, t)}
</svg>
`;

// ---------- banner ----------
// Drawn at 2x; returns the canvas and the boxes stars must avoid (display px).
function banner() {
  const S = 2, W = 1200 * S, H = 400 * S, CELL = 4 * S, DOT = 3 * S;
  const cols = W / CELL, rows = H / CELL;
  const img = canvas(W, H, BG);
  const cx = 212, cy = 50, R = 27;
  const dust = norm([-1, -0.45, 0]);
  const f = new Float32Array(cols * rows), ring = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = (i - cx) / R, y = (j - cy) / R;
      let v = planet(x, y, { spin: 0.6 });
      ring[j * cols + i] = hitRing;
      // dust blown off the planet towards the upper left
      const along = x * dust[0] + y * dust[1], perp = Math.abs(-x * dust[1] + y * dust[0]);
      if (along > 0.6 && Math.hypot(x, y) > 0.95) {
        const spread = 0.45 + along * 0.55;
        const density = Math.exp(-(perp * perp) / (2 * spread * spread)) * Math.exp(-(along - 0.6) / 1.6);
        if (rand() < density * 0.55) v = Math.max(v, rand() * density * 1.1);
      }
      if (rand() < 0.004) v = Math.max(v, 0.25 + rand() * 0.6); // stars
      f[j * cols + i] = v;
    }
  // Floyd-Steinberg onto 3 lit levels, drawn as square dots; the ring is violet
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i, v = f[k];
      const q = Math.max(0, Math.min(3, Math.round(v * 3)));
      const e = v - q / 3;
      if (i + 1 < cols) f[k + 1] += (e * 7) / 16;
      if (j + 1 < rows) {
        if (i > 0) f[k + cols - 1] += (e * 3) / 16;
        f[k + cols] += (e * 5) / 16;
        if (i + 1 < cols) f[k + cols + 1] += e / 16;
      }
      if (q) rect(img, i * CELL, j * CELL, DOT, DOT, (ring[k] ? [V1, V2, V3] : [P1, P2, P3])[q - 1]);
    }

  // terminal window frame around the planet (nod to the "creation" frame)
  const fx = 718 * S, fy = 52 * S, fw = 260 * S, fh = 250 * S, lw = 2 * S;
  rect(img, fx, fy, fw, lw, FG); rect(img, fx, fy + fh - lw, fw, lw, FG);
  rect(img, fx, fy, lw, fh, FG); rect(img, fx + fw - lw, fy, lw, fh, FG);
  rect(img, fx, fy + 16 * S, fw, lw, FG);
  rect(img, fx + lw, fy + lw, fw - 2 * lw, 14 * S, BG);
  text(img, "~/PEURAUD-PIERRE", fx + 8 * S, fy + 4 * S, S, S, FG);
  for (let b = 0; b < 3; b++) rect(img, fx + fw - (12 + b * 10) * S, fy + 5 * S, 6 * S, 6 * S, [V3, V2, MUTED][b]);

  // title + subtitle
  text(img, "PIERRE", 56 * S, 70 * S, 9 * S, 12 * S, FG, S);
  text(img, "PEURAUD", 56 * S, 70 * S + 96 * S, 9 * S, 12 * S, FG, S);
  text(img, "APPRENTICE DEVELOPER · FRANCE", 58 * S, 268 * S, 2 * S, 3 * S, V2);

  // "what will you build?" card, after the dithered-hands poster
  const by = 318 * S, bh = 62 * S;
  roundRect(img, 56 * S, by, 170 * S, bh, 12 * S, CARD);
  roundRect(img, 230 * S, by, bh, bh, 12 * S, CARD);
  text(img, "WHAT WILL", 72 * S, by + 14 * S, 2 * S, 2 * S, FG);
  text(img, "YOU BUILD?", 72 * S, by + 34 * S, 2 * S, 2 * S, FG);
  const ix = 230 * S + bh / 2 - 12 * S, iy = by + bh / 2 - 12 * S;
  rect(img, ix, iy, 12 * S, 12 * S, FG);
  rect(img, ix + 12 * S, iy + 12 * S, 12 * S, 12 * S, V2);
  const avoid = [[50, 60, 340, 220], [50, 310, 250, 75], [718, 52, 260, 250]];
  return { img, stars: stars(28, 1200, 400, avoid) };
}

// ---------- section headers ----------
function header(label) {
  const S = 2, W = 900 * S, H = 52 * S;
  const img = canvas(W, H, BG);
  roundRect(img, 0, 0, W, H, 6 * S, HB);
  const sx = 4 * S, sy = 5 * S;
  const end = text(img, label, 22 * S, (H - 7 * sy) / 2, sx, sy, FG, 0);
  // dithered pixel strip fading in to the right, from gray to violet
  const start = end + 30 * S, C = 6 * S, stripY = H / 2 - C;
  for (let x = start; x + C <= W - 18 * S; x += C) {
    const t = (x - start) / (W - 18 * S - start);
    for (let r = 0; r < 2; r++)
      if (rand() < 0.15 + 0.85 * t * t) rect(img, x, stripY + r * C, C, C, [S1, S2, S3, S4][Math.floor(rand() * 4 * (0.4 + 0.6 * t))]);
  }
  return { img, stars: stars(5, 900, 52, [[0, 0, start / S, 52]], 2) };
}

// ---------- ASCII planet ----------
function asciiPlanet() {
  const COLS = 64, ROWS = 18, FRAMES = 16, DUR = 4.8;
  const RAMP = " .`-:;~^/[uo8NM";
  const FS = 12, LH = 13, CW = FS * 0.6, PAD = 18;
  const R = 6.5; // planet radius in rows
  const ring = ringNormal(0.42, 0.55);
  // each frame: rows of { ch, ring }
  const frames = [];
  for (let n = 0; n < FRAMES; n++) {
    const lines = [];
    for (let j = 0; j < ROWS; j++) {
      const line = [];
      for (let i = 0; i < COLS; i++) {
        const x = ((i - COLS / 2 + 0.5) * (CW / LH)) / R, y = (j - ROWS / 2 + 0.5) / R;
        const v = planet(x, y, { spin: (n / FRAMES) * Math.PI * 2, ring, r1: 1.35, r2: 2.05, tex: 0.4, ringTex: 0.25 });
        line.push({ ch: RAMP[Math.min(RAMP.length - 1, Math.floor(Math.pow(v, 0.6) * RAMP.length))], ring: hitRing });
      }
      lines.push(line);
    }
    frames.push(lines);
  }
  // crop to the drawn area, keeping a margin for the stars
  const blank = (i, j) => frames.every((ls) => ls[j][i].ch === " ");
  const colBlank = (i) => [...Array(ROWS).keys()].every((j) => blank(i, j));
  const rowBlank = (j) => [...Array(COLS).keys()].every((i) => blank(i, j));
  let c0 = 0, c1 = COLS, r0 = 0, r1 = ROWS;
  while (colBlank(c0)) c0++;
  while (colBlank(c1 - 1)) c1--;
  while (rowBlank(r0)) r0++;
  while (rowBlank(r1 - 1)) r1--;
  c0 = Math.max(0, c0 - 3); c1 = Math.min(COLS, c1 + 3); r0 = Math.max(0, r0 - 1); r1 = Math.min(ROWS, r1 + 1);
  const cols = c1 - c0, rows = r1 - r0;
  const W = Math.ceil(cols * CW + PAD * 2), H = rows * LH + PAD * 2;
  // nbsp survives the whitespace collapsing of <text>
  const esc = (ch) => (ch === " " ? "\u00a0" : ch);
  const row = (line) => {
    let s = "", cur = null;
    for (const { ch, ring } of line) {
      const r = ring && ch !== " ";
      if (r !== cur) { if (cur) s += "</tspan>"; if (r) s += '<tspan class="r">'; cur = r; }
      s += esc(ch);
    }
    return cur ? s + "</tspan>" : s;
  };
  const step = DUR / FRAMES;
  const free = [];
  for (let j = r0; j < r1; j++) for (let i = c0; i < c1; i++) if (blank(i, j)) free.push([i, j]);
  const twinkles = Array.from({ length: 14 }, () => {
    const [i, j] = free[Math.floor(rand() * free.length)];
    return { x: PAD + (i - c0) * CW, y: PAD + (j - r0 + 1) * LH - 3, ch: "+*·"[Math.floor(rand() * 3)], violet: rand() < 0.6, dur: 1.8 + rand() * 3, delay: rand() * 4 };
  });
  return (t) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <style>
    text { font: 700 ${FS}px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; fill: ${t.fg}; white-space: pre; }
    .r { fill: ${t.accent}; }
    .f { opacity: 0; animation: show ${DUR}s steps(1, end) infinite; }
    @keyframes show { 0% { opacity: 1; } ${(100 / FRAMES).toFixed(3)}% { opacity: 0; } 100% { opacity: 0; } }
    .tw { animation: tw ease-in-out infinite; opacity: 0.15; }
    @keyframes tw { 0%, 100% { opacity: 0.1; } 50% { opacity: 1; } }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="6" fill="${t.bg}" stroke="${t.border}"/>
${twinkles.map(({ x, y, ch, violet, dur, delay }) => `  <text class="tw${violet ? " r" : ""}" x="${x.toFixed(1)}" y="${y}" style="animation-duration:${dur.toFixed(2)}s;animation-delay:-${delay.toFixed(2)}s">${ch}</text>`).join("\n")}
${frames.map((lines, n) => `  <text class="f" xml:space="preserve" style="animation-delay:-${(((FRAMES - n) % FRAMES) * step).toFixed(2)}s">${lines.slice(r0, r1).map((l, j) => `<tspan x="${PAD}" y="${PAD + (j + 1) * LH - 3}">${row(l.slice(c0, c1))}</tspan>`).join("")}</text>`).join("\n")}
</svg>
`;
}

// Geometry is drawn once, then rendered with each theme's colors.
const art = {
  banner: [banner(), 1200, 400],
  ...Object.fromEntries([["about", "WHO I AM"], ["stack", "TECH STACK"], ["connect", "CONNECT"], ["stats", "STATISTICS"]]
    .map(([file, label]) => [`h-${file}`, [header(label), 900, 52]])),
};
const ascii = asciiPlanet();
for (const [name, t] of Object.entries(THEMES)) {
  for (const [file, [{ img, stars }, w, h]] of Object.entries(art))
    writeFileSync(new URL(`${file}-${name}.svg`, out), pngSvg(img, t, w, h, stars));
  writeFileSync(new URL(`ascii-planet-${name}.svg`, out), ascii(t));
}
console.log("art written");

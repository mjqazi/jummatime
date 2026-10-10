/**
 * Synthetic LED timetable-board renderer.
 * Rasterises straight into an RGBA {width,height,data} buffer — no Canvas2D.
 * Optional PNG/JPEG encode/decode via pngjs and jpeg-js.
 */

const fs = require('fs');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

// Sample windows from the reader, slightly oversized so the 40% brightest
// mean lands on the lit rectangle even after a 1-px bloom.
const DRAW_SEGMENTS = [
  [0.22, 0.78, 0.06, 0.20], // A
  [0.78, 0.96, 0.12, 0.48], // B
  [0.76, 0.96, 0.48, 0.88], // C  (meets G)
  [0.22, 0.78, 0.80, 0.94], // D
  [0.04, 0.24, 0.48, 0.88], // E  (meets G)
  [0.04, 0.22, 0.12, 0.50], // F
  [0.22, 0.78, 0.44, 0.56], // G  (meets F and C)
];
const PATTERNS = [
  0b1111110, 0b0110000, 0b1101101, 0b1111001, 0b0110011,
  0b1011011, 0b1011111, 0b1110000, 0b1111111, 0b1111011,
];
const COLOURS = {
  red: [255, 32, 24],
  green: [24, 255, 64],
  amber: [255, 188, 20],
  white: [245, 245, 255],
};

function mulberry32(a) {
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function fillRect(data, w, h, x0, y0, x1, y1, rgb, alpha) {
  const a = alpha == null ? 1 : alpha;
  const ix0 = Math.max(0, Math.floor(x0));
  const iy0 = Math.max(0, Math.floor(y0));
  const ix1 = Math.min(w, Math.ceil(x1));
  const iy1 = Math.min(h, Math.ceil(y1));
  for (let y = iy0; y < iy1; y++) {
    for (let x = ix0; x < ix1; x++) {
      const i = (y * w + x) * 4;
      data[i] = rgb[0] * a + data[i] * (1 - a);
      data[i + 1] = rgb[1] * a + data[i + 1] * (1 - a);
      data[i + 2] = rgb[2] * a + data[i + 2] * (1 - a);
      data[i + 3] = 255;
    }
  }
}

function drawDigit(data, w, h, cell, digit, litRgb, ghost) {
  const insetX = cell.w * 0.10, insetY = cell.h * 0.10;
  const x0 = cell.x + insetX, y0 = cell.y + insetY;
  const cw = cell.w - 2 * insetX, ch = cell.h - 2 * insetY;
  const mask = PATTERNS[digit];
  if (mask == null) return;
  for (let s = 0; s < 7; s++) {
    const on = (mask >> (6 - s)) & 1;
    const r = DRAW_SEGMENTS[s];
    const rgb = on ? litRgb : litRgb.map((c) => c * ghost);
    if (!on && ghost <= 0) continue;
    fillRect(
      data, w, h,
      x0 + r[0] * cw, y0 + r[2] * ch,
      x0 + r[1] * cw, y0 + r[3] * ch,
      rgb, 1,
    );
  }
}

function drawColon(data, w, h, x, y, cellH, rgb) {
  const dot = Math.max(3, cellH * 0.10);
  const gap = cellH * 0.22;
  const cx = x - dot / 2;
  fillRect(data, w, h, cx, y + cellH * 0.28, cx + dot, y + cellH * 0.28 + dot, rgb, 1);
  fillRect(data, w, h, cx, y + cellH * 0.28 + gap, cx + dot, y + cellH * 0.28 + gap + dot, rgb, 1);
}

function parseText(text) {
  const parts = String(text).trim().split(':');
  return {
    groups: parts.map((p) => p.split('').map((ch) => parseInt(ch, 10))),
    raw: text,
  };
}

function layoutRow(text, originX, originY, cellW, cellH, colonGap, digitGap) {
  const { groups } = parseText(text);
  const cells = [];
  const colons = [];
  let x = originX;
  groups.forEach((g, gi) => {
    if (gi) {
      colons.push(x + colonGap / 2);
      x += colonGap;
    }
    g.forEach((d, di) => {
      if (di) x += digitGap;
      cells.push({ x, y: originY, w: cellW, h: cellH, digit: d });
      x += cellW;
    });
  });
  return { cells, colons, width: x - originX, height: cellH };
}

function bloom(data, w, h, radius, litMin) {
  if (!radius || radius < 1) return;
  const src = new Uint8ClampedArray(data);
  const r = radius | 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const mx = Math.max(src[i], src[i + 1], src[i + 2]);
      if (mx < litMin) continue;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const di = (yy * w + xx) * 4;
          const fall = 1 - Math.hypot(dx, dy) / (r + 1);
          if (fall <= 0) continue;
          for (let c = 0; c < 3; c++) {
            const v = src[i + c] * fall * 0.55;
            if (v > data[di + c]) data[di + c] = v;
          }
        }
      }
    }
  }
}

function applyKeystone(src, w, h, ratio) {
  if (!ratio || Math.abs(ratio - 1) < 1e-3) return src;
  const dst = new Uint8ClampedArray(src.length);
  const cx = (w - 1) / 2;
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    const widthY = w * (ratio + (1 - ratio) * t);
    const xL = cx - widthY / 2;
    for (let x = 0; x < w; x++) {
      const srcX = (x - xL) * (w / widthY);
      const di = (y * w + x) * 4;
      if (srcX < 0 || srcX >= w) {
        dst[di + 3] = 255;
        continue;
      }
      const x0 = Math.max(0, Math.min(w - 1, srcX | 0));
      const x1 = Math.min(w - 1, x0 + 1);
      const fx = srcX - x0;
      const s0 = (y * w + x0) * 4, s1 = (y * w + x1) * 4;
      for (let c = 0; c < 4; c++) dst[di + c] = src[s0 + c] * (1 - fx) + src[s1 + c] * fx;
    }
  }
  return dst;
}

function renderBoard(opts) {
  const o = opts || {};
  const width = o.width || 720;
  const height = o.height || 1080;
  const wall = o.wall || [62, 58, 52];
  const panelColor = o.panelColor || [6, 6, 8];
  const margin = o.margin != null ? o.margin : 0.10;
  const px0 = Math.round(width * margin);
  const py0 = Math.round(height * margin);
  const pw = width - 2 * px0;
  const ph = height - 2 * py0;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = wall[0];
    data[i * 4 + 1] = wall[1];
    data[i * 4 + 2] = wall[2];
    data[i * 4 + 3] = 255;
  }
  fillRect(data, width, height, px0, py0, px0 + pw, py0 + ph, panelColor, 1);

  if (o.paper) {
    return { width, height, data };
  }

  const cellH = o.cellH || Math.round(ph * 0.075);
  const cellW = o.cellW || Math.round(cellH * 32 / 56);
  const digitGap = o.digitGap != null ? o.digitGap : Math.round(cellW * 0.12);
  const colonGap = o.colonGap != null ? o.colonGap : Math.round(cellW * 0.42);
  const jamatLeft = o.jamatLeft != null ? o.jamatLeft : px0 + Math.round(pw * 0.16);
  const clockScale = o.clockScale != null ? o.clockScale : 1.45;
  const ghost = o.ghost != null ? o.ghost : 0;
  const ghostRows = o.ghostRows || [];
  const drawColons = o.colons !== false;

  const clock = o.clock || { text: '6:55:42' };
  const rows = o.rows || [
    { text: '4:50' },
    { text: '1:30' },
    { text: '5:15' },
    { text: '6:51', colour: 'green' },
    { text: '8:45' },
    { text: '1:30' },
  ];
  const extras = o.extras || [
    { text: '4:53', leftFrac: 0.58, heightScale: 0.62 },
    { text: '12:05', leftFrac: 0.58, heightScale: 0.62 },
    { text: '8:24', leftFrac: 0.58, heightScale: 0.55 },
  ];

  const paintRow = (spec, originX, originY, cw, ch, ghostAmt) => {
    const colour = COLOURS[spec.colour || 'red'] || COLOURS.red;
    const layout = layoutRow(spec.text, originX, originY, cw, ch, drawColons ? colonGap * (cw / cellW) : digitGap, digitGap * (cw / cellW));
    for (const cell of layout.cells) {
      drawDigit(data, width, height, cell, cell.digit, colour, ghostAmt);
    }
    if (drawColons) {
      for (const cx of layout.colons) drawColon(data, width, height, cx, originY, ch, colour);
    }
    return layout;
  };

  const clockH = Math.round(cellH * clockScale);
  const clockW = Math.round(cellW * clockScale);
  const clockY = py0 + Math.round(ph * 0.04);
  paintRow(clock, jamatLeft, clockY, clockW, clockH, o.ghostClock != null ? o.ghostClock : 0);

  const jamatTop = clockY + clockH + Math.round(ph * 0.02);
  const rowGap = Math.round(cellH * 0.22);
  rows.forEach((spec, i) => {
    const y = jamatTop + i * (cellH + rowGap);
    const g = ghostRows.includes(i) ? ghost : (spec.ghost != null ? spec.ghost : 0);
    paintRow(spec, jamatLeft, y, cellW, cellH, g);
  });

  const extraTop = jamatTop + Math.round(cellH * 0.4);
  extras.forEach((spec, i) => {
    const scale = spec.heightScale != null ? spec.heightScale : 0.6;
    const ew = Math.round(cellW * scale), eh = Math.round(cellH * scale);
    const left = px0 + Math.round(pw * (spec.leftFrac != null ? spec.leftFrac : 0.58));
    const y = extraTop + i * (eh + Math.round(rowGap * 0.8));
    paintRow(spec, left, y, ew, eh, 0);
  });

  bloom(data, width, height, o.bloom || 0, 140);

  if (o.glare && o.glare.height) {
    const gy = py0 + Math.round(ph * (o.glare.yFrac != null ? o.glare.yFrac : 0.4));
    const gh = o.glare.height;
    fillRect(data, width, height, px0, gy, px0 + pw, gy + gh, [255, 255, 255], o.glare.alpha != null ? o.glare.alpha : 0.35);
  }

  let out = data;
  if (o.keystone && o.keystone !== 1) {
    out = applyKeystone(data, width, height, o.keystone);
  }

  if (o.noise > 0) {
    const rng = mulberry32(o.seed || 1);
    const sigma = o.noise;
    for (let i = 0; i < width * height; i++) {
      const n = gaussian(rng) * sigma;
      const p = i * 4;
      for (let c = 0; c < 3; c++) {
        let v = out[p + c] + n;
        if (v < 0) v = 0; else if (v > 255) v = 255;
        out[p + c] = v;
      }
    }
  }

  return { width, height, data: out };
}

function referenceBoard(overrides) {
  return renderBoard(Object.assign({
    clock: { text: '6:55:42' },
    rows: [
      { text: '4:50' },
      { text: '1:30' },
      { text: '5:15' },
      { text: '6:51', colour: 'green' },
      { text: '8:45' },
      { text: '1:30' },
    ],
    extras: [
      { text: '4:53', leftFrac: 0.58, heightScale: 0.62 },
      { text: '12:05', leftFrac: 0.58, heightScale: 0.62 },
      { text: '8:24', leftFrac: 0.58, heightScale: 0.55 },
    ],
  }, overrides || {}));
}

function encodePng(image) {
  const png = new PNG({ width: image.width, height: image.height });
  png.data.set(image.data);
  return PNG.sync.write(png);
}

function loadPng(filePath) {
  const png = PNG.sync.read(fs.readFileSync(filePath));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}

function loadJpeg(filePath) {
  const raw = jpeg.decode(fs.readFileSync(filePath), { useTArray: true });
  return { width: raw.width, height: raw.height, data: new Uint8ClampedArray(raw.data) };
}

module.exports = {
  renderBoard,
  referenceBoard,
  encodePng,
  loadPng,
  loadJpeg,
  COLOURS,
};

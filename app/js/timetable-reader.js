// On-device 7-segment timetable board reader.
// Pure ImageData in → rows out. No DOM, no canvas, no `window` inside
// the algorithm (the assignment at the bottom is the only global).
//
// Pipeline (each stage is a separately exported synchronous function):
//   luminance → locate panel → crop/scale → optional trapezoid warp →
//   LED mask → components → digits → rows → colons → grammar →
//   7-segment sample → decode → confidence.

const SEG_A = 0, SEG_B = 1, SEG_C = 2, SEG_D = 3, SEG_E = 4, SEG_F = 5, SEG_G = 6;
const SEG_REGIONS = [
  [0.25, 0.75, 0.08, 0.18], // A top
  [0.78, 0.92, 0.14, 0.45], // B upper-right
  [0.78, 0.92, 0.55, 0.86], // C lower-right
  [0.25, 0.75, 0.82, 0.92], // D bottom
  [0.08, 0.22, 0.55, 0.86], // E lower-left
  [0.08, 0.22, 0.14, 0.45], // F upper-left
  [0.25, 0.75, 0.45, 0.55], // G middle
];
// Canonical 7-bit masks, bit6=A … bit0=G.
const CANON = [
  0b1111110, // 0 ABCDEF
  0b0110000, // 1 BC
  0b1101101, // 2 ABDEG
  0b1111001, // 3 ABCDG
  0b0110011, // 4 BCFG
  0b1011011, // 5 ACDFG
  0b1011111, // 6 ACDEFG
  0b1110000, // 7 ABC
  0b1111111, // 8 ABCDEFG
  0b1111011, // 9 ABCDFG
];
const SPARSE_PAIRS = [[1, 8], [0, 8], [5, 6], [7, 9], [5, 9], [3, 9], [3, 8]];

function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function median(arr) {
  const n = arr.length;
  if (!n) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const m = (n - 1) / 2;
  return (s[m | 0] + s[Math.ceil(m)]) / 2;
}

function hamming7(a, b) {
  let x = (a ^ b) & 0x7f, c = 0;
  while (x) { c += x & 1; x >>= 1; }
  return c;
}

function bitOn(mask, i) {
  return (mask >> (6 - i)) & 1;
}

// ─── Stage 1: luminance ───────────────────────────────────────────

function luminancePlane(image) {
  const { width, height, data } = image;
  const n = width * height;
  const L = new Float32Array(n);
  const chroma = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    L[i] = mx / 255;
    chroma[i] = (mx - mn) / 255;
  }
  return { L, chroma, width, height };
}

function percentileU8(L, n, p) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    let v = (L[i] * 255) | 0;
    if (v < 0) v = 0; else if (v > 255) v = 255;
    hist[v]++;
  }
  const target = p * n;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= target) return i / 255;
  }
  return 1;
}

function maxL(L, n) {
  let m = 0;
  for (let i = 0; i < n; i++) if (L[i] > m) m = L[i];
  return m;
}

// ─── Connected components (8-connected) ───────────────────────────

function connectedComponents(mask, width, height) {
  const n = width * height;
  const labels = new Int32Array(n);
  const comps = [];
  const stack = new Int32Array(n);
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy = [-1, -1, -1, 0, 0, 1, 1, 1];

  for (let seed = 0; seed < n; seed++) {
    if (!mask[seed] || labels[seed]) continue;
    const id = comps.length + 1;
    let sp = 0;
    stack[sp++] = seed;
    labels[seed] = id;
    let minX = seed % width, maxX = minX;
    let minY = (seed / width) | 0, maxY = minY;
    let area = 0, sumX = 0, sumY = 0, peak = 0, peakIdx = seed;
    while (sp) {
      const idx = stack[--sp];
      const x = idx % width;
      const y = (idx / width) | 0;
      area++;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let k = 0; k < 8; k++) {
        const nx = x + dx[k], ny = y + dy[k];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nidx = ny * width + nx;
        if (!mask[nidx] || labels[nidx]) continue;
        labels[nidx] = id;
        stack[sp++] = nidx;
      }
    }
    comps.push({
      id, minX, minY, maxX, maxY, area,
      x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1,
      cx: sumX / area, cy: sumY / area,
      peak, peakIdx,
    });
  }
  return { labels, comps };
}

function attachPeaks(comps, labels, L, width, height) {
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const id = labels[i];
    if (!id) continue;
    const c = comps[id - 1];
    if (L[i] > c.peak) { c.peak = L[i]; c.peakIdx = i; }
  }
}

function dilate3x3(src, width, height) {
  const n = width * height;
  const dst = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!src[y * width + x]) continue;
      const y0 = y > 0 ? y - 1 : 0, y1 = y + 1 < height ? y + 1 : height - 1;
      const x0 = x > 0 ? x - 1 : 0, x1 = x + 1 < width ? x + 1 : width - 1;
      for (let yy = y0; yy <= y1; yy++) {
        const row = yy * width;
        for (let xx = x0; xx <= x1; xx++) dst[row + xx] = 1;
      }
    }
  }
  return dst;
}

function clusterByBox(comps, dilatePx) {
  const n = comps.length;
  if (!n) return [];
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i) => {
    let a = i;
    while (parent[a] !== a) a = parent[a];
    let b = i;
    while (parent[b] !== a) { const t = parent[b]; parent[b] = a; b = t; }
    return a;
  };
  const d = dilatePx;
  for (let i = 0; i < n; i++) {
    const a = comps[i];
    const a0 = a.minX - d, a1 = a.maxX + d, b0 = a.minY - d, b1 = a.maxY + d;
    for (let j = i + 1; j < n; j++) {
      const c = comps[j];
      if (c.maxX + d < a0 || c.minX - d > a1 || c.maxY + d < b0 || c.minY - d > b1) continue;
      const ia = find(i), ib = find(j);
      if (ia !== ib) parent[ib] = ia;
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let g = groups.get(r);
    if (!g) { g = []; groups.set(r, g); }
    g.push(comps[i]);
  }
  return Array.from(groups.values());
}

function boundsOf(comps) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1, area = 0;
  for (const c of comps) {
    if (c.minX < minX) minX = c.minX;
    if (c.minY < minY) minY = c.minY;
    if (c.maxX > maxX) maxX = c.maxX;
    if (c.maxY > maxY) maxY = c.maxY;
    area += c.area;
  }
  return { minX, minY, maxX, maxY, area, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// ─── Stage 2: panel locate, crop, scale, warp ─────────────────────

function locatePanel(plane) {
  const { L, width, height } = plane;
  const n = width * height;
  const p95 = percentileU8(L, n, 0.95);
  const thresh = 0.35 * p95;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (L[i] > thresh) mask[i] = 1;
  const { comps } = connectedComponents(mask, width, height);
  const imgArea = n;
  // Drop the wall (giant bright component) and specks.
  const ledLike = comps.filter((c) => c.area >= 8 && c.area < 0.20 * imgArea);
  if (!ledLike.length) {
    return { x: 0, y: 0, w: width, h: height, found: false };
  }
  const dilatePx = Math.max(2, Math.round(width * 0.02));
  const clusters = clusterByBox(ledLike, dilatePx);
  const boxes = clusters.map((g) => {
    const b = boundsOf(g);
    return { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY, area: b.area, members: g };
  });
  const medH = median(boxes.map((b) => b.maxY - b.minY + 1)) || dilatePx;
  // Rows of a board sit farther apart than 2% of width on a short synthetic
  // frame; merge vertically stacked LED clusters so the panel is the whole
  // board, not just the largest single row (usually the clock).
  const mergePx = Math.max(dilatePx, Math.round(medH * 1.25));
  const merged = clusterByBox(boxes, mergePx);
  let best = merged[0], bestArea = 0;
  for (const cl of merged) {
    const area = cl.reduce((s, b) => s + (b.area || 0), 0);
    if (area > bestArea) { bestArea = area; best = cl; }
  }
  const bestComps = [];
  for (const b of best) {
    if (b.members) for (const m of b.members) bestComps.push(m);
    else bestComps.push(b);
  }
  const box = boundsOf(bestComps.length ? bestComps : ledLike);
  const mx = Math.max(4, Math.round(box.w * 0.04));
  const my = Math.max(4, Math.round(box.h * 0.04));
  const x = clamp(box.minX - mx, 0, width - 1);
  const y = clamp(box.minY - my, 0, height - 1);
  const x1 = clamp(box.maxX + mx, 0, width - 1);
  const y1 = clamp(box.maxY + my, 0, height - 1);
  return { x, y, w: x1 - x + 1, h: y1 - y + 1, found: true };
}

function sampleBilinear(data, sw, sh, sx, sy, out, di) {
  if (sx < 0 || sy < 0 || sx >= sw - 1e-6 || sy >= sh - 1e-6) {
    const x = clamp(Math.round(sx), 0, sw - 1);
    const y = clamp(Math.round(sy), 0, sh - 1);
    const si = (y * sw + x) * 4;
    out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
    return;
  }
  const x0 = sx | 0, y0 = sy | 0;
  const x1 = x0 + 1 < sw ? x0 + 1 : x0;
  const y1 = y0 + 1 < sh ? y0 + 1 : y0;
  const fx = sx - x0, fy = sy - y0;
  const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4;
  const i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  for (let c = 0; c < 4; c++) {
    out[di + c] = w00 * data[i00 + c] + w10 * data[i10 + c] + w01 * data[i01 + c] + w11 * data[i11 + c];
  }
}

function cropImage(image, rect) {
  const x0 = clamp(Math.floor(rect.x), 0, image.width);
  const y0 = clamp(Math.floor(rect.y), 0, image.height);
  const w = clamp(Math.floor(rect.w), 1, image.width - x0);
  const h = clamp(Math.floor(rect.h), 1, image.height - y0);
  const data = new Uint8ClampedArray(w * h * 4);
  const src = image.data;
  for (let y = 0; y < h; y++) {
    const si = ((y0 + y) * image.width + x0) * 4;
    data.set(src.subarray(si, si + w * 4), y * w * 4);
  }
  return { width: w, height: h, data };
}

function scaleToLongEdge(image, longEdge) {
  const sw = image.width, sh = image.height;
  const srcLong = Math.max(sw, sh);
  if (srcLong === longEdge) return image;
  const scale = longEdge / srcLong;
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const data = new Uint8ClampedArray(dw * dh * 4);
  const xRatio = sw / dw, yRatio = sh / dh;
  for (let y = 0; y < dh; y++) {
    const sy = (y + 0.5) * yRatio - 0.5;
    for (let x = 0; x < dw; x++) {
      const sx = (x + 0.5) * xRatio - 0.5;
      sampleBilinear(image.data, sw, sh, sx, sy, data, (y * dw + x) * 4);
    }
  }
  return { width: dw, height: dh, data };
}

function cropAndScale(image, rect, longEdge) {
  return scaleToLongEdge(cropImage(image, rect), longEdge);
}

function fitSideEdges(L, width, height) {
  const n = width * height;
  const p95 = percentileU8(L, n, 0.95);
  const thresh = Math.max(0.35 * p95, 0.25);
  const bands = Math.max(8, Math.min(48, (height / 8) | 0));
  const leftPts = [], rightPts = [];
  for (let b = 0; b < bands; b++) {
    const y0 = ((b * height) / bands) | 0;
    const y1 = (((b + 1) * height) / bands) | 0;
    let minX = width, maxX = -1, ySum = 0, cnt = 0;
    for (let y = y0; y < y1; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (L[row + x] <= thresh) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        ySum += y;
        cnt++;
      }
    }
    if (cnt < 4 || maxX < minX) continue;
    const y = ySum / cnt;
    leftPts.push({ x: minX, y });
    rightPts.push({ x: maxX, y });
  }
  const left = fitLineXofY(leftPts);
  const right = fitLineXofY(rightPts);
  const topY = 0, botY = height - 1;
  const xLT = left.a + left.b * topY, xRT = right.a + right.b * topY;
  const xLB = left.a + left.b * botY, xRB = right.a + right.b * botY;
  const topW = xRT - xLT, botW = xRB - xLB;
  const leftLen = Math.hypot(xLB - xLT, botY - topY);
  const rightLen = Math.hypot(xRB - xRT, botY - topY);
  const ratioTB = topW > 0 && botW > 0 ? Math.min(topW, botW) / Math.max(topW, botW) : 0;
  const ratioLR = leftLen > 0 && rightLen > 0 ? Math.min(leftLen, rightLen) / Math.max(leftLen, rightLen) : 0;
  const convex = xLT < xRT && xLB < xRB && topW > 1 && botW > 1;
  const residOk = left.residual < 0.015 * width && right.residual < 0.015 * width;
  const ratioOk = ratioTB >= 0.6 && ratioTB <= 1 && ratioLR >= 0.6 && ratioLR <= 1;
  const vsRect = Math.abs(topW - botW) / Math.max(Math.abs(topW), Math.abs(botW), 1);
  const shouldWarp = convex && residOk && ratioOk && vsRect > 0.03;
  return { left, right, shouldWarp, convex, vsRect, ratioTB, ratioLR };
}

function fitLineXofY(points) {
  const n = points.length;
  if (n < 2) return { a: points[0] ? points[0].x : 0, b: 0, residual: 0 };
  let sumY = 0, sumX = 0, sumYY = 0, sumYX = 0;
  for (const p of points) {
    sumY += p.y; sumX += p.x; sumYY += p.y * p.y; sumYX += p.y * p.x;
  }
  const det = n * sumYY - sumY * sumY;
  let a, b;
  if (Math.abs(det) < 1e-6) {
    a = sumX / n; b = 0;
  } else {
    b = (n * sumYX - sumY * sumX) / det;
    a = (sumX - b * sumY) / n;
  }
  let err = 0;
  for (const p of points) {
    const dx = p.x - (a + b * p.y);
    err += dx * dx;
  }
  return { a, b, residual: Math.sqrt(err / n) };
}

function warpTrapezoid(image, left, right) {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data.length);
  const denom = Math.max(1, width - 1);
  for (let y = 0; y < height; y++) {
    const xL = left.a + left.b * y;
    const xR = right.a + right.b * y;
    const span = xR - xL;
    if (span < 1) continue;
    for (let x = 0; x < width; x++) {
      const srcX = xL + (x / denom) * span;
      sampleBilinear(data, width, height, srcX, y, out, (y * width + x) * 4);
    }
  }
  return { width, height, data: out };
}

// ─── Stage 3: LED mask ────────────────────────────────────────────

function otsuThreshold(L, n) {
  const hist = new Float64Array(256);
  for (let i = 0; i < n; i++) {
    let v = (L[i] * 255) | 0;
    if (v < 0) v = 0; else if (v > 255) v = 255;
    hist[v]++;
  }
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, bestT = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; bestT = t; }
  }
  return bestT / 255;
}

function ledMask(plane) {
  const { L, width, height } = plane;
  const n = width * height;
  const t = otsuThreshold(L, n);
  const otsu = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (L[i] >= t) otsu[i] = 1;
  const { labels, comps } = connectedComponents(otsu, width, height);
  attachPeaks(comps, labels, L, width, height);
  const raw = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const id = labels[i];
    if (!id) continue;
    const peak = comps[id - 1].peak || 0;
    if (L[i] >= 0.45 * peak) raw[i] = 1;
  }
  const dilated = dilate3x3(raw, width, height);
  return { raw, dilated, otsuThreshold: t, comps };
}

// ─── Stage 4: components → digits → rows ──────────────────────────

function componentsToDigits(comps, panelArea) {
  const minA = Math.max(4, panelArea * 0.0002);
  const maxA = panelArea * 0.04;
  const sized = comps.filter((c) => c.area >= 3 && c.area <= maxA);
  if (!sized.length) return { digits: [], smallComps: [] };
  const heights = sized.map((c) => c.h).sort((a, b) => a - b);
  const typicalH = heights[Math.min(heights.length - 1, (heights.length * 0.75) | 0)] || 20;
  const typicalW = typicalH * (32 / 56);
  // Colon dots are squat (h ≈ w, < 25 % of a nearby digit). A split `1`
  // (B/C halves) is tall and thin — keep those in digit clustering even
  // when they are short relative to a larger clock digit on the same board.
  const isDigitComp = (c) => {
    if (c.area < minA) return false;
    if (c.h >= 0.30 * typicalH) return true;
    return c.h >= 0.15 * typicalH && c.h / Math.max(c.w, 1) >= 2.0;
  };
  const digitComps = sized.filter(isDigitComp);
  const smallComps = sized.filter((c) => !isDigitComp(c) || c.area < minA);
  if (!digitComps.length) return { digits: [], smallComps };
  const medW = median(digitComps.map((c) => c.w));
  const sorted = digitComps.slice().sort((a, b) => a.minX - b.minX || a.minY - b.minY);
  const used = new Uint8Array(sorted.length);
  const digits = [];

  const yGapOf = (a0, a1, b0, b1) => (b0 > a1 ? b0 - a1 : a0 > b1 ? a0 - b1 : 0);

  for (let i = 0; i < sorted.length; i++) {
    if (used[i]) continue;
    const cluster = [sorted[i]];
    used[i] = 1;
    let minX = sorted[i].minX, maxX = sorted[i].maxX, minY = sorted[i].minY, maxY = sorted[i].maxY;

    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < sorted.length; j++) {
        if (used[j]) continue;
        const c = sorted[j];
        const unionW = Math.max(maxX, c.maxX) - Math.min(minX, c.minX) + 1;
        const unionH = Math.max(maxY, c.maxY) - Math.min(minY, c.minY) + 1;
        // Cap width by the cluster's own height so a clock-sized typicalW
        // cannot glue two jamat digits (or a `1` and its neighbour) together.
        const localW = unionH * (32 / 56);
        if (unionH > 1.55 * typicalH) continue;
        if (unionW > 1.15 * Math.max(localW, 1)) continue;
        const xOv = Math.max(0, Math.min(maxX, c.maxX) - Math.max(minX, c.minX) + 1);
        const yg = yGapOf(minY, maxY, c.minY, c.maxY);
        const gap = c.minX > maxX ? c.minX - maxX : (minX > c.maxX ? minX - c.maxX : 0);
        const oY0 = Math.max(minY, c.minY), oY1 = Math.min(maxY, c.maxY);
        const minH = Math.min(maxY - minY + 1, c.h);
        const yOv = minH > 0 ? (oY1 - oY0 + 1) / minH : 0;
        const stacked = xOv >= 0.55 * Math.min(maxX - minX + 1, c.w) && yg < 0.14 * Math.max(unionH, typicalH);
        const gapThresh = 0.6 * Math.min(medW, Math.max(maxX - minX + 1, c.w), localW);
        const beside = gap < gapThresh && yOv >= 0.5;
        if (stacked || beside) {
          used[j] = 1;
          cluster.push(c);
          if (c.minX < minX) minX = c.minX;
          if (c.maxX > maxX) maxX = c.maxX;
          if (c.minY < minY) minY = c.minY;
          if (c.maxY > maxY) maxY = c.maxY;
          changed = true;
        }
      }
    }
    digits.push({
      x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1,
      cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
      comps: cluster,
    });
  }
  digits.sort((a, b) => a.x - b.x);
  return { digits, smallComps, typicalH, typicalW };
}

function finishRow(digits) {
  digits.sort((a, b) => a.x - b.x);
  let minY = Infinity, maxY = -1, minX = Infinity, maxX = -1, cy = 0;
  for (const d of digits) {
    if (d.y < minY) minY = d.y;
    if (d.y + d.h - 1 > maxY) maxY = d.y + d.h - 1;
    if (d.x < minX) minX = d.x;
    if (d.x + d.w - 1 > maxX) maxX = d.x + d.w - 1;
    cy += d.cy;
  }
  return {
    digits,
    cy: cy / digits.length,
    y: minY,
    h: maxY - minY + 1,
    x: minX,
    w: maxX - minX + 1,
    digitHeight: median(digits.map((d) => d.h)),
    leftX: minX,
  };
}

function digitsToRows(digits) {
  if (!digits.length) return [];
  const medH = median(digits.map((d) => d.h));
  const medW = median(digits.map((d) => d.w)) || medH * 32 / 56;
  const tol = 0.45 * medH;
  const sorted = digits.slice().sort((a, b) => a.cy - b.cy);
  const bands = [];
  for (const d of sorted) {
    const last = bands[bands.length - 1];
    if (last && Math.abs(d.cy - last.cy) <= tol) {
      last.digits.push(d);
      last.cy = (last.cy * (last.digits.length - 1) + d.cy) / last.digits.length;
    } else {
      bands.push({ digits: [d], cy: d.cy });
    }
  }
  const rows = [];
  for (const band of bands) {
    const ds = band.digits.slice().sort((a, b) => a.x - b.x);
    let group = [ds[0]];
    for (let i = 1; i < ds.length; i++) {
      const gap = ds[i].x - (ds[i - 1].x + ds[i - 1].w);
      if (gap > 1.6 * medW) {
        rows.push(finishRow(group));
        group = [ds[i]];
      } else {
        group.push(ds[i]);
      }
    }
    rows.push(finishRow(group));
  }
  rows.sort((a, b) => a.y - b.y || a.x - b.x);
  return rows;
}

function refineRowByProjection(row, mask, width, height) {
  const x0 = clamp(row.x, 0, width - 1);
  const x1 = clamp(row.x + row.w, 1, width);
  const y0 = clamp(row.y - 4, 0, height - 1);
  const y1 = clamp(row.y + row.h + 4, 1, height);
  let top = -1, bot = -1;
  for (let y = y0; y < y1; y++) {
    let cnt = 0;
    const rowOff = y * width;
    for (let x = x0; x < x1; x++) if (mask[rowOff + x]) cnt++;
    if (cnt >= 2) {
      if (top < 0) top = y;
      bot = y;
    }
  }
  if (top >= 0 && bot >= top) {
    row.y = top;
    row.h = bot - top + 1;
  }
}

function estimateStrokeFromDigits(ds) {
  if (!ds.length) return 1;
  const medH = median(ds.map((d) => d.h)) || 1;
  const thin = ds.filter((d) => d.h / Math.max(d.w, 1) > 2.4);
  if (thin.length) return Math.max(1, median(thin.map((d) => d.w)));
  return Math.max(1, medH * 0.14);
}

function isNarrow1(d, stroke) {
  const w = Math.max(d.w, 1);
  if (d.h / w > 3.5) return true;
  // Dilation at small scale fattens a `1` so h/w drops below 3.5; compare
  // the bbox to the row's stroke (width of a `1` or the thinnest vertical).
  if (stroke > 0 && d.w <= 2.5 * stroke && d.h / w > 2.2) return true;
  return false;
}

function expandNarrowDigit(d, typicalW, stroke, minX) {
  if (typicalW < 2) return;
  if (isNarrow1(d, stroke != null ? stroke : d.w)) {
    d.narrow1 = true;
    const right = d.x + d.w;
    let newX = right - typicalW;
    if (minX != null && newX < minX) newX = minX;
    d.w = Math.max(d.w, right - newX);
    d.x = right - d.w;
    d.cx = d.x + d.w / 2;
  }
}

function expandNarrowOnes(row) {
  const ds = row.digits;
  if (!ds.length) return;
  const stroke = estimateStrokeFromDigits(ds);
  row.strokeWidth = stroke;
  const fat = ds.filter((d) => !isNarrow1(d, stroke));
  const typicalW = fat.length ? median(fat.map((d) => d.w)) : median(ds.map((d) => d.h * 32 / 56));
  const typicalH = median(ds.map((d) => d.h));
  for (let i = 0; i < ds.length; i++) {
    const minX = i > 0 ? ds[i - 1].x + ds[i - 1].w + Math.max(1, stroke * 0.5) : null;
    expandNarrowDigit(ds[i], typicalW, stroke, minX);
  }
  for (let i = 0; i < ds.length; i++) {
    const d = ds[i];
    if (d.narrow1) continue;
    // Widen digits missing a side (3, 7) to a pitch cell, right-aligned
    // so B/C stay on the ink and E/F sample the empty half. Never expand
    // through the previous digit — two `3`s must not share a cell.
    if (d.w >= 0.90 * typicalW) continue;
    const right = d.x + d.w;
    let newX = right - typicalW;
    if (i > 0) {
      const minX = ds[i - 1].x + ds[i - 1].w + Math.max(1, stroke * 0.5);
      if (newX < minX) newX = minX;
    }
    if (newX < d.x) {
      d.w = right - newX;
      d.x = newX;
      d.cx = d.x + d.w / 2;
    }
    d.h = typicalH;
    d.y = d.cy - typicalH / 2;
    d.cy = d.y + d.h / 2;
  }
  row.leftX = Math.min(...ds.map((d) => d.x));
  row.x = row.leftX;
  row.w = Math.max(...ds.map((d) => d.x + d.w)) - row.x;
  row.digitHeight = typicalH;
}

function expandNarrowDigits(digits, typicalW) {
  const stroke = estimateStrokeFromDigits(digits);
  const fat = digits.filter((d) => !isNarrow1(d, stroke));
  const typical = fat.length ? median(fat.map((d) => d.w)) : typicalW;
  for (const d of digits) expandNarrowDigit(d, typical, stroke);
}

// ─── Stage 5: colons ──────────────────────────────────────────────

function findColons(row, smallComps, medH, medW) {
  const ds = row.digits;
  if (ds.length < 2) return [];
  const y0 = row.y, y1 = row.y + row.h;
  const xLo = Math.min(row.x, ds[0].x) - 4;
  const xHi = Math.max(row.x + row.w, ds[ds.length - 1].x + ds[ds.length - 1].w) + 4;
  const small = (smallComps || []).filter((c) =>
    c.h < 0.25 * medH && c.w < 0.6 * medW
    && c.cy >= y0 - 4 && c.cy <= y1 + 4
    && c.cx >= xLo && c.cx <= xHi);
  const blobs = [];
  // Two stacked blobs between digit cells.
  for (let i = 0; i < small.length; i++) {
    for (let j = i + 1; j < small.length; j++) {
      const a = small[i], b = small[j];
      if (Math.abs(a.cx - b.cx) > 0.4 * medW) continue;
      const top = a.cy < b.cy ? a : b;
      const bot = a.cy < b.cy ? b : a;
      if (bot.minY - top.maxY > 0.6 * medH) continue;
      if (bot.cy - top.cy < 0.12 * medH) continue;
      const cx = (a.cx + b.cx) / 2;
      const between = ds.some((d, k) => k < ds.length - 1 && d.cx < cx && ds[k + 1].cx > cx);
      if (!between && !(cx > ds[0].x && cx < ds[ds.length - 1].x + ds[ds.length - 1].w)) continue;
      blobs.push({ x: cx, kind: 'blobs', confidence: 1 });
    }
  }
  // One candidate per inter-digit slot. A `3` next to a `3` has a fat
  // ink-bbox gap that looks like a colon; we only keep the number of
  // colons the grammar expects (1 for 3–4 digits, 2 for 5–6), preferring
  // blob colons and then the largest gap.
  const expect = ds.length >= 5 ? 2 : 1;
  const slots = [];
  for (let i = 0; i < ds.length - 1; i++) {
    const left = ds[i], right = ds[i + 1];
    const gap = right.x - (left.x + left.w);
    const mid = left.x + left.w + gap / 2;
    const blob = blobs.find((c) => c.x > left.cx && c.x < right.cx);
    if (blob) {
      slots.push({ x: blob.x, kind: 'blobs', confidence: 1, gap, i });
    } else if (gap >= 0.55 * medW && gap <= 1.25 * medW) {
      slots.push({ x: mid, kind: 'gap', confidence: 0.8, gap, i });
    }
  }
  slots.sort((a, b) => {
    if (a.kind === 'blobs' && b.kind !== 'blobs') return -1;
    if (b.kind === 'blobs' && a.kind !== 'blobs') return 1;
    return b.gap - a.gap;
  });
  const picked = slots.slice(0, expect).filter((s) => s.confidence > 0);
  picked.sort((a, b) => a.x - b.x);
  return picked.map((s) => ({ x: s.x, kind: s.kind, confidence: s.confidence }));
}

// ─── Stage 6: row grammar ─────────────────────────────────────────

function parseRowGrammar(row) {
  const n = row.digits.length;
  const c = (row.colons || []).length;
  if (c === 1 && (n === 3 || n === 4)) return 'time';
  if (c === 2 && (n === 5 || n === 6)) return 'clock';
  return null;
}

function pitchConfidence(row) {
  const ds = row.digits;
  if (ds.length < 2) return 0.85;
  // A leading `1` is narrower even after expansion; judge regularity on
  // the fat cells so a correct `1:30` is not capped below the fill line.
  const fat = ds.filter((d) => !d.narrow1);
  const use = fat.length >= 2 ? fat : ds;
  const pitches = [];
  for (let i = 1; i < use.length; i++) pitches.push(use[i].cx - use[i - 1].cx);
  if (pitches.length < 1) return 0.85;
  const med = median(pitches);
  if (med <= 0) return 0.85;
  const regular = pitches.every((p) => Math.abs(p - med) <= 0.20 * med);
  return regular ? 1 : 0.85;
}

// ─── Stage 7: seven-segment sampling ──────────────────────────────

function brightest40Mean(vals) {
  const n = vals.length;
  if (!n) return 0;
  const s = vals.slice().sort((a, b) => b - a);
  const k = Math.max(1, Math.ceil(n * 0.4));
  let sum = 0;
  for (let i = 0; i < k; i++) sum += s[i];
  return sum / k;
}

function clipCellToNeighbours(cell, row, stroke) {
  const ds = row.digits;
  const idx = ds.indexOf(cell);
  const padX = cell.w * 0.10, padY = cell.h * 0.10;
  let x0 = cell.x - padX, x1 = cell.x + cell.w + padX;
  let y0 = cell.y - padY, y1 = cell.y + cell.h + padY;
  // Never shrink inside the ink box — the 10 % pad is what reaches a
  // colon or neighbour. Two adjacent `3`s must not inherit the colon-side
  // clip on the neighbour-facing edge (that ate B/C and turned `3` into `8`).
  const ink0 = cell.x, ink1 = cell.x + cell.w;
  const colonR = Math.max(1, (stroke || 1) * 0.8, cell.w * 0.06);
  for (const c of row.colons || []) {
    if (c.x < cell.cx && c.x + colonR > x0) {
      x0 = Math.max(x0, Math.min(c.x + colonR, ink0));
    } else if (c.x > cell.cx && c.x - colonR < x1) {
      x1 = Math.min(x1, Math.max(c.x - colonR, ink1));
    }
  }
  const nGap = Math.max(1, (stroke || 1) * 0.5);
  if (idx > 0) {
    const bound = ds[idx - 1].x + ds[idx - 1].w + nGap;
    x0 = Math.max(x0, Math.min(bound, ink0));
  }
  if (idx >= 0 && idx < ds.length - 1) {
    const bound = ds[idx + 1].x - nGap;
    x1 = Math.min(x1, Math.max(bound, ink1));
  }
  if (x1 - x0 < Math.max(2, (stroke || 1))) {
    return { x: cell.x, y: cell.y, w: cell.w, h: cell.h, narrow1: cell.narrow1, cx: cell.cx, cy: cell.cy };
  }
  return {
    x: x0, y: y0, w: x1 - x0, h: y1 - y0,
    narrow1: cell.narrow1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
  };
}

function sampleSevenSegment(plane, cell, panelPeak, narrow1OrOpts) {
  const { L, width, height } = plane;
  const opts = narrow1OrOpts && typeof narrow1OrOpts === 'object' ? narrow1OrOpts : { narrow1: !!narrow1OrOpts };
  const narrow1 = !!opts.narrow1;
  const stroke = opts.stroke > 0 ? opts.stroke : Math.max(1, cell.w * 0.14);
  // Cell is ink/pitch plus 10 % pad, already clipped off colons and
  // neighbours. Spec windows on that box; E/F/B/C are inset by ~½ stroke
  // from the (clipped) edge so a colon on the boundary cannot score.
  const cellW = Math.max(1, cell.w), cellH = Math.max(1, cell.h);
  const x0 = cell.x, y0 = cell.y;
  const cw = cellW, ch = cellH;
  let cellMin = 1, cellMax = 0;
  const xA = clamp(Math.floor(cell.x), 0, width - 1);
  const xB = clamp(Math.ceil(cell.x + cellW), 1, width);
  const yA = clamp(Math.floor(cell.y), 0, height - 1);
  const yB = clamp(Math.ceil(cell.y + cellH), 1, height);
  for (let y = yA; y < yB; y++) {
    const row = y * width;
    for (let x = xA; x < xB; x++) {
      const v = L[row + x];
      if (v < cellMin) cellMin = v;
      if (v > cellMax) cellMax = v;
    }
  }
  const rawPeak = cellMax;
  if (rawPeak < (narrow1 ? 0.18 : 0.30) * panelPeak) return { reject: true, rawPeak, cellMin, cellMax };
  if (!narrow1 && (cellMax - cellMin) < 0.25 * panelPeak) return { reject: true, rawPeak, cellMin, cellMax };
  const range = Math.max(cellMax - cellMin, 1e-6);
  const scores = new Float32Array(7);
  const rawMeans = new Float32Array(7);
  const collect = (x0f, x1f, y0f, y1f) => {
    const xs = clamp(Math.floor(x0 + x0f * cw), 0, width - 1);
    const xe = clamp(Math.ceil(x0 + x1f * cw), xs + 1, width);
    const ys = clamp(Math.floor(y0 + y0f * ch), 0, height - 1);
    const ye = clamp(Math.ceil(y0 + y1f * ch), ys + 1, height);
    const vals = [];
    for (let y = ys; y < ye; y++) {
      const rowOff = y * width;
      for (let x = xs; x < xe; x++) vals.push(L[rowOff + x]);
    }
    return vals;
  };
  const sx = stroke / cw;
  const sideInset = clamp(Math.max(0.08, sx * 0.5), 0.06, 0.16);
  const sideW = clamp(Math.max(0.12, Math.min(0.14, sx)), 0.10, 0.16);
  const regions = [
    [0.25, 0.75, 0.08, 0.18],                           // A
    [1 - sideInset - sideW, 1 - sideInset, 0.14, 0.45], // B
    [1 - sideInset - sideW, 1 - sideInset, 0.55, 0.86], // C
    [0.25, 0.75, 0.82, 0.92],                           // D
    [sideInset, sideInset + sideW, 0.55, 0.86],         // E
    [sideInset, sideInset + sideW, 0.14, 0.45],         // F
    [0.30, 0.70, 0.45, 0.55],                           // G slightly inset from colon-side edges
  ];
  for (let i = 0; i < 7; i++) {
    if (narrow1 && i !== SEG_B && i !== SEG_C) {
      scores[i] = 0;
      rawMeans[i] = cellMin;
      continue;
    }
    const r = regions[i];
    const vals = collect(r[0], r[1], r[2], r[3]);
    // D/E/F sit next to C/A and next to the neighbour. Brightest-40 %
    // would promote a strip of C into D (a `7`) or a neighbour's B/C
    // into E/F (a `3`). Median of the window is the cell's own ink.
    const raw = (i === SEG_D || i === SEG_E || i === SEG_F) ? median(vals) : brightest40Mean(vals);
    rawMeans[i] = raw;
    scores[i] = (raw - cellMin) / range;
  }
  let brightest = 0, maxScore = 0;
  for (let i = 0; i < 7; i++) {
    if (rawMeans[i] > brightest) brightest = rawMeans[i];
    if (scores[i] > maxScore) maxScore = scores[i];
  }
  const rangeFloor = 0.6 * brightest;
  const litScores = [];
  for (let i = 0; i < 7; i++) if (scores[i] > 0.45) litScores.push(scores[i]);
  const litRef = litScores.length ? median(litScores) : maxScore;
  const scoreFloor = 0.55 * Math.max(litRef, maxScore);
  for (const i of [SEG_E, SEG_F, SEG_G]) {
    if (rawMeans[i] < rangeFloor || scores[i] < scoreFloor) scores[i] = 0;
  }
  let rawOn = 0, rawOff = 0, nOn = 0, nOff = 0;
  for (let i = 0; i < 7; i++) {
    if (scores[i] > 0.45) { rawOn += rawMeans[i]; nOn++; }
    else { rawOff += rawMeans[i]; nOff++; }
  }
  return {
    reject: false,
    scores,
    rawMeans,
    rawPeak,
    cellMin,
    cellMax,
    rawOn: nOn ? rawOn / nOn : 0,
    rawOff: nOff ? rawOff / nOff : 0,
  };
}

// ─── Stage 8: decode ──────────────────────────────────────────────

function matchScore(scores, mask) {
  let s = 0;
  for (let i = 0; i < 7; i++) s += bitOn(mask, i) ? scores[i] : (1 - scores[i]);
  return s / 7;
}

function extraSegmentIndices(denseMask, sparseMask) {
  const extra = [];
  for (let i = 0; i < 7; i++) {
    if (bitOn(denseMask, i) && !bitOn(sparseMask, i)) extra.push(i);
  }
  return extra;
}

function decodeDigit(scores, opts) {
  const onThresh = opts && opts.onThresh != null ? opts.onThresh : 0.45;
  const doStability = !opts || opts.stability !== false;
  let pattern = 0;
  for (let i = 0; i < 7; i++) if (scores[i] > onThresh) pattern |= 1 << (6 - i);

  let best = null, bestDist = 8;
  for (let d = 0; d <= 9; d++) {
    const dist = hamming7(pattern, CANON[d]);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  if (bestDist >= 2) {
    return { value: null, confidence: 0, pattern, hamming: bestDist, alt: null };
  }

  const scoreBest = matchScore(scores, CANON[best]);
  for (let p = 0; p < SPARSE_PAIRS.length; p++) {
    const sparse = SPARSE_PAIRS[p][0], dense = SPARSE_PAIRS[p][1];
    if (best !== dense && best !== sparse) continue;
    const ds = matchScore(scores, CANON[dense]);
    const ss = matchScore(scores, CANON[sparse]);
    if (Math.abs(ds - ss) <= 0.15 || Math.abs(scoreBest - ss) <= 0.15 || Math.abs(scoreBest - ds) <= 0.15) {
      const extra = extraSegmentIndices(CANON[dense], CANON[sparse]);
      if (extra.every((i) => scores[i] < 0.55)) {
        best = sparse;
        bestDist = hamming7(pattern, CANON[sparse]);
      }
    }
  }

  const chosen = CANON[best];
  let minOn = 1, maxOff = 0, hasOn = false, hasOff = false;
  for (let i = 0; i < 7; i++) {
    if (bitOn(chosen, i)) {
      hasOn = true;
      if (scores[i] < minOn) minOn = scores[i];
    } else {
      hasOff = true;
      if (scores[i] > maxOff) maxOff = scores[i];
    }
  }
  if (!hasOn) minOn = 0;
  if (!hasOff) maxOff = 0;
  let conf = clamp((minOn - maxOff) / 0.5, 0, 1);
  if (bestDist === 1) conf *= 0.5;

  if (doStability) {
    const lo = decodeDigit(scores, { onThresh: onThresh - 0.06, stability: false });
    const hi = decodeDigit(scores, { onThresh: onThresh + 0.06, stability: false });
    if (lo.value !== best || hi.value !== best) conf *= 0.5;
  }

  let alt = null, altScore = -1;
  const chosenScore = matchScore(scores, CANON[best]);
  for (let d = 0; d <= 9; d++) {
    if (d === best) continue;
    const s = matchScore(scores, CANON[d]);
    if (s > altScore) { altScore = s; alt = d; }
  }
  if (alt == null || chosenScore - altScore > 0.15) alt = null;

  return { value: best, confidence: conf, pattern, hamming: bestDist, alt };
}

function alternativesFromDigits(digitsOut, colonCount) {
  const idxs = [];
  for (let i = 0; i < digitsOut.length; i++) {
    if (digitsOut[i].alt != null && digitsOut[i].value != null) idxs.push(i);
  }
  const combos = [];
  for (const i of idxs) combos.push([i]);
  for (let a = 0; a < idxs.length; a++) {
    for (let b = a + 1; b < idxs.length; b++) combos.push([idxs[a], idxs[b]]);
  }
  const out = [];
  const seen = new Set();
  seen.add(formatDisplay(digitsOut.map((d) => d.value), colonCount));
  for (const combo of combos) {
    if (out.length >= 4) break;
    const values = digitsOut.map((d, i) => (combo.includes(i) ? d.alt : d.value));
    if (values.some((v) => v == null)) continue;
    const display = formatDisplay(values, colonCount);
    if (seen.has(display)) continue;
    seen.add(display);
    out.push(display);
  }
  return out;
}

function formatDisplay(values, colonCount) {
  const v = values.map((d) => (d == null ? '?' : String(d)));
  if (colonCount === 1 && v.length === 3) return `${v[0]}:${v[1]}${v[2]}`;
  if (colonCount === 1 && v.length === 4) return `${v[0]}${v[1]}:${v[2]}${v[3]}`;
  if (colonCount === 2 && v.length === 5) return `${v[0]}:${v[1]}${v[2]}:${v[3]}${v[4]}`;
  if (colonCount === 2 && v.length === 6) return `${v[0]}${v[1]}:${v[2]}${v[3]}:${v[4]}${v[5]}`;
  return v.join('');
}

function parseDecoded(values, colonCount) {
  if (values.some((d) => d == null)) return null;
  let hh, mm, ss = null;
  if (colonCount === 1 && values.length === 3) {
    hh = values[0]; mm = values[1] * 10 + values[2];
  } else if (colonCount === 1 && values.length === 4) {
    hh = values[0] * 10 + values[1]; mm = values[2] * 10 + values[3];
  } else if (colonCount === 2 && values.length === 5) {
    hh = values[0]; mm = values[1] * 10 + values[2]; ss = values[3] * 10 + values[4];
  } else if (colonCount === 2 && values.length === 6) {
    hh = values[0] * 10 + values[1]; mm = values[2] * 10 + values[3]; ss = values[4] * 10 + values[5];
  } else return null;
  return { hh, mm, ss };
}

function classifyColour(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx < 16) return 'unknown';
  if (mx - mn < 28) return 'white';
  if (r > 90 && g > 70 && r > b * 1.3 && g > b * 1.2 && Math.abs(r - g) < 90) return 'amber';
  if (g >= r && g >= b) return 'green';
  if (r >= g && r >= b) return 'red';
  return 'unknown';
}

function rowColour(image, mask, row) {
  if (!image || !mask) return 'unknown';
  const { width, height, data } = image;
  const x0 = clamp(row.x | 0, 0, width - 1);
  const x1 = clamp((row.x + row.w) | 0, x0 + 1, width);
  const y0 = clamp(row.y | 0, 0, height - 1);
  const y1 = clamp((row.y + row.h) | 0, y0 + 1, height);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    const rowOff = y * width;
    for (let x = x0; x < x1; x++) {
      if (!mask[rowOff + x]) continue;
      const i = (rowOff + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  if (!n) return 'unknown';
  return classifyColour(r / n, g / n, b / n);
}

function finishDecodedRow(row, digitsOut, values, boardIs24h, colour) {
  const colonCount = (row.colons || []).length;
  const parsed = parseDecoded(values, colonCount);
  const display = formatDisplay(values, colonCount);
  const colonConf = row.colons && row.colons.length
    ? Math.min(...row.colons.map((c) => c.confidence))
    : 0;
  const pitchConf = pitchConfidence(row);
  let minDigitConf = 1;
  for (const d of digitsOut) {
    if (d.confidence < minDigitConf) minDigitConf = d.confidence;
  }
  let confidence = Math.min(minDigitConf, colonConf, pitchConf);
  const hh = parsed ? parsed.hh : null;
  const mm = parsed ? parsed.mm : null;
  const ss = parsed ? parsed.ss : null;
  const maxHH = boardIs24h ? 23 : 12;
  const minHH = boardIs24h ? 0 : 1;
  if (!parsed || mm > 59 || (ss != null && ss > 59) || hh > maxHH) {
    confidence = 0;
  } else if (hh < minHH && !(hh === 0 && !boardIs24h && mm <= 59)) {
    confidence = 0;
  }
  const alternatives = alternativesFromDigits(digitsOut, colonCount);
  return {
    kind: row.kind,
    display,
    hh: parsed ? parsed.hh : null,
    mm: parsed ? parsed.mm : null,
    ss: parsed && parsed.ss != null ? parsed.ss : undefined,
    confidence,
    bbox: { x: row.x, y: row.y, w: row.w, h: row.h },
    digitHeight: row.digitHeight,
    leftX: row.leftX,
    colour: colour || row.colour || 'unknown',
    digits: digitsOut,
    colons: row.colons,
    strokeWidth: row.strokeWidth,
    pitchConfidence: pitchConf,
    colonConfidence: colonConf,
    alternatives,
  };
}

function decodeRow(plane, image, mask, row, panelPeak, boardIs24h, opts) {
  const onThresh = opts && opts.onThreshold != null ? opts.onThreshold : 0.45;
  const stroke = row.strokeWidth || estimateStrokeFromDigits(row.digits || []);
  const digitsOut = [];
  const values = [];
  for (const cell of row.digits) {
    const clipped = clipCellToNeighbours(cell, row, stroke);
    const sampled = sampleSevenSegment(plane, clipped, panelPeak, {
      narrow1: !!cell.narrow1, stroke,
    });
    if (sampled.reject) {
      digitsOut.push({ value: null, confidence: 0, pattern: 0, scores: null });
      values.push(null);
      continue;
    }
    const dec = decodeDigit(sampled.scores, { onThresh });
    digitsOut.push({
      value: dec.value,
      confidence: dec.confidence,
      pattern: dec.pattern,
      scores: Array.from(sampled.scores),
      alt: dec.alt != null ? dec.alt : null,
    });
    values.push(dec.value);
  }
  const colour = rowColour(image, mask, row);
  return finishDecodedRow(row, digitsOut, values, boardIs24h, colour);
}

function redecodeRow(row, opts) {
  const onThresh = opts && opts.onThreshold != null ? opts.onThreshold : 0.45;
  const boardIs24h = !!(opts && opts.boardIs24h);
  const srcDigits = row.digits || [];
  const digitsOut = [];
  const values = [];
  for (const d of srcDigits) {
    if (!d.scores || !d.scores.length) {
      digitsOut.push(d);
      values.push(d.value);
      continue;
    }
    const dec = decodeDigit(d.scores, { onThresh });
    digitsOut.push({
      value: dec.value,
      confidence: dec.confidence,
      pattern: dec.pattern,
      scores: d.scores,
      alt: dec.alt != null ? dec.alt : null,
    });
    values.push(dec.value);
  }
  const bbox = row.bbox || { x: row.x, y: row.y, w: row.w, h: row.h };
  const fakeRow = {
    kind: row.kind,
    digits: srcDigits,
    colons: row.colons,
    digitHeight: row.digitHeight,
    leftX: row.leftX,
    x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h,
    strokeWidth: row.strokeWidth,
    colour: row.colour,
  };
  const out = finishDecodedRow(fakeRow, digitsOut, values, boardIs24h, row.colour);
  if (row.pitchConfidence != null || row.colonConfidence != null) {
    const minDigit = Math.min(...digitsOut.map((d) => d.confidence));
    const colonConf = row.colonConfidence != null ? row.colonConfidence : 1;
    const pitchConf = row.pitchConfidence != null ? row.pitchConfidence : 1;
    let confidence = Math.min(minDigit, colonConf, pitchConf);
    if (out.hh == null || out.mm > 59 || (out.ss != null && out.ss > 59)) confidence = 0;
    const maxHH = boardIs24h ? 23 : 12;
    const minHH = boardIs24h ? 0 : 1;
    if (out.hh != null && out.hh > maxHH) confidence = 0;
    if (out.hh != null && out.hh < minHH && !(out.hh === 0 && !boardIs24h)) confidence = 0;
    out.confidence = confidence;
    out.pitchConfidence = pitchConf;
    out.colonConfidence = colonConf;
  }
  return out;
}

function yieldMacrotask() {
  return new Promise((r) => setTimeout(r, 0));
}

// ─── Orchestrator ─────────────────────────────────────────────────

async function readTimetable(image, opts) {
  const cropLongEdge = (opts && opts.cropLongEdge) || 1600;
  const onThreshold = opts && opts.onThreshold != null ? opts.onThreshold : 0.45;
  const t0 = nowMs();
  const stages = [];
  let markAt = t0;
  const mark = (name) => {
    const t = nowMs();
    stages.push({ name, ms: t - markAt });
    markAt = t;
  };

  const plane0 = luminancePlane(image);
  mark('luminance');

  const panelBox = locatePanel(plane0);
  const cropped = cropAndScale(image, panelBox, cropLongEdge);
  const cropPlane = luminancePlane(cropped);
  const edges = fitSideEdges(cropPlane.L, cropped.width, cropped.height);
  let warped = cropped;
  let didWarp = false;
  if (edges.shouldWarp) {
    warped = warpTrapezoid(cropped, edges.left, edges.right);
    didWarp = true;
  }
  const plane = didWarp ? luminancePlane(warped) : cropPlane;
  mark('panel');

  await yieldMacrotask();
  const mask = ledMask(plane);
  mark('mask');

  await yieldMacrotask();
  const panelArea = warped.width * warped.height;
  const { labels, comps } = connectedComponents(mask.dilated, warped.width, warped.height);
  void labels;
  const grouped = componentsToDigits(comps, panelArea);
  expandNarrowDigits(grouped.digits, grouped.typicalW);
  const rowsRaw = digitsToRows(grouped.digits);
  for (const row of rowsRaw) {
    refineRowByProjection(row, mask.dilated, warped.width, warped.height);
    expandNarrowOnes(row);
    const medW = median(row.digits.map((d) => d.w));
    row.colons = findColons(row, grouped.smallComps, row.digitHeight || median(row.digits.map((d) => d.h)), medW);
    row.kind = parseRowGrammar(row);
  }
  mark('group');

  await yieldMacrotask();
  const accepted = rowsRaw.filter((r) => r.kind === 'time' || r.kind === 'clock');
  const panelPeak = maxL(plane.L, plane.L.length);
  const decodeOpts = { onThreshold };
  const decodedPass = accepted.map((row) =>
    decodeRow(plane, warped, mask.raw, row, panelPeak, false, decodeOpts));
  const is24h = decodedPass.some((r) => r.hh > 12);
  const decoded = is24h
    ? accepted.map((row) => decodeRow(plane, warped, mask.raw, row, panelPeak, true, decodeOpts))
    : decodedPass;
  mark('decode');

  const timeHeights = decoded.filter((r) => r.kind === 'time').map((r) => r.digitHeight);
  const medianDigitHeight = timeHeights.length ? median(timeHeights) : median(decoded.map((r) => r.digitHeight));

  return {
    panel: { x: panelBox.x, y: panelBox.y, w: panelBox.w, h: panelBox.h, warped: didWarp },
    rows: decoded,
    stats: {
      medianDigitHeight,
      ms: nowMs() - t0,
      stages,
    },
  };
}

window.JAMAT_TIMETABLE_READER = {
  readTimetable,
  luminancePlane,
  locatePanel,
  cropImage,
  scaleToLongEdge,
  cropAndScale,
  fitSideEdges,
  warpTrapezoid,
  ledMask,
  connectedComponents,
  componentsToDigits,
  digitsToRows,
  findColons,
  parseRowGrammar,
  sampleSevenSegment,
  decodeDigit,
  decodeRow,
  redecodeRow,
  alternativesFromDigits,
  clipCellToNeighbours,
  estimateStrokeFromDigits,
  otsuThreshold,
  CANON,
  SEG_REGIONS,
};

/**
 * Digit recall on clean synthetic boards (task 3 part A).
 * Every time in the set must decode correctly at ≥ 0.8 at jamat-adjacent
 * sizes, without reintroducing a confident-wrong digit.
 */

const path = require('path');
const fs = require('fs');
const { renderBoard } = require('./helpers/boardRender');

jest.setTimeout(30000);

function loadReader() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'timetable-reader.js'), 'utf8');
  // eslint-disable-next-line no-eval
  window.eval(src);
  return window.JAMAT_TIMETABLE_READER;
}

const Reader = loadReader();

const RECALL = [
  '1:33', '3:33', '0:05', '7:17', '7:07',
  '1:30', '11:11', '12:45', '9:30',
  '7:00', '7:30', '10:05', '3:03', '0:00',
];
const SCALES = [1.0, 0.8, 0.65];

function extraRow(reading) {
  const times = (reading.rows || []).filter((r) => r.kind === 'time');
  return times.slice().sort((a, b) => (b.leftX || 0) - (a.leftX || 0))[0];
}

describe('recall on clean synthetic extras (default leftFrac)', () => {
  for (const text of RECALL) {
    for (const scale of SCALES) {
      it(`${text} heightScale=${scale} decodes at ≥ 0.8`, async () => {
        const img = renderBoard({ extras: [{ text, heightScale: scale }] });
        const reading = await Reader.readTimetable(img, { cropLongEdge: 1600 });
        const row = extraRow(reading);
        expect(row).toBeTruthy();
        expect(row.display).toBe(text);
        expect(row.confidence).toBeGreaterThanOrEqual(0.8);
        const want = text.replace(/:/g, '');
        const got = (row.digits || []).map((d) => (d.value == null ? '?' : String(d.value))).join('');
        expect(got).toBe(want);
        for (const d of row.digits || []) {
          if (d.value == null) continue;
          expect(d.confidence).toBeGreaterThanOrEqual(0.8);
        }
      });
    }
  }
});

describe('recall does not reintroduce confident-wrong digits', () => {
  const texts = ['4:53', '12:05', '8:24', '1:33', '3:15', '0:05'];
  const scales = [0.5, 0.62, 0.75, 0.9, 1.0];
  const lefts = [0.05, 0.58];

  for (const text of texts) {
    for (const scale of scales) {
      for (const leftFrac of lefts) {
        it(`${text} s=${scale} L=${leftFrac}: wrong digit conf < 0.5`, async () => {
          const img = renderBoard({ extras: [{ text, leftFrac, heightScale: scale }] });
          const reading = await Reader.readTimetable(img, { cropLongEdge: 1600 });
          const want = text.replace(/:/g, '').split('');
          const jamat = new Set(['4:50', '1:30', '5:15', '6:51', '8:45']);
          for (const row of (reading.rows || []).filter((r) => r.kind === 'time')) {
            expect(row.display === '4:58' && row.confidence >= 0.5).toBe(false);
            if (jamat.has(row.display) && row.display !== text) continue;
            const digits = row.digits || [];
            if (digits.length !== want.length) continue;
            digits.forEach((d, i) => {
              if (d.value == null || String(d.value) === want[i]) return;
              expect(d.confidence).toBeLessThan(0.5);
            });
          }
        });
      }
    }
  }
});

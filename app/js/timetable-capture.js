// ═══════════════════════════════════════════════════════════════════
// Timetable capture — in-app viewfinder tuned for LED boards.
//
// Why this exists: masjid LED boards are multiplexed and mains-synced. A
// phone's auto exposure picks a short shutter for a bright board, catches
// segments mid-cycle, and hands the reader half-lit digits and dark bands.
// The stock camera app (the <input type=file capture> path) gives us no
// say in that. Opening the camera ourselves does:
//
//   1. Exposure biased for the LEDs: exposure compensation at the camera's
//      minimum (wall and frame go dark, the lit segments stay saturated),
//      and where the device allows manual exposure, a ~1/25 s shutter at
//      minimum ISO so one frame integrates a whole mains cycle.
//   2. A burst of frames composited by per-pixel MAX. A segment lit at any
//      instant of the cycle is lit in the composite, so flicker is defeated
//      even on devices that ignore the manual shutter request.
//
// Verified on a Samsung SM-S918U1 (Chrome 152): exposureCompensation
// -2..2, exposureMode manual, exposureTime 0.5–1500 (×100 µs), iso 50–3200,
// focusMode continuous, torch, ImageCapture.grabFrame at 1920×2560. Other
// devices expose a subset; every constraint is applied individually and
// skipped when unsupported.
//
// Pure helpers (buildConstraintPlan, compositeMax, fitWithin) carry no DOM
// so the unit suite covers them; open()/close() own the viewfinder.
//
// Exposed as window.JAMAT_TIMETABLE_CAPTURE = { isSupported, open, close, … }.
// app.js falls back to the hidden file input whenever isSupported() is
// false or open() rejects with code 'denied' / 'unavailable'.
// ═══════════════════════════════════════════════════════════════════

window.JAMAT_TIMETABLE_CAPTURE = (() => {
  const BURST_FRAMES = 10;
  // Gaps between burst frames, in ms. Mains flicker repeats every 10 ms
  // (50 Hz, rectified) or 8.33 ms (60 Hz). A fixed gap that is a multiple
  // of either — 40 ms was — lands every frame on the same phase and the
  // burst learns nothing. Every gap below sits between 0.15 and 0.85 of a
  // half-cycle away from the nearest multiple of BOTH 10 ms and 8.33 ms
  // (the unit test enforces this), so ten frames walk through the waveform
  // of either grid. Total ≈ 450 ms.
  const BURST_SCHEDULE_MS = [23, 27, 37, 43, 45, 47, 53, 55, 57, 63];
  const MAX_EDGE = 2400;           // same cap as the file path in app.js
  // MediaStream units of 100 µs → 50 ms. 50 ms is 5 half-cycles of 50 Hz
  // and 6 of 60 Hz, so a single frame integrates whole cycles of either
  // mains frequency: where the device honours manual exposure, flicker is
  // gone before the burst even starts.
  const TARGET_EXPOSURE_TIME = 500;
  // Exposure bracketing (owner): a second, brighter burst is captured
  // right after the dark one and handed back as `alternate`. app.js reads
  // the dark composite first and only falls back to the brighter one when
  // the reader comes back weak — the two are never blended, because a
  // brighter frame in a MAX composite drags the wall back into the picture.
  const BRACKET_EV_STEP = 1;

  let overlay = null;
  let stream = null;
  let deniedThisSession = false;

  const t = (key, fallback, params) => window.i18n?.t?.(key, params) ?? fallback;

  function isSupported() {
    if (deniedThisSession) return false;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
    if (typeof window !== 'undefined' && window.isSecureContext === false) return false;
    return true;
  }

  // ── Pure helpers ────────────────────────────────────────────────

  /**
   * Turn a track's getCapabilities() into the list of single-key advanced
   * constraints to try, in order, plus a summary of what was chosen. Only
   * keys the device reports are included; the caller applies each one on
   * its own so an unsupported value cannot sink the rest.
   */
  function buildConstraintPlan(caps) {
    const plan = [];
    const chosen = {};
    if (!caps || typeof caps !== 'object') return { plan, chosen };
    const has = (k) => Object.prototype.hasOwnProperty.call(caps, k);
    const listHas = (k, v) => Array.isArray(caps[k]) && caps[k].includes(v);
    const range = (k) => (has(k) && typeof caps[k] === 'object' && caps[k] !== null && Number.isFinite(caps[k].min) ? caps[k] : null);

    const ec = range('exposureCompensation');
    if (ec) {
      plan.push({ exposureCompensation: ec.min });
      chosen.exposureCompensation = ec.min;
    }
    const et = range('exposureTime');
    if (listHas('exposureMode', 'manual') && et) {
      const time = Math.min(Math.max(TARGET_EXPOSURE_TIME, et.min), et.max);
      plan.push({ exposureMode: 'manual' });
      plan.push({ exposureTime: time });
      chosen.exposureMode = 'manual';
      chosen.exposureTime = time;
    }
    // Owner rule: ISO as low as the device allows, always — not only when
    // manual shutter is available. Low gain keeps the dark wall dark and
    // the sensor noise out of the reader's mask; the LEDs are bright
    // enough to saturate at base ISO. Applied after exposure so a device
    // that ties ISO to manual mode sees the mode first.
    const iso = range('iso');
    if (iso) {
      plan.push({ iso: iso.min });
      chosen.iso = iso.min;
    }
    if (listHas('focusMode', 'continuous')) {
      plan.push({ focusMode: 'continuous' });
      chosen.focusMode = 'continuous';
    }
    if (listHas('whiteBalanceMode', 'continuous')) {
      plan.push({ whiteBalanceMode: 'continuous' });
      chosen.whiteBalanceMode = 'continuous';
    }
    if (has('torch')) {
      plan.push({ torch: false });
      chosen.torch = false;
    }
    return { plan, chosen };
  }

  /**
   * One stop brighter than the LED-first plan, for the bracketed second
   * burst: EV up by BRACKET_EV_STEP (clamped to the device max) and, when
   * manual shutter is in play, the shutter doubled (clamped). ISO stays at
   * the device minimum. Returns null when the device offers no exposure
   * control at all (nothing to bracket).
   */
  function bracketPlan(caps, chosen) {
    if (!caps || !chosen) return null;
    const plan = [];
    const out = {};
    const ec = caps.exposureCompensation;
    if (Number.isFinite(chosen.exposureCompensation) && ec && Number.isFinite(ec.max)) {
      const ev = Math.min(chosen.exposureCompensation + BRACKET_EV_STEP, ec.max);
      plan.push({ exposureCompensation: ev });
      out.exposureCompensation = ev;
    }
    const et = caps.exposureTime;
    if (Number.isFinite(chosen.exposureTime) && et && Number.isFinite(et.max)) {
      const time = Math.min(chosen.exposureTime * 2, et.max);
      plan.push({ exposureMode: 'manual' });
      plan.push({ exposureTime: time });
      out.exposureMode = 'manual';
      out.exposureTime = time;
    }
    if (Number.isFinite(chosen.iso)) {
      plan.push({ iso: chosen.iso });
      out.iso = chosen.iso;
    }
    return plan.length ? { plan, chosen: out } : null;
  }

  /** Largest size with the same aspect whose long edge is ≤ maxEdge. */
  function fitWithin(width, height, maxEdge) {
    const long = Math.max(width, height);
    if (!long || long <= maxEdge) return { width, height, scale: 1 };
    const scale = maxEdge / long;
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      scale,
    };
  }

  /**
   * Per-pixel, per-channel maximum across frames of identical size. Alpha
   * is forced to 255. Frames are {width, height, data: Uint8ClampedArray}.
   * The first frame's buffer is reused as the accumulator when `inPlace`
   * is true (the burst path streams frames in one at a time).
   */
  function compositeMax(frames, inPlace = false) {
    if (!Array.isArray(frames) || frames.length === 0) throw new Error('compositeMax: no frames');
    const { width, height } = frames[0];
    const n = width * height * 4;
    const out = inPlace ? frames[0].data : new Uint8ClampedArray(frames[0].data);
    for (let f = inPlace ? 1 : 1; f < frames.length; f++) {
      const fr = frames[f];
      if (fr.width !== width || fr.height !== height || fr.data.length !== n) {
        throw new Error('compositeMax: frame size mismatch');
      }
      mergeMaxInto(out, fr.data);
    }
    for (let i = 3; i < n; i += 4) out[i] = 255;
    return { width, height, data: out };
  }

  function mergeMaxInto(acc, src) {
    const n = acc.length;
    for (let i = 0; i < n; i += 4) {
      if (src[i] > acc[i]) acc[i] = src[i];
      if (src[i + 1] > acc[i + 1]) acc[i + 1] = src[i + 1];
      if (src[i + 2] > acc[i + 2]) acc[i + 2] = src[i + 2];
    }
  }

  // ── Camera plumbing ─────────────────────────────────────────────

  async function applyPlan(track, plan) {
    const applied = {};
    for (const c of plan) {
      const key = Object.keys(c)[0];
      try {
        await track.applyConstraints({ advanced: [c] });
        applied[key] = c[key];
      } catch {
        applied[key] = null; // unsupported on this device — skip, keep going
      }
    }
    return applied;
  }

  // Grab one frame from the live track as ImageData at ≤ MAX_EDGE.
  async function grabFrame(track, video, canvas) {
    let source = null;
    let srcW = 0;
    let srcH = 0;
    if (typeof ImageCapture !== 'undefined') {
      try {
        const ic = new ImageCapture(track);
        source = await ic.grabFrame();
        srcW = source.width;
        srcH = source.height;
      } catch { source = null; }
    }
    if (!source) {
      source = video;
      srcW = video.videoWidth;
      srcH = video.videoHeight;
    }
    if (!srcW || !srcH) throw new Error('Camera frame is empty');
    const fit = fitWithin(srcW, srcH, MAX_EDGE);
    if (canvas.width !== fit.width || canvas.height !== fit.height) {
      canvas.width = fit.width;
      canvas.height = fit.height;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, fit.width, fit.height);
    if (typeof source.close === 'function') source.close();
    return ctx.getImageData(0, 0, fit.width, fit.height);
  }

  // Burst → running MAX composite. Keeps two buffers alive at most.
  async function captureBurst(track, video, { frames = BURST_FRAMES, schedule = BURST_SCHEDULE_MS, onProgress, canvas } = {}) {
    canvas = canvas || document.createElement('canvas');
    let acc = null;
    let taken = 0;
    for (let i = 0; i < frames; i++) {
      const started = performance.now();
      const frame = await grabFrame(track, video, canvas);
      if (!acc) {
        acc = { width: frame.width, height: frame.height, data: new Uint8ClampedArray(frame.data) };
      } else if (frame.width === acc.width && frame.height === acc.height) {
        mergeMaxInto(acc.data, frame.data);
      }
      taken++;
      onProgress?.(taken, frames);
      const gap = schedule[i % schedule.length];
      const wait = gap - (performance.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    const n = acc.data.length;
    for (let i = 3; i < n; i += 4) acc.data[i] = 255;
    return { image: acc, frames: taken };
  }

  // ── Viewfinder UI ───────────────────────────────────────────────

  function buildOverlay() {
    const root = document.createElement('div');
    root.id = 'scan-capture';
    root.className = 'scan-capture';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', t('scan.aria', 'Take a picture of the masjid timetable board'));
    root.innerHTML = `
      <video class="scan-capture__video" playsinline muted autoplay></video>
      <div class="scan-capture__guide" aria-hidden="true"></div>
      <p class="scan-capture__hint"></p>
      <div class="scan-capture__bar">
        <button type="button" class="btn btn--ghost scan-capture__cancel"></button>
        <button type="button" class="btn btn--primary scan-capture__shutter"></button>
      </div>`;
    root.querySelector('.scan-capture__hint').textContent = t('scan.guide', 'Fit the board inside the frame. Hold still.');
    root.querySelector('.scan-capture__cancel').textContent = t('scan.cancel', 'Cancel');
    root.querySelector('.scan-capture__shutter').textContent = t('scan.shutter', 'Take a pic');
    return root;
  }

  function close() {
    if (stream) {
      stream.getTracks().forEach((tr) => { try { tr.stop(); } catch { /* already stopped */ } });
      stream = null;
    }
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    document.body.classList.remove('scan-capture-open');
  }

  /**
   * Open the viewfinder. Resolves with { image, stats } where image is
   * ImageData-shaped, or null when the user cancels. Rejects with an
   * Error carrying .code = 'denied' | 'unavailable' when the camera cannot
   * be opened — the caller should fall back to the file input.
   */
  async function open() {
    if (!isSupported()) {
      const err = new Error('Camera capture unsupported');
      err.code = 'unavailable';
      throw err;
    }
    close();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } },
        audio: false,
      });
    } catch (e) {
      const err = new Error(e?.message || 'Camera unavailable');
      err.code = (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') ? 'denied' : 'unavailable';
      if (err.code === 'denied') deniedThisSession = true;
      throw err;
    }

    const track = stream.getVideoTracks()[0];
    const caps = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
    const { plan, chosen } = buildConstraintPlan(caps);
    const applied = await applyPlan(track, plan);

    overlay = buildOverlay();
    document.body.appendChild(overlay);
    document.body.classList.add('scan-capture-open');
    const video = overlay.querySelector('video');
    video.srcObject = stream;
    try { await video.play(); } catch { /* autoplay attribute covers it */ }

    return new Promise((resolve, reject) => {
      const shutter = overlay.querySelector('.scan-capture__shutter');
      const cancel = overlay.querySelector('.scan-capture__cancel');
      const hint = overlay.querySelector('.scan-capture__hint');
      cancel.addEventListener('click', () => { close(); resolve(null); });
      shutter.addEventListener('click', async () => {
        shutter.disabled = true;
        cancel.disabled = true;
        hint.textContent = t('scan.capturing', 'Hold still…');
        try {
          const canvas = document.createElement('canvas');
          const settingsOf = () => (typeof track.getSettings === 'function' ? track.getSettings() : null);
          const progress = (label) => (i, n) => { hint.textContent = `${t('scan.capturing', 'Hold still…')} ${label}${i}/${n}`; };

          // Burst 1: LED-first (darkest EV, long shutter, base ISO).
          const started = performance.now();
          const dark = await captureBurst(track, video, { canvas, onProgress: progress('') });
          const stats = {
            source: 'burst',
            frames: dark.frames,
            schedule: BURST_SCHEDULE_MS.slice(0, dark.frames),
            ms: Math.round(performance.now() - started),
            width: dark.image.width,
            height: dark.image.height,
            requested: chosen,
            applied,
            settings: settingsOf(),
          };

          // Burst 2: one stop brighter, same schedule — the bracket. Kept
          // separate; app.js only reads it if the dark composite is weak.
          let alternate = null;
          const bracket = bracketPlan(caps, chosen);
          if (bracket) {
            const bApplied = await applyPlan(track, bracket.plan);
            // Exposure changes take a few frames to settle on most sensors;
            // grabbing immediately would put dark frames into the bright burst.
            await new Promise((r) => setTimeout(r, 200));
            const t2 = performance.now();
            const bright = await captureBurst(track, video, { canvas, onProgress: progress('2·') });
            alternate = {
              image: bright.image,
              stats: {
                source: 'burst-bracket',
                frames: bright.frames,
                ms: Math.round(performance.now() - t2),
                width: bright.image.width,
                height: bright.image.height,
                requested: bracket.chosen,
                applied: bApplied,
                settings: settingsOf(),
              },
            };
          }
          close();
          resolve({ image: dark.image, stats, alternate });
        } catch (e) {
          close();
          reject(e);
        }
      });
    });
  }

  return {
    isSupported,
    open,
    close,
    // pure helpers, exported for the unit suite
    buildConstraintPlan,
    bracketPlan,
    compositeMax,
    fitWithin,
    BURST_FRAMES,
    BURST_SCHEDULE_MS,
    BRACKET_EV_STEP,
    TARGET_EXPOSURE_TIME,
    MAX_EDGE,
  };
})();

/* =====================================================
   TOON PLAYER — HTML5 Canvas, ported from ActionScript
   Faithful port of Player.as + ToolbarToon.as including:
     - Multicurve quadratic Bézier stroke rendering
     - Oldschool brush polygon rendering
     - oneFrame stroke-by-stroke reveal mode
     - Sketchy/hand-drawn toolbar on black background
     - Toolbar jitter repaints at 100ms (10fps) like AS3
     - Bar hidden when totalSteps < 10 (matches AS3 rule)
     - FPS from saved settings, default 10
===================================================== */

(function () {
  'use strict';

  /* =====================================================
     MULTICURVE — ported from AS3 FrameV1/FrameV2
  ===================================================== */
  function drawMulticurve(ctx, points, scale, closed) {
    if (!points || points.length === 0) return;
    const s  = scale || 1;
    const sc = points.map(p => ({ x: p.x * s, y: p.y * s }));
    const n  = sc.length;
    if (n === 1) {
      ctx.arc(sc[0].x, sc[0].y, Math.max(ctx.lineWidth / 2, 1), 0, Math.PI * 2);
      return;
    }
    if (n === 2) {
      ctx.moveTo(sc[0].x, sc[0].y);
      ctx.lineTo(sc[1].x, sc[1].y);
      return;
    }
    const mx = [], my = [];
    for (let i = 1; i < n - 2; i++) {
      mx[i] = 0.5 * (sc[i + 1].x + sc[i].x);
      my[i] = 0.5 * (sc[i + 1].y + sc[i].y);
    }
    if (closed) {
      mx[0]     = 0.5 * (sc[1].x + sc[0].x);
      my[0]     = 0.5 * (sc[1].y + sc[0].y);
      mx[n - 1] = 0.5 * (sc[n - 1].x + sc[n - 2].x);
      my[n - 1] = 0.5 * (sc[n - 1].y + sc[n - 2].y);
    } else {
      mx[0]     = sc[0].x;  my[0]     = sc[0].y;
      mx[n - 2] = sc[n - 1].x; my[n - 2] = sc[n - 1].y;
    }
    ctx.moveTo(mx[0], my[0]);
    for (let i = 1; i < n - 1; i++) {
      ctx.quadraticCurveTo(sc[i].x, sc[i].y, mx[i], my[i]);
    }
    if (closed) {
      ctx.quadraticCurveTo(sc[n - 1].x, sc[n - 1].y, mx[0], my[0]);
      ctx.closePath();
    }
  }

  /* =====================================================
     STROKE RENDERER
  ===================================================== */
  function drawStroke(ctx, stroke, scale) {
    const s = scale || 1;
    if (!stroke.points || stroke.points.length === 0) return;

    if (stroke.oldschool && stroke.polygon && stroke.polygon.length > 0) {
      ctx.beginPath();
      stroke.polygon.forEach((p, i) => {
        i === 0 ? ctx.moveTo(p.x * s, p.y * s) : ctx.lineTo(p.x * s, p.y * s);
      });
      ctx.closePath();
      ctx.fillStyle = stroke.color || '#000';
      ctx.fill();
      return;
    }

    const color = stroke.color || '#000';
    const size  = (stroke.size || 2) * s;

    if (stroke.points.length === 1) {
      ctx.beginPath();
      ctx.arc(stroke.points[0].x * s, stroke.points[0].y * s, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      return;
    }

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = size;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    drawMulticurve(ctx, stroke.points, s, false);
    ctx.stroke();
  }

  /* =====================================================
     FRAME RENDERER
     strokeLimit -1 = all; N = draw strokes 0..N
  ===================================================== */
  function drawFrame(ctx, frame, scale, strokeLimit) {
    if (!frame || !frame.strokes) return;
    const limit = (strokeLimit === undefined || strokeLimit < 0)
      ? frame.strokes.length
      : Math.min(strokeLimit + 1, frame.strokes.length);
    for (let i = 0; i < limit; i++) drawStroke(ctx, frame.strokes[i], scale);
  }

  /* =====================================================
     SKETCHY TOOLBAR PAINTERS
     All use Math.random() per call — repainted at 100ms
     to give the living-sketch jitter of the AS3 original.
  ===================================================== */

  const r = n => Math.random() * n;

  // Wobbly bar strip — mirrors ToolbarToon.repaintBar()
  // Drawn in dark grey so it's visible on black bg
  function paintBar(ctx, x, y, w) {
    const h = 4;
    ctx.save();
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    const steps = Math.max(2, Math.floor(w / 30));
    for (let i = 1; i < steps; i++) {
      ctx.lineTo(x + i * 30 + r(10) - 5, y + h - r(2));
    }
    ctx.lineTo(x + w, y + h);
    for (let i = steps - 1; i >= 1; i--) {
      ctx.lineTo(x + i * 30 + r(10) - 5, y + h + 1 + r(2));
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Wobbly slider knob — mirrors ToolbarToon.repaintSlider()
  // Black outer ring, white inner fill
  function paintSlider(ctx, cx, cy) {
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const px = cx + Math.cos(a) * (8 + r(1));
      const py = cy + Math.sin(a) * (8 + r(1));
      a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const px = cx + Math.cos(a) * (6 + r(1));
      const py = cy + Math.sin(a) * (6 + r(1));
      a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Pause icon (two wobbly rects) — mirrors Button.repaint() mode=0
  function paintPauseIcon(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 5 + i * 10 + r(2) - 1, y + 5);
      for (let j = 1; j < 3; j++) ctx.lineTo(x + 4 - r(2) + i * 10, y + 5 + j * 6.6);
      ctx.lineTo(x + 6 + i * 10 + r(2) - 1, y + 25);
      for (let j = 2; j > 0; j--) ctx.lineTo(x + 6 + r(2) + i * 10, y + 5 + j * 6.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Play icon (sketchy triangle) — mirrors Button.repaint() mode=1
  function paintPlayIcon(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(x + 5 + r(1), y + 5 + r(1));
    for (let i = 1; i < 4; i++) ctx.lineTo(x + 5 + i * 5 + r(1), y + 5 + i * 2.5 + r(1));
    for (let i = 2; i >= 0; i--) ctx.lineTo(x + 5 + i * 5 + r(2), y + 5 + (6 - i) * 3 + r(1));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* =====================================================
     PLAYER FACTORY
  ===================================================== */
  function initToonPlayer(rootId, frames, savedSettings) {
    const root = document.getElementById(rootId);
    if (!root) { console.error('toon-player: root not found:', rootId); return; }

    const cfg        = savedSettings || {};
    const fps        = cfg.playFPS || 10;
    const frameDelay = Math.round(1000 / fps);  // e.g. 100ms at 10fps

    const W = 600, H = 300;
    const TB_H = 40;

    const frameCount = frames.length || 1;
    const oneFrame   = frameCount === 1;   // mirrors AS3 oneFrame mode
    const totalSteps = oneFrame
      ? (frames[0].strokes || []).length
      : frameCount;
    const showBar = totalSteps >= 10;      // mirrors AS3: hidden if total < 10

    /* ---- Layout constants (all in canvas px) ---- */
    const BTN_AREA = 36;   // width reserved for play/pause button
    const BAR_L    = BTN_AREA + 8;          // bar left edge
    const BAR_R    = W - 70;                // bar right edge (leave room for counter)
    const BAR_W    = BAR_R - BAR_L;
    const BAR_Y    = TB_H / 2;              // vertical centre of bar

    /* ---- DOM: two stacked canvases, no overlap ---- */
    root.innerHTML = '';
    root.style.cssText = 'display:inline-block;line-height:0;font-size:0;';

    // Toon canvas
    const toonCanvas = document.createElement('canvas');
    toonCanvas.width  = W;
    toonCanvas.height = H;
    toonCanvas.style.cssText = [
      'display:block',
      'width:100%',
      'max-width:' + W + 'px',
      'background:#fff',
      'cursor:pointer',
    ].join(';');

    // Toolbar canvas — same CSS width as toon canvas so they align
    const tbCanvas = document.createElement('canvas');
    tbCanvas.width  = W;
    tbCanvas.height = TB_H;
    tbCanvas.style.cssText = [
      'display:block',
      'width:100%',
      'max-width:' + W + 'px',
      'background:#000',   // black background matching AS3 screenshot
      'cursor:default',
    ].join(';');

    root.appendChild(toonCanvas);
    root.appendChild(tbCanvas);

    const tCtx  = toonCanvas.getContext('2d');
    const tbCtx = tbCanvas.getContext('2d');

    /* ---- Playback state ---- */
    let curFrame        = 0;
    let lastShownStroke = -1;  // mirrors AS3 lastShownAction
    let playing         = false;
    let animTimer       = null;
    let sliderDragging  = false;
    let sliderRatio     = 0;   // 0..1 position along bar

    /* ---- Toon render ---- */
    function renderToon() {
      tCtx.clearRect(0, 0, W, H);
      if (oneFrame) {
        drawFrame(tCtx, frames[0], 1, lastShownStroke);
      } else {
        drawFrame(tCtx, frames[curFrame], 1, -1);
      }
    }

    /* ---- Toolbar render — called every 100ms for jitter ---- */
    function renderToolbar() {
      // Clear to black
      tbCtx.clearRect(0, 0, W, TB_H);
      tbCtx.fillStyle = '#000';
      tbCtx.fillRect(0, 0, W, TB_H);

      // Play / Pause button (30x30 area, vertically centred)
      const btnY = TB_H / 2 - 15;
      if (playing) {
        paintPauseIcon(tbCtx, 4, btnY);
      } else {
        paintPlayIcon(tbCtx, 4, btnY);
      }

      // Bar + slider — only if totalSteps >= 10
      if (showBar) {
        paintBar(tbCtx, BAR_L, BAR_Y - 2, BAR_W);
        const kx = BAR_L + sliderRatio * BAR_W;
        paintSlider(tbCtx, kx, BAR_Y);
      }

      // Frame / stroke counter — right side, mirrors AS3 position label
      const step  = oneFrame ? Math.max(0, lastShownStroke) : curFrame;
      const label = (step + 1) + ' / ' + totalSteps + (oneFrame ? ' strokes' : '');
      tbCtx.fillStyle    = '#888';
      tbCtx.font         = '10px Tahoma, sans-serif';
      tbCtx.textAlign    = 'right';
      tbCtx.textBaseline = 'middle';
      tbCtx.fillText(label, W - 6, TB_H / 2);
    }

    /* ---- Toolbar jitter interval: 100ms (10fps) ---- */
    const tbTimer = setInterval(renderToolbar, 100);

    /* ---- Sync slider from current playback position ---- */
    function syncSlider() {
      const step = oneFrame ? Math.max(0, lastShownStroke) : curFrame;
      sliderRatio = totalSteps <= 1 ? 0 : step / (totalSteps - 1);
    }

    /* ---- Playback ticks ---- */

    // Normal multi-frame — mirrors AS3 onEnterFrame normal branch
    function tickMulti() {
      renderToon();
      syncSlider();
      curFrame = (curFrame + 1) % frameCount;
    }

    // oneFrame reveal — mirrors AS3 onEnterFrame oneFrame branch exactly
    function tickOneFrame() {
      const next  = lastShownStroke + 1;
      const total = (frames[0].strokes || []).length;
      if (next >= total) {
        stopPlay();
        lastShownStroke = total - 1;
        renderToon();
        syncSlider();
        return;
      }
      lastShownStroke = next;
      renderToon();
      syncSlider();
    }

    function startPlay() {
      if (playing) return;
      if (oneFrame) {
        const total = (frames[0].strokes || []).length;
        if (lastShownStroke >= total - 1) lastShownStroke = -1;
      }
      playing   = true;
      animTimer = setInterval(oneFrame ? tickOneFrame : tickMulti, frameDelay);
    }

    function stopPlay() {
      playing = false;
      clearInterval(animTimer);
      animTimer = null;
    }

    /* ---- Seek ---- */
    function seekTo(ratio) {
      const clamped   = Math.max(0, Math.min(1, ratio));
      const step      = Math.round(clamped * (totalSteps - 1));
      sliderRatio     = clamped;
      if (oneFrame) lastShownStroke = step;
      else          curFrame        = step;
      renderToon();
    }

    function ratioFromMouseEvent(e) {
      const rect   = tbCanvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const mx     = (e.clientX - rect.left) * scaleX;
      return (mx - BAR_L) / BAR_W;
    }

    /* ---- Toolbar interactions ---- */
    tbCanvas.addEventListener('click', (e) => {
      const rect   = tbCanvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const mx     = (e.clientX - rect.left) * scaleX;
      if (mx < BTN_AREA) {
        // Button click
        if (playing) stopPlay(); else startPlay();
      } else if (showBar && mx >= BAR_L && mx <= BAR_R) {
        // Bar click — seek
        stopPlay();
        seekTo(ratioFromMouseEvent(e));
      }
    });

    tbCanvas.addEventListener('mousedown', (e) => {
      const rect   = tbCanvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const mx     = (e.clientX - rect.left) * scaleX;
      if (!showBar || mx < BAR_L) return;
      sliderDragging = true;
      stopPlay();
      seekTo(ratioFromMouseEvent(e));
    });

    document.addEventListener('mousemove', (e) => {
      if (!sliderDragging) return;
      seekTo(ratioFromMouseEvent(e));
    });

    document.addEventListener('mouseup', () => {
      sliderDragging = false;
    });

    // Click toon canvas to toggle play/pause
    toonCanvas.addEventListener('click', () => {
      if (playing) stopPlay(); else startPlay();
    });

    /* ---- Init — mirrors AS3 checkComplete → showPosition(0) ---- */
    if (oneFrame) {
      // Show full drawing on load; user clicks play to watch the reveal
      lastShownStroke = (frames[0].strokes || []).length - 1;
    } else {
      curFrame = 0;
    }
    syncSlider();
    renderToon();
    renderToolbar();

    // Auto-play multi-frame toons (mirrors AS3: if (!isPaused) play())
    if (frameCount > 1) startPlay();

    /* ---- Public API ---- */
    return {
      play:    startPlay,
      pause:   stopPlay,
      goTo:    (n) => {
        stopPlay();
        const step = Math.max(0, Math.min(n, totalSteps - 1));
        if (oneFrame) lastShownStroke = step;
        else          curFrame        = step;
        syncSlider();
        renderToon();
      },
      destroy: () => {
        stopPlay();
        clearInterval(tbTimer);
      }
    };
  }

  window.initToonPlayer = initToonPlayer;

})();
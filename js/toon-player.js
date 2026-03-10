/* =====================================================
   TOON PLAYER — HTML5 Canvas, ported from ActionScript
   Faithful port of Player.as + ToolbarToon.as including:
     - Multicurve quadratic Bézier stroke rendering
     - Oldschool brush polygon rendering
     - oneFrame stroke-by-stroke reveal mode
     - Sketchy/hand-drawn toolbar (wobbly bar, jitter
       slider, sketchy play/pause button) matching AS3
     - Bar hidden when total < 10 (matching AS3 rule)
     - FPS from saved settings, default 10
===================================================== */

(function () {
  'use strict';

  /* =====================================================
     MULTICURVE — ported from AS3 FrameV1/FrameV2
  ===================================================== */
  function drawMulticurve(ctx, points, scale, closed) {
    if (!points || points.length === 0) return;
    const s = scale || 1;
    const sc = points.map(p => ({ x: p.x * s, y: p.y * s }));
    const n = sc.length;
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
      mx[0]     = sc[0].x; my[0]     = sc[0].y;
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

    // Oldschool brush — pre-built filled polygon
    if (stroke.oldschool && stroke.polygon && stroke.polygon.length > 0) {
      ctx.beginPath();
      stroke.polygon.forEach((p, i) => {
        i === 0 ? ctx.moveTo(p.x * s, p.y * s) : ctx.lineTo(p.x * s, p.y * s);
      });
      ctx.closePath();
      ctx.fillStyle = stroke.color || '#000000';
      ctx.fill();
      return;
    }

    const color = stroke.color || '#000000';
    const size  = (stroke.size || 2) * s;

    // Single dot
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
     strokeLimit -1 = all strokes; N = strokes 0..N
  ===================================================== */
  function drawFrame(ctx, frame, scale, strokeLimit) {
    if (!frame || !frame.strokes) return;
    const limit = (strokeLimit === undefined || strokeLimit < 0)
      ? frame.strokes.length
      : Math.min(strokeLimit + 1, frame.strokes.length);
    for (let i = 0; i < limit; i++) drawStroke(ctx, frame.strokes[i], scale);
  }

  /* =====================================================
     SKETCHY TOOLBAR — Canvas-based, matching AS3 aesthetic
     All elements repaint with Math.random() jitter every
     animation frame, exactly like the Flash originals.
  ===================================================== */

  function r(n) { return Math.random() * n; }   // shorthand

  // Wobbly bar — mirrors ToolbarToon.repaintBar()
  // A filled polygon with randomly jittered top edge
  function paintBar(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    const steps = Math.floor(w / 30);
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

  // Slider knob — mirrors ToolbarToon.repaintSlider()
  // Two concentric wobbly circles: black outer, white inner
  function paintSlider(ctx, cx, cy) {
    ctx.save();
    // Outer black circle (~8px radius, jittered)
    ctx.fillStyle = '#000';
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const rx = Math.cos(a) * (8 + r(1));
      const ry = Math.sin(a) * (8 + r(1));
      a === 0 ? ctx.moveTo(cx + rx, cy + ry) : ctx.lineTo(cx + rx, cy + ry);
    }
    ctx.closePath();
    ctx.fill();
    // Inner white circle (~6px radius, jittered)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const rx = Math.cos(a) * (6 + r(1));
      const ry = Math.sin(a) * (6 + r(1));
      a === 0 ? ctx.moveTo(cx + rx, cy + ry) : ctx.lineTo(cx + rx, cy + ry);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Play button — mirrors Button.repaint() mode=0
  // Two sketchy pause bars (mode=0 = PLAYING, shows pause icon)
  function paintPause(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#000';
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 5 + i * 10 + r(2) - 1, y + 5);
      for (let j = 1; j < 3; j++) {
        ctx.lineTo(x + 4 - r(2) + i * 10, y + 5 + j * 6.6);
      }
      ctx.lineTo(x + 6 + i * 10 + r(2) - 1, y + 25);
      for (let j = 2; j > 0; j--) {
        ctx.lineTo(x + 6 + r(2) + i * 10, y + 5 + j * 6.6);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Pause button — mirrors Button.repaint() mode=1
  // A sketchy play triangle
  function paintPlay(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(x + 5 + r(1), y + 5 + r(1));
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(x + 5 + i * 5 + r(1), y + 5 + i * 2.5 + r(1));
    }
    for (let i = 2; i >= 0; i--) {
      ctx.lineTo(x + 5 + i * 5 + r(2), y + 5 + (6 - i) * 3 + r(1));
    }
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
    const fps        = cfg.playFPS || 10;           // mirrors Toon._frameRate default
    const frameDelay = Math.round(1000 / fps);

    const W = 600, H = 300;                          // mirrors AS3 _movieWidth/_movieHeight
    const frameCount  = frames.length || 1;
    const oneFrame    = frameCount === 1;            // mirrors AS3 oneFrame logic
    const totalSteps  = oneFrame
      ? (frames[0].strokes || []).length
      : frameCount;
    const showBar     = totalSteps >= 10;            // mirrors AS3: hidden if total < 10

    /* ---- Toolbar canvas dimensions ---- */
    const TB_H     = 40;   // mirrors AS3 toolbar height
    const BTN_W    = 30;   // play/pause button area
    const BTN_PAD  = 5;
    const BAR_PAD  = 10;   // mirrors AS3 bar.x = placeRect.x + 10

    /* ---- DOM ---- */
    root.innerHTML = '';
    root.style.cssText = 'display:inline-block;line-height:0;';

    // Toon canvas
    const toonCanvas = document.createElement('canvas');
    toonCanvas.width  = W;
    toonCanvas.height = H;
    toonCanvas.style.cssText = 'display:block;width:100%;max-width:' + W + 'px;background:#fff;cursor:pointer;';
    root.appendChild(toonCanvas);

    // Toolbar canvas — same width as toon canvas, 40px tall
    const tbCanvas = document.createElement('canvas');
    tbCanvas.width  = W;
    tbCanvas.height = TB_H;
    tbCanvas.style.cssText = 'display:block;width:100%;max-width:' + W + 'px;cursor:pointer;background:#fff;';
    root.appendChild(tbCanvas);

    const tCtx = toonCanvas.getContext('2d');
    const tbCtx = tbCanvas.getContext('2d');

    /* ---- State ---- */
    let curFrame        = 0;
    let lastShownStroke = -1;  // mirrors AS3 lastShownAction
    let playing         = false;
    let animTimer       = null;
    let isOver          = false; // mouse over toolbar
    let sliderDragging  = false;
    let sliderPos       = 0;    // 0..1

    /* ---- Toolbar layout ---- */
    // barX/barW: the scrub bar zone (mirrors AS3 bar.x = placeRect.x + 10)
    const btnX  = BTN_PAD;
    const barX  = BTN_W + BTN_PAD * 2 + BAR_PAD;
    let   barW  = W - barX - BAR_PAD;   // shrinks if sound/expand buttons present

    /* ---- Render toon ---- */
    function renderToon() {
      tCtx.clearRect(0, 0, W, H);
      if (oneFrame) {
        drawFrame(tCtx, frames[0], 1, lastShownStroke);
      } else {
        drawFrame(tCtx, frames[curFrame], 1, -1);
      }
    }

    /* ---- Render toolbar ---- */
    function renderToolbar() {
      tbCtx.clearRect(0, 0, W, TB_H);

      // White background (mirrors AS3 white rect behind toolbar)
      tbCtx.fillStyle = '#fff';
      tbCtx.fillRect(0, 0, W, TB_H);

      const cy = TB_H / 2;  // vertical centre

      // Play/Pause button (30x30, centred vertically)
      const btnY = cy - 15;
      if (playing) {
        // Showing pause icon (user can click to pause)
        paintPause(tbCtx, btnX, btnY);
      } else {
        // Showing play icon
        paintPlay(tbCtx, btnX, btnY);
      }

      // Scrub bar + slider — hidden if totalSteps < 10 (mirrors AS3)
      if (showBar) {
        const barY = cy;  // vertical centre of bar strip

        // Bar background (wobbly black strip, 4px tall centred)
        paintBar(tbCtx, barX, barY - 2, barW, 4);

        // Slider knob at current position
        const sliderX = barX + BAR_PAD + sliderPos * (barW - BAR_PAD * 2);
        paintSlider(tbCtx, sliderX, barY);
      }

      // Frame counter (right-aligned, mirrors AS3 position display)
      const step  = oneFrame ? Math.max(0, lastShownStroke) : curFrame;
      const label = (step + 1) + ' / ' + totalSteps + (oneFrame ? ' strokes' : '');
      tbCtx.fillStyle = '#888';
      tbCtx.font      = '10px Tahoma, sans-serif';
      tbCtx.textAlign = 'right';
      tbCtx.textBaseline = 'middle';
      tbCtx.fillText(label, W - 8, cy);
    }

    /* ---- RAF loop for toolbar jitter ---- */
    let rafId = null;
    function toolbarLoop() {
      // Only repaint toolbar every frame so jitter stays alive
      // (mirrors AS3 ENTER_FRAME repaint on hover)
      renderToolbar();
      rafId = requestAnimationFrame(toolbarLoop);
    }
    toolbarLoop();

    /* ---- Update slider from current step ---- */
    function syncSlider() {
      const step = oneFrame ? Math.max(0, lastShownStroke) : curFrame;
      sliderPos = totalSteps <= 1 ? 0 : step / (totalSteps - 1);
    }

    /* ---- Playback ---- */
    function tickMulti() {
      renderToon();
      syncSlider();
      curFrame = (curFrame + 1) % frameCount;
    }

    // mirrors AS3 oneFrame onEnterFrame branch exactly
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
      playing  = true;
      animTimer = setInterval(oneFrame ? tickOneFrame : tickMulti, frameDelay);
    }

    function stopPlay() {
      playing = false;
      clearInterval(animTimer);
      animTimer = null;
    }

    /* ---- Scrub helpers ---- */
    function seekTo(ratio) {
      const clamped = Math.max(0, Math.min(1, ratio));
      const step    = Math.round(clamped * (totalSteps - 1));
      sliderPos     = clamped;
      if (oneFrame) lastShownStroke = step;
      else          curFrame        = step;
      renderToon();
    }

    function ratioFromEvent(e) {
      const rect    = tbCanvas.getBoundingClientRect();
      const scaleX  = W / rect.width;
      const mouseX  = (e.clientX - rect.left) * scaleX;
      return (mouseX - barX - BAR_PAD) / (barW - BAR_PAD * 2);
    }

    /* ---- Toolbar mouse events ---- */
    // Click the button area (left ~35px)
    tbCanvas.addEventListener('click', (e) => {
      const rect   = tbCanvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const mx     = (e.clientX - rect.left) * scaleX;

      if (mx < BTN_W + BTN_PAD * 2) {
        // Button click — toggle play/pause
        if (playing) stopPlay(); else startPlay();
      } else if (showBar) {
        // Bar click — seek
        stopPlay();
        seekTo(ratioFromEvent(e));
      }
    });

    // Also click the toon canvas to toggle
    toonCanvas.addEventListener('click', () => {
      if (playing) stopPlay(); else startPlay();
    });

    // Drag scrub
    tbCanvas.addEventListener('mousedown', (e) => {
      const rect   = tbCanvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const mx     = (e.clientX - rect.left) * scaleX;
      if (!showBar || mx < BTN_W + BTN_PAD * 2) return;
      sliderDragging = true;
      stopPlay();
      seekTo(ratioFromEvent(e));
    });

    document.addEventListener('mousemove', (e) => {
      if (!sliderDragging) return;
      seekTo(ratioFromEvent(e));
    });

    document.addEventListener('mouseup', () => {
      sliderDragging = false;
    });

    /* ---- Init (mirrors AS3 checkComplete → showPosition(0)) ---- */
    if (oneFrame) {
      lastShownStroke = (frames[0].strokes || []).length - 1;
    } else {
      curFrame = 0;
    }
    syncSlider();
    renderToon();

    // Auto-play multi-frame (mirrors AS3: if (!isPaused) play())
    if (frameCount > 1) startPlay();

    /* ---- Public API ---- */
    return {
      play:  startPlay,
      pause: stopPlay,
      goTo:  (n) => {
        stopPlay();
        const step = Math.max(0, Math.min(n, totalSteps - 1));
        if (oneFrame) lastShownStroke = step;
        else          curFrame        = step;
        syncSlider();
        renderToon();
      },
      destroy: () => {
        stopPlay();
        cancelAnimationFrame(rafId);
      }
    };
  }

  window.initToonPlayer = initToonPlayer;

})();
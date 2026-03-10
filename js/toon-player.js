/* =====================================================
   TOON PLAYER — HTML5 Canvas, ported from ActionScript
   Faithful port of Player.as + ToolbarToon.as + Toolbar.as
     - Wobbly black border around canvas (Player.repaintBack)
     - Multicurve quadratic Bézier stroke rendering
     - Oldschool brush polygon rendering
     - oneFrame stroke-by-stroke reveal mode
     - Sketchy toolbar: play/pause, scrub bar, slider knob,
       expand button, fullscreen button, Toonator logo
     - White toolbar background (black only in fullscreen)
     - All toolbar jitter repaints at 100ms (10fps)
     - Bar hidden when totalSteps < 10 (AS3 rule)
     - FPS from saved settings, default 10
===================================================== */

(function () {
  'use strict';

  const r = n => Math.random() * n;

  /* =====================================================
     MULTICURVE — ported from AS3 FrameV1/FrameV2
  ===================================================== */
  function drawMulticurve(ctx, points, scale, closed) {
    if (!points || points.length === 0) return;
    const s  = scale || 1;
    const sc = points.map(p => ({ x: p.x * s, y: p.y * s }));
    const n  = sc.length;
    if (n === 1) { ctx.arc(sc[0].x, sc[0].y, Math.max(ctx.lineWidth / 2, 1), 0, Math.PI * 2); return; }
    if (n === 2) { ctx.moveTo(sc[0].x, sc[0].y); ctx.lineTo(sc[1].x, sc[1].y); return; }
    const mx = [], my = [];
    for (let i = 1; i < n - 2; i++) {
      mx[i] = 0.5 * (sc[i+1].x + sc[i].x);
      my[i] = 0.5 * (sc[i+1].y + sc[i].y);
    }
    if (closed) {
      mx[0] = 0.5*(sc[1].x+sc[0].x); my[0] = 0.5*(sc[1].y+sc[0].y);
      mx[n-1] = 0.5*(sc[n-1].x+sc[n-2].x); my[n-1] = 0.5*(sc[n-1].y+sc[n-2].y);
    } else {
      mx[0] = sc[0].x; my[0] = sc[0].y;
      mx[n-2] = sc[n-1].x; my[n-2] = sc[n-1].y;
    }
    ctx.moveTo(mx[0], my[0]);
    for (let i = 1; i < n-1; i++) ctx.quadraticCurveTo(sc[i].x, sc[i].y, mx[i], my[i]);
    if (closed) { ctx.quadraticCurveTo(sc[n-1].x, sc[n-1].y, mx[0], my[0]); ctx.closePath(); }
  }

  /* =====================================================
     STROKE RENDERER
  ===================================================== */
  function drawStroke(ctx, stroke, scale) {
    const s = scale || 1;
    if (!stroke.points || stroke.points.length === 0) return;
    if (stroke.oldschool && stroke.polygon && stroke.polygon.length > 0) {
      ctx.beginPath();
      stroke.polygon.forEach((p, i) => i === 0 ? ctx.moveTo(p.x*s, p.y*s) : ctx.lineTo(p.x*s, p.y*s));
      ctx.closePath(); ctx.fillStyle = stroke.color || '#000'; ctx.fill();
      return;
    }
    const color = stroke.color || '#000';
    const size  = (stroke.size || 2) * s;
    if (stroke.points.length === 1) {
      ctx.beginPath();
      ctx.arc(stroke.points[0].x*s, stroke.points[0].y*s, size/2, 0, Math.PI*2);
      ctx.fillStyle = color; ctx.fill(); return;
    }
    ctx.beginPath();
    ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    drawMulticurve(ctx, stroke.points, s, false);
    ctx.stroke();
  }

  function drawFrame(ctx, frame, scale, strokeLimit) {
    if (!frame || !frame.strokes) return;
    const limit = (strokeLimit === undefined || strokeLimit < 0)
      ? frame.strokes.length : Math.min(strokeLimit + 1, frame.strokes.length);
    for (let i = 0; i < limit; i++) drawStroke(ctx, frame.strokes[i], scale);
  }

  /* =====================================================
     WOBBLY BORDER — ported from Player.repaintBack()
     Draws a sketchy black filled polygon around the canvas
     with randomly jittered edges, then a white rect inside.
     BW = border canvas width, BH = border canvas height
     IW/IH = inner toon area, INSET = border thickness
  ===================================================== */
  function paintBorder(ctx, bw, bh, inset) {
    ctx.clearRect(0, 0, bw, bh);

    // Black filled wobbly border shape
    ctx.fillStyle = '#000';
    ctx.beginPath();

    // Top edge (left→right)
    ctx.moveTo(0, r(3));
    for (let t = 0.05; t <= 1; t += 0.05)
      ctx.lineTo(t * (bw + 10), r(3));

    // Right edge (top→bottom)
    for (let t = 0; t <= 1; t += 0.1)
      ctx.lineTo(bw - r(3), t * (bh + 8));

    // Bottom edge (right→left)
    for (let t = 1; t >= 0; t -= 0.05)
      ctx.lineTo(t * (bw + 8), bh - r(3));

    // Left edge (bottom→top)
    for (let t = 1; t >= 0; t -= 0.1)
      ctx.lineTo(r(3), t * (bh + 8));

    ctx.closePath();
    ctx.fill();

    // White inner rect (the actual canvas area)
    ctx.fillStyle = '#fff';
    ctx.fillRect(inset, inset, bw - inset * 2, bh - inset * 2);
  }

  /* =====================================================
     TOOLBAR PAINTERS — black icons on white bg
     All jitter with Math.random() on each 100ms repaint.
  ===================================================== */

  // Wobbly scrub bar — mirrors ToolbarToon.repaintBar()
  function paintBar(ctx, x, y, w) {
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(x, y + 2);
    const steps = Math.max(2, Math.floor(w / 30));
    for (let i = 1; i < steps; i++) ctx.lineTo(x + i*30 + r(10)-5, y + 2 - r(2));
    ctx.lineTo(x + w, y + 2);
    for (let i = steps-1; i >= 1; i--) ctx.lineTo(x + i*30 + r(10)-5, y + 3 + r(2));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Wobbly slider knob — mirrors ToolbarToon.repaintSlider()
  // Black outer (~8px), white inner (~6px)
  function paintSlider(ctx, cx, cy) {
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    for (let a = 0; a < Math.PI*2; a += Math.PI/8) {
      const px = cx + Math.cos(a)*(8+r(1)), py = cy + Math.sin(a)*(8+r(1));
      a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let a = 0; a < Math.PI*2; a += Math.PI/6) {
      const px = cx + Math.cos(a)*(6+r(1)), py = cy + Math.sin(a)*(6+r(1));
      a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Pause icon — two wobbly rectangles, mirrors Button.repaint() mode=0
  function paintPauseIcon(ctx, x, y) {
    ctx.save(); ctx.fillStyle = '#000';
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 5 + i*10 + r(2)-1, y + 5);
      for (let j = 1; j < 3; j++) ctx.lineTo(x + 4 - r(2) + i*10, y + 5 + j*6.6);
      ctx.lineTo(x + 6 + i*10 + r(2)-1, y + 25);
      for (let j = 2; j > 0; j--) ctx.lineTo(x + 6 + r(2) + i*10, y + 5 + j*6.6);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // Play icon — sketchy triangle, mirrors Button.repaint() mode=1
  function paintPlayIcon(ctx, x, y) {
    ctx.save(); ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(x + 5 + r(1), y + 5 + r(1));
    for (let i = 1; i < 4; i++) ctx.lineTo(x + 5 + i*5 + r(1), y + 5 + i*2.5 + r(1));
    for (let i = 2; i >= 0; i--) ctx.lineTo(x + 5 + i*5 + r(2), y + 5 + (6-i)*3 + r(1));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Expand button — two L-corner arrows, mirrors SizeButton EXPAND
  // Drawn as two sketchy L-shapes with arrowheads
  function paintExpandIcon(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = '#888'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    // Top-right L
    ctx.beginPath(); ctx.moveTo(x+12+r(1), y+2+r(1)); ctx.lineTo(x+18+r(1), y+2+r(1)); ctx.lineTo(x+18+r(1), y+8+r(1)); ctx.stroke();
    // Bottom-left L
    ctx.beginPath(); ctx.moveTo(x+2+r(1), y+12+r(1)); ctx.lineTo(x+2+r(1), y+18+r(1)); ctx.lineTo(x+8+r(1), y+18+r(1)); ctx.stroke();
    ctx.restore();
  }

  // Fullscreen button — corner brackets, mirrors SizeButton FULLSCREEN
  function paintFullscreenIcon(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = '#888'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const corners = [[x,y],[x+20,y],[x,y+20],[x+20,y+20]];
    const dirs    = [[1,1],[-1,1],[1,-1],[-1,-1]];
    corners.forEach(([cx,cy],[dx,dy]) => {
      ctx.beginPath();
      ctx.moveTo(cx+dx*(r(1)), cy);
      ctx.lineTo(cx+dx*7+r(1), cy+r(1));
      ctx.moveTo(cx, cy+dy*(r(1)));
      ctx.lineTo(cx+r(1), cy+dy*7+r(1));
      ctx.stroke();
    }, dirs);
    ctx.restore();
  }

  // Toonator logo — sketchy text, mirrors ToonatorLogo placement
  function paintLogo(ctx, x, y) {
    ctx.save();
    ctx.font         = 'bold 13px "Comic Sans MS", cursive';
    ctx.fillStyle    = '#aaa';
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'right';
    ctx.fillText('Toonator', x, y);
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
    const frameDelay = Math.round(1000 / fps);

    // Logical dimensions — mirrors AS3 _movieWidth/_movieHeight
    const W = 600, H = 300;
    // Border inset — mirrors AS3: playerSprite.x=5, playerSprite.y=5
    const INSET = 8;
    // Border canvas is slightly larger to contain the wobbly edge
    const BW = W + INSET * 2 + 4;
    const BH = H + INSET * 2 + 4;
    // Toolbar height — mirrors AS3 toolbar y=310, total SWF height ~350
    const TB_H = 40;

    const frameCount = frames.length || 1;
    const oneFrame   = frameCount === 1;
    const totalSteps = oneFrame ? (frames[0].strokes || []).length : frameCount;
    const showBar    = totalSteps >= 10;  // mirrors AS3 total < 10 → hide bar

    /* ---- Layout (toolbar canvas coords) ---- */
    const TB_W      = BW;             // toolbar same width as border canvas
    const BTN_AREA  = 36;             // play/pause zone
    const LOGO_W    = 75;             // "Toonator" text width
    const FS_W      = 26;             // fullscreen icon
    const EXP_W     = 26;             // expand icon
    const RIGHT_PAD = LOGO_W + FS_W + EXP_W + 10;
    const COUNTER_W = 80;
    const BAR_L     = BTN_AREA + 8;
    const BAR_R     = TB_W - RIGHT_PAD - COUNTER_W - 8;
    const BAR_W     = Math.max(10, BAR_R - BAR_L);
    const BAR_Y     = TB_H / 2;

    /* ---- DOM ---- */
    root.innerHTML = '';
    root.style.cssText = 'display:inline-block;line-height:0;font-size:0;';

    // Border canvas — contains the wobbly frame + toon drawn on top
    const borderCanvas = document.createElement('canvas');
    borderCanvas.width  = BW;
    borderCanvas.height = BH;
    borderCanvas.style.cssText = [
      'display:block', 'width:100%', 'max-width:' + BW + 'px',
      'cursor:pointer', 'background:#000',
    ].join(';');

    // Toolbar canvas
    const tbCanvas = document.createElement('canvas');
    tbCanvas.width  = TB_W;
    tbCanvas.height = TB_H;
    tbCanvas.style.cssText = [
      'display:block', 'width:100%', 'max-width:' + TB_W + 'px',
      'cursor:default', 'background:#fff',
    ].join(';');

    root.appendChild(borderCanvas);
    root.appendChild(tbCanvas);

    const bCtx  = borderCanvas.getContext('2d');
    const tbCtx = tbCanvas.getContext('2d');

    /* ---- State ---- */
    let curFrame        = 0;
    let lastShownStroke = -1;
    let playing         = false;
    let animTimer       = null;
    let sliderDragging  = false;
    let sliderRatio     = 0;
    let isFullscreen    = false;

    /* ---- Render toon onto border canvas ---- */
    function renderToon() {
      // Repaint border every frame (jitter) then draw toon on top
      paintBorder(bCtx, BW, BH, INSET);
      bCtx.save();
      bCtx.translate(INSET, INSET);
      if (oneFrame) drawFrame(bCtx, frames[0], W/600, lastShownStroke);
      else          drawFrame(bCtx, frames[curFrame], W/600, -1);
      bCtx.restore();
    }

    /* ---- Render toolbar ---- */
    function renderToolbar() {
      tbCtx.clearRect(0, 0, TB_W, TB_H);
      tbCtx.fillStyle = '#fff';
      tbCtx.fillRect(0, 0, TB_W, TB_H);

      // Play/Pause button
      const btnY = TB_H / 2 - 15;
      if (playing) paintPauseIcon(tbCtx, 4, btnY);
      else         paintPlayIcon(tbCtx, 4, btnY);

      // Scrub bar + slider
      if (showBar) {
        paintBar(tbCtx, BAR_L, BAR_Y - 2, BAR_W);
        paintSlider(tbCtx, BAR_L + sliderRatio * BAR_W, BAR_Y);
      }

      // Frame counter (between bar and right icons)
      const step  = oneFrame ? Math.max(0, lastShownStroke) : curFrame;
      const label = (step + 1) + ' / ' + totalSteps + (oneFrame ? ' strokes' : '');
      tbCtx.fillStyle = '#999'; tbCtx.font = '10px Tahoma,sans-serif';
      tbCtx.textAlign = 'right'; tbCtx.textBaseline = 'middle';
      tbCtx.fillText(label, BAR_R + COUNTER_W + 4, TB_H / 2);

      // Right-side icons: expand, fullscreen, logo
      const rightStart = TB_W - LOGO_W - FS_W - EXP_W - 8;
      paintExpandIcon(tbCtx,     rightStart,           TB_H/2 - 10);
      paintFullscreenIcon(tbCtx, rightStart + EXP_W,   TB_H/2 - 10);
      paintLogo(tbCtx, TB_W - 6, TB_H / 2);
    }

    /* ---- 100ms jitter timer ---- */
    const tbTimer = setInterval(renderToolbar, 100);

    /* ---- Sync slider ---- */
    function syncSlider() {
      const step = oneFrame ? Math.max(0, lastShownStroke) : curFrame;
      sliderRatio = totalSteps <= 1 ? 0 : step / (totalSteps - 1);
    }

    /* ---- Playback ticks ---- */
    function tickMulti() {
      renderToon(); syncSlider();
      curFrame = (curFrame + 1) % frameCount;
    }

    function tickOneFrame() {
      const next  = lastShownStroke + 1;
      const total = (frames[0].strokes || []).length;
      if (next >= total) {
        stopPlay(); lastShownStroke = total - 1; renderToon(); syncSlider(); return;
      }
      lastShownStroke = next; renderToon(); syncSlider();
    }

    function startPlay() {
      if (playing) return;
      if (oneFrame) {
        const total = (frames[0].strokes || []).length;
        if (lastShownStroke >= total - 1) lastShownStroke = -1;
      }
      playing = true;
      animTimer = setInterval(oneFrame ? tickOneFrame : tickMulti, frameDelay);
    }

    function stopPlay() {
      playing = false; clearInterval(animTimer); animTimer = null;
    }

    /* ---- Seek ---- */
    function seekTo(ratio) {
      const clamped = Math.max(0, Math.min(1, ratio));
      sliderRatio   = clamped;
      const step    = Math.round(clamped * (totalSteps - 1));
      if (oneFrame) lastShownStroke = step; else curFrame = step;
      renderToon();
    }

    function ratioFromEvent(e, el) {
      const rect   = el.getBoundingClientRect();
      const scaleX = TB_W / rect.width;
      return ((e.clientX - rect.left) * scaleX - BAR_L) / BAR_W;
    }

    /* ---- Fullscreen ---- */
    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        root.requestFullscreen && root.requestFullscreen();
      } else {
        document.exitFullscreen && document.exitFullscreen();
      }
    }

    document.addEventListener('fullscreenchange', () => {
      isFullscreen = !!document.fullscreenElement;
    });

    /* ---- Toolbar interactions ---- */
    tbCanvas.addEventListener('click', (e) => {
      const rect   = tbCanvas.getBoundingClientRect();
      const scaleX = TB_W / rect.width;
      const mx     = (e.clientX - rect.left) * scaleX;
      const rightStart = TB_W - LOGO_W - FS_W - EXP_W - 8;

      if (mx < BTN_AREA) {
        if (playing) stopPlay(); else startPlay();
      } else if (showBar && mx >= BAR_L && mx <= BAR_R + COUNTER_W) {
        stopPlay(); seekTo(ratioFromEvent(e, tbCanvas));
      } else if (mx >= rightStart && mx < rightStart + EXP_W) {
        // expand — no-op in embed context, mirrors AS3 onExpand
      } else if (mx >= rightStart + EXP_W && mx < rightStart + EXP_W + FS_W) {
        toggleFullscreen();
      }
    });

    tbCanvas.addEventListener('mousedown', (e) => {
      const rect   = tbCanvas.getBoundingClientRect();
      const scaleX = TB_W / rect.width;
      const mx     = (e.clientX - rect.left) * scaleX;
      if (!showBar || mx < BAR_L || mx > BAR_R) return;
      sliderDragging = true; stopPlay(); seekTo(ratioFromEvent(e, tbCanvas));
    });

    document.addEventListener('mousemove', (e) => {
      if (sliderDragging) seekTo(ratioFromEvent(e, tbCanvas));
    });
    document.addEventListener('mouseup', () => { sliderDragging = false; });

    borderCanvas.addEventListener('click', () => {
      if (playing) stopPlay(); else startPlay();
    });

    /* ---- Init ---- */
    if (oneFrame) lastShownStroke = (frames[0].strokes || []).length - 1;
    else          curFrame = 0;
    syncSlider();
    renderToon();
    renderToolbar();

    if (frameCount > 1) startPlay();

    /* ---- Public API ---- */
    return {
      play:    startPlay,
      pause:   stopPlay,
      goTo:    (n) => {
        stopPlay();
        const step = Math.max(0, Math.min(n, totalSteps - 1));
        if (oneFrame) lastShownStroke = step; else curFrame = step;
        syncSlider(); renderToon();
      },
      destroy: () => { stopPlay(); clearInterval(tbTimer); }
    };
  }

  window.initToonPlayer = initToonPlayer;

})();
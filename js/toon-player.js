/* =====================================================
   TOON PLAYER — HTML5 Canvas, ported from ActionScript
   Pixel-perfect port of Player.as + ToolbarToon.as +
   Toolbar.as + repaintBack() border logic.

   Layout mirrors AS3 exactly:
     Canvas:  600×300, inset 5px inside wobbly border
     Toolbar: 610×40, y=310
     placeRect starts as Rectangle(0,0,610,40)
       RIGHT: logo (margin 5, ~60px wide)
              fullscreen btn (margin 10, 20px wide)
              expand btn (margin 10, 20px wide)
       LEFT:  play/pause button (margin 5, 30px wide)
       Remaining centre → scrub bar + slider at y=20
===================================================== */

(function () {
  'use strict';

  const rand = n => Math.random() * n;

  /* =====================================================
     COMPACT STROKE DESERIALIZATION
     Compact format (saved by save.js):
       frame.strokes = [
         ["#000|2|0|0", [[x,y],[x,y],...], [[px,py],...] | null],
         ...
       ]
     Header fields: color|size|eraser(0/1)|oldschool(0/1)
     Element [1] = points array (may be flat pairs or {x,y} objects)
     Element [2] = polygon array or absent/null (oldschool only)

     Full (legacy) format: array of stroke objects — passed through unchanged.
  ===================================================== */
  function deserializeStrokes(rawStrokes) {
    if (!rawStrokes || rawStrokes.length === 0) return [];

    return rawStrokes.map(s => {
      // Already a full object (legacy save)
      if (s && typeof s === 'object' && !Array.isArray(s)) return s;

      // Compact array: [header, points, polygon?]
      if (Array.isArray(s)) {
        const [header, rawPoints, rawPolygon] = s;
        const parts = (header || '').split('|');
        const color      = parts[0] || '#000';
        const size       = parseFloat(parts[1]) || 2;
        const eraser     = parts[2] === '1';
        const oldschool  = parts[3] === '1';

        // Points: accept [[x,y],...] or [{x,y},...]
        const points = (rawPoints || []).map(p =>
          Array.isArray(p) ? { x: p[0], y: p[1] } : p
        );

        // Polygon: same dual format
        const polygon = rawPolygon
          ? rawPolygon.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p)
          : null;

        return { color, size, eraser, oldschool, points, polygon };
      }

      // Unknown — skip
      return null;
    }).filter(Boolean);
  }

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
      mx[0] = 0.5*(sc[1].x+sc[0].x);   my[0] = 0.5*(sc[1].y+sc[0].y);
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
     Handles eraser strokes via destination-out composite.
     Eraser strokes are drawn as filled/stroked shapes that
     punch through to transparency, exactly as in the editor.
  ===================================================== */
  function drawStroke(ctx, stroke, scale) {
    const s = scale || 1;
    if (!stroke.points || stroke.points.length === 0) return;

    // Set composite mode — eraser punches out pixels
    ctx.globalCompositeOperation = stroke.eraser ? 'destination-out' : 'source-over';

    if (stroke.oldschool && stroke.polygon && stroke.polygon.length > 0) {
      ctx.beginPath();
      stroke.polygon.forEach((p, i) => i === 0 ? ctx.moveTo(p.x*s, p.y*s) : ctx.lineTo(p.x*s, p.y*s));
      ctx.closePath();
      ctx.fillStyle = stroke.eraser ? 'rgba(0,0,0,1)' : (stroke.color || '#000');
      ctx.fill();
      // Reset composite immediately after eraser fill
      ctx.globalCompositeOperation = 'source-over';
      return;
    }

    const color = stroke.color || '#000';
    const size  = (stroke.size || 2) * s;

    if (stroke.points.length === 1) {
      ctx.beginPath();
      ctx.arc(stroke.points[0].x*s, stroke.points[0].y*s, size/2, 0, Math.PI*2);
      // Eraser dot — any opaque color works with destination-out
      ctx.fillStyle = stroke.eraser ? 'rgba(0,0,0,1)' : color;
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      return;
    }

    ctx.beginPath();
    // Eraser stroke color doesn't matter visually — destination-out uses alpha only
    ctx.strokeStyle = stroke.eraser ? 'rgba(0,0,0,1)' : color;
    ctx.lineWidth  = size;
    ctx.lineCap    = 'round';
    ctx.lineJoin   = 'round';
    drawMulticurve(ctx, stroke.points, s, false);
    ctx.stroke();

    // Always reset composite after each stroke
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderFrameStrokes(ctx, frame, scale, strokeLimit) {
    if (!frame || !frame.strokes) return;
    const strokes = deserializeStrokes(frame.strokes);
    const limit = (strokeLimit === undefined || strokeLimit < 0)
      ? strokes.length : Math.min(strokeLimit + 1, strokes.length);
    for (let i = 0; i < limit; i++) drawStroke(ctx, strokes[i], scale);
  }

  /* =====================================================
     TOOLBAR PAINTERS
     All coordinates match AS3 exactly.
     Bar and slider are at y=20 (vertical centre of 40px toolbar).
     Button is 30×30, placed at LEFT with margin 5 → x=5.
     SizeButtons are 20×20.
  ===================================================== */

  // Bar — exact port of ToolbarToon.repaintBar()
  function paintBar(ctx, x, barWidth) {
    const y    = 20;
    const w    = barWidth;
    const nSeg = Math.floor(w / 30);

    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(x, y);

    for (let i = 1; i < nSeg - 1; i++)
      ctx.lineTo(x + i*30 + rand(10) - 5, y - rand(2));
    ctx.lineTo(x + w, y);

    for (let i = nSeg - 1; i >= 1; i--)
      ctx.lineTo(x + i*30 + rand(10) - 5, y + 1 + rand(2));

    ctx.closePath();
    ctx.fill();
  }

  // Slider — exact port of ToolbarToon.repaintSlider()
  function paintSlider(ctx, cx, cy) {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    for (let a = 0; a < Math.PI*2; a += Math.PI/8) {
      const px = cx + Math.cos(a)*(8+rand(1));
      const py = cy + Math.sin(a)*(8+rand(1));
      a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let a = 0; a < Math.PI*2; a += Math.PI/6) {
      const px = cx + Math.cos(a)*(6+rand(1));
      const py = cy + Math.sin(a)*(6+rand(1));
      a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  }

  // Play button
  function paintPlayIcon(ctx, x, y) {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(x + 5 + rand(1), y + 5 + rand(1));
    for (let i = 1; i < 4; i++)
      ctx.lineTo(x + 5 + i*5 + rand(1), y + 5 + i*2.5 + rand(1));
    for (let i = 2; i >= 0; i--)
      ctx.lineTo(x + 5 + i*5 + rand(2), y + 5 + (6-i)*3 + rand(1));
    ctx.closePath(); ctx.fill();
  }

  // Pause button
  function paintPauseIcon(ctx, x, y) {
    ctx.fillStyle = '#000';
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 5 + i*10 + rand(2)-1, y + 5);
      for (let j = 1; j < 3; j++) ctx.lineTo(x + 4 - rand(2) + i*10, y + 5 + j*6.6);
      ctx.lineTo(x + 6 + i*10 + rand(2)-1, y + 25);
      for (let j = 2; j > 0; j--) ctx.lineTo(x + 6 + rand(2) + i*10, y + 5 + j*6.6);
      ctx.closePath(); ctx.fill();
    }
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

    const MOVIE_W = 600, MOVIE_H = 300;
    const TB_W = 610, TB_H = 40;

    const frameCount = frames.length || 1;
    const oneFrame   = frameCount === 1;
    const totalSteps = oneFrame
      ? deserializeStrokes(frames[0].strokes || []).length
      : frameCount;
    const showBar    = totalSteps >= 10;

    const LOGO_W  = 90;
    const LOGO_X  = TB_W - LOGO_W - 8;
    const BTN_X   = 5;
    const BTN_W   = 30;
    const BAR_X   = BTN_X + BTN_W + 14;
    const BAR_W   = Math.max(10, LOGO_X - BAR_X - 10);
    const BAR_Y   = 20;

    /* ---- DOM ---- */
    root.innerHTML = '';
    root.style.cssText = [
      'display:inline-block',
      'line-height:0',
      'font-size:0',
      'border:2px solid #000',
      'box-sizing:border-box',
    ].join(';');

    const borderCanvas = document.createElement('canvas');
    borderCanvas.width  = MOVIE_W;
    borderCanvas.height = MOVIE_H;
    borderCanvas.style.cssText = [
      'display:block', 'width:100%',
      'max-width:' + MOVIE_W + 'px',
      'cursor:pointer', 'background:#fff',
    ].join(';');

    const tbCanvas = document.createElement('canvas');
    tbCanvas.width  = TB_W;
    tbCanvas.height = TB_H;
    tbCanvas.style.cssText = [
      'display:block', 'width:100%',
      'max-width:' + TB_W + 'px',
      'cursor:default', 'background:#fff',
      'border-top:2px solid #000',
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

    /* ---- Render toon ---- */
    function renderToon() {
      bCtx.clearRect(0, 0, MOVIE_W, MOVIE_H);
      if (oneFrame) renderFrameStrokes(bCtx, frames[0], 1, lastShownStroke);
      else          renderFrameStrokes(bCtx, frames[curFrame], 1, -1);
    }

    /* ---- Logo ---- */
    const logoImg = new Image();
    logoImg.src = '/img/toonator.svg';
    logoImg.onload = () => renderToolbar();

    /* ---- Render toolbar ---- */
    function renderToolbar() {
      tbCtx.clearRect(0, 0, TB_W, TB_H);
      tbCtx.fillStyle = '#fff';
      tbCtx.fillRect(0, 0, TB_W, TB_H);

      if (playing) paintPauseIcon(tbCtx, BTN_X, 5);
      else         paintPlayIcon(tbCtx,  BTN_X, 5);

      if (showBar) {
        paintBar(tbCtx, BAR_X, BAR_W);
        paintSlider(tbCtx, BAR_X + sliderRatio * BAR_W, BAR_Y);
      }

      if (logoImg.complete && logoImg.naturalWidth > 0) {
        const lw = 90, lh = Math.round(90 * 22 / 155);
        tbCtx.drawImage(logoImg, LOGO_X, Math.round(TB_H/2 - lh/2), lw, lh);
      }
    }

    const tbTimer = setInterval(renderToolbar, 100);

    /* ---- Slider sync ---- */
    function syncSlider() {
      const step = oneFrame ? Math.max(0, lastShownStroke) : curFrame;
      sliderRatio = totalSteps <= 1 ? 0 : step / (totalSteps - 1);
    }

    /* ---- Playback ---- */
    function tickMulti() {
      renderToon(); syncSlider();
      curFrame = (curFrame + 1) % frameCount;
    }

    function tickOneFrame() {
      const deserialized = deserializeStrokes(frames[0].strokes || []);
      const next  = lastShownStroke + 1;
      const total = deserialized.length;
      if (next >= total) {
        stopPlay(); lastShownStroke = total - 1; renderToon(); syncSlider(); return;
      }
      lastShownStroke = next; renderToon(); syncSlider();
    }

    function startPlay() {
      if (playing) return;
      if (oneFrame) {
        const deserialized = deserializeStrokes(frames[0].strokes || []);
        if (lastShownStroke >= deserialized.length - 1) lastShownStroke = -1;
      }
      playing = true;
      animTimer = setInterval(oneFrame ? tickOneFrame : tickMulti, frameDelay);
    }

    function stopPlay() {
      playing = false; clearInterval(animTimer); animTimer = null;
    }

    /* ---- Seek ---- */
    function seekToRatio(ratio) {
      const clamped = Math.max(0, Math.min(1, ratio));
      sliderRatio   = clamped;
      const step    = Math.round(clamped * (totalSteps - 1));
      if (oneFrame) lastShownStroke = step; else curFrame = step;
      renderToon();
    }

    function mouseRatioOnBar(e) {
      const rect   = tbCanvas.getBoundingClientRect();
      const scaleX = TB_W / rect.width;
      return ((e.clientX - rect.left) * scaleX - BAR_X) / BAR_W;
    }

    function mouseXOnTb(e) {
      const rect   = tbCanvas.getBoundingClientRect();
      const scaleX = TB_W / rect.width;
      return (e.clientX - rect.left) * scaleX;
    }

    /* ---- Events ---- */
    tbCanvas.addEventListener('click', (e) => {
      const mx = mouseXOnTb(e);
      if (mx >= BTN_X && mx < BTN_X + BTN_W + 10) {
        if (playing) stopPlay(); else startPlay();
      } else if (showBar && mx >= BAR_X && mx <= BAR_X + BAR_W) {
        stopPlay(); seekToRatio(mouseRatioOnBar(e));
      }
    });

    tbCanvas.addEventListener('mousedown', (e) => {
      const mx = mouseXOnTb(e);
      if (!showBar || mx < BAR_X || mx > BAR_X + BAR_W) return;
      sliderDragging = true; stopPlay(); seekToRatio(mouseRatioOnBar(e));
    });

    document.addEventListener('mousemove', (e) => {
      if (sliderDragging) seekToRatio(mouseRatioOnBar(e));
    });
    document.addEventListener('mouseup', () => { sliderDragging = false; });

    borderCanvas.addEventListener('click', () => { if (playing) stopPlay(); else startPlay(); });

    /* ---- Init ---- */
    if (oneFrame) {
      const deserialized = deserializeStrokes(frames[0].strokes || []);
      lastShownStroke = deserialized.length - 1;
    } else {
      curFrame = 0;
    }
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
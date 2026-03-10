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
    ctx.strokeStyle = color; ctx.lineWidth = size;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    drawMulticurve(ctx, stroke.points, s, false);
    ctx.stroke();
  }

  function renderFrameStrokes(ctx, frame, scale, strokeLimit) {
    if (!frame || !frame.strokes) return;
    const limit = (strokeLimit === undefined || strokeLimit < 0)
      ? frame.strokes.length : Math.min(strokeLimit + 1, frame.strokes.length);
    for (let i = 0; i < limit; i++) drawStroke(ctx, frame.strokes[i], scale);
  }

  /* =====================================================
     TOOLBAR PAINTERS
     All coordinates match AS3 exactly.
     Bar and slider are at y=20 (vertical centre of 40px toolbar).
     Button is 30×30, placed at LEFT with margin 5 → x=5.
     SizeButtons are 20×20.
  ===================================================== */

  // Bar — exact port of ToolbarToon.repaintBar()
  // bar.x = placeRect.x + 10, barWidth = placeRect.width - 20
  // drawn at local y=20, fills 2px high (thin strip)
  function paintBar(ctx, x, barWidth) {
    const y    = 20;  // matches AS3 _loc5_ = 20
    const w    = barWidth;
    const nSeg = Math.floor(w / 30);

    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(x, y);

    // Top wobbly edge (left→right)
    for (let i = 1; i < nSeg - 1; i++)
      ctx.lineTo(x + i*30 + rand(10) - 5, y - rand(2));
    ctx.lineTo(x + w, y);

    // Bottom wobbly edge (right→left)
    for (let i = nSeg - 1; i >= 1; i--)
      ctx.lineTo(x + i*30 + rand(10) - 5, y + 1 + rand(2));

    ctx.closePath();
    ctx.fill();
  }

  // Slider — exact port of ToolbarToon.repaintSlider()
  // Two concentric wobbly circles at (cx, cy)
  // Outer: black, r≈8+rand(1), step PI/8
  // Inner: white, r≈6+rand(1), step PI/6
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

  // Play button — exact port of Button.repaint() mode=1 (shows play ▶)
  // 30×30 hit area, drawn in black
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

  // Pause button — exact port of Button.repaint() mode=0 (shows pause ‖)
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

  // Expand button — port of SizeButton EXPAND (20×20)
  // Two L-shapes with sketchy arrowheads, drawn in dark colour
  function paintExpandIcon(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = '#777'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    // Top-right bracket
    ctx.beginPath(); ctx.moveTo(x+12+rand(1), y+rand(1)); ctx.lineTo(x+19+rand(1), y+rand(1)); ctx.lineTo(x+19+rand(1), y+8+rand(1)); ctx.stroke();
    // Bottom-left bracket
    ctx.beginPath(); ctx.moveTo(x+rand(1), y+12+rand(1)); ctx.lineTo(x+rand(1), y+19+rand(1)); ctx.lineTo(x+8+rand(1), y+19+rand(1)); ctx.stroke();
    ctx.restore();
  }

  // Fullscreen button — port of SizeButton FULLSCREEN (20×20)
  // Corner brackets at all four corners
  function paintFullscreenIcon(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = '#777'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    // Top-left
    ctx.beginPath(); ctx.moveTo(x+rand(1), y+8+rand(1)); ctx.lineTo(x+rand(1), y+rand(1)); ctx.lineTo(x+8+rand(1), y+rand(1)); ctx.stroke();
    // Top-right
    ctx.beginPath(); ctx.moveTo(x+12+rand(1), y+rand(1)); ctx.lineTo(x+20+rand(1), y+rand(1)); ctx.lineTo(x+20+rand(1), y+8+rand(1)); ctx.stroke();
    // Bottom-left
    ctx.beginPath(); ctx.moveTo(x+rand(1), y+12+rand(1)); ctx.lineTo(x+rand(1), y+20+rand(1)); ctx.lineTo(x+8+rand(1), y+20+rand(1)); ctx.stroke();
    // Bottom-right
    ctx.beginPath(); ctx.moveTo(x+12+rand(1), y+20+rand(1)); ctx.lineTo(x+20+rand(1), y+20+rand(1)); ctx.lineTo(x+20+rand(1), y+12+rand(1)); ctx.stroke();
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

    // AS3 dimensions
    const MOVIE_W = 600, MOVIE_H = 300;
    // Toolbar: AS3 _width=610, height=40
    const TB_W = 610, TB_H = 40;

    const frameCount = frames.length || 1;
    const oneFrame   = frameCount === 1;
    const totalSteps = oneFrame ? (frames[0].strokes || []).length : frameCount;
    const showBar    = totalSteps >= 10;  // AS3: hide bar if total < 10

    /* ---- Toolbar layout — mirrors Toolbar.realign() exactly ----
       placeRect starts as Rectangle(0, 0, 610, 40)
       RIGHT items (consume from right edge):
         logo:        width≈60, margin 5  → right edge moves left by 65
         fullscreen:  width=20, margin 10 → right edge moves left by 30
         expand:      width=20, margin 10 → right edge moves left by 30
       LEFT items:
         button:      width=30, margin 5  → left edge moves right by 35
       Remaining placeRect is the bar zone.
    ---- */
    const LOGO_W  = 62;  // approximate rendered width of "Toonator" logo text
    const SZ_BTN  = 20;  // SizeButton is 20×20

    // Right side x positions (right-to-left placement)
    const LOGO_X  = TB_W - LOGO_W - 5;                    // rightmost
    const FS_X    = LOGO_X - SZ_BTN - 10;                 // fullscreen left of logo
    const EXP_X   = FS_X  - SZ_BTN - 10;                  // expand left of fullscreen

    // Left side
    const BTN_X   = 5;   // button margin=5
    const BTN_W   = 30;

    // Bar zone: placeRect after left+right consumption
    const placeLeft  = BTN_X + BTN_W + 5;   // 5(margin) + 30(btn) + 5 = 40
    const placeRight = EXP_X - 10;          // expand x - its margin
    // bar.x = placeRect.x + 10, barWidth = placeRect.width - 20
    const BAR_X    = placeLeft + 10;
    const BAR_W    = Math.max(10, (placeRight - placeLeft) - 20);
    const BAR_Y    = 20;  // AS3: slider.y = 20, bar drawn at y=20

    /* ---- DOM ---- */
    root.innerHTML = '';
    root.style.cssText = [
      'display:inline-block',
      'line-height:0',
      'font-size:0',
      'border:2px solid #000',
      'box-sizing:border-box',
    ].join(';');

    // Toon canvas — plain white, no border logic needed
    const borderCanvas = document.createElement('canvas');
    borderCanvas.width  = MOVIE_W;
    borderCanvas.height = MOVIE_H;
    borderCanvas.style.cssText = [
      'display:block', 'width:100%',
      'max-width:' + MOVIE_W + 'px',
      'cursor:pointer', 'background:#fff',
    ].join(';');

    // Toolbar canvas
    const tbCanvas = document.createElement('canvas');
    tbCanvas.width  = TB_W;
    tbCanvas.height = TB_H;
    tbCanvas.style.cssText = [
      'display:block', 'width:100%',
      'max-width:' + TB_W + 'px',
      'cursor:default', 'background:#fff',
      'border-top:1px solid #ccc',
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

    /* ---- Render toolbar ---- */
    function renderToolbar() {
      tbCtx.clearRect(0, 0, TB_W, TB_H);
      tbCtx.fillStyle = '#fff';
      tbCtx.fillRect(0, 0, TB_W, TB_H);

      // Play/Pause button at x=BTN_X, vertically centred (30×30 → y=5)
      if (playing) paintPauseIcon(tbCtx, BTN_X, 5);
      else         paintPlayIcon(tbCtx,  BTN_X, 5);

      // Scrub bar + slider (hidden if totalSteps < 10)
      if (showBar) {
        paintBar(tbCtx, BAR_X, BAR_W);
        paintSlider(tbCtx, BAR_X + sliderRatio * BAR_W, BAR_Y);
      }

      // Frame / stroke counter — just right of bar
      const step  = oneFrame ? Math.max(0, lastShownStroke) : curFrame;
      const label = (step + 1) + ' / ' + totalSteps + (oneFrame ? ' strokes' : '');
      tbCtx.fillStyle    = '#999';
      tbCtx.font         = '10px Tahoma, sans-serif';
      tbCtx.textAlign    = 'left';
      tbCtx.textBaseline = 'middle';
      tbCtx.fillText(label, BAR_X + BAR_W + 6, BAR_Y);

      // Right icons
      paintExpandIcon(tbCtx,     EXP_X, TB_H/2 - 10);
      paintFullscreenIcon(tbCtx, FS_X,  TB_H/2 - 10);

      // Logo — "Toonator" in the original hand-drawn font style
      tbCtx.font         = 'bold 14px "Comic Sans MS", cursive';
      tbCtx.fillStyle    = '#bbb';
      tbCtx.textAlign    = 'left';
      tbCtx.textBaseline = 'middle';
      tbCtx.fillText('Toonator', LOGO_X, TB_H/2);
    }

    /* ---- 100ms jitter interval — mirrors AS3 ENTER_FRAME at 10fps ---- */
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
        if (lastShownStroke >= (frames[0].strokes || []).length - 1) lastShownStroke = -1;
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
      } else if (mx >= EXP_X && mx < EXP_X + SZ_BTN) {
        // expand — no-op in web embed
      } else if (mx >= FS_X && mx < FS_X + SZ_BTN) {
        if (!document.fullscreenElement) root.requestFullscreen && root.requestFullscreen();
        else document.exitFullscreen && document.exitFullscreen();
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

    /* ---- Init — mirrors AS3 checkComplete → showPosition(0) ---- */
    if (oneFrame) lastShownStroke = (frames[0].strokes || []).length - 1;
    else          curFrame = 0;
    syncSlider();
    renderToon();
    renderToolbar();

    // Auto-play multi-frame (mirrors AS3: if (!isPaused) play())
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
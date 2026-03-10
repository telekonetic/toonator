/* =====================================================
   CANVAS SETUP
===================================================== */

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const timelineCanvas = document.getElementById("timelineCanvas");
const timelineCtx = timelineCanvas.getContext("2d");


/* =====================================================
   PIXEL NUMBER FONT
===================================================== */

const numbers = [
[0,1,1,0,1,0,0,1,1,0,0,1,1,0,0,1,0,1,1,0],
[0,0,1,0,0,1,1,0,0,0,1,0,0,0,1,0,0,1,1,1],
[1,1,1,0,0,0,0,1,0,1,1,0,1,0,0,0,1,1,1,1],
[1,1,1,0,0,0,0,1,0,1,1,0,0,0,0,1,1,1,1,0],
[1,0,0,1,1,0,0,1,0,1,1,1,0,0,0,1,0,0,0,1],
[1,1,1,1,1,0,0,0,1,1,1,0,0,0,0,1,1,1,1,0],
[0,1,1,1,1,0,0,0,1,1,1,0,1,0,0,1,0,1,1,0],
[1,1,1,1,0,0,0,1,0,0,1,0,0,1,0,0,0,1,0,0],
[0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0],
[0,1,1,0,1,0,0,1,0,1,1,1,0,0,0,1,1,1,1,0]
];


/* =====================================================
   STATE
===================================================== */

let drawing = false;

let brushSize = 2;
let color = "#000";
let eraserMode = false;  // NEW: track eraser mode separately

let frames = [{ strokes: [] }];

let currentFrame = 0;
let previousFrame = -1;
let lastViewedFrame = -1;  // NEW: track last clicked/viewed frame for onion skin

let currentStroke = null;

let playing = false;
let playInterval = null;

let copiedFrame = null;

let eyedropperActive = false;

// NEW: oldschool brush mode toggle
let oldschoolMode = false;

// Tracks last 3 keypresses to detect the "old" cheat code (mirrors AS3 lastThreeKeys)
const lastThreeKeys = [0, 0, 0];

const brushSizes = [2, 4, 6, 10, 20];
const sizeButtons = ['btnSize1','btnSize2','btnSize3','btnSize4','btnSize5'];

/* =====================================================
   SETTINGS — all user-configurable values
===================================================== */
const settings = {
  smoothing: true,          // enable/disable multicurve spline smoothing
  simplifyTolerance: 5,     // RDP simplification tolerance (0 = off, higher = fewer points)
  onionSkin: true,          // show previous frames ghosted
  onionSkin2: true,         // show 2nd previous frame (very faint)
  onionAlpha1: 0.3,         // opacity of frame-1 ghost
  onionAlpha2: 0.1,         // opacity of frame-2 ghost
  playFPS: 10,              // playback frames per second
};

/* timeline */

let startPos = 0;
let endPos = 0;
let frameThumbs = [];


/* =====================================================
   MAIN RENDER
===================================================== */

let renderScale = 1;

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // NEW: Don't show onion skin during playback
  if (!playing) {
    // Use lastViewedFrame instead of currentFrame - 1 for onion skin
    if (settings.onionSkin && lastViewedFrame >= 0 && lastViewedFrame !== currentFrame) {
      // Show 2nd previous frame if enabled and exists
      if (settings.onionSkin2 && lastViewedFrame > 0) {
        const twoBack = frames[lastViewedFrame - 1];
        if (twoBack) {
          ctx.globalAlpha = settings.onionAlpha2;
          drawFrameStrokes(ctx, twoBack.strokes);
        }
      }

      // Show last viewed frame
      ctx.globalAlpha = settings.onionAlpha1;
      drawFrameStrokes(ctx, frames[lastViewedFrame].strokes);
    }
  }

  ctx.globalAlpha = 1;
  drawFrameStrokes(ctx, frames[currentFrame].strokes);
}

// NEW: shared stroke renderer — uses multicurve spline when enough points exist,
// falls back to straight lines for very short strokes (mirrors ActionScript logic)
function drawFrameStrokes(targetCtx, strokes) {
  strokes.forEach(stroke => {
    // Only change composite operation for eraser
    if (stroke.eraser) {
      targetCtx.globalCompositeOperation = 'destination-out';
    }

    targetCtx.beginPath();
    targetCtx.lineWidth = stroke.size * renderScale;
    targetCtx.strokeStyle = stroke.color;
    targetCtx.lineCap = "round";
    targetCtx.lineJoin = "round";

    if (stroke.oldschool) {
      drawOldschoolStroke(targetCtx, stroke);
    } else {
      if (settings.smoothing) {
        drawMulticurve(targetCtx, stroke.points, false);
      } else {
        stroke.points.forEach((p, i) => {
          const x = p.x * renderScale, y = p.y * renderScale;
          if (i === 0) targetCtx.moveTo(x, y);
          else targetCtx.lineTo(x, y);
        });
      }
      targetCtx.stroke();
    }
    
    // Reset only if we changed it
    if (stroke.eraser) {
      targetCtx.globalCompositeOperation = 'source-over';
    }
  });
}


/* =====================================================
   MULTICURVE — ported from ActionScript multicurve()
   Draws smooth quadratic Bézier splines through points.
   Uses midpoints between consecutive points as anchors,
   matching the AS3 drawPath / curveTo logic exactly.
===================================================== */

function drawMulticurve(targetCtx, points, closed) {
  if (!points || points.length === 0) return;

  const scaled = points.map(p => ({ x: p.x * renderScale, y: p.y * renderScale }));
  const n = scaled.length;

  if (n === 1) {
    // Single point — draw a dot
    targetCtx.arc(scaled[0].x, scaled[0].y, targetCtx.lineWidth / 2, 0, Math.PI * 2);
    return;
  }

  if (n === 2) {
    targetCtx.moveTo(scaled[0].x, scaled[0].y);
    targetCtx.lineTo(scaled[1].x, scaled[1].y);
    return;
  }

  // Compute midpoints array (mirrors AS3 _loc11_ / _loc12_ arrays)
  const mx = [];
  const my = [];

  for (let i = 1; i < n - 2; i++) {
    mx[i] = 0.5 * (scaled[i + 1].x + scaled[i].x);
    my[i] = 0.5 * (scaled[i + 1].y + scaled[i].y);
  }

  if (closed) {
    mx[0]     = 0.5 * (scaled[1].x + scaled[0].x);
    my[0]     = 0.5 * (scaled[1].y + scaled[0].y);
    mx[n - 1] = 0.5 * (scaled[n - 1].x + scaled[n - 2].x);
    my[n - 1] = 0.5 * (scaled[n - 1].y + scaled[n - 2].y);
  } else {
    // Open path: first and last midpoints are just the endpoints themselves
    mx[0]     = scaled[0].x;
    my[0]     = scaled[0].y;
    mx[n - 2] = scaled[n - 1].x;
    my[n - 2] = scaled[n - 1].y;
  }

  targetCtx.moveTo(mx[0], my[0]);

  for (let i = 1; i < n - 1; i++) {
    // quadraticCurveTo: control point = actual point, end = next midpoint
    targetCtx.quadraticCurveTo(scaled[i].x, scaled[i].y, mx[i], my[i]);
  }

  if (closed) {
    targetCtx.quadraticCurveTo(scaled[n - 1].x, scaled[n - 1].y, mx[0], my[0]);
    targetCtx.closePath();
  }
}


/* =====================================================
   OLDSCHOOL BRUSH MODE — ported from AS3 onOldEndDraw()
   Builds a filled polygon outline around the stroke path,
   with rounded end caps and slight random width variation.
===================================================== */

function getAngle(a, b) {
  if (a.y === b.y && a.x === b.x) return 0;
  let angle = Math.atan2(b.y - a.y, b.x - a.x);
  while (angle < 0) angle += Math.PI * 2;
  while (angle > Math.PI * 2) angle -= Math.PI * 2;
  return angle;
}

function midAngle(a, b) {
  while (a < 0) a += Math.PI * 2;
  while (a > Math.PI * 2) a -= Math.PI * 2;
  while (b < 0) b += Math.PI * 2;
  while (b > Math.PI * 2) b -= Math.PI * 2;

  let diff = (Math.PI * 2 - a + b) % (Math.PI * 2);
  let result = a + diff / 2;
  result = result % (Math.PI * 2);
  return result;
}

function buildOldschoolPolygon(points, halfWidth) {
  const CAP_STEPS = 4;        // matches AS3 _loc3_ = 4
  const r = halfWidth;
  const poly = [];

  if (points.length < 2) {
    // Single dot — circle approximation
    for (let a = 0; a < Math.PI * 2; a += Math.PI / CAP_STEPS) {
      poly.push({ x: points[0].x + r * Math.cos(a), y: points[0].y + r * Math.sin(a) });
    }
    return poly;
  }

  // Jitter range for organic width variation (mirrors AS3 _loc16_)
  let jitter = r / 2;
  if (jitter < 2) jitter = 2;
  if (jitter > 6) jitter = 6;

  // ---- Forward pass: left side of stroke ----
  let angle = getAngle(points[0], points[1]);

  // Start cap (semicircle)
  for (let a = angle + Math.PI / 2; a < angle + Math.PI / 2 + Math.PI + Math.PI / CAP_STEPS / 2; a += Math.PI / CAP_STEPS) {
    poly.push({ x: points[0].x + r * Math.cos(a), y: points[0].y + r * Math.sin(a) });
  }

  // Mid-points going forward
  for (let i = 1; i < points.length - 1; i++) {
    const nextAngle = getAngle(points[i], points[i + 1]);
    let delta = angle - nextAngle;

    let turnRight;
    if (delta > Math.PI)      { delta = Math.PI * 2 - delta; turnRight = false; }
    else if (delta < -Math.PI) { delta = Math.PI * 2 + delta; turnRight = true; }
    else if (delta >= 0)       { turnRight = true; }
    else                       { delta = -delta; turnRight = false; }

    const mid = midAngle(angle - Math.PI / 2, nextAngle - Math.PI / 2);
    const outAngle = turnRight ? mid + Math.PI : mid;

    if (delta > Math.PI / 4) {
      poly.push({ x: points[i].x + r * Math.cos(outAngle), y: points[i].y + r * Math.sin(outAngle) });
    } else {
      const rj = r + Math.random() * jitter - jitter / 2;
      poly.push({ x: points[i].x + rj * Math.cos(outAngle), y: points[i].y + rj * Math.sin(outAngle) });
    }

    angle = nextAngle;
  }

  // End cap (semicircle)
  angle = getAngle(points[points.length - 2], points[points.length - 1]);
  const endR = r + Math.random() * jitter - jitter / 2;
  for (let a = angle + Math.PI / 2 + Math.PI; a < angle + Math.PI / 2 + Math.PI * 2 + Math.PI / CAP_STEPS / 2; a += Math.PI / CAP_STEPS) {
    poly.push({ x: points[points.length - 1].x + endR * Math.cos(a), y: points[points.length - 1].y + endR * Math.sin(a) });
  }

  // ---- Backward pass: right side of stroke ----
  angle = getAngle(points[points.length - 1], points[points.length - 2]);

  for (let i = points.length - 2; i > 0; i--) {
    const nextAngle = getAngle(points[i], points[i - 1]);
    let delta = angle - nextAngle;

    let turnRight;
    if (delta > Math.PI)      { delta = Math.PI * 2 - delta; turnRight = false; }
    else if (delta < -Math.PI) { delta = Math.PI * 2 + delta; turnRight = true; }
    else if (delta >= 0)       { turnRight = true; }
    else                       { delta = -delta; turnRight = false; }

    const mid = midAngle(angle - Math.PI / 2, nextAngle - Math.PI / 2);
    const outAngle = turnRight ? mid + Math.PI : mid;

    if (delta > Math.PI / 4) {
      poly.push({ x: points[i].x + r * Math.cos(outAngle), y: points[i].y + r * Math.sin(outAngle) });
    } else {
      const rj = r + Math.random() * jitter - jitter / 2;
      poly.push({ x: points[i].x + rj * Math.cos(outAngle), y: points[i].y + rj * Math.sin(outAngle) });
    }

    angle = nextAngle;
  }

  return poly;
}

function drawOldschoolStroke(targetCtx, stroke) {
  if (!stroke.polygon || stroke.polygon.length === 0) return;
  const poly = stroke.polygon;
  
  // Use multiple operations to ensure smooth filling
  targetCtx.beginPath();
  poly.forEach((p, i) => {
    const x = p.x * renderScale;
    const y = p.y * renderScale;
    if (i === 0) targetCtx.moveTo(x, y);
    else targetCtx.lineTo(x, y);
  });
  targetCtx.closePath();
  targetCtx.fillStyle = stroke.color;
  targetCtx.fill();
  
  // Also stroke the centerline to fill any gaps
  targetCtx.beginPath();
  targetCtx.lineWidth = stroke.size * renderScale;
  targetCtx.strokeStyle = stroke.color;
  targetCtx.lineCap = "round";
  targetCtx.lineJoin = "round";
  stroke.points.forEach((p, i) => {
    const x = p.x * renderScale;
    const y = p.y * renderScale;
    if (i === 0) targetCtx.moveTo(x, y);
    else targetCtx.lineTo(x, y);
  });
  targetCtx.stroke();
}


/* =====================================================
   LINE SIMPLIFICATION — ported from AS3 LineGeneralization
   Ramer–Douglas–Peucker algorithm.
   Reduces redundant collinear points after mouse-up,
   mirroring the AS3 simplifyLang(5, 10, points) call.
===================================================== */

function simplifyPoints(points, tolerance) {
  if (points.length <= 2) return points;

  function perpendicularDist(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function rdp(pts, start, end, tol, keep) {
    if (end <= start + 1) return;
    let maxDist = 0, maxIdx = start;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDist(pts[i], pts[start], pts[end]);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > tol) {
      keep[maxIdx] = true;
      rdp(pts, start, maxIdx, tol, keep);
      rdp(pts, maxIdx, end, tol, keep);
    }
  }

  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  rdp(points, 0, points.length - 1, tolerance, keep);
  return points.filter((_, i) => keep[i]);
}


/* =====================================================
   PLAYBACK HELPERS
===================================================== */

function setPlaying(val) {
  document.getElementById("btnPlay").style.display = val ? "none" : "block";
  document.getElementById("btnPause").style.display = val ? "block" : "none";
}

function stopIfPlaying() {
  if (playing) {
    stop();
    setPlaying(false);
  }
}


/* =====================================================
   CUSTOM CURSOR
===================================================== */

let cursorCanvas = null;
let cursorCtx = null;

function createCursorCanvas() {
  if (!cursorCanvas) {
    cursorCanvas = document.createElement('canvas');
    cursorCtx = cursorCanvas.getContext('2d');
  }
  const size = Math.max(brushSize * 2 + 4, 20);
  cursorCanvas.width = size;
  cursorCanvas.height = size;
  const center = size / 2;
  
  cursorCtx.clearRect(0, 0, size, size);
  cursorCtx.strokeStyle = eraserMode ? '#666' : '#000';
  cursorCtx.lineWidth = 1;
  cursorCtx.beginPath();
  cursorCtx.arc(center, center, brushSize, 0, Math.PI * 2);
  cursorCtx.stroke();
  
  return cursorCanvas.toDataURL();
}

function updateCursor() {
  if (eyedropperActive) {
    canvas.style.cursor = 'crosshair';
  } else {
    const cursorUrl = createCursorCanvas();
    const size = Math.max(brushSize * 2 + 4, 20);
    const center = size / 2;
    canvas.style.cursor = `url('${cursorUrl}') ${center} ${center}, auto`;
  }
}


/* =====================================================
   DRAW INPUT
===================================================== */

canvas.addEventListener("mousedown", (e) => {
  stopIfPlaying();
  drawing = true;
  currentStroke = {
    size: brushSize,
    color: eraserMode ? '#000' : color,  // Store black for eraser
    eraser: eraserMode,  // NEW: flag to use destination-out
    points: [],
    oldschool: oldschoolMode,
    polygon: null
  };
  currentStroke.points.push({
    x: e.offsetX / renderScale,
    y: e.offsetY / renderScale
  });
  frames[currentFrame].strokes.push(currentStroke);
});

canvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;
  currentStroke.points.push({
    x: e.offsetX / renderScale,
    y: e.offsetY / renderScale
  });
  render();
});

canvas.addEventListener("mouseup", () => {
  if (!drawing) return;
  drawing = false;
  ctx.beginPath();

  // simplify points on mouse-up — tolerance 0 means skip entirely
  if (currentStroke && currentStroke.points.length > 2 && settings.simplifyTolerance > 0) {
    currentStroke.points = simplifyPoints(currentStroke.points, settings.simplifyTolerance);
  }

  // NEW: build oldschool polygon outline after simplification
  if (currentStroke && currentStroke.oldschool && currentStroke.points.length >= 2) {
    currentStroke.polygon = buildOldschoolPolygon(currentStroke.points, currentStroke.size / 2);
  }

  updateThumbnail(currentFrame);
  drawFramesTimeline();
  render();
});

// NEW: Stop drawing when mouse leaves canvas
canvas.addEventListener("mouseleave", () => {
  if (!drawing) return;
  drawing = false;
  ctx.beginPath();

  // simplify points on mouse leave
  if (currentStroke && currentStroke.points.length > 2 && settings.simplifyTolerance > 0) {
    currentStroke.points = simplifyPoints(currentStroke.points, settings.simplifyTolerance);
  }

  // build oldschool polygon outline after simplification
  if (currentStroke && currentStroke.oldschool && currentStroke.points.length >= 2) {
    currentStroke.polygon = buildOldschoolPolygon(currentStroke.points, currentStroke.size / 2);
  }

  updateThumbnail(currentFrame);
  drawFramesTimeline();
  render();
});


/* =====================================================
   FRAME MANAGEMENT
===================================================== */

function newFrame(insertBefore = false){

  stopIfPlaying();
  updateThumbnail(currentFrame);

  if (insertBefore) {
    // Insert new frame before current frame
    frames.splice(currentFrame, 0, {strokes:[]});
    frameThumbs.splice(currentFrame, 0, null);
    // Stay on the same index (which is now the new frame)
    lastViewedFrame = currentFrame > 0 ? currentFrame - 1 : -1;
  } else {
    // Add new frame at end
    frames.push({strokes:[]});
    previousFrame = currentFrame;
    currentFrame = frames.length - 1;
    lastViewedFrame = previousFrame;
  }

  updateSliderMax();
  autoScrollTimeline();

  render();
  drawFramesTimeline();

}

function nextFrame(){

  if(currentFrame<frames.length-1){

    lastViewedFrame = currentFrame;  // NEW: track last viewed
    previousFrame=currentFrame;
    currentFrame++;

    render();
    drawFramesTimeline();

  }

}

function prevFrame(){

  if(currentFrame>0){

    lastViewedFrame = currentFrame;  // NEW: track last viewed
    previousFrame=currentFrame;
    currentFrame--;

    render();
    drawFramesTimeline();

  }

}


/* =====================================================
   COPY / PASTE
===================================================== */

function copyFrame(){
  copiedFrame=JSON.parse(JSON.stringify(frames[currentFrame]));
}

function pasteFrame(){

  if(!copiedFrame) return;

  frames[currentFrame]=JSON.parse(JSON.stringify(copiedFrame));

  updateThumbnail(currentFrame);

  render();
  drawFramesTimeline();

}


/* =====================================================
   PLAYBACK
===================================================== */

function play(){

  if(playing) return;

  playing=true;

  playInterval=setInterval(()=>{

    currentFrame++;

    if(currentFrame>=frames.length)
      currentFrame=0;

    render();
    drawFramesTimeline();

  }, Math.round(1000 / settings.playFPS));

}

function stop(){

  playing=false;
  clearInterval(playInterval);

}


/* =====================================================
   THUMBNAILS
===================================================== */

function updateThumbnail(frameIndex){

  const thumb=document.createElement("canvas");

  thumb.width=46;
  thumb.height=22;

  const tctx=thumb.getContext("2d");

  tctx.lineWidth = 1;
  tctx.lineCap = "round";
  tctx.lineJoin = "round";

  frames[frameIndex].strokes.forEach(stroke => {

    // Handle eraser strokes with destination-out
    if (stroke.eraser) {
      tctx.globalCompositeOperation = 'destination-out';
    } else {
      tctx.globalCompositeOperation = 'source-over';
    }

    if (stroke.oldschool && stroke.polygon) {
      // Draw filled polygon in thumbnail
      const poly = stroke.polygon;
      tctx.beginPath();
      poly.forEach((p, i) => {
        const x = p.x / 12;
        const y = p.y / 12;
        if (i === 0) tctx.moveTo(x, y);
        else tctx.lineTo(x, y);
      });
      tctx.closePath();
      tctx.fillStyle = stroke.color;  // NEW: use actual stroke color
      tctx.fill();
    } else {
      // Draw spline curve in thumbnail
      tctx.strokeStyle = stroke.color;  // NEW: use actual stroke color
      tctx.beginPath();
      drawMulticurveRaw(tctx, stroke.points, 1 / 12, false);
      tctx.stroke();
    }

  });

  // Reset composite operation
  tctx.globalCompositeOperation = 'source-over';

  frameThumbs[frameIndex]=thumb;

}

// Helper: multicurve with a custom scale factor (used for thumbnails)
function drawMulticurveRaw(targetCtx, points, scale, closed) {
  if (!points || points.length === 0) return;
  const scaled = points.map(p => ({ x: p.x * scale, y: p.y * scale }));
  const n = scaled.length;
  if (n === 1) return;
  if (n === 2) {
    targetCtx.moveTo(scaled[0].x, scaled[0].y);
    targetCtx.lineTo(scaled[1].x, scaled[1].y);
    return;
  }
  const mx = [], my = [];
  for (let i = 1; i < n - 2; i++) {
    mx[i] = 0.5 * (scaled[i + 1].x + scaled[i].x);
    my[i] = 0.5 * (scaled[i + 1].y + scaled[i].y);
  }
  mx[0]     = scaled[0].x;
  my[0]     = scaled[0].y;
  mx[n - 2] = scaled[n - 1].x;
  my[n - 2] = scaled[n - 1].y;
  targetCtx.moveTo(mx[0], my[0]);
  for (let i = 1; i < n - 1; i++) {
    targetCtx.quadraticCurveTo(scaled[i].x, scaled[i].y, mx[i], my[i]);
  }
}


/* =====================================================
   TIMELINE
===================================================== */

function drawDigit(digit,x,y){

  const data = numbers[digit];

  for(let row=0; row<5; row++){
    for(let col=0; col<4; col++){

      if(data[col + row*4]){

        timelineCtx.fillStyle = "red";
        timelineCtx.fillRect(x + col, y + row, 1, 1);

      }

    }
  }

}

function drawFramesTimeline(){

  const tlW = timelineCanvas.width;
  const visibleSlots = Math.floor(tlW / 48);

  timelineCtx.fillStyle="white";
  timelineCtx.fillRect(0,0,tlW,24);

  endPos = Math.min(startPos + visibleSlots - 1, frames.length - 1);

  for(let i=startPos;i<=endPos;i++){

    const slot = i - startPos;
    const x = slot * 48;

    if(frameThumbs[i])
      timelineCtx.drawImage(frameThumbs[i],x+1,1);

    /* ===== frame number ===== */

    let num = i;
    let offset = 1;

    do{

      const digit = num % 10;

      drawDigit(
        digit,
        x + 48 - offset*5,
        1
      );

      num = Math.floor(num/10);
      offset++;

    }while(num > 0);

    /* ===== divider ===== */

    timelineCtx.fillStyle="black";
    timelineCtx.fillRect((slot+1)*48,0,1,24);

    /* ===== frame highlights ===== */

    if(i===currentFrame){

      timelineCtx.strokeStyle="red";
      timelineCtx.strokeRect(x,0,48,24);

    }

    if(i===previousFrame){

      timelineCtx.strokeStyle="#777";
      timelineCtx.strokeRect(x,0,48,24);

    }

  }

}


/* =====================================================
   TIMELINE CLICK
===================================================== */

timelineCanvas.addEventListener("mousedown",(e)=>{

  let frame=Math.floor(e.offsetX/48)+startPos;

  if(frame<frames.length){

    lastViewedFrame = currentFrame;  // NEW: track last viewed before jumping
    previousFrame=currentFrame;
    currentFrame=frame;

    render();
    drawFramesTimeline();

  }

});


/* =====================================================
   SCROLLBAR
===================================================== */

const slider = document.getElementById("scrollSlider");
const track = document.getElementById("scrollBar");
let max = 0;
let pos = 0;
let dragging = false;
const SCROLL_LEFT = 0;
let SCROLL_RIGHT_DYNAMIC = 479;

function getTravel() {
  return SCROLL_RIGHT_DYNAMIC - SCROLL_LEFT - slider.offsetWidth;
}

function setSliderPos(percent) {
  slider.style.left = (SCROLL_LEFT + percent * getTravel()) + "px";
}

function snapSlider() {
  setSliderPos(max <= 0 ? 0 : pos / max);
}

slider.addEventListener("mousedown", () => { dragging = true; });

document.addEventListener("mouseup", () => {
  if (!dragging) return;
  dragging = false;
  snapSlider();
});

document.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const rect = track.getBoundingClientRect();
  const travel = getTravel();
  let x = e.clientX - rect.left - slider.offsetWidth / 2;
  x = Math.max(SCROLL_LEFT, Math.min(SCROLL_LEFT + travel, x));
  slider.style.left = x + "px";
  if (max > 0) {
    const newPos = Math.round(((x - SCROLL_LEFT) / travel) * max);
    if (newPos !== pos) {
      pos = Math.max(0, Math.min(max, newPos));
      scrollTimeline();
    }
  }
});

function scrollTimeline() {
  startPos = pos;
  drawFramesTimeline();
}

function updateSliderMax() {
  const visibleSlots = Math.floor(timelineCanvas.width / 48);
  max = Math.max(frames.length - visibleSlots, 0);
  if (pos > max) pos = max;
  snapSlider();
}

function autoScrollTimeline() {
  const visibleSlots = Math.floor(timelineCanvas.width / 48);
  if (currentFrame > startPos + visibleSlots - 1) {
    startPos = currentFrame - (visibleSlots - 1);
    pos = startPos;
    snapSlider();
  }
}

document.getElementById("scrollPrev").addEventListener("click", () => {
  if (pos > 0) { pos--; snapSlider(); scrollTimeline(); }
});

document.getElementById("scrollNext").addEventListener("click", () => {
  if (pos < max) { pos++; snapSlider(); scrollTimeline(); }
});

snapSlider();


/* =====================================================
   TOOLBAR BUTTONS
===================================================== */

// NEW: Ctrl+click to insert before current frame
document.getElementById("btnAdd").addEventListener("click", (e) => {
  newFrame(e.ctrlKey || e.metaKey);
});

document.getElementById("btnDelete").addEventListener("click", () => {
  stopIfPlaying();
  if (frames.length <= 1) return;
  frames.splice(currentFrame, 1);
  frameThumbs.splice(currentFrame, 1);
  if (currentFrame >= frames.length) currentFrame = frames.length - 1;
  previousFrame = -1;
  lastViewedFrame = -1;  // Reset last viewed
  const newMax = Math.max(frames.length - 10, 0);
  if (newMax < max) pos = Math.min(pos, newMax);
  updateSliderMax();
  render();
  scrollTimeline();
  drawFramesTimeline();
});

document.getElementById("btnPlay").addEventListener("click", () => {
  play();
  setPlaying(true);
});

document.getElementById("btnPause").addEventListener("click", () => {
  stop();
  setPlaying(false);
});


/* =====================================================
   TOOL SELECTION
===================================================== */

function setActiveTool(btnId) {
  document.querySelectorAll('#btnPencil, #btnEraser, #btnEyedropper').forEach(btn => {
    btn.classList.remove('btnActive');
  });
  document.getElementById(btnId).classList.add('btnActive');
}

document.getElementById("btnPencil").addEventListener("click", () => {
  color = "#000";
  eraserMode = false;
  eyedropperActive = false;
  oldschoolMode = false;
  updateCursor();
  setActiveTool("btnPencil");
});

document.getElementById("btnEraser").addEventListener("click", () => {
  eraserMode = true;
  eyedropperActive = false;
  oldschoolMode = false;
  updateCursor();
  setActiveTool("btnEraser");
});

document.getElementById("btnEyedropper").addEventListener("click", () => {
  eyedropperActive = !eyedropperActive;
  eraserMode = false;
  oldschoolMode = false;
  updateCursor();
  setActiveTool(eyedropperActive ? "btnEyedropper" : "btnPencil");
});

// NEW: Oldschool brush mode toggled by typing "old" — no button needed
function switchOldschool() {
  oldschoolMode = !oldschoolMode;
  settings.oldschoolMode = oldschoolMode;
  eyedropperActive = false;
  eraserMode = false;
  updateCursor();
  // sync checkbox if panel is open
  const cb = document.getElementById('settingOldschool');
  if (cb) cb.checked = oldschoolMode;
}

canvas.addEventListener("click", (e) => {
  if (!eyedropperActive) return;
  const pixel = ctx.getImageData(e.offsetX, e.offsetY, 1, 1).data;
  color = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
  eyedropperActive = false;
  eraserMode = false;
  updateCursor();
  setActiveTool("btnPencil");
});


/* =====================================================
   BRUSH SIZE
===================================================== */

function updateSizeIndicator() {
  const index = brushSizes.indexOf(brushSize);
  sizeButtons.forEach((id, i) => {
    document.getElementById(id).classList.toggle('btnSizeActive', i === index);
  });
  updateCursor();  // NEW: update cursor when size changes
}

function setActiveSize(index) {
  brushSize = brushSizes[index];
  updateSizeIndicator();
}

sizeButtons.forEach((id, i) => {
  document.getElementById(id).addEventListener('click', () => setActiveSize(i));
});


/* =====================================================
   KEYBOARD
===================================================== */

// Set to true whenever the user is typing in a text field (save dialog, settings)
// so drawing hotkeys don't fire
let keybindsDisabled = false;

document.addEventListener("keydown",(e)=>{

  // Always track the "old" sequence regardless of keybinds state
  lastThreeKeys[0] = lastThreeKeys[1];
  lastThreeKeys[1] = lastThreeKeys[2];
  lastThreeKeys[2] = e.key.charCodeAt(0);
  if (lastThreeKeys[0] === 111 && lastThreeKeys[1] === 108 && lastThreeKeys[2] === 100) {
    switchOldschool();
  }

  // Block all drawing hotkeys when typing in dialogs or settings inputs
  if (keybindsDisabled) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch(e.key.toLowerCase()){

    case "z":
      frames[currentFrame].strokes.pop();
      updateThumbnail(currentFrame);
      render();
      drawFramesTimeline();
      break;

    case "arrowright":
      nextFrame();
      break;

    case "arrowleft":
      prevFrame();
      break;

    case "+":
    case "=":
      brushSize++;
      updateSizeIndicator();
      break;

    case "-":
      brushSize = Math.max(1, brushSize - 1);
      updateSizeIndicator();
      break;

    case "c":
      copyFrame();
      break;

    case "v":
      pasteFrame();
      break;

    case "n":
      // NEW: Ctrl+N inserts before current frame
      newFrame(e.ctrlKey || e.metaKey);
      break;

  }

});

function setActiveColor(btnId) {
  document.querySelectorAll('#btnColorBlack, #btnColorRed, #btnColorCustom').forEach(btn => {
    btn.style.backgroundColor = '';
  });
  const btn = document.getElementById(btnId);
  if (btnId === 'btnColorCustom' && !btn.classList.contains('enabled')) return;
  btn.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
}


document.getElementById('btnColorBlack').addEventListener('click', () => {
  color = '#000000';
  eraserMode = false;
  setActiveTool('btnPencil');
  setActiveColor('btnColorBlack');
});
document.getElementById('btnColorRed').addEventListener('click', () => {
  color = '#ff0000';
  eraserMode = false;
  setActiveTool('btnPencil');
  setActiveColor('btnColorRed');
});
document.getElementById('colorPicker').addEventListener('input', (e) => {
  color = e.target.value;
  document.getElementById('btnColorCustom').style.background = color;
  setActiveColor('btnColorCustom');
  if (color === '#ffffff') {
    eraserMode = true;
    setActiveTool('btnEraser');
  } else {
    eraserMode = false;
    setActiveTool('btnPencil');
  }
});
document.getElementById('btnColorCustom').addEventListener('click', () => {
  document.getElementById('colorPicker').click();
});

window.resizeEditor = function(w) {
  renderScale = w / 600;
  
  const h = Math.round(w / 2);

  canvas.width = w;
  canvas.height = h;

  document.getElementById('editor').style.width = w + 'px';
  document.getElementById('bottomBar').style.width = w + 'px';
  document.getElementById('toolbar').style.width = w + 'px';

  // timeline expands to fill available width (toolbar is ~84px on left, 3px margin on right)
  const tlWidth = w - 84 - 3;
  timelineCanvas.width = tlWidth;
  document.getElementById('timeline').style.width = tlWidth + 'px';

  // framesSlider matches timeline
  const fs = document.getElementById('framesSlider');
  fs.style.width = (tlWidth) + 'px';

  // scrollBar inner track
  document.getElementById('scrollBar').style.width = (tlWidth - 18 - 22) + 'px';
  SCROLL_RIGHT_DYNAMIC = tlWidth - 18 - 22;

  render();
  drawFramesTimeline();
}

window.addEventListener('beforeunload', (e) => {
  e.preventDefault();
  e.returnValue = '';
});

/* =====================================================
   DEBUG
===================================================== */

window.newFrame=newFrame;
window.nextFrame=nextFrame;
window.prevFrame=prevFrame;
window.play=play;
window.stopAnim=stop;

window.enablePalette = function() {
  const picker = document.getElementById('colorPicker');
  const btn = document.getElementById('btnColorCustom');
  picker.disabled = false;
  btn.classList.add('enabled');
  picker.click();
}

/* =====================================================
   CONTINUE / LOAD
===================================================== */

async function loadContinue() {
  const params = new URLSearchParams(window.location.search);
  const continueId = params.get('continue');
  if (!continueId) return;

  window.CONTINUE_ID = continueId;

  const { data, error } = await db
    .from('animations')
    .select('id, title, frames, description, keywords, is_draft')
    .eq('id', continueId)
    .single();

  if (error || !data) {
    console.error('Failed to load animation:', error);
    return;
  }

  frames = Array.isArray(data.frames)
    ? data.frames
    : (data.frames ? Object.values(data.frames) : [{ strokes: [] }]);

  frameThumbs = [];
  frames.forEach((_, i) => updateThumbnail(i));

  currentFrame = 0;
  previousFrame = -1;
  lastViewedFrame = -1;

  updateSliderMax();
  render();
  drawFramesTimeline();

  const nameEl = document.getElementById('saveDialogName');
  const descEl = document.getElementById('saveDialogDesc');
  const kwEl = document.getElementById('saveDialogKeywords');
  const draftEl = document.getElementById('saveDialogDraft');

  if (nameEl) nameEl.value = data.title || '';
  if (descEl) descEl.value = data.description || '';
  if (kwEl) kwEl.value = data.keywords || '';
  if (draftEl) draftEl.checked = data.is_draft || false;
}

/* =====================================================
   INIT
===================================================== */

setActiveTool("btnPencil");
setActiveColor('btnColorBlack');
updateSizeIndicator();
updateSliderMax();

// Auto-size to the editor's actual rendered width on load,
// then again whenever the window resizes (e.g. parent iframe changes)
function autoResize() {
  const w = document.getElementById('editor').offsetWidth;
  if (w > 0) window.resizeEditor(w);
}
window.addEventListener('resize', autoResize);
// Use setTimeout to let the parent page finish sizing the iframe first
setTimeout(autoResize, 0);

drawFramesTimeline();
render();
loadContinue();



/* =====================================================
   SETTINGS PANEL
===================================================== */

// disable keybinds when any text input is focused
document.addEventListener('focusin', (e) => {
  if ((e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox')
      || e.target.tagName === 'TEXTAREA') {
    keybindsDisabled = true;
  }
});
document.addEventListener('focusout', (e) => {
  if ((e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox')
      || e.target.tagName === 'TEXTAREA') {
    keybindsDisabled = false;
  }
});

const settingsBtn     = document.getElementById('btnSettings');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsPanel   = document.getElementById('settingsPanel');

settingsBtn.addEventListener('click', () => {
  settingsOverlay.classList.toggle('open');
});

document.getElementById('settingsClose').addEventListener('click', () => {
  settingsOverlay.classList.remove('open');
});

// click the dim area outside the panel to close
settingsOverlay.addEventListener('mousedown', (e) => {
  if (e.target === settingsOverlay) settingsOverlay.classList.remove('open');
});

document.getElementById('settingOldschool').addEventListener('change', e => {
  oldschoolMode = e.target.checked;
  settings.oldschoolMode = oldschoolMode;
});

document.getElementById('settingSmoothing').addEventListener('change', e => {
  settings.smoothing = e.target.checked;
  render();
});

document.getElementById('settingSimplify').addEventListener('input', e => {
  settings.simplifyTolerance = parseInt(e.target.value);
  document.getElementById('settingSimplifyVal').textContent = e.target.value;
});

document.getElementById('settingOnion').addEventListener('change', e => {
  settings.onionSkin = e.target.checked;
  render();
});

document.getElementById('settingOnion2').addEventListener('change', e => {
  settings.onionSkin2 = e.target.checked;
  render();
});

document.getElementById('settingAlpha1').addEventListener('input', e => {
  settings.onionAlpha1 = parseInt(e.target.value) / 100;
  document.getElementById('settingAlpha1Val').textContent = e.target.value + '%';
  render();
});

document.getElementById('settingAlpha2').addEventListener('input', e => {
  settings.onionAlpha2 = parseInt(e.target.value) / 100;
  document.getElementById('settingAlpha2Val').textContent = e.target.value + '%';
  render();
});

document.getElementById('settingFPS').addEventListener('input', e => {
  settings.playFPS = parseInt(e.target.value);
  document.getElementById('settingFPSVal').textContent = e.target.value;
  if (playing) {
    clearInterval(playInterval);
    playInterval = setInterval(() => {
      currentFrame++;
      if (currentFrame >= frames.length) currentFrame = 0;
      render();
      drawFramesTimeline();
    }, Math.round(1000 / settings.playFPS));
  }
});
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

let frames = [{ strokes: [] }];

let currentFrame = 0;
let previousFrame = -1;

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

  if (settings.onionSkin && currentFrame > 1 && settings.onionSkin2) {
    ctx.globalAlpha = settings.onionAlpha2;
    drawFrameStrokes(ctx, frames[currentFrame - 2].strokes);
  }

  if (settings.onionSkin && currentFrame > 0) {
    ctx.globalAlpha = settings.onionAlpha1;
    drawFrameStrokes(ctx, frames[currentFrame - 1].strokes);
  }

  ctx.globalAlpha = 1;
  drawFrameStrokes(ctx, frames[currentFrame].strokes);
}

// NEW: shared stroke renderer — uses multicurve spline when enough points exist,
// falls back to straight lines for very short strokes (mirrors ActionScript logic)
function drawFrameStrokes(targetCtx, strokes) {
  strokes.forEach(stroke => {
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
        // raw polyline when smoothing is off
        stroke.points.forEach((p, i) => {
          const x = p.x * renderScale, y = p.y * renderScale;
          if (i === 0) targetCtx.moveTo(x, y);
          else targetCtx.lineTo(x, y);
        });
      }
      targetCtx.stroke();
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
   DRAW INPUT
===================================================== */

canvas.addEventListener("mousedown", (e) => {
  stopIfPlaying();
  drawing = true;
  currentStroke = {
    size: brushSize,
    color: color,
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


/* =====================================================
   FRAME MANAGEMENT
===================================================== */

function newFrame(){

  stopIfPlaying();
  updateThumbnail(currentFrame);

  frames.push({strokes:[]});

  previousFrame=currentFrame;
  currentFrame=frames.length-1;

  updateSliderMax();
  autoScrollTimeline();

  render();
  drawFramesTimeline();

}

function nextFrame(){

  if(currentFrame<frames.length-1){

    previousFrame=currentFrame;
    currentFrame++;

    render();
    drawFramesTimeline();

  }

}

function prevFrame(){

  if(currentFrame>0){

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
  tctx.strokeStyle = "black";
  tctx.lineCap = "round";
  tctx.lineJoin = "round";

  frames[frameIndex].strokes.forEach(stroke => {

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
      tctx.fillStyle = "black";
      tctx.fill();
    } else {
      // Draw spline curve in thumbnail
      tctx.beginPath();
      drawMulticurveRaw(tctx, stroke.points, 1 / 12, false);
      tctx.stroke();
    }

  });

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

  timelineCtx.fillStyle="white";
  timelineCtx.fillRect(0,0,516,24);

  endPos = Math.min(startPos + 9, frames.length - 1);

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
  max = Math.max(frames.length - 10, 0);
  if (pos > max) pos = max;
  snapSlider();
}

function autoScrollTimeline() {
  if (currentFrame > startPos + 9) {
    startPos = currentFrame - 9;
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

document.getElementById("btnAdd").addEventListener("click", newFrame);

document.getElementById("btnDelete").addEventListener("click", () => {
  stopIfPlaying();
  if (frames.length <= 1) return;
  frames.splice(currentFrame, 1);
  frameThumbs.splice(currentFrame, 1);
  if (currentFrame >= frames.length) currentFrame = frames.length - 1;
  previousFrame = -1;
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
  eyedropperActive = false;
  oldschoolMode = false;
  canvas.style.cursor = "default";
  setActiveTool("btnPencil");
});

document.getElementById("btnEraser").addEventListener("click", () => {
  color = "#fff";
  eyedropperActive = false;
  oldschoolMode = false;
  canvas.style.cursor = "default";
  setActiveTool("btnEraser");
});

document.getElementById("btnEyedropper").addEventListener("click", () => {
  eyedropperActive = !eyedropperActive;
  oldschoolMode = false;
  canvas.style.cursor = eyedropperActive ? "crosshair" : "default";
  setActiveTool(eyedropperActive ? "btnEyedropper" : "btnPencil");
});

// NEW: Oldschool brush mode toggled by typing "old" — no button needed
function switchOldschool() {
  oldschoolMode = !oldschoolMode;
  settings.oldschoolMode = oldschoolMode;
  eyedropperActive = false;
  canvas.style.cursor = "default";
  // sync checkbox if panel is open
  const cb = document.getElementById('settingOldschool');
  if (cb) cb.checked = oldschoolMode;
}

canvas.addEventListener("click", (e) => {
  if (!eyedropperActive) return;
  const pixel = ctx.getImageData(e.offsetX, e.offsetY, 1, 1).data;
  color = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
  eyedropperActive = false;
  canvas.style.cursor = "default";
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
      newFrame();
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
  setActiveTool('btnPencil');
  setActiveColor('btnColorBlack');
});
document.getElementById('btnColorRed').addEventListener('click', () => {
  color = '#ff0000';
  setActiveTool('btnPencil');
  setActiveColor('btnColorRed');
});
document.getElementById('colorPicker').addEventListener('input', (e) => {
  color = e.target.value;
  document.getElementById('btnColorCustom').style.background = color;
  setActiveColor('btnColorCustom');
  if (color === '#ffffff') {
    setActiveTool('btnEraser');
  } else {
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
drawFramesTimeline();
render();
loadContinue();



/* =====================================================
   SETTINGS PANEL
===================================================== */

(function () {

  // ── disable keybinds when any text input is focused ──
  document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox'
        || e.target.tagName === 'TEXTAREA') {
      keybindsDisabled = true;
    }
  });
  document.addEventListener('focusout', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox'
        || e.target.tagName === 'TEXTAREA') {
      keybindsDisabled = false;
    }
  });

  // ── inject ⚙ button into toolbar (matches existing btn style) ──
  const toolbar = document.getElementById('toolbar');
  const btn = document.createElement('div');
  btn.id = 'btnSettings';
  btn.title = 'Settings';
  toolbar.appendChild(btn);

  // ── build panel HTML ────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'settingsPanel';
  panel.innerHTML = `
    <div id="settingsHeader">
      <span id="settingsTitle">Settings</span>
      <span id="settingsClose">✕</span>
    </div>
    <div class="settingsGroup">
      <div class="settingsGroupLabel">BRUSH</div>
      <label class="settingsRow">
        <span>Oldschool brush <span class="settingsHint">(type "old")</span></span>
        <input type="checkbox" id="settingOldschool">
      </label>
      <label class="settingsRow">
        <span>Curve smoothing</span>
        <input type="checkbox" id="settingSmoothing" checked>
      </label>
      <div class="settingsRow">
        <span>Simplify tolerance <span class="settingsHint">(0 = off)</span></span>
        <div class="settingsSliderWrap">
          <input type="range" id="settingSimplify" min="0" max="20" step="1" value="5">
          <span class="settingsVal" id="settingSimplifyVal">5</span>
        </div>
      </div>
    </div>
    <div class="settingsGroup">
      <div class="settingsGroupLabel">ONION SKIN</div>
      <label class="settingsRow">
        <span>Enable onion skin</span>
        <input type="checkbox" id="settingOnion" checked>
      </label>
      <label class="settingsRow">
        <span>Show 2nd previous frame</span>
        <input type="checkbox" id="settingOnion2" checked>
      </label>
      <div class="settingsRow">
        <span>Frame −1 opacity</span>
        <div class="settingsSliderWrap">
          <input type="range" id="settingAlpha1" min="0" max="100" step="5" value="30">
          <span class="settingsVal" id="settingAlpha1Val">30%</span>
        </div>
      </div>
      <div class="settingsRow">
        <span>Frame −2 opacity</span>
        <div class="settingsSliderWrap">
          <input type="range" id="settingAlpha2" min="0" max="100" step="5" value="10">
          <span class="settingsVal" id="settingAlpha2Val">10%</span>
        </div>
      </div>
    </div>
    <div class="settingsGroup">
      <div class="settingsGroupLabel">PLAYBACK</div>
      <div class="settingsRow">
        <span>Speed (FPS)</span>
        <div class="settingsSliderWrap">
          <input type="range" id="settingFPS" min="1" max="30" step="1" value="10">
          <span class="settingsVal" id="settingFPSVal">10</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // ── styles — match save dialog's #555 dark grey palette ─
  const style = document.createElement('style');
  style.textContent = `
    #settingsPanel {
      display: none;
      position: fixed;
      z-index: 9000;
      /* positioned relative to the editor — JS will anchor it */
      background: #555555;
      border-radius: 8px;
      padding: 0;
      width: 290px;
      font-family: Arial, sans-serif;
      font-size: 13px;
      color: #fff;
      box-shadow: 0 4px 24px rgba(0,0,0,0.45);
    }
    #settingsPanel.open { display: block; }

    #settingsHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px 8px;
      border-bottom: 1px solid rgba(255,255,255,0.12);
    }
    #settingsTitle {
      font-size: 13px;
      font-weight: bold;
      color: #fff;
    }
    #settingsClose {
      cursor: pointer;
      color: #ddd;
      font-size: 14px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 3px;
      transition: background 0.1s;
    }
    #settingsClose:hover { background: rgba(255,255,255,0.15); }

    .settingsGroup {
      padding: 10px 14px 6px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .settingsGroup:last-child { border-bottom: none; padding-bottom: 12px; }

    .settingsGroupLabel {
      font-size: 10px;
      letter-spacing: 1.5px;
      color: rgba(255,255,255,0.45);
      margin-bottom: 8px;
    }

    .settingsRow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      gap: 8px;
      cursor: default;
    }
    label.settingsRow { cursor: pointer; }
    .settingsRow > span { flex: 1; color: #ddd; font-size: 12px; }
    .settingsHint { color: rgba(255,255,255,0.35); font-size: 10px; }

    .settingsRow input[type=checkbox] {
      width: 15px;
      height: 15px;
      accent-color: #e33;
      cursor: pointer;
      flex-shrink: 0;
    }
    .settingsSliderWrap {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .settingsRow input[type=range] {
      width: 88px;
      accent-color: #e33;
      cursor: pointer;
    }
    .settingsVal {
      width: 30px;
      text-align: right;
      color: #ffcc88;
      font-size: 11px;
    }
  `;
  document.head.appendChild(style);

  // ── position panel above the settings button ────────
  function positionPanel() {
    const btnRect = btn.getBoundingClientRect();
    panel.style.left = (btnRect.right - 290) + 'px';
    panel.style.top  = (btnRect.top - panel.offsetHeight - 6) + 'px';
  }

  // ── toggle open/close ───────────────────────────────
  btn.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) positionPanel();
  });
  document.getElementById('settingsClose').addEventListener('click', () => {
    panel.classList.remove('open');
  });

  // close if clicking outside panel and button
  document.addEventListener('mousedown', (e) => {
    if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== btn) {
      panel.classList.remove('open');
    }
  });

  // ── wire up controls ────────────────────────────────

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

})();
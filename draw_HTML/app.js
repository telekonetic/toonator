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

const brushSizes = [2, 4, 6, 10, 20];
const sizeButtons = ['btnSize1','btnSize2','btnSize3','btnSize4','btnSize5'];

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

  if (currentFrame > 0) {
    ctx.globalAlpha = 0.3;
    frames[currentFrame - 1].strokes.forEach(stroke => {
      ctx.beginPath();
      ctx.lineWidth = stroke.size * renderScale;
      ctx.strokeStyle = stroke.color;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      stroke.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x * renderScale, p.y * renderScale);
        else ctx.lineTo(p.x * renderScale, p.y * renderScale);
      });
      ctx.stroke();
    });
  }

  ctx.globalAlpha = 1;
  frames[currentFrame].strokes.forEach(stroke => {
    ctx.beginPath();
    ctx.lineWidth = stroke.size * renderScale;
    ctx.strokeStyle = stroke.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    stroke.points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x * renderScale, p.y * renderScale);
      else ctx.lineTo(p.x * renderScale, p.y * renderScale);
    });
    ctx.stroke();
  });
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
  currentStroke = { size: brushSize, color: color, points: [] };
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

canvas.addEventListener("mouseup",()=>{

  drawing=false;
  ctx.beginPath();

  updateThumbnail(currentFrame);
  drawFramesTimeline();

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

  },100);

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

  frames[frameIndex].strokes.forEach(stroke=>{

    tctx.beginPath();
    tctx.lineWidth=1;
    tctx.strokeStyle="black";

    stroke.points.forEach((p,i)=>{

      const x=p.x/12;
      const y=p.y/12;

      if(i===0) tctx.moveTo(x,y);
      else tctx.lineTo(x,y);

    });

    tctx.stroke();

  });

  frameThumbs[frameIndex]=thumb;

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
  canvas.style.cursor = "default";
  setActiveTool("btnPencil");
});

document.getElementById("btnEraser").addEventListener("click", () => {
  color = "#fff";
  eyedropperActive = false;
  canvas.style.cursor = "default";
  setActiveTool("btnEraser");
});

document.getElementById("btnEyedropper").addEventListener("click", () => {
  eyedropperActive = !eyedropperActive;
  canvas.style.cursor = eyedropperActive ? "crosshair" : "default";
  setActiveTool(eyedropperActive ? "btnEyedropper" : "btnPencil");
});

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

document.addEventListener("keydown",(e)=>{

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

  // Store the ID so save.js can update instead of insert
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

  // Populate frames
  frames = Array.isArray(data.frames)
    ? data.frames
    : (data.frames ? Object.values(data.frames) : [{ strokes: [] }]);

  // Rebuild thumbnails
  frameThumbs = [];
  frames.forEach((_, i) => updateThumbnail(i));

  currentFrame = 0;
  previousFrame = -1;

  updateSliderMax();
  render();
  drawFramesTimeline();

  // Pre-fill save dialog fields if they exist
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
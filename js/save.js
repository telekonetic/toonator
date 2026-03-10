/* =====================================================
   SAVE DIALOG
===================================================== */

function openSaveDialog() {
  document.getElementById('saveDialog').style.display = 'flex';
  document.getElementById('saveDialogName').focus();
}

function closeSaveDialog() {
  document.getElementById('saveDialog').style.display = 'none';
  document.getElementById('saveStatus').textContent = '';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('saveDialogName').maxLength = 100;
  document.getElementById('saveDialogKeywords').maxLength = 200;
  document.getElementById('saveDialogDesc').maxLength = 1000;

  document.getElementById('btnSave').addEventListener('click', openSaveDialog);
  document.getElementById('saveCancel').addEventListener('click', closeSaveDialog);
  document.getElementById('saveFinal').addEventListener('click', saveAnimation);
});


/* =====================================================
   COMPACT STROKE SERIALIZATION
   Each stroke is serialized as a 3-element array:
     [
       "color|size|eraser|oldschool",   // compact header string
       [[x,y], [x,y], ...],             // points as flat pairs
       [[x,y], ...]  | null             // polygon pairs (oldschool) or null
     ]

   Examples:
     black pencil, size 2:   ["#000000|2|0|0", [[10,20],[15,25]], null]
     red eraser, size 6:     ["#ff0000|6|1|0", [[5,5]], null]
     oldschool brush, size 4:["#000000|4|0|1", [[...]], [[...]]]

   Saves ~40–60% payload vs full stroke objects.
   toon-player.js deserializes back to stroke objects on load.
===================================================== */

function serializeStroke(stroke) {
  const color     = stroke.color     || '#000000';
  const size      = stroke.size      || 2;
  const eraser    = stroke.eraser    ? '1' : '0';
  const oldschool = stroke.oldschool ? '1' : '0';

  const header = `${color}|${size}|${eraser}|${oldschool}`;

  // Points as flat [x, y] pairs — round to 2dp to trim floats
  const points = (stroke.points || []).map(p => [
    Math.round(p.x * 100) / 100,
    Math.round(p.y * 100) / 100
  ]);

  // Polygon (oldschool only) — same rounding
  const polygon = (stroke.oldschool && stroke.polygon && stroke.polygon.length > 0)
    ? stroke.polygon.map(p => [
        Math.round(p.x * 100) / 100,
        Math.round(p.y * 100) / 100
      ])
    : null;

  return [header, points, polygon];
}

function serializeFrames(frames) {
  return frames.map(frame => ({
    strokes: (frame.strokes || []).map(serializeStroke)
  }));
}


/* =====================================================
   RENDER FRAME TO CANVAS AT SIZE
===================================================== */

function renderFrameToCanvas(frame, width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const cx = c.getContext('2d');
  cx.fillStyle = '#ffffff';
  cx.fillRect(0, 0, width, height);
  const scaleX = width / 600;

  frame.strokes.forEach(stroke => {
    if (!stroke.points || stroke.points.length === 0) return;

    // Eraser
    cx.globalCompositeOperation = stroke.eraser ? 'destination-out' : 'source-over';

    // Oldschool brush — pre-built polygon
    if (stroke.oldschool && stroke.polygon && stroke.polygon.length > 0) {
      cx.beginPath();
      stroke.polygon.forEach((p, i) => {
        const x = p.x * scaleX, y = p.y * scaleX;
        i === 0 ? cx.moveTo(x, y) : cx.lineTo(x, y);
      });
      cx.closePath();
      cx.fillStyle = stroke.eraser ? 'rgba(0,0,0,1)' : stroke.color;
      cx.fill();
      cx.globalCompositeOperation = 'source-over';
      return;
    }

    if (stroke.points.length < 2) {
      cx.globalCompositeOperation = 'source-over';
      return;
    }

    cx.beginPath();
    cx.strokeStyle = stroke.eraser ? 'rgba(0,0,0,1)' : stroke.color;
    cx.lineWidth = Math.max(1, stroke.size * scaleX);
    cx.lineCap = 'round';
    cx.lineJoin = 'round';

    if (settings.smoothing && stroke.points.length > 2) {
      drawMulticurveRaw(cx, stroke.points, scaleX, false);
    } else {
      stroke.points.forEach((p, i) => {
        const x = p.x * scaleX;
        const y = p.y * scaleX;
        if (i === 0) cx.moveTo(x, y);
        else cx.lineTo(x, y);
      });
    }
    cx.stroke();
    cx.globalCompositeOperation = 'source-over';
  });

  return c;
}


/* =====================================================
   GIF GENERATION
===================================================== */

function generateGif(width, height) {
  return new Promise((resolve, reject) => {
    const frameDelay = Math.round(1000 / (settings.playFPS || 10));

    const gif = new GIF({
      workers: 2,
      quality: 20,
      width: width,
      height: height,
      workerScript: '/js/gif.worker.js',
      dither: false,
      background: '#ffffff',
      transparent: null
    });

    frames.forEach(frame => {
      const c = renderFrameToCanvas(frame, width, height);
      gif.addFrame(c, { delay: frameDelay });
    });

    gif.on('finished', blob => resolve(blob));
    gif.on('error', err => reject(err));
    gif.render();
  });
}


/* =====================================================
   SAVE ANIMATION
   Serializes frames in compact stroke format, then
   persists to Supabase.
===================================================== */

async function saveAnimation() {
  const title       = (document.getElementById('saveDialogName').value.trim() || 'Untitled').slice(0, 100);
  const keywords    = document.getElementById('saveDialogKeywords').value.trim().slice(0, 200);
  const description = document.getElementById('saveDialogDesc').value.trim().slice(0, 1000);
  const isDraft     = document.getElementById('saveDialogDraft').checked;

  const status = document.getElementById('saveStatus');
  const btn    = document.getElementById('saveFinal');

  btn.disabled = true;
  status.textContent = 'Saving...';

  try {
    // 1. Get current user
    const { data: { user }, error: userError } = await db.auth.getUser();
    if (userError || !user) throw new Error('You must be logged in to save.');

    // 2. Compact-serialize all frames
    const compactFrames = serializeFrames(frames);

    // 3. Snapshot settings (document-level only — per-stroke settings live in the strokes)
    const savedSettings = {
      playFPS:           settings.playFPS,
      smoothing:         settings.smoothing,
      simplifyTolerance: settings.simplifyTolerance,
    };

    // 4. Build insert payload
    const insertData = {
      user_id:     user.id,
      title,
      keywords,
      description,
      is_draft:    isDraft,
      frames:      compactFrames,
      settings:    savedSettings,
    };

    if (window.CONTINUE_ID && /^[a-zA-Z0-9_-]{1,100}$/.test(window.CONTINUE_ID)) {
      insertData.continued_from = window.CONTINUE_ID;
    }

    const { data: anim, error: insertError } = await db
      .from('animations')
      .insert(insertData)
      .select('id')
      .single();

    if (insertError) throw insertError;

    const animId = anim.id;

    status.textContent = 'Generating previews...';

    // 5. Generate GIFs at two sizes (use original in-memory frames, not compacted)
    const [blob200, blob40] = await Promise.all([
      generateGif(200, 100),
      generateGif(40,  20)
    ]);

    // 6. Upload GIFs to Supabase Storage
    const upload = async (blob, path) => {
      const { error } = await db.storage
        .from('previews')
        .upload(path, blob, { contentType: 'image/gif', upsert: true });
      if (error) throw error;
    };

    status.textContent = 'Uploading previews...';

    await Promise.all([
      upload(blob200, `${animId}_100.gif`),
      upload(blob40,  `${animId}_40.gif`)
    ]);

    status.textContent = 'Saved!';

    setTimeout(() => {
      closeSaveDialog();
      window.location.href = `/toon/${animId}`;
    }, 800);

  } catch (err) {
    console.error(err);
    status.textContent = 'Error: ' + (err.message || 'Something went wrong.');
    btn.disabled = false;
  }
}
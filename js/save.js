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

    if (stroke.oldschool && stroke.polygon && stroke.polygon.length > 0) {
      cx.beginPath();
      stroke.polygon.forEach((p, i) => {
        const x = p.x * scaleX, y = p.y * scaleX;
        i === 0 ? cx.moveTo(x, y) : cx.lineTo(x, y);
      });
      cx.closePath();
      cx.fillStyle = stroke.color;
      cx.fill();
      return;
    }

    if (stroke.points.length < 2) return;

    cx.beginPath();
    cx.strokeStyle = stroke.color;
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
    console.log('[save] user ok:', user.id);

    // 2. Snapshot settings
    const savedSettings = {
      playFPS:           settings.playFPS,
      smoothing:         settings.smoothing,
      simplifyTolerance: settings.simplifyTolerance,
    };

    // 3. Build insert payload
    const insertData = {
      user_id:     user.id,
      title,
      keywords,
      description,
      is_draft:    isDraft,
      frames:      frames,
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
    console.log('[save] animation inserted:', animId);

    status.textContent = 'Generating previews...';

    // 4. Generate GIFs at two sizes
    const [blob200, blob40] = await Promise.all([
      generateGif(200, 100),
      generateGif(40,  20)
    ]);
    console.log('[save] GIFs generated, sizes:', blob200.size, blob40.size);

    // 5. Upload GIFs to Supabase Storage
    const upload = async (blob, path) => {
      console.log('[save] uploading:', path, 'size:', blob.size);
      const result = await db.storage
        .from('previews')
        .upload(path, blob, { contentType: 'image/gif', upsert: true });
      console.log('[save] upload result for', path, ':', JSON.stringify(result));
      if (result.error) throw result.error;
    };

    status.textContent = 'Uploading previews...';

    await Promise.all([
      upload(blob200, `${animId}_100.gif`),
      upload(blob40,  `${animId}_40.gif`)
    ]);

    console.log('[save] all done!');
    status.textContent = 'Saved!';

    setTimeout(() => {
      closeSaveDialog();
      window.location.href = `/toon/${animId}`;
    }, 800);

  } catch (err) {
    console.error('[save] ERROR:', err);
    status.textContent = 'Error: ' + (err.message || 'Something went wrong.');
    btn.disabled = false;
  }
}
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
  const scaleY = height / 300;
  frame.strokes.forEach(stroke => {
    if (!stroke.points || stroke.points.length < 2) return;
    cx.beginPath();
    cx.strokeStyle = stroke.color;
    cx.lineWidth = Math.max(1, stroke.size * scaleX);
    cx.lineCap = 'round';
    cx.lineJoin = 'round';
    stroke.points.forEach((p, i) => {
      const x = p.x * scaleX;
      const y = p.y * scaleY;
      if (i === 0) cx.moveTo(x, y);
      else cx.lineTo(x, y);
    });
    cx.stroke();
  });
  return c;
}

/* =====================================================
   GIF GENERATION
===================================================== */

function generateGif(width, height) {
  return new Promise((resolve, reject) => {
    const gif = new GIF({
      workers: 2,
      quality: 20,        // higher = lower quality but smaller (default is 10)
      width: width,
      height: height,
      workerScript: '/js/gif.worker.js',
      dither: false,      // disabling dither reduces size
      background: '#ffffff',
      transparent: null
    });

    frames.forEach(frame => {
      const c = renderFrameToCanvas(frame, width, height);
      gif.addFrame(c, { delay: 100 }); // 10fps = 100ms per frame
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
  const title = document.getElementById('saveDialogName').value.trim() || 'Untitled';
  const keywords = document.getElementById('saveDialogKeywords').value.trim();
  const description = document.getElementById('saveDialogDesc').value.trim();
  const isDraft = document.getElementById('saveDialogDraft').checked;

  const status = document.getElementById('saveStatus');
  const btn = document.getElementById('saveFinal');

  btn.disabled = true;
  status.textContent = 'Saving...';

  try {
    // 1. Get current user
    const { data: { user }, error: userError } = await db.auth.getUser();
    if (userError || !user) throw new Error('You must be logged in to save.');

    // 2. Insert animation record to get the ID first
    const { data: anim, error: insertError } = await db
      .from('animations')
      .insert({
        user_id: user.id,
        title,
        keywords,
        description,
        is_draft: isDraft,
        frames: frames
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    const animId = anim.id;

    status.textContent = 'Generating previews...';

    // 3. Generate GIFs
    const [blob200, blob40] = await Promise.all([
      generateGif(200, 100),
      generateGif(40, 20)
    ]);

    // 4. Upload GIFs to Supabase Storage
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
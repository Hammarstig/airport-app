const MAX_SIDE = 1600;
const THUMB_SIDE = 240;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Kunde inte läsa bilden ${file.name}.`));
    };
    img.src = url;
  });
}

/** Skalar ner till max 1600 px på längsta sidan och kodar om som JPEG. */
export async function downscaleToJpeg(file, quality = 0.85, maxSide = MAX_SIDE) {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return await drawToJpeg(bmp, bmp.width, bmp.height, quality, maxSide, () => bmp.close && bmp.close());
    } catch {
      /* fall tillbaka på <img> */
    }
  }
  const { img, url } = await loadImage(file);
  try {
    return await drawToJpeg(img, img.naturalWidth, img.naturalHeight, quality, maxSide);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawToJpeg(source, w, h, quality, maxSide, cleanup) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(source, 0, 0, cw, ch);
  cleanup && cleanup();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, width: cw, height: ch }) : reject(new Error('Kunde inte koda bilden.'))),
      'image/jpeg',
      quality
    )
  );
}

/** Liten förhandsbild som data-URL (blob:-URL:er stoppas av serverns CSP). */
export async function makeThumbnail(file) {
  const { blob } = await downscaleToJpeg(file, 0.7, THUMB_SIDE);
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Kunde inte läsa bilden.'));
    r.readAsDataURL(blob);
  });
}

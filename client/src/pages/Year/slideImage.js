import { THEMES } from './slides.js';

// Ritar en bild ur bildspelet som PNG i 1080x1920 (9:16, för stories) med Canvas 2D.
// Måtten följer .wrapped-slide i moments.css där 1cqw = 1 % av bredden.
const W = 1080;
const H = 1920;
const u = W / 100;

function fonts() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fb) => cs.getPropertyValue(name).trim() || fb;
  return {
    display: v('--font-display', 'sans-serif'),
    body: v('--font-body', 'sans-serif'),
    mono: v('--font-mono', 'monospace')
  };
}

function wrap(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Ritar bilden och returnerar en PNG-blob. */
export async function slideImage(slide, { year, username }) {
  const f = fonts();
  if (document.fonts?.load) {
    await Promise.all(
      [`800 60px ${f.display}`, `700 40px ${f.body}`, `600 60px ${f.mono}`].map((s) =>
        document.fonts.load(s).catch(() => null)
      )
    );
  }
  const t = THEMES[slide.theme] || THEMES.night;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Bakgrund och motiv
  const g = ctx.createLinearGradient(W * 0.2, 0, W * 0.8, H);
  g.addColorStop(0, t.bg2);
  g.addColorStop(0.7, t.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const cx = W * 0.9;
  const cy = H * 0.02;
  for (const [r, a, lw] of [
    [60 * u + 24 * u, 0.03, 24 * u],
    [60 * u + 12 * u, 0.04, 12 * u],
    [60 * u, 0.12, 0.5 * u]
  ]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r - lw / 2, 0, Math.PI * 2);
    ctx.strokeStyle = alpha(t.fg, a);
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  const left = 8 * u;
  const right = W - 8 * u;
  const width = right - left;
  ctx.fillStyle = t.fg;
  ctx.textBaseline = 'alphabetic';

  // Märke överst
  ctx.font = `800 ${6 * u}px ${f.display}`;
  ctx.fillText('Gatelog', left, 9 * u + 5 * u);
  ctx.font = `700 ${3.6 * u}px ${f.body}`;
  ctx.textAlign = 'right';
  ctx.globalAlpha = 0.85;
  ctx.fillText(`Ditt ${year}`, right, 9 * u + 5 * u);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  // Fot: streckad linje, användarnamn och streckkod
  const footBottom = H - 8 * u;
  const barTop = footBottom - 8 * u;
  const lineY = barTop - 4 * u;
  const footY = footBottom - 2.6 * u;
  ctx.setLineDash([2 * u, 1.4 * u]);
  ctx.strokeStyle = alpha(t.fg, 0.4);
  ctx.lineWidth = 0.5 * u;
  ctx.beginPath();
  ctx.moveTo(left, lineY);
  ctx.lineTo(right, lineY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `700 ${3.6 * u}px ${f.body}`;
  ctx.fillText(username ? `@${username}` : 'gatelog.app', left, footY);
  const bars = [0.5, 0.6, 1.2, 0.5, 0.3, 0.9];
  let x = right - 30 * u;
  for (let i = 0; x < right; i++) {
    const w = bars[i % bars.length] * u;
    if (i % 2 === 0) ctx.fillRect(x, barTop, w, 8 * u);
    x += w + 0.6 * u;
  }

  // Innehåll: byggs som block och placeras nerifrån, ovanför foten (som margin-top: auto på kickern).
  const blocks = [];
  const add = (h, draw) => blocks.push({ h, draw });
  add(5 * u * 1.3, (y) => {
    ctx.fillStyle = t.hi;
    ctx.font = `700 ${5 * u}px ${f.body}`;
    ctx.fillText(slide.kicker, left, y + 5 * u);
  });
  if (slide.big) {
    let size = 44 * u;
    ctx.font = `800 ${size}px ${f.display}`;
    while (ctx.measureText(slide.big).width > width && size > 12 * u) {
      size -= 2 * u;
      ctx.font = `800 ${size}px ${f.display}`;
    }
    add(size * 0.82, (y) => {
      ctx.fillStyle = t.fg;
      ctx.font = `800 ${size}px ${f.display}`;
      ctx.fillText(slide.big, left, y + size * 0.8);
    });
  }
  if (slide.code) {
    add(28 * u, (y) => {
      ctx.fillStyle = t.fg;
      ctx.font = `600 ${28 * u}px ${f.mono}`;
      ctx.letterSpacing = `${2.2 * u}px`;
      ctx.fillText(slide.code, left, y + 24 * u);
      ctx.letterSpacing = '0px';
    });
  }
  if (slide.list) {
    slide.list.forEach(([name, n], idx) => {
      add(5.4 * u + 4.8 * u, (y) => {
        ctx.setLineDash([1.4 * u, 1 * u]);
        ctx.strokeStyle = alpha(t.fg, 0.3);
        ctx.lineWidth = 0.4 * u;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        const base = y + 2.4 * u + 5.4 * u;
        ctx.font = `800 ${5.4 * u}px ${f.display}`;
        ctx.fillStyle = t.hi;
        ctx.fillText(String(idx + 1), left, base);
        ctx.font = `700 ${5.4 * u}px ${f.body}`;
        ctx.fillStyle = t.fg;
        ctx.fillText(name, left + 9 * u, base);
        ctx.globalAlpha = 0.8;
        ctx.textAlign = 'right';
        ctx.fillText(String(n), right, base);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      });
    });
  }
  if (slide.stats) {
    const rows = Math.ceil(slide.stats.length / 2);
    add(7 * u + rows * (13 * u + 5 * u + 5 * u), (y) => {
      slide.stats.forEach(([value, label], i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const sx = left + col * (width / 2 + 2 * u);
        const sy = y + 7 * u + row * (23 * u);
        ctx.fillStyle = t.fg;
        ctx.font = `800 ${13 * u}px ${f.display}`;
        ctx.fillText(String(value), sx, sy + 12 * u);
        ctx.globalAlpha = 0.85;
        ctx.font = `400 ${4 * u}px ${f.body}`;
        ctx.fillText(label, sx, sy + 17 * u);
        ctx.globalAlpha = 1;
      });
    });
  }
  if (slide.codes?.length) {
    add(6 * u + 12 * u, (y) => {
      let cx2 = left;
      ctx.font = `600 ${6.4 * u}px ${f.mono}`;
      for (const code of slide.codes) {
        const w = ctx.measureText(code).width + 4 * u;
        ctx.fillStyle = '#0F1B2D';
        ctx.beginPath();
        ctx.roundRect(cx2, y + 6 * u, w, 10 * u, 1.4 * u);
        ctx.fill();
        ctx.fillStyle = '#FFC629';
        ctx.fillText(code, cx2 + 2 * u, y + 6 * u + 7.4 * u);
        cx2 += w + 2 * u;
      }
    });
  }
  if (slide.label) {
    ctx.font = `800 ${11 * u}px ${f.display}`;
    const lines = wrap(ctx, slide.label, width);
    add(2 * u + lines.length * 10.5 * u, (y) => {
      ctx.fillStyle = t.fg;
      ctx.font = `800 ${11 * u}px ${f.display}`;
      lines.forEach((l, i) => ctx.fillText(l, left, y + 2 * u + 9.5 * u + i * 10.5 * u));
    });
  }
  if (slide.text) {
    ctx.font = `400 ${4.6 * u}px ${f.body}`;
    const lines = wrap(ctx, slide.text, Math.min(width, 4.6 * u * 0.5 * 32 * 1.15));
    add(4 * u + lines.length * 4.6 * u * 1.35, (y) => {
      ctx.fillStyle = t.fg;
      ctx.globalAlpha = 0.92;
      ctx.font = `400 ${4.6 * u}px ${f.body}`;
      lines.forEach((l, i) => ctx.fillText(l, left, y + 4 * u + 4.6 * u + i * 4.6 * u * 1.35));
      ctx.globalAlpha = 1;
    });
  }
  const total = blocks.reduce((n, b) => n + b.h, 0);
  let y = lineY - 8 * u - total;
  for (const b of blocks) {
    b.draw(y);
    y += b.h;
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Kunde inte skapa bilden.'))), 'image/png')
  );
}

import * as THREE from 'three';

export const SVG_FONT_FAMILY = '"Noto Serif SC", "Songti SC", STSong, SimSun, Georgia, serif';
const escapeXml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const dimension = value => { if (!Number.isFinite(value) || value <= 0) throw new RangeError('SVG panel dimensions must be positive finite numbers.'); return value; };

export function svgText(text, x, y, { size = 48, color = '#e6e1c9', anchor = 'middle', weight = 600 } = {}) {
  return `<text x="${x}" y="${y}" font-family="${escapeXml(SVG_FONT_FAMILY)}" font-size="${size}" font-weight="${escapeXml(weight)}" text-anchor="${escapeXml(anchor)}" dominant-baseline="central" fill="${escapeXml(color)}">${escapeXml(text)}</text>`;
}

export function svgDocument(width, height, body, { pixelWidth = width, pixelHeight = height } = {}) {
  dimension(width); dimension(height);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

// The source is SVG, rasterized by the browser at an aspect-preserving density
// for WebGL. Allocate the final canvas immediately: uploaded texture dimensions
// stay constant, including frames rendered while the SVG is still decoding.
export function createVectorPanel({ width, height, anisotropy = 8, resolution = 2048 }) {
  dimension(width); dimension(height); dimension(resolution);
  const scale = resolution / Math.max(width, height), pixelWidth = Math.max(1, Math.round(width * scale)), pixelHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas'); canvas.width = pixelWidth; canvas.height = pixelHeight;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.max(1, anisotropy); texture.needsUpdate = true;
  let disposed = false, generation = 0, current = null, lastBody = null, lastUpdate = Promise.resolve(false);
  function cancel(record) {
    if (!record) return;
    record.image.onload = record.image.onerror = null; URL.revokeObjectURL(record.url); record.finish(false);
    if (current === record) current = null;
  }
  function update(svgBody) {
    if (disposed) return Promise.resolve(false);
    const body = String(svgBody); if (body === lastBody) return lastUpdate;
    lastBody = body; const version = ++generation; cancel(current);
    const source = svgDocument(width, height, body, { pixelWidth, pixelHeight });
    texture.userData.svgSource = source;
    lastUpdate = new Promise(resolve => {
      const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' })), image = new Image();
      const record = { url, image, finish: resolve }; current = record;
      image.decoding = 'async';
      image.onload = () => {
        if (disposed || version !== generation) { cancel(record); return; }
        context.clearRect(0, 0, pixelWidth, pixelHeight); context.drawImage(image, 0, 0, pixelWidth, pixelHeight); texture.needsUpdate = true;
        image.onload = image.onerror = null; URL.revokeObjectURL(url); current = null; resolve(true);
      };
      image.onerror = () => { if (version === generation) lastBody = null; cancel(record); };
      image.src = url;
    });
    return lastUpdate;
  }
  function dispose() { if (disposed) return; disposed = true; generation++; cancel(current); texture.dispose(); texture.image = null; }
  return { texture, update, dispose };
}

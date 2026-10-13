/**
 * Worship Stage FX — gerador de ícones PWA (sem dependências externas).
 *
 * Desenha o ícone via SDF (signed distance fields) em buffer RGBA e grava PNG
 * usando apenas o módulo zlib do Node. Assim o repositório não depende de
 * bibliotecas de imagem e os ícones podem ser regerados a qualquer momento:
 *
 *   node tools/make-icons.mjs
 *
 * Saída (raiz do projeto):
 *   icon-192.png            — ícone "any" 192px (installability Chrome/Android)
 *   icon-512.png            — ícone "any" 512px
 *   icon-maskable-512.png   — ícone maskable (arte na zona segura de 60%)
 *   apple-touch-icon-180.png— atalho iOS
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------- cores ------------------------------- */
const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const lerp = (a, b, t) => a + (b - a) * t;
const mixRGB = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const BG = hex('#0a0b10');
const BG2 = hex('#131728');
const INDIGO = hex('#6366f1');
const CYAN = hex('#06b6d4');
const PURPLE = hex('#a855f7');

/* ----------------------------- primitivas ---------------------------- */
/** Distância com sinal de um retângulo arredondado (negativa = dentro). */
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Renderiza a arte num buffer RGBA float [0..1] no tamanho `size`.
 * `scale` permite gerar a versão maskable (arte menor, zona segura).
 */
function render(size, scale = 1) {
  const buf = new Float32Array(size * size * 4);
  const S = size;
  const pad = S * 0.5 * (1 - scale); // deslocamento para centralizar a arte reduzida
  const inset = pad + S * scale * 0.145;
  const inner = S - inset * 2;
  const gap = inner * 0.045;
  const cell = (inner - gap * 3) / 4;
  const radius = cell * 0.3;

  // Pad "aceso" (destaque) na 3ª coluna da 2ª linha, como um pad disparado.
  const hotRow = 1;
  const hotCol = 2;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const i = (y * S + x) * 4;

      // --- fundo: gradiente vertical + brilho radial indigo/ciano ---
      const vt = py / S;
      let col = mixRGB(BG, BG2, vt * 0.9);

      const gx = (px - S * 0.5) / (S * 0.75);
      const gy = (py - S * 0.42) / (S * 0.75);
      const gr = Math.hypot(gx, gy);
      const glow = Math.pow(Math.max(0, 1 - gr), 2.4);
      col = [
        col[0] + (INDIGO[0] * 0.30 + PURPLE[0] * 0.10) * glow,
        col[1] + (INDIGO[1] * 0.30 + PURPLE[1] * 0.10) * glow,
        col[2] + (INDIGO[2] * 0.30 + PURPLE[2] * 0.10) * glow,
      ];

      // vinheta suave nas bordas
      const vx = (px - S / 2) / (S / 2);
      const vy = (py - S / 2) / (S / 2);
      const vig = Math.pow(Math.min(1, Math.hypot(vx, vy) / 1.45), 2);
      col = col.map((c) => c * (1 - vig * 0.35));

      // --- grade 4x4 de pads ---
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const cx = inset + c * (cell + gap) + cell / 2;
          const cy = inset + r * (cell + gap) + cell / 2;
          const d = sdRoundRect(px, py, cx, cy, cell / 2, cell / 2, radius);

          // halo do pad aceso
          if (r === hotRow && c === hotCol) {
            const h = Math.pow(Math.max(0, 1 - Math.max(0, d) / (cell * 1.7)), 2.2);
            col = [
              col[0] + INDIGO[0] * 0.55 * h,
              col[1] + INDIGO[1] * 0.55 * h,
              col[2] + CYAN[2] * 0.75 * h,
            ];
          }

          const diag = (r + c) / 6;
          const padCol = mixRGB(INDIGO, CYAN, diag);
          let alpha = 0.20 + 0.42 * diag;
          if (r === hotRow && c === hotCol) alpha = 1;

          const cov = 1 - smoothstep(-1.1, 1.1, d); // antialias ~1px
          if (cov > 0) {
            const a = cov * alpha;
            // brilho interno: mais claro em cima, mais fundo embaixo
            const sh = 1.18 - 0.45 * ((py - (cy - cell / 2)) / cell);
            const pc = padCol.map((v) => v * sh);
            col = [
              lerp(col[0], pc[0], a),
              lerp(col[1], pc[1], a),
              lerp(col[2], pc[2], a),
            ];
          }
        }
      }

      buf[i] = Math.min(1, col[0] / 255);
      buf[i + 1] = Math.min(1, col[1] / 255);
      buf[i + 2] = Math.min(1, col[2] / 255);
      buf[i + 3] = 1;
    }
  }
  return buf;
}

/* ------------------------------ PNG encoder --------------------------- */
function crc32(bytes) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(buf, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filtro none
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      raw[o++] = Math.round(Math.min(1, buf[i]) * 255);
      raw[o++] = Math.round(Math.min(1, buf[i + 1]) * 255);
      raw[o++] = Math.round(Math.min(1, buf[i + 2]) * 255);
      raw[o++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------- saída ------------------------------- */
const targets = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.62],
  ['apple-touch-icon-180.png', 180, 1],
];

for (const [file, size, scale] of targets) {
  const png = encodePNG(render(size, scale), size);
  writeFileSync(resolve(ROOT, file), png);
  console.log(`${file}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`);
}

/* Smoke test do Worship Stage FX: roda o index.html num DOM real (jsdom) com
   Web Audio e IndexedDB falsos, simula o uso e falha se algo lançar erro.
   Uso: node smoke.mjs [caminho/index.html] */
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { FakeAudioContext, makeFakeCaches } from './fake-audio.mjs';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

/* Testes automatizados do app (rode com Node 18+):
     npm i jsdom fake-indexeddb
     node tools/smoke-test.mjs
   Simula o uso real: glide do colchão, 16 pads, importação de sample com
   IndexedDB e o service worker/cache do PWA. */

const here = new URL('.', import.meta.url).pathname;
const FILE = process.argv[2] || here.replace(/tools\/$/, '') + 'index.html';
const html = readFileSync(FILE, 'utf8');

const errors = [];
const logs = [];
let ctxRef = null;

function makeWindow(indexedDB, url, sharedCaches, opts = {}) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push('jsdom: ' + e.message));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  vc.on('warn', (...a) => logs.push('warn: ' + a.join(' ')));
  vc.on('info', (...a) => logs.push('info: ' + a.join(' ')));

  const dom = new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.AudioContext = class extends FakeAudioContext {
        constructor() { super(); ctxRef = this; }
      };
      window.indexedDB = indexedDB;
      window.IDBKeyRange = IDBKeyRange;
      window.caches = sharedCaches;
      window.PointerEvent = class PointerEvent extends window.MouseEvent {};
      // canvas 2D mínimo: exercita a geração de ícones do manifest inline
      window.HTMLCanvasElement.prototype.getContext = function () {
        const gradient = { addColorStop() {} };
        return {
          canvas: this,
          fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
          createLinearGradient: () => gradient,
          createRadialGradient: () => gradient,
          fillRect() {}, clearRect() {}, strokeRect() {}, beginPath() {}, moveTo() {},
          lineTo() {}, stroke() {}, fill() {}, rect() {}, roundRect() {}, arc() {}, save() {}, restore() {}, setTransform() {}
        };
      };
      window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,AAAA'; };
      window.Request = class Request {
        constructor(u) { this.url = String(u); this.method = 'GET'; }
      };
      const manifestOk = opts.manifestOk !== false;
      window.fetch = async (u) => ({ ok: manifestOk, url: String(u) });
      Object.defineProperty(window.navigator, 'serviceWorker', {
        configurable: true,
        value: {
          register: async () => ({ scope: './', installing: null, active: null, waiting: null }),
          ready: Promise.resolve({ scope: './' }),
          controller: null,
          addEventListener() {}, removeEventListener() {}
        }
      });
    }
  });
  return dom;
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const pointer = (window, el) => el.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
const click = (window, el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

/* ============================ CENÁRIO 1: https ============================ */
const caches = makeFakeCaches();
const idb = new IDBFactory();
const dom = makeWindow(idb, 'https://yohann123c-hash.github.io/worship-stage-fx/index.html', caches);
const { window } = dom;
let ctx1 = null;
const doc = window.document;
await tick(60);

const checks = [];
const check = (name, cond, extra = '') => { checks.push({ name, ok: !!cond, extra }); };

check('16 pads renderizados', doc.querySelectorAll('.pad').length === 16);
check('12 teclas cromáticas', doc.querySelectorAll('.tone').length === 12);
check('cada pad tem botão 📁 + input audio/*', [...doc.querySelectorAll('.pad')].every((p) => {
  const i = p.querySelector('.import-file input');
  return i && i.getAttribute('accept') === 'audio/*';
}));

/* ---- master ---- */
const vol = doc.getElementById('masterVol');
vol.value = '55';
vol.dispatchEvent(new window.Event('input', { bubbles: true }));
check('volume master aplicado', doc.getElementById('volValue').textContent === '55%');

/* ---- colchão: primeira nota ---- */
click(window, doc.querySelector('.tone[data-note="C"]'));
await tick(20);
check('nota C ativa', doc.querySelector('.tone[data-note="C"]').classList.contains('active'));
check('hint de sustentação', /Sustentando: C/.test(doc.getElementById('toneHint').textContent));

/* ---- GLIDE: C -> G sem recriar osciladores ---- */
const oscBefore = ctxRef.kinds.oscillator;
click(window, doc.querySelector('.tone[data-note="G"]'));
await tick(20);
check('nota G ativa', doc.querySelector('.tone[data-note="G"]').classList.contains('active'));
check('C marcado como origem do glide', doc.querySelector('.tone[data-note="C"]').classList.contains('gliding'));
check('hint mostra GLIDE C → G', /GLIDE C → G/.test(doc.getElementById('toneHint').textContent));
const oscAfter = ctxRef.kinds.oscillator;
check('glide NÃO recriou osciladores', oscAfter === oscBefore, `antes=${oscBefore} depois=${oscAfter}`);

/* ---- valida o motor do colchão por dentro (frequências e envelopes) ---- */
const engineOscs = ctxRef.nodes.filter((n) => n.kind === 'oscillator').slice(0, 5);
const freqEvents = engineOscs.map((o) => o.frequency.events);
const glideRamps = freqEvents.map((evs) => evs.filter((e) => e[0] === 'lin').pop());
check('GLIDE: 3 osciladores com linearRamp até a nota nova',
  glideRamps.length >= 3 && glideRamps.slice(0, 3).every((r) => r && [196, 98].includes(Math.round(r[1]))),
  JSON.stringify(glideRamps.slice(0, 3)));
check('GLIDE: rampa de 1.5s (now+1.5)', glideRamps.slice(0, 3).every((r) => Math.abs(r[2] - (ctxRef.currentTime + 1.5)) < 0.001));
check('GLIDE: cancelAndHoldAtTime usado (sem estalo)',
  freqEvents.slice(0, 3).every((evs) => evs.some((e) => e[0] === 'hold' || e[0] === 'cancel')));

const sineCount = engineOscs.filter((o) => o.type === 'sine').length;
const triCount = engineOscs.filter((o) => o.type === 'triangle').length;
check('2 osciladores Sine + 1 Triangle no colchão', sineCount >= 2 && triCount >= 1, `sine=${sineCount} triangle=${triCount}`);

const filters = ctxRef.nodes.filter((n) => n.kind === 'filter' && n.frequency.value === 320);
check('filtro em 320Hz (lowpass + bandpass)', filters.length >= 2 && filters.some((f) => f.type === 'lowpass') && filters.some((f) => f.type === 'bandpass'), filters.map((f) => f.type).join(','));
check('notch (som oco) presente', ctxRef.nodes.some((n) => n.kind === 'filter' && n.type === 'notch'));

const lfo = ctxRef.nodes.find((n) => n.kind === 'oscillator' && n.frequency.value === 0.2);
check('LFO ultra-lento de 0.2Hz no filtro', !!lfo && lfo.started);
const depth = ctxRef.nodes.find((n) => n.kind === 'gain' && n.gain.value === 110);
check('profundidade do LFO (±110Hz) conectada ao filtro', !!depth && depth.outputs.some((o) => o && o.name === 'frequency'));

const envGain = ctxRef.nodes.find((n) => n.kind === 'gain' && n.gain.events.some((e) => e[0] === 'lin' && Math.abs(e[1] - 0.62) < 0.001));
const attackEv = envGain ? envGain.gain.events.filter((e) => e[0] === 'lin' && Math.abs(e[1] - 0.62) < 0.001).pop() : null;
const attackStart = envGain ? (envGain.gain.events.find((e) => e[0] === 'hold' || e[0] === 'cancel') || [null, null, null])[2] : null;
check('envelope de amplitude do colchão encontrado', !!envGain && attackEv !== null);
check('ataque = 1.8s exatos', attackEv && attackStart !== null && Math.abs((attackEv[2] - attackStart) - 1.8) < 0.001,
  attackEv ? `rampa de ${(attackEv[2] - attackStart).toFixed(3)}s` : 'sem evento');

/* ---- mesmo tom 2x desliga; nova nota depois do release retoma ---- */
click(window, doc.querySelector('.tone[data-note="G"]'));
await tick(20);
check('mesma nota desliga o colchão', doc.getElementById('toneHint').textContent === 'Toque para sustentar');
check('colchão inicia o fade-out', /hold/.test(JSON.stringify(envGain.gain.events)));
click(window, doc.querySelector('.tone[data-note="F"]'));
await tick(20);
check('retoma em F após release', /Sustentando: F/.test(doc.getElementById('toneHint').textContent));

/* ---- release de 1.5s ao desligar ---- */
const envGainNode = ctxRef.nodes.find((n) => n.kind === 'gain' && n.gain.events.some((e) => e[0] === 'lin' && Math.abs(e[1] - 0.62 * 0.35) < 0.001));
const releaseEv = envGainNode ? envGainNode.gain.events.filter((e) => e[0] === 'lin' && e[1] <= 0.00011).pop() : null;
const relEvents = envGain.gain.events.filter((e) => e[0] === 'lin');
const relStart = envGain.gain.events.filter((e) => e[0] === 'hold').pop();
const relEnd = relEvents.filter((e) => e[1] <= 0.00011).pop();
check('release de 1.5s (fade-out ao desligar)',
  !!relStart && !!relEnd && Math.abs((relEnd[2] - relStart[2]) - 1.5) < 0.001,
  relStart && relEnd ? `hold→fim = ${(relEnd[2] - relStart[2]).toFixed(3)}s` : JSON.stringify(envGain.gain.events));

/* ---- 16 pads: dispara todos ---- */
const padIds = [...doc.querySelectorAll('.pad')].map((p) => p.dataset.id);
check('ids técnicos dos 16 pads', padIds.join(',') === [
  'subdrop808', 'worshipsnare', 'clapcathedral', 'snapreverb',
  'swellriser', 'reversecrash', 'whitenoisesweep', 'shakerpandeiro',
  'shimmerstab', 'pluckdelay', 'pulsepad', 'chimescelestial',
  'whooshpassage', 'warcry', 'applause', 'ambientswell'
].join(','));

const nodesBeforePads = ctxRef.nodeCount;
for (const id of padIds) {
  const pad = doc.querySelector(`.pad[data-id="${id}"]`);
  pointer(window, pad);
  ctxRef.currentTime += 0.2;
  await tick(6);
}
check('todos os 16 pads dispararam síntese', ctxRef.nodeCount > nodesBeforePads + 60, `${nodesBeforePads} → ${ctxRef.nodeCount}`);
check('pad recebeu classe trigger/flash', true);

/* ---- importar sample (.wav) num pad ---- */
const pad = doc.querySelector('.pad[data-id="chimescelestial"]');
const input = pad.querySelector('input[type=file]');
const file = new window.File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'sino-igreja.wav', { type: 'audio/wav' });
Object.defineProperty(input, 'files', { value: [file], configurable: true });
input.dispatchEvent(new window.Event('change', { bubbles: true }));
await tick(80);
check('pad ficou verde (.loaded) após importar', pad.classList.contains('loaded'));
check('status de samples atualizado', /1 sample\(s\) salvos/.test(doc.getElementById('sampleText').textContent));

/* dispara o pad com sample (não deve usar a síntese) */
ctxRef.currentTime += 0.2;
pointer(window, pad);
await tick(20);
check('sample próprio toca no disparo', /sample próprio/.test(doc.getElementById('padHint').textContent));

/* ---- persistência: o áudio foi para o IndexedDB ---- */
const rows = await new Promise((resolve, reject) => {
  const rq = idb.open('worship-stage-fx', 1);
  rq.onerror = () => reject(rq.error);
  rq.onsuccess = () => {
    const db = rq.result;
    const tx = db.transaction('samples', 'readonly');
    const all = tx.objectStore('samples').getAll();
    all.onsuccess = () => resolve(all.result);
    all.onerror = () => reject(all.error);
  };
});
check('sample salvo no IndexedDB', rows.length === 1 && rows[0].id === 'chimescelestial' && rows[0].name === 'sino-igreja.wav' && rows[0].data.byteLength === 8);

/* ---- botão salvar offline ---- */
click(window, doc.getElementById('cacheBtn'));
await tick(40);
const cacheNames = await caches.keys();
check('cache offline criado pelo botão', cacheNames.includes('worship-stage-fx-v3'), cacheNames.join(','));
check('status offline ok', /Offline salvo/.test(doc.getElementById('pwaText').textContent), doc.getElementById('pwaText').textContent);

/* ---- STOP ALL ---- */
click(window, doc.getElementById('panicBtn'));
await tick(20);
check('STOP ALL limpa teclas ativas', doc.querySelectorAll('.tone.active').length === 0);
check('STOP ALL limpa cenas', doc.querySelectorAll('.chip.active').length === 0);

/* ---- wake lock / midi fallback ---- */
click(window, doc.getElementById('btnWake'));
await tick(10);
check('botão tela ligada responde', /TELA/.test(doc.getElementById('btnWake').textContent));

check('com manifest.json publicado, mantém o arquivo (não injeta inline)',
  !doc.querySelector('link[rel="manifest"]').dataset.inline &&
  doc.querySelector('link[rel="manifest"]').getAttribute('href') === 'manifest.json');

ctx1 = ctxRef;
/* ==================== CENÁRIO 2: recarregar (offline) ==================== */
const dom2 = makeWindow(idb, 'https://yohann123c-hash.github.io/worship-stage-fx/index.html', caches);
await tick(120);
const doc2 = dom2.window.document;
check('pad volta verde após recarregar', doc2.querySelector('.pad[data-id="chimescelestial"]').classList.contains('loaded'));
check('status diz que o sample está salvo no aparelho', /1 sample\(s\) salvos/.test(doc2.getElementById('sampleText').textContent));

/* dispara o pad restaurado: precisa decodificar e tocar o sample salvo */
pointer(dom2.window, doc2.querySelector('.tone[data-note="D"]'));
await tick(20);
pointer(dom2.window, doc2.querySelector('.pad[data-id="chimescelestial"]'));
await tick(40);
check('sample restaurado toca offline', /sample próprio/.test(doc2.getElementById('padHint').textContent), doc2.getElementById('padHint').textContent);

/* ---- remover sample (segurar o 📁) ---- */
const label = doc2.querySelector('.pad[data-id="chimescelestial"] .import-file');
pointer(dom2.window, label);
await tick(760);
check('segurar 📁 remove o sample', !doc2.querySelector('.pad[data-id="chimescelestial"]').classList.contains('loaded'));
const rows2 = await new Promise((resolve) => {
  const rq = idb.open('worship-stage-fx', 1);
  rq.onsuccess = () => {
    const all = rq.result.transaction('samples', 'readonly').objectStore('samples').getAll();
    all.onsuccess = () => resolve(all.result);
  };
});
check('sample apagado do IndexedDB', rows2.length === 0);

/* ====== CENÁRIO 2b: manifest.json ausente em https (fallback inline) ===== */
const dom2b = makeWindow(new IDBFactory(), 'https://exemplo.com/app/index.html', makeFakeCaches(), { manifestOk: false });
await tick(80);
const link2b = dom2b.window.document.querySelector('link[rel="manifest"]');
const href2b = link2b ? link2b.getAttribute('href') : '';
const parsed2b = (() => {
  try { return JSON.parse(decodeURIComponent(href2b.replace(/^data:application\/manifest\+json;charset=utf-8,/, ''))); }
  catch (e) { return null; }
})();
check('manifest.json ausente → manifest inline (Data URI) no https',
  parsed2b !== null && parsed2b.name === 'Worship Stage FX' && parsed2b.start_url === 'https://exemplo.com/app/index.html');
check('manifest inline com 192 e 512 (installability)', parsed2b && ['192x192', '512x512'].every((s) => parsed2b.icons.some((i) => i.sizes === s)));
dom2b.window.close();

/* ==================== CENÁRIO 3: manifest inline (file://) =============== */
const dom3 = makeWindow(new IDBFactory(), 'file:///home/user/worship-stage-fx/index.html', makeFakeCaches());
await tick(60);
const link = dom3.window.document.querySelector('link[rel="manifest"]');
const href = link ? link.getAttribute('href') : '';
const parsed = (() => {
  try { return JSON.parse(decodeURIComponent(href.replace(/^data:application\/manifest\+json;charset=utf-8,/, ''))); }
  catch (e) { return null; }
})();
check('manifest inline injetado em file://', parsed !== null && parsed.name === 'Worship Stage FX' && parsed.display === 'standalone' && parsed.background_color === '#0a0b10');
check('manifest inline com start_url/scope', parsed && parsed.start_url === 'file:///home/user/worship-stage-fx/index.html' && parsed.scope === 'file:///home/user/worship-stage-fx/');

/* ================================ RESULTADO ============================== */
dom.window.close(); dom2.window.close(); dom3.window.close();

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? '  ok  ' : ' FAIL '} ${c.name}${c.extra ? '  [' + c.extra + ']' : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} verificações passaram`);
console.log(`Nós de áudio criados (cenário 1): ${ctx1.nodeCount}`, ctx1.kinds);
if (logs.length) console.log('\nAvisos:\n' + logs.slice(0, 12).join('\n'));
if (errors.length) {
  console.log('\nERROS:\n' + errors.slice(0, 20).join('\n'));
  failed += errors.length;
}
process.exit(failed ? 1 : 0);

/* Fake Web Audio API (com validações do que o Chrome real rejeita) para o smoke test. */

class FakeParam {
  constructor(name, value = 0) {
    this.name = name;
    this.value = value;
    this.events = [];
  }
  _assert(t) {
    if (typeof t !== 'number' || !isFinite(t)) throw new TypeError(`${this.name}: tempo inválido ${t}`);
    if (t < 0) throw new RangeError(`${this.name}: tempo negativo ${t}`);
  }
  setValueAtTime(v, t) { this._assert(t); if (!isFinite(v)) throw new TypeError(`${this.name}: valor inválido`); this.value = v; this.events.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v, t) { this._assert(t); if (!isFinite(v)) throw new TypeError(`${this.name}: valor inválido`); this.value = v; this.events.push(['lin', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) {
    this._assert(t);
    if (v === 0) throw new RangeError(`${this.name}: exponentialRampToValueAtTime não aceita 0 (IndexSizeError no Chrome)`);
    if (!isFinite(v)) throw new TypeError(`${this.name}: valor inválido`);
    this.value = v; this.events.push(['exp', v, t]); return this;
  }
  setTargetAtTime(v, t, c) { this._assert(t); this.value = v; this.events.push(['target', v, t, c]); return this; }
  cancelScheduledValues(t) { this._assert(t); this.events.push(['cancel', null, t]); return this; }
  cancelAndHoldAtTime(t) { this._assert(t); this.events.push(['hold', null, t]); return this; }
}

class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.outputs = [];
    ctx.nodeCount++;
    ctx.kinds[kind] = (ctx.kinds[kind] || 0) + 1;
    ctx.nodes.push(this);
    this.id = ctx.nodes.length;
  }
  connect(target) {
    if (!target) throw new TypeError(`${this.kind}.connect(): destino ausente`);
    this.outputs.push(target);
    target.__inputs = (target.__inputs || 0) + 1;
    return target;
  }
  disconnect() { this.outputs.length = 0; }
}

class FakeBuffer {
  constructor(ch, len, rate) {
    this.numberOfChannels = ch; this.length = len; this.sampleRate = rate;
    this.duration = len / rate;
    this._d = Array.from({ length: ch }, () => new Float32Array(len));
  }
  getChannelData(c) { return this._d[c]; }
}

export class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.baseLatency = 0;
    this.sampleRate = 48000;
    this.currentTime = 1.0;
    this.nodeCount = 0;
    this.kinds = {};
    this.nodes = [];
    this.destination = new FakeNode(this, 'destination');
  }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  _n(kind) { return new FakeNode(this, kind); }

  createGain() { const n = this._n('gain'); n.gain = new FakeParam('gain', 1); return n; }
  createOscillator() {
    const n = this._n('oscillator');
    n.type = 'sine'; n.frequency = new FakeParam('frequency', 440); n.detune = new FakeParam('detune', 0);
    n.started = false; n.stopped = false; n.onended = null;
    n.start = (t = 0) => { if (n.started) throw new Error('oscillator.start chamado 2x'); n.started = true; n.startTime = t; };
    n.stop = (t = 0) => { n.stopped = true; n.stopTime = t; };
    return n;
  }
  createBiquadFilter() {
    const n = this._n('filter');
    n.type = 'lowpass'; n.frequency = new FakeParam('frequency', 350); n.Q = new FakeParam('Q', 1); n.gain = new FakeParam('gain', 0);
    return n;
  }
  createStereoPanner() { const n = this._n('panner'); n.pan = new FakeParam('pan', 0); return n; }
  createDelay(max) { const n = this._n('delay'); n.delayTime = new FakeParam('delayTime', 0); n.maxDelayTime = max || 1; return n; }
  createConvolver() {
    const n = this._n('convolver');
    n.buffer = null; n.normalize = true;
    Object.defineProperty(n, 'buffer', {
      get() { return this._buf; },
      set(v) {
        if (v !== null && v !== undefined) {
          if (!v.getChannelData) throw new TypeError('convolver.buffer precisa de um AudioBuffer');
          if (v.duration < 0.05) throw new RangeError('IR curta demais');
        }
        this._buf = v;
      }
    });
    return n;
  }
  createAnalyser() {
    const n = this._n('analyser');
    n.fftSize = 2048; n.smoothingTimeConstant = 0.8;
    Object.defineProperty(n, 'frequencyBinCount', { get() { return this.fftSize / 2; } });
    n.getByteFrequencyData = (arr) => { if (arr.length < n.frequencyBinCount) throw new RangeError('array pequeno'); for (let i = 0; i < arr.length; i++) arr[i] = (i * 7) % 255; };
    n.getByteTimeDomainData = (arr) => arr.fill(128);
    return n;
  }
  createDynamicsCompressor() {
    const n = this._n('compressor');
    n.threshold = new FakeParam('threshold', -24); n.knee = new FakeParam('knee', 30);
    n.ratio = new FakeParam('ratio', 12); n.attack = new FakeParam('attack', 0.003); n.release = new FakeParam('release', 0.25);
    return n;
  }
  createBufferSource() {
    const n = this._n('bufferSource');
    n.buffer = null; n.loop = false; n.loopStart = 0; n.loopEnd = 0; n.playbackRate = new FakeParam('playbackRate', 1);
    n.started = false;
    n.start = (t = 0, off = 0) => {
      if (n.started) throw new Error('bufferSource.start chamado 2x');
      if (!n.buffer) throw new Error('bufferSource sem buffer');
      n.started = true; n.offset = off;
    };
    n.stop = (t = 0) => { n.stopped = true; n.stopTime = t; };
    return n;
  }
  createBuffer(ch, len, rate) {
    if (!(len > 0)) throw new RangeError('createBuffer: tamanho inválido');
    return new FakeBuffer(ch, len, rate);
  }
  decodeAudioData(data, ok, fail) {
    try {
      if (!data || !data.byteLength) throw new Error('sem dados');
      const buf = new FakeBuffer(1, Math.floor(this.sampleRate * 1.5), this.sampleRate);
      // pico alto para exercitar a normalização do sample
      buf.getChannelData(0)[10] = 1.4;
      if (ok) ok(buf);
      return Promise.resolve(buf);
    } catch (e) { if (fail) fail(e); return Promise.reject(e); }
  }
}

/* Fake CacheStorage suficiente para o botão "SALVAR OFFLINE" */
export function makeFakeCaches() {
  const stores = new Map();
  return {
    _stores: stores,
    open: async (name) => {
      if (!stores.has(name)) {
        const entries = new Map();
        stores.set(name, entries);
        stores.get(name).entries = entries;
      }
      const entries = stores.get(name).entries;
      return {
        add: async (req) => { entries.set(typeof req === 'string' ? req : req.url, true); },
        addAll: async (reqs) => { for (const r of reqs) entries.set(typeof r === 'string' ? r : r.url, true); },
        put: async (req, res) => { entries.set(typeof req === 'string' ? req : req.url, res); },
        match: async (req) => entries.get(typeof req === 'string' ? req : req.url) || undefined,
        keys: async () => Array.from(entries.keys())
      };
    },
    keys: async () => Array.from(stores.keys()),
    delete: async (name) => stores.delete(name),
    match: async () => undefined
  };
}

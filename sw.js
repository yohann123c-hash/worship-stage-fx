/* ==========================================================================
   Worship Stage FX — Service Worker (cache 100% offline)
   Este arquivo é o service worker oficial do app. O index.html traz uma cópia
   inline equivalente usada apenas como rede de segurança.
   Estratégia: pré-cache no install + "cache primeiro, rede depois".
   ========================================================================== */
'use strict';

var CACHE = 'worship-stage-fx-v4';
var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon-180.png'
];

function abs(u) { return new URL(u, self.registration.scope).href; }

function precache() {
  return caches.open(CACHE).then(function (c) {
    return Promise.all(ASSETS.map(function (u) {
      // cache:'reload' ignora o cache HTTP e sempre grava a versão nova
      return c.add(new Request(abs(u), { cache: 'reload' })).catch(function () {});
    }));
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil(precache().then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) {
  if (!e.data) return;
  if (e.data.type === 'CACHE_NOW') e.waitUntil(precache());
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function stash(req, res) {
  if (res && res.ok && res.type === 'basic') {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copy); });
  }
  return res;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  // Navegação: rede primeiro, cache como plano B (abre offline sem falhas)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(function (r) { stash(new Request(abs('./index.html')), r.clone()); return r; })
        .catch(function () {
          return caches.match(abs('./index.html')).then(function (r) { return r || caches.match('./'); });
        })
    );
    return;
  }

  if (new URL(req.url).origin !== self.location.origin) return;

  // Demais arquivos: cache primeiro (rápido e funciona sem internet)
  e.respondWith(caches.match(req).then(function (cached) {
    var net = fetch(req)
      .then(function (r) { return stash(req, r.clone()); })
      .catch(function () { return cached; });
    return cached || net;
  }));
});

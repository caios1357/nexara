/* NEXARA — service worker (META-69): o jogo abre SEM REDE depois de uma visita com rede.
 * Estratégia (o save fica no localStorage do aparelho — o SW nunca toca nele):
 *  • arquivos com ?v=<build> (código do jogo) e three.js fixo (CDN, versão no caminho) → cache primeiro (a URL muda a cada build);
 *  • página, dados JSON, manifest e tudo sem versão → REDE primeiro (sempre o mais novo online), cache só se estiver offline;
 *  • imagens/áudio/modelos sem versão → cache e atualiza em segundo plano.
 * ?sw=0 desregistra (diagnóstico). Caches de versões antigas do SW são apagados na ativação. */
const SW_VERSION = 'nx-sw-1';
const CACHE = 'nexara-' + SW_VERSION;
const CORE = ['./', './index.html', './manifest.webmanifest'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('nexara-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const STATIC_RX = /\.(png|jpe?g|webp|gif|svg|glb|gltf|bin|ogg|mp3|wav|m4a|woff2?|ttf|ktx2)$/i;
function put(req, res) {
  if (!res || !(res.ok || res.type === 'opaque')) return res;
  const copy = res.clone();
  caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
  return res;
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;
  const versioned = url.searchParams.has('v') && url.origin === self.location.origin && !req.mode.startsWith('navigate');
  const pinnedCdn = url.hostname === 'cdn.jsdelivr.net' && /@\d+\.\d+\.\d+\//.test(url.pathname);
  if (versioned || pinnedCdn) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => put(req, r))));
    return;
  }
  if (url.origin === self.location.origin && STATIC_RX.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => { const net = fetch(req).then((r) => put(req, r)).catch(() => hit); return hit || net; }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // rede primeiro (página, JSON de dados, manifest…) — offline cai no cache; página sem cache → página inicial guardada
  e.respondWith(fetch(req).then((r) => put(req, r)).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./') : Response.error()))));
});

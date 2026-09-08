// 越南 10 天 · Service Worker
// ⚠️ 发版必须改 VERSION（哪怕只改一位），否则手机上装的还是旧版——缓存名带着它，不改就不清旧缓存。
const VERSION = '2026-09-08-tiles3';
const CACHE_NAME = 'vn10-' + VERSION;
// 瓦片缓存名不带版本：瓦片本身不会变，发一次版就把她下好的离线地图全清掉太蠢了
const TILES = 'vn10-tiles';
const PRECACHE = ['index.html','lock.js','data.enc.js','app.js','tab-today.js','tab-map.js','tab-pool.js','tab-bag.js','tab-spin.js',
  'manifest.json','icons/icon.svg','icons/icon-180.png','icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css','https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => Promise.allSettled(PRECACHE.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ns => Promise.all(ns.filter(n => n !== CACHE_NAME && n !== TILES).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // 汇率 API：永远走网络，绝不返回缓存的旧汇率（拿不到就让页面自己回退到存的基准）
  if (u.hostname === 'open.er-api.com') { e.respondWith(fetch(e.request)); return; }
  // 地图瓦片：缓存优先。瓦片是不变的，之前写成网络优先意味着
  // 就算存过也要等一次网络往返——地图每次打开都慢，离线更是直接白板。
  if (u.hostname.endsWith('tile.openstreetmap.org') || u.hostname.endsWith('basemaps.cartocdn.com')) {
    e.respondWith(caches.open(TILES).then(c => c.match(e.request).then(hit => hit ||
      fetch(e.request).then(r => {
        // 不透明响应（no-cors）的 ok 恒为 false，但照样能存，别漏掉
        if (r.ok || r.type === 'opaque') c.put(e.request, r.clone());
        return r;
      }))));
    return;
  }
  // ignoreSearch：index.html 里脚本挂了 ?v=<版本>，不忽略 query 就配不上预缓存的 app.js，离线直接白屏
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});

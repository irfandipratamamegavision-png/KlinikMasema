/* Service worker Klinik Masema
   Tugasnya hanya menyimpan "kerangka" aplikasi (halaman + ICD-10 + pustaka CDN) agar bisa dibuka saat internet mati.
   Data pasien/kasir TIDAK lewat sini: disimpan di penyimpanan lokal aplikasi dan disinkronkan ke Firebase oleh aplikasi sendiri.
   Kalau mengganti isi index.html / icd10-data.js, naikkan angka VERSI di bawah supaya cache lama dibuang. */
const VERSI = 'klinik-masema-v3-1';
const SHELL = ['./', 'index.html', 'icd10-data.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const HOST_STATIS = ['cdnjs.cloudflare.com', 'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e=>{
  e.waitUntil((async ()=>{
    const c = await caches.open(VERSI);
    await Promise.allSettled(SHELL.map(u=> c.add(new Request(u, { cache:'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e=>{
  e.waitUntil((async ()=>{
    const names = await caches.keys();
    await Promise.all(names.filter(n=> n !== VERSI).map(n=> caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin === self.location.origin){
    e.respondWith(req.mode === 'navigate' ? networkFirst(req) : staleWhileRevalidate(req));
    return;
  }
  if(HOST_STATIS.includes(url.hostname)){
    e.respondWith(url.hostname === 'fonts.googleapis.com' ? staleWhileRevalidate(req) : cacheFirst(req));
  }
  // Selain itu (Firebase Auth, Realtime Database, dll) dibiarkan langsung ke jaringan, tidak pernah di-cache.
});

function fetchDenganBatas(req, ms, opts){
  return new Promise((resolve, reject)=>{
    const t = setTimeout(()=> reject(new Error('timeout')), ms);
    fetch(req, opts).then(r=>{ clearTimeout(t); resolve(r); }, err=>{ clearTimeout(t); reject(err); });
  });
}

// Halaman utama: ambil versi terbaru kalau online (batas 4 detik), kalau gagal pakai salinan tersimpan.
async function networkFirst(req){
  const c = await caches.open(VERSI);
  try{
    const res = await fetchDenganBatas(req, 4000, { cache:'no-cache' });
    if(res && res.ok){ c.put('index.html', res.clone()); }
    return res;
  }catch(err){
    return (await c.match(req, { ignoreSearch:true })) || (await c.match('index.html')) || (await c.match('./')) || Response.error();
  }
}

async function staleWhileRevalidate(req){
  const c = await caches.open(VERSI);
  const tersimpan = await c.match(req, { ignoreSearch:true });
  const dariJaringan = fetch(req).then(res=>{
    if(res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
    return res;
  }).catch(()=> null);
  return tersimpan || (await dariJaringan) || Response.error();
}

async function cacheFirst(req){
  const c = await caches.open(VERSI);
  const tersimpan = await c.match(req);
  if(tersimpan) return tersimpan;
  try{
    const res = await fetch(req);
    if(res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
    return res;
  }catch(err){ return Response.error(); }
}

// Service worker: uygulamanın internetsiz de açılmasını sağlar.
// Yöntem: önce hafızadaki kopyayı göster, arkada internetten yenisini indirip hafızayı güncelle.
// Böylece telefon çevrimdışıyken de açılır, güncellemeler de bir sonraki açılışta gelir.
// Not: Kelimeler burada değil, tarayıcının localStorage hafızasında durur (app.js).
const SURUM = 'kelime-kartlari-v6';
const DOSYALAR = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './esitleme.js',
  './firebase-ayar.js',
  './manifest.webmanifest',
  './simgeler/simge-192.png',
  './simgeler/simge-512.png',
  './simgeler/apple-touch-icon.png'
];

self.addEventListener('install', (olay) => {
  olay.waitUntil(caches.open(SURUM).then((c) => c.addAll(DOSYALAR)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (olay) => {
  // Eski sürümün hafızasını sil
  olay.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a !== SURUM).map((a) => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (olay) => {
  if (olay.request.method !== 'GET') return;
  const adres = new URL(olay.request.url);
  // Çeviri servisi, Firebase gibi dış adreslere karışma.
  if (adres.origin !== self.location.origin) return;
  // Sadece uygulamanın kendi dosyaları (DOSYALAR) ve sayfanın kendisi. Diğer isteklere (ör. ?'li adresler,
  // kelimeler.js) karışma: aşağıdaki "ignoreSearch" yüzünden yanlış cevap verebilirdi.
  const kok = new URL('./', self.location).pathname;
  const goreli = './' + adres.pathname.slice(kok.length);
  if (!DOSYALAR.includes(goreli) && olay.request.mode !== 'navigate') return;
  olay.respondWith(
    caches.open(SURUM).then((c) =>
      c.match(olay.request, { ignoreSearch: true }).then((kayitli) => {
        const internetten = fetch(olay.request)
          .then((yanit) => {
            if (yanit && yanit.ok) c.put(olay.request, yanit.clone());
            return yanit;
          })
          .catch(() => kayitli || Response.error());
        return kayitli || internetten;
      })
    )
  );
});

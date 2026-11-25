// Service worker: uygulamanın internetsiz de açılmasını sağlar.
// Yöntem: önce hafızadaki kopyayı göster, arkada internetten yenisini indirip hafızayı güncelle.
// Böylece telefon çevrimdışıyken de açılır, güncellemeler de bir sonraki açılışta gelir.
// Not: Kelimeler burada değil, tarayıcının localStorage hafızasında durur (app.js).
const SURUM = 'kelime-kartlari-v9';
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
  // cache: 'reload' -> tarayıcının HTTP önbelleğini atla, dosyaların en yeni halini sunucudan al
  // (GitHub Pages dosyaları 10 dk önbellekte tuttuğu için yoksa yeni sürüm eski dosyalarla kurulabiliyordu).
  olay.waitUntil(
    caches.open(SURUM)
      .then((c) => c.addAll(DOSYALAR.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
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
        // cache: 'no-cache' -> arka planda yenilerken sunucuya "değişti mi?" diye mutlaka sor.
        // (Sayfa isteği (navigate) ayar kabul etmediği için adresiyle istenir.)
        const istek = olay.request.mode === 'navigate' ? adres.href : olay.request;
        const internetten = fetch(istek, { cache: 'no-cache' })
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

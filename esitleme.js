// Eşitleme motoru (Firebase). app.js bu dosyayı sadece internetten açılınca ve Firebase ayarı varsa yükler.
// Görevleri:
//   1) Google ile giriş / çıkış (Firebase Authentication)
//   2) Bu cihazda değişen kayıtları buluta göndermek (Firestore, toplu yazma)
//   3) Buluttan sadece en son okunandan sonra değişen kayıtları dinlemek ve app.js'e vermek
// Bulutta yapı: kullanicilar/{uid}/setler/{id} ve kullanicilar/{uid}/kartlar/{id}
// Her kayıtta app.js'in alanları + s (sunucu zamanı: "en son nereye kadar okundu" imleci için) var.
// app.js ile sadece window.KK fonksiyonları üzerinden konuşur (kk).

const SURUM = '10.14.1';
const adres = (ad) => `https://www.gstatic.com/firebasejs/${SURUM}/${ad}.js`;

let fb = null;          // Firebase fonksiyonları
let kk = null;          // app.js'in verdiği fonksiyonlar
let auth = null;
let db = null;
let kullanici = null;
let dinleyiciler = [];  // açık bulut dinleyicilerini kapatmak için
let gonderiliyor = false;
let zamanlayici = null;
let ilkOkuma = { setler: false, kartlar: false };

export async function baslat(ayar, kkFonksiyonlari) {
  kk = kkFonksiyonlari;
  const [uyg, yetki, depo] = await Promise.all([
    import(adres('firebase-app')), import(adres('firebase-auth')), import(adres('firebase-firestore'))
  ]);
  fb = Object.assign({}, uyg, yetki, depo);
  const app = fb.initializeApp(ayar);
  auth = fb.getAuth(app);
  // Bulutun kendi hafızası kapalı: kelimeler zaten app.js'te (localStorage) saklanıyor.
  db = fb.initializeFirestore(app, { localCache: fb.memoryLocalCache() });

  try {
    await fb.getRedirectResult(auth);          // yönlendirmeyle giriş yapıldıysa sonucunu al
  } catch (e) {
    kk.esitlemeDurumu('hata', null, e.code || e.message);
  }
  fb.onAuthStateChanged(auth, (k) => {
    durdur();
    kullanici = k;
    if (k) basla();
    else kk.esitlemeDurumu('kapali', null);
  });
  window.addEventListener('online', () => durt(0));
  window.addEventListener('offline', () => { if (kullanici) kk.esitlemeDurumu('cevrimdisi', kullanici.email); });
}

export function bilgi() {
  return { girisli: !!kullanici, eposta: kullanici ? kullanici.email : null };
}

export async function girisYap() {
  const saglayici = new fb.GoogleAuthProvider();
  saglayici.setCustomParameters({ prompt: 'select_account' });
  try {
    await fb.signInWithPopup(auth, saglayici);
  } catch (e) {
    // Açılır pencere engellendiyse (bazı telefon tarayıcıları) sayfa yönlendirmesiyle dene.
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment',
         'auth/cancelled-popup-request'].includes(e.code)) {
      await fb.signInWithRedirect(auth, saglayici);
    } else if (e.code !== 'auth/popup-closed-by-user') {
      throw e;
    }
  }
}

export async function cikisYap() {
  await fb.signOut(auth);
}

// Değişiklik oldu: kısa bir bekleme sonra gönder (art arda değişiklikler tek seferde gitsin).
export function durt(bekleme = 800) {
  clearTimeout(zamanlayici);
  zamanlayici = setTimeout(gonder, bekleme);
}

function durdur() {
  dinleyiciler.forEach((kapat) => kapat());
  dinleyiciler = [];
  clearTimeout(zamanlayici);
}

function durumuGuncelle() {
  if (!kullanici) return;
  if (navigator.onLine === false) kk.esitlemeDurumu('cevrimdisi', kullanici.email);
  else if (gonderiliyor || kk.bekleyenSayisi() > 0) kk.esitlemeDurumu('gonderiyor', kullanici.email);
  else if (!ilkOkuma.setler || !ilkOkuma.kartlar) kk.esitlemeDurumu('baglaniyor', kullanici.email);
  else kk.esitlemeDurumu('acik', kullanici.email);
}

function basla() {
  const uid = kullanici.uid;
  kk.kullaniciKontrol(uid);
  ilkOkuma = { setler: false, kartlar: false };
  durumuGuncelle();
  ['setler', 'kartlar'].forEach((tur) => {
    const son = kk.imlecAl(tur);
    const sorgu = fb.query(
      fb.collection(db, 'kullanicilar', uid, tur),
      fb.where('s', '>', fb.Timestamp.fromMillis(son)),
      fb.orderBy('s')
    );
    dinleyiciler.push(fb.onSnapshot(sorgu, (anlik) => {
      const gelen = [];
      let enSon = 0;
      anlik.docChanges().forEach((d) => {
        if (d.type === 'removed') return;
        if (d.doc.metadata.hasPendingWrites) return;   // kendi gönderdiğimiz, henüz onaylanmamış
        const veri = d.doc.data();
        const s = veri.s && veri.s.toMillis ? veri.s.toMillis() : 0;
        if (s > enSon) enSon = s;
        delete veri.s;
        gelen.push({ tur, id: d.doc.id, veri });
      });
      if (gelen.length) kk.uzaktanGeldi(gelen);
      if (enSon) kk.imlecYaz(tur, enSon);
      ilkOkuma[tur] = true;
      durumuGuncelle();
    }, (hata) => {
      kk.esitlemeDurumu('hata', kullanici && kullanici.email, hata.code || hata.message);
    }));
  });
  durt(0);
}

async function gonder() {
  if (!kullanici || gonderiliyor) return;
  const paket = kk.bekleyenleriAl(400);         // Firestore toplu yazma sınırı 500
  if (!paket.length) { durumuGuncelle(); return; }
  gonderiliyor = true;
  durumuGuncelle();
  try {
    const toplu = fb.writeBatch(db);
    paket.forEach(({ tur, id, veri }) => {
      toplu.set(fb.doc(db, 'kullanicilar', kullanici.uid, tur, id),
        Object.assign({}, veri, { s: fb.serverTimestamp() }));
    });
    await toplu.commit();                        // internet yoksa bağlantı gelene kadar bekler
    kk.gonderildi(paket);
    gonderiliyor = false;
    if (kk.bekleyenSayisi() > 0) durt(0); else durumuGuncelle();
  } catch (e) {
    gonderiliyor = false;
    if (e.code === 'permission-denied') {
      // Güvenlik kuralı, buluttakinden ESKİ bir kaydın yazılmasını reddeder (başka cihaz daha yeni
      // bir hal göndermiş). Dinleyici o yeni hali getirince bizdeki eski hal listeden düşer; kısa
      // süre sonra kalanlarla yeniden dene.
      durt(3000);
    } else {
      kk.esitlemeDurumu('hata', kullanici && kullanici.email, e.code || e.message);
      durt(15000);                               // bir süre sonra yeniden dene
    }
  }
}

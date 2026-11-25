// Kelime Kartları - uygulamanın bütün davranışı bu dosyada.
// V3: Kelimeler cihazın hafızasında (localStorage) saklanır ve Google hesabıyla giriş yapılınca
// bütün cihazlar arasında eşitlenir (buluta bağlanan kısım: esitleme.js).
// Her set ve her kart ayrı bir "kayıt"tır: kimliği (id), son değişme zamanı (g) ve silindi işareti var.
// İki cihaz aynı kaydı değiştirirse daha sonra değiştirilen (g'si büyük olan) kazanır.
// İlk açılışta hafıza boşsa, varsa kelimeler.js dosyasındaki setler bir kez hafızaya alınır.
(function () {
  'use strict';

  // ---------- Küçük yardımcılar ----------
  const $ = (secici) => document.querySelector(secici);

  // Tarayıcı hafızası (localStorage) bazen kapalı olabilir; hata verirse varsayılanı kullan.
  function hafizadanOku(anahtar, varsayilan) {
    try {
      const deger = localStorage.getItem(anahtar);
      return deger === null ? varsayilan : JSON.parse(deger);
    } catch (e) {
      return varsayilan;
    }
  }
  function hafizayaYaz(anahtar, deger) {
    try { localStorage.setItem(anahtar, JSON.stringify(deger)); return true; } catch (e) { return false; }
  }
  function hafizadanSil(anahtar) {
    try { localStorage.removeItem(anahtar); } catch (e) { /* yoksay */ }
  }

  // Yazıyı küçük harfe çevirip Türkçe/İngilizce aramada sorun çıkarmayacak hale getirir.
  function sadelestir(metin) {
    return (metin || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Kartın üzerindeki yazı uzunsa yazı boyutunu küçült.
  function boyutSinifi(metin) {
    const n = (metin || '').length;
    if (n > 90) return 'kart-metin uzun';
    if (n > 30) return 'kart-metin orta';
    return 'kart-metin';
  }

  function yeniId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // Ekranın altında 3 saniyelik kısa mesaj.
  let bildirimZamani = null;
  function bildir(metin) {
    const kutu = $('#bildirim');
    kutu.textContent = metin;
    kutu.hidden = false;
    clearTimeout(bildirimZamani);
    bildirimZamani = setTimeout(() => { kutu.hidden = true; }, 3000);
  }

  const KALEM = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

  // Bir kelime satırı oluşturur. tiklaninca: satıra basınca; duzenlenince: kaleme basınca.
  function kelimeSatiri(kart, kaynakAdi, tiklaninca, duzenlenince) {
    const satir = document.createElement('div');
    satir.className = 'kelime-satir';
    const ana = document.createElement('button');
    ana.type = 'button';
    ana.className = 'satir-ana';
    const terim = document.createElement('span');
    terim.className = 'terim';
    terim.textContent = kart.on;
    const anlam = document.createElement('span');
    anlam.className = 'anlam';
    anlam.textContent = kart.arka;
    ana.append(terim, anlam);
    if (kaynakAdi) {
      const kaynak = document.createElement('span');
      kaynak.className = 'kaynak';
      kaynak.textContent = kaynakAdi;
      ana.append(kaynak);
    }
    ana.addEventListener('click', tiklaninca);
    satir.append(ana);
    if (duzenlenince) {
      const kalem = document.createElement('button');
      kalem.type = 'button';
      kalem.className = 'duzenle';
      kalem.setAttribute('aria-label', 'Düzenle: ' + kart.on);
      kalem.innerHTML = KALEM;
      kalem.addEventListener('click', duzenlenince);
      satir.append(kalem);
    }
    return satir;
  }

  // ---------- Veri (kayıtlar) ----------
  // depo = { setler: { id: {ad, sira, g, silindi} },
  //          kartlar: { id: {set, on, arka, sira, g, silindi} } }
  // bekleyen = { 'kartlar/id': g, ... }  -> buluta henüz gönderilmemiş kayıtlar
  // SETLER   = ekranda gösterilen liste: [{ id, ad, sira, kartlar: [{ id, on, arka, sira }] }]
  //            (depodan üretilir, silinenler içinde yoktur; doğrudan değiştirilmez)
  const DEPO = 'kelimeDeposu';
  const BEKLEYEN = 'kelimeBekleyen';
  let depo = hafizadanOku(DEPO, null);
  let bekleyen = hafizadanOku(BEKLEYEN, {});
  let SETLER = [];
  let sonZaman = 0;

  // Her değişiklik bir öncekinden büyük bir zaman damgası alır (saat geri kalsa bile).
  function simdi() {
    sonZaman = Math.max(Date.now(), sonZaman + 1);
    return sonZaman;
  }

  // Eski biçimdeki set listesini ([{id?, ad, kartlar:[{on, arka}]}]) kayıtlara çevirir.
  // Hepsi "bekleyen" olur, yani giriş yapılınca buluta gönderilir.
  function eskiVeridenDepo(setler) {
    const d = { setler: {}, kartlar: {} };
    const g = simdi();
    setler.forEach((s, i) => {
      const sid = s.id || yeniId();
      d.setler[sid] = { ad: String(s.ad), sira: i, g, silindi: false };
      bekleyen['setler/' + sid] = g;
      (s.kartlar || []).forEach((k, j) => {
        const kid = sid + '-' + j;
        d.kartlar[kid] = { set: sid, on: String(k.on), arka: String(k.arka), sira: j, g, silindi: false };
        bekleyen['kartlar/' + kid] = g;
      });
    });
    return d;
  }

  function depoyuKaydet() {
    const tamam = hafizayaYaz(DEPO, depo) && hafizayaYaz(BEKLEYEN, bekleyen);
    if (!tamam) bildir('Kaydedilemedi! Tarayıcı hafızası kapalı ya da dolu olabilir.');
    return tamam;
  }

  if (!depo || !depo.setler || !depo.kartlar) {
    // V2'nin hafızası varsa ondan, yoksa kelimeler.js'ten (bilgisayardaki sürüm), o da yoksa boş başla.
    const eski = hafizadanOku('kelimeSetleri', null);
    depo = eskiVeridenDepo(Array.isArray(eski) ? eski : (window.KELIME_SETLERI || []));
    depoyuKaydet();
  }
  Object.values(depo.setler).concat(Object.values(depo.kartlar)).forEach((k) => {
    if (k.g > sonZaman) sonZaman = k.g;
  });

  // Depodaki kayıtlardan ekranda gösterilecek SETLER listesini üretir.
  function gorunumuKur() {
    const harita = {};
    SETLER = [];
    Object.keys(depo.setler).forEach((id) => {
      const s = depo.setler[id];
      if (s.silindi) return;
      const set = { id, ad: s.ad, sira: s.sira, kartlar: [] };
      harita[id] = set;
      SETLER.push(set);
    });
    Object.keys(depo.kartlar).forEach((id) => {
      const k = depo.kartlar[id];
      if (k.silindi || !harita[k.set]) return;
      harita[k.set].kartlar.push({ id, on: k.on, arka: k.arka, sira: k.sira });
    });
    const sirala = (a, b) => (a.sira - b.sira) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    SETLER.sort(sirala);
    SETLER.forEach((s) => s.kartlar.sort(sirala));
  }
  gorunumuKur();

  // Kayıtları değiştirir: liste = [[tur, id, alanlar], ...]  (tur: 'setler' ya da 'kartlar')
  // Değişen her kayıt yeni bir zaman damgası alır ve "bekleyen" listesine girer.
  function kayitlariYaz(liste) {
    liste.forEach(([tur, id, alanlar]) => {
      const g = simdi();
      depo[tur][id] = Object.assign({}, depo[tur][id], alanlar, { g });
      bekleyen[tur + '/' + id] = g;
    });
    const tamam = depoyuKaydet();
    gorunumuKur();
    esitlemeyiDurt();
    return tamam;
  }

  function setBul(id) {
    return SETLER.find((s) => s.id === id) || null;
  }

  // Telefonda tarayıcının bu verileri kendiliğinden silmemesini iste.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  // ---------- Uygulamanın durumu ----------
  const durum = {
    set: null,          // açık olan set (nesne)
    sira: [],           // kartların gösterilme sırası (karıştırınca değişir)
    konum: 0,           // sira içindeki şu anki yer
    cevrik: false,      // kart arka yüzünü mü gösteriyor
    karisik: false,     // karıştırma açık mı
    tersYuz: hafizadanOku('tersYuz', false) // true ise önce arka yüz (anlam) gösterilir
  };

  // ---------- ANA SAYFA ----------
  function anaSayfayiGoster() {
    $('#ana').hidden = false;
    $('#set').hidden = true;
    $('#geri').hidden = true;
    $('#baslik').textContent = 'Kelime Kartları';
    document.title = 'Kelime Kartları';
    durum.set = null;

    const toplam = SETLER.reduce((t, s) => t + s.kartlar.length, 0);
    $('#ozet').textContent = SETLER.length + ' set · ' + toplam + ' kelime';

    const liste = $('#set-listesi');
    liste.innerHTML = '';
    if (SETLER.length === 0) {
      liste.innerHTML =
        '<div class="bos">Henüz set yok. Yeni bir set oluşturun ya da yedek dosyanızı yükleyin.' +
        '<div class="bos-dugmeler">' +
        '<button type="button" class="secenek vurgulu" data-is="yeni-set">+ Yeni set</button>' +
        '<button type="button" class="secenek" data-is="yedek-yukle">Yedekten yükle</button>' +
        '</div></div>';
      liste.querySelector('[data-is="yeni-set"]').addEventListener('click', yeniSet);
      liste.querySelector('[data-is="yedek-yukle"]').addEventListener('click', () => $('#yedek-dosya').click());
    }
    SETLER.forEach((set) => {
      const a = document.createElement('a');
      a.href = '#set/' + set.id;
      a.className = 'set-kutu';
      const ad = document.createElement('span');
      ad.className = 'set-ad';
      ad.textContent = set.ad;
      const adet = document.createElement('span');
      adet.className = 'set-adet';
      adet.textContent = set.kartlar.length + ' kelime';
      a.append(ad, adet);
      liste.append(a);
    });
    aramaYap();
  }

  function aramaYap() {
    const sorgu = sadelestir($('#arama').value.trim());
    const sonuc = $('#arama-sonuc');
    const setListesi = $('#set-listesi');
    if (!sorgu) {
      sonuc.hidden = true;
      setListesi.hidden = false;
      return;
    }
    setListesi.hidden = true;
    sonuc.hidden = false;
    sonuc.innerHTML = '';
    let bulunan = 0;
    SETLER.forEach((set) => {
      set.kartlar.forEach((kart, kartNo) => {
        if (bulunan >= 200) return;
        if (sadelestir(kart.on).includes(sorgu) || sadelestir(kart.arka).includes(sorgu)) {
          const satir = kelimeSatiri(kart, set.ad, () => {
            hafizayaYaz('konum-' + set.id, kartNo);
            hafizayaYaz('karisik-' + set.id, false);
            location.hash = '#set/' + set.id;
          }, () => kelimePenceresi(set, kartNo, anaSayfayiGoster));
          sonuc.append(satir);
          bulunan++;
        }
      });
    });
    if (bulunan === 0) sonuc.innerHTML = '<div class="bos">Sonuç bulunamadı.</div>';
  }

  // ---------- SET SAYFASI ----------
  function setiAc(id) {
    const set = setBul(id);
    if (!set) { location.hash = ''; return; }
    durum.set = set;
    durum.karisik = hafizadanOku('karisik-' + set.id, false);
    siraOlustur();
    const kayitli = hafizadanOku('konum-' + set.id, 0);
    durum.konum = durum.karisik ? 0 : Math.min(Math.max(kayitli, 0), Math.max(set.kartlar.length - 1, 0));

    $('#ana').hidden = true;
    $('#set').hidden = false;
    $('#geri').hidden = false;
    window.scrollTo(0, 0);
    setSayfasiniYenile();
  }

  function setSayfasiniYenile() {
    const set = durum.set;
    $('#baslik').textContent = set.ad;
    document.title = set.ad + ' · Kelime Kartları';
    $('#set-adet').textContent = '(' + set.kartlar.length + ')';
    setListesiniCiz();
    kartiCiz();
    seceneklerinGorunumu();
  }

  // Kartların sırasını hazırla: normal sıra ya da karışık.
  function siraOlustur() {
    const n = durum.set.kartlar.length;
    durum.sira = Array.from({ length: n }, (_, i) => i);
    if (durum.karisik) {
      for (let i = n - 1; i > 0; i--) {           // Fisher-Yates karıştırma
        const j = Math.floor(Math.random() * (i + 1));
        [durum.sira[i], durum.sira[j]] = [durum.sira[j], durum.sira[i]];
      }
    }
  }

  function simdikiKart() {
    if (!durum.set) return null;
    return durum.set.kartlar[durum.sira[durum.konum]] || null;
  }

  function kartiCiz() {
    const set = durum.set;
    if (set.kartlar.length === 0) {           // boş set: önceki setin kartı ekranda kalmasın
      $('#kart').classList.remove('cevrik');
      durum.cevrik = false;
      $('#kart-on').textContent = 'Bu sette kelime yok.\n"+ Kelime ekle" ile başlayın.';
      $('#kart-on').className = 'kart-metin orta';
      $('#kart-arka').textContent = '';
      $('#sayac').textContent = '0 / 0';
      $('#ilerleme-dolu').style.width = '0%';
      $('#onceki').disabled = true;
      $('#sonraki').disabled = true;
      return;
    }
    const kart = simdikiKart();
    const onYazi = durum.tersYuz ? kart.arka : kart.on;
    const arkaYazi = durum.tersYuz ? kart.on : kart.arka;

    // Yeni karta geçerken çevirme animasyonu görünmesin diye animasyonu bir anlık kapat.
    const kartKutu = $('#kart');
    kartKutu.classList.add('anisiz');
    kartKutu.classList.remove('cevrik');
    durum.cevrik = false;
    $('#kart-on').textContent = onYazi;
    $('#kart-on').className = boyutSinifi(onYazi);
    $('#kart-arka').textContent = arkaYazi;
    $('#kart-arka').className = boyutSinifi(arkaYazi);
    void kartKutu.offsetWidth; // tarayıcıyı değişikliği uygulamaya zorla
    kartKutu.classList.remove('anisiz');

    const n = set.kartlar.length;
    $('#sayac').textContent = (durum.konum + 1) + ' / ' + n;
    $('#ilerleme-dolu').style.width = ((durum.konum + 1) / n * 100) + '%';
    $('#onceki').disabled = durum.konum === 0;
    $('#sonraki').disabled = durum.konum === n - 1;

    // Listede şu anki kelimeyi işaretle
    document.querySelectorAll('#set-kelimeleri .kelime-satir').forEach((s, i) => {
      s.classList.toggle('secili', i === durum.sira[durum.konum]);
    });

    if (!durum.karisik) hafizayaYaz('konum-' + set.id, durum.konum);
  }

  function setListesiniCiz() {
    const liste = $('#set-kelimeleri');
    liste.innerHTML = '';
    const set = durum.set;
    if (set.kartlar.length === 0) {
      liste.innerHTML = '<div class="bos">Henüz kelime yok.</div>';
      return;
    }
    set.kartlar.forEach((kart, kartNo) => {
      liste.append(kelimeSatiri(kart, null, () => {
        durum.konum = durum.sira.indexOf(kartNo);
        kartiCiz();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, () => kelimePenceresi(set, kartNo, kartlarDegisti)));
    });
  }

  function cevir() {
    if (!simdikiKart()) return;               // boş sette çevrilecek kart yok
    durum.cevrik = !durum.cevrik;
    $('#kart').classList.toggle('cevrik', durum.cevrik);
  }

  function git(adim) {
    const yeni = durum.konum + adim;
    if (yeni < 0 || yeni >= durum.sira.length) return;
    durum.konum = yeni;
    kartiCiz();
  }

  function karistir() {
    durum.karisik = !durum.karisik;
    hafizayaYaz('karisik-' + durum.set.id, durum.karisik);
    siraOlustur();
    durum.konum = 0;
    kartiCiz();
    seceneklerinGorunumu();
  }

  function tersCevir() {
    durum.tersYuz = !durum.tersYuz;
    hafizayaYaz('tersYuz', durum.tersYuz);
    kartiCiz();
    seceneklerinGorunumu();
  }

  function seceneklerinGorunumu() {
    $('#karistir').setAttribute('aria-pressed', String(durum.karisik));
    $('#ters').setAttribute('aria-pressed', String(durum.tersYuz));
    $('#ters-yazi').textContent = durum.tersYuz ? 'Önce: arka yüz (anlam)' : 'Önce: ön yüz (kelime)';
  }

  // Kartın ön yüzündeki kelimeyi (İngilizce) sesli okur.
  function seslendir() {
    const kart = simdikiKart();
    if (!kart || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const konusma = new SpeechSynthesisUtterance(kart.on);
    konusma.lang = 'en-US';
    konusma.rate = 0.9;
    speechSynthesis.speak(konusma);
  }

  // Veri değişince (bu cihazda ya da başka cihazdan) ekranı yeniler.
  // Set sayfasındaysak: çalışılan kart ve (karışık) sıra korunur; yeni kartlar sıranın sonuna eklenir,
  // silinenler sıradan çıkar. Bir pencere açıkken ekrana dokunulmaz, pencere kapanınca yenilenir.
  let yenilemeBekliyor = false;
  function ekraniYenile() {
    if (document.querySelector('dialog[open]')) { yenilemeBekliyor = true; return; }
    yenilemeBekliyor = false;
    if (!durum.set) {
      if (!$('#ana').hidden) anaSayfayiGoster();
      return;
    }
    const eski = durum.set;
    const set = setBul(eski.id);
    if (!set) {                              // set silinmiş (belki başka cihazdan)
      bildir('Bu set silindi.');
      location.hash = '';
      return;
    }
    const kart = simdikiKart();
    const kartId = kart ? kart.id : null;
    const cevrikti = durum.cevrik;
    const yeniYer = {};
    set.kartlar.forEach((k, i) => { yeniYer[k.id] = i; });
    const sira = durum.sira
      .map((i) => eski.kartlar[i] && eski.kartlar[i].id)
      .filter((id) => id in yeniYer)
      .map((id) => yeniYer[id]);
    const sirada = new Set(sira);
    set.kartlar.forEach((k, i) => { if (!sirada.has(i)) sira.push(i); });
    durum.set = set;
    durum.sira = sira;
    const yer = kartId && kartId in yeniYer ? sira.indexOf(yeniYer[kartId]) : -1;
    durum.konum = yer >= 0 ? yer : Math.min(durum.konum, Math.max(sira.length - 1, 0));
    setSayfasiniYenile();
    if (cevrikti && yer >= 0) {              // aynı karttaysak çevrik hali bozulmasın
      $('#kart').classList.add('anisiz', 'cevrik');
      durum.cevrik = true;
      void $('#kart').offsetWidth;
      $('#kart').classList.remove('anisiz');
    }
  }
  const kartlarDegisti = ekraniYenile;

  // ---------- PENCERELER ----------
  // Soru penceresi: düğmelerden birine basılınca o düğmenin değerini döndürür (iptal: null).
  function sor(baslik, metin, secenekler) {
    return new Promise((coz) => {
      const p = $('#soru-pencere');
      $('#sp-baslik').textContent = baslik;
      $('#sp-metin').textContent = metin || '';
      $('#sp-metin').hidden = !metin;
      const kutu = $('#sp-dugmeler');
      kutu.innerHTML = '';
      secenekler.concat([{ yazi: 'Vazgeç', deger: null }]).forEach((s) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'secenek' + (s.tehlike ? ' tehlike' : '') + (s.vurgulu ? ' vurgulu' : '');
        b.textContent = s.yazi;
        b.addEventListener('click', () => { p.close(); coz(s.deger); });
        kutu.append(b);
      });
      // Geri tuşu / Esc ile kapatma = vazgeç. ('close' değil 'cancel' dinlenir; çünkü bir önceki
      // pencerenin gecikmeli 'close' sinyali yeni açılan soruyu yanlışlıkla iptal ediyordu.)
      p.oncancel = () => coz(null);
      p.showModal();
    });
  }

  // Kelime ekle/düzenle penceresi. kartNo null ise yeni kelime eklenir.
  // Pencere numara değil kimlik tutar; pencere açıkken başka cihazdan değişiklik gelse de doğru kart düzenlenir.
  let kp = null; // { setId, setAd, kartId (yeni kelimede null), sonra }
  function kelimePenceresi(set, kartNo, sonra) {
    const yeni = kartNo === null;
    const kart = yeni ? null : set.kartlar[kartNo];
    kp = { setId: set.id, setAd: set.ad, kartId: kart ? kart.id : null, sonra };
    $('#kp-baslik').textContent = yeni ? 'Kelime ekle · ' + set.ad : 'Kelimeyi düzenle · ' + set.ad;
    $('#k-on').value = yeni ? '' : kart.on;
    $('#k-arka').value = yeni ? '' : kart.arka;
    $('#kp-sil').hidden = yeni;
    $('#kp-yeni').hidden = !yeni;
    onerileriTemizle();
    $('#kelime-pencere').showModal();
    $('#k-on').focus();
  }

  // Penceredeki kelimeyi kaydeder. Başarılıysa true döner.
  function kelimeyiKaydet() {
    const on = $('#k-on').value.trim();
    const arka = $('#k-arka').value.trim();
    if (!on && !arka) { bildir('İki alan da boş.'); $('#k-on').focus(); return false; }
    const kart = { on: on || '(kelime yok)', arka: arka || '(çeviri yok)' };
    const { setId, kartId, sonra } = kp;
    if (!depo.setler[setId] || depo.setler[setId].silindi) {
      bildir('Bu set silinmiş, kelime kaydedilemedi.');
      return false;
    }
    if (kartId === null) {
      // sira = şimdiki zaman: yeni kart setin sonuna gelir
      kayitlariYaz([['kartlar', yeniId(), { set: setId, on: kart.on, arka: kart.arka, sira: Date.now(), silindi: false }]]);
    } else {
      kayitlariYaz([['kartlar', kartId, { on: kart.on, arka: kart.arka }]]);
    }
    if (sonra) sonra();
    bildir(kartId === null ? 'Eklendi: ' + kart.on : 'Kaydedildi.');
    return true;
  }

  async function kelimeyiSil() {
    const { kartId, sonra } = kp;
    const kart = depo.kartlar[kartId];
    $('#kelime-pencere').close();
    if (!kart) return;
    const cevap = await sor('Kelime silinsin mi?', kart.on + ' — ' + kart.arka,
      [{ yazi: 'Sil', deger: 'sil', tehlike: true }]);
    if (cevap !== 'sil') return;
    kayitlariYaz([['kartlar', kartId, { silindi: true }]]);
    if (sonra) sonra();
    bildir('Silindi.');
  }

  // ---------- Sözlük önerisi (MyMemory, ücretsiz, anahtar gerektirmez) ----------
  function onerileriTemizle() {
    $('#oneriler').innerHTML = '';
    $('#oneri-durum').textContent = '';
  }

  function htmlCoz(metin) {
    const t = document.createElement('textarea');
    t.innerHTML = metin;
    return t.value;
  }

  async function oneriGetir() {
    const on = $('#k-on').value.trim();
    const arka = $('#k-arka').value.trim();
    let metin, cift, hedef;
    if (on) { metin = on; cift = 'en|tr'; hedef = $('#k-arka'); }
    else if (arka) { metin = arka; cift = 'tr|en'; hedef = $('#k-on'); }
    else { bildir('Önce bir kelime yazın.'); return; }

    onerileriTemizle();
    $('#oneri-durum').textContent = 'Aranıyor...';
    $('#oner').disabled = true;
    try {
      const adres = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(metin) +
        '&langpair=' + encodeURIComponent(cift);
      const yanit = await fetch(adres);
      const veri = await yanit.json();
      const adaylar = [veri.responseData && veri.responseData.translatedText]
        .concat((veri.matches || []).map((m) => m.translation));
      const gorulen = new Set([sadelestir(metin)]);
      const oneriler = [];
      adaylar.forEach((a) => {
        if (!a) return;
        a = htmlCoz(String(a)).trim();
        if (!a || /MYMEMORY|QUERY LENGTH|INVALID/i.test(a)) return;
        const anahtar = sadelestir(a).replace(/[.!?]+$/, '');
        if (gorulen.has(anahtar)) return;
        gorulen.add(anahtar);
        oneriler.push(a);
      });
      if (oneriler.length === 0) {
        $('#oneri-durum').textContent = 'Öneri bulunamadı.';
        return;
      }
      $('#oneri-durum').textContent = 'Eklemek için dokunun:';
      oneriler.slice(0, 6).forEach((o) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = o;
        b.addEventListener('click', () => {
          const simdiki = hedef.value.trim();
          if (!simdiki) hedef.value = o;
          else if (!sadelestir(simdiki).includes(sadelestir(o))) hedef.value = simdiki + ', ' + o;
          b.disabled = true;
        });
        $('#oneriler').append(b);
      });
    } catch (e) {
      $('#oneri-durum').textContent = navigator.onLine === false
        ? 'İnternet yok, öneri alınamadı.'
        : 'Öneri servisine ulaşılamadı.';
    } finally {
      $('#oner').disabled = false;
    }
  }

  // ---------- Set işlemleri ----------
  let adPenceresiSonra = null;
  function adPenceresi(baslik, ilkDeger, sonra) {
    $('#ap-baslik').textContent = baslik;
    $('#set-adi').value = ilkDeger || '';
    adPenceresiSonra = sonra;
    $('#ad-pencere').showModal();
    $('#set-adi').focus();
  }

  function adKaydet() {
    const ad = $('#set-adi').value.trim();
    if (!ad) { bildir('Set adı boş olamaz.'); $('#set-adi').focus(); return; }
    $('#ad-pencere').close();
    if (adPenceresiSonra) adPenceresiSonra(ad);
  }

  function yeniSet() {
    adPenceresi('Yeni set', '', (ad) => {
      const id = yeniId();
      // sira = eksi zaman: yeni set listenin başında görünsün
      kayitlariYaz([['setler', id, { ad, sira: -Date.now(), silindi: false }]]);
      location.hash = '#set/' + id;
      setTimeout(() => { const set = setBul(id); if (set) kelimePenceresi(set, null, kartlarDegisti); }, 50);
    });
  }

  function setiYenidenAdlandir() {
    const id = durum.set.id;
    adPenceresi('Set adını değiştir', durum.set.ad, (ad) => {
      kayitlariYaz([['setler', id, { ad }]]);
      ekraniYenile();
    });
  }

  async function setiSil() {
    const set = durum.set;
    const cevap = await sor('"' + set.ad + '" silinsin mi?',
      'İçindeki ' + set.kartlar.length + ' kelime de silinir. Eşitleme açıksa bütün cihazlardan silinir. ' +
      'Bu geri alınamaz (yedeğiniz yoksa).',
      [{ yazi: 'Seti sil', deger: 'sil', tehlike: true }]);
    if (cevap !== 'sil') return;
    kayitlariYaz([['setler', set.id, { silindi: true }]].concat(
      set.kartlar.map((k) => ['kartlar', k.id, { silindi: true }])));
    hafizadanSil('konum-' + set.id);
    hafizadanSil('karisik-' + set.id);
    location.hash = '';
    bildir('Set silindi.');
  }

  // ---------- Yedek (dosyaya indir / dosyadan yükle) ----------
  function yedegiIndir() {
    const veri = {
      uygulama: 'kelime-kartlari',
      surum: 2,
      tarih: new Date().toISOString(),
      setler: SETLER.map((s) => ({ ad: s.ad, kartlar: s.kartlar.map((k) => ({ on: k.on, arka: k.arka })) }))
    };
    const blob = new Blob([JSON.stringify(veri, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kelime-yedek-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    bildir('Yedek indirildi: ' + a.download);
  }

  // Dosyadaki yazıyı set listesine çevirir. Bozuksa hata fırlatır.
  function yedegiCoz(metin) {
    const veri = JSON.parse(metin);
    const ham = Array.isArray(veri) ? veri : veri && veri.setler;
    if (!Array.isArray(ham)) throw new Error('Bu dosya kelime yedeği değil.');
    return ham.map((s) => {
      if (!s || typeof s.ad !== 'string' || !Array.isArray(s.kartlar)) throw new Error('Set biçimi bozuk.');
      return {
        ad: s.ad,
        kartlar: s.kartlar
          .filter((k) => k && (k.on || k.arka))
          .map((k) => ({ on: String(k.on || '(kelime yok)'), arka: String(k.arka || '(çeviri yok)') }))
      };
    });
  }

  async function yedekDosyasiSecildi() {
    const dosya = $('#yedek-dosya').files[0];
    $('#yedek-dosya').value = '';
    if (!dosya) return;
    let yeniSetler;
    try {
      yeniSetler = yedegiCoz(await dosya.text());
    } catch (e) {
      bildir('Dosya okunamadı: ' + e.message);
      return;
    }
    const kelime = yeniSetler.reduce((t, s) => t + s.kartlar.length, 0);
    const secenekler = [{ yazi: 'Mevcutların yanına ekle', deger: 'ekle', vurgulu: true }];
    if (SETLER.length) secenekler.push({ yazi: 'Hepsinin yerine geçsin', deger: 'degistir', tehlike: true });
    const cevap = await sor('Yedek yüklensin mi?',
      dosya.name + ': ' + yeniSetler.length + ' set, ' + kelime + ' kelime.' +
      (SETLER.length ? ' Şu an ' + SETLER.length + ' set var.' : ''), secenekler);
    if (!cevap) return;
    const liste = [];
    if (cevap === 'degistir') {               // var olanların hepsi silindi olarak işaretlenir
      SETLER.forEach((s) => {
        liste.push(['setler', s.id, { silindi: true }]);
        s.kartlar.forEach((k) => liste.push(['kartlar', k.id, { silindi: true }]));
      });
    }
    const enSonSira = cevap === 'ekle' && SETLER.length ? Math.max(...SETLER.map((s) => s.sira)) + 1 : 0;
    yeniSetler.forEach((s, i) => {
      const sid = yeniId();
      liste.push(['setler', sid, { ad: s.ad, sira: enSonSira + i, silindi: false }]);
      s.kartlar.forEach((k, j) => {
        liste.push(['kartlar', sid + '-' + j, { set: sid, on: k.on, arka: k.arka, sira: j, silindi: false }]);
      });
    });
    if (kayitlariYaz(liste)) bildir(yeniSetler.length + ' set, ' + kelime + ' kelime yüklendi.');
    location.hash = '';
    anaSayfayiGoster();
  }

  // ---------- Eşitleme (bulut) ----------
  // Buluta bağlanan kısım ayrı bir dosyada (esitleme.js) ve sadece internetten (http/https) açılınca,
  // Firebase ayarı (firebase-ayar.js) da varsa yüklenir. O dosya bu uygulamayla aşağıdaki
  // window.KK fonksiyonları üzerinden konuşur.
  const IMLEC = 'esitlemeImlec';   // { uid, setler: ms, kartlar: ms }  -> buluttan en son nereye kadar okundu
  const esitleme = { durum: 'kapali', eposta: null, hata: null, motor: null };

  function esitlemeyiDurt() {
    if (esitleme.motor && esitleme.motor.durt) esitleme.motor.durt();
  }

  const DURUM_YAZISI = {
    kurulmadi: 'Eşitleme henüz kurulmadı',
    dosya: 'Eşitleme sadece internetteki adreste çalışır',
    kapali: 'Eşitleme kapalı (giriş yapılmadı)',
    baglaniyor: 'Buluta bağlanıyor...',
    gonderiyor: 'Değişiklikler gönderiliyor...',
    acik: 'Eşitlendi',
    cevrimdisi: 'İnternet yok; değişiklikler bağlantı gelince gönderilecek',
    hata: 'Eşitleme hatası'
  };

  function esitlemeDurumu(yeni, eposta, hata) {
    esitleme.durum = yeni;
    if (eposta !== undefined) esitleme.eposta = eposta;
    esitleme.hata = hata || null;
    const b = $('#bulut');
    b.dataset.durum = yeni;
    const yazi = DURUM_YAZISI[yeni] + (esitleme.eposta && yeni !== 'kapali' ? ' · ' + esitleme.eposta : '');
    b.title = yazi;
    b.setAttribute('aria-label', yazi);
  }

  function imlecAl(tur) {
    const i = hafizadanOku(IMLEC, {});
    return Number(i[tur]) || 0;
  }
  function imlecYaz(tur, ms) {
    const i = hafizadanOku(IMLEC, {});
    if (ms > (Number(i[tur]) || 0)) { i[tur] = ms; hafizayaYaz(IMLEC, i); }
  }
  // Bu cihazda ilk kez (ya da başka bir hesapla) giriş yapılınca: bütün kayıtlar gönderilecekler
  // listesine girer (iki taraftakiler birleşir, hiçbiri silinmez) ve buluttan baştan okunur.
  function kullaniciKontrol(uid) {
    const i = hafizadanOku(IMLEC, {});
    if (i.uid === uid) return;
    ['setler', 'kartlar'].forEach((tur) => {
      Object.keys(depo[tur]).forEach((id) => {
        if (bekleyen[tur + '/' + id] === undefined) bekleyen[tur + '/' + id] = depo[tur][id].g;
      });
    });
    hafizayaYaz(IMLEC, { uid, setler: 0, kartlar: 0 });
    depoyuKaydet();
  }

  // Buluttan gelen kayıtları uygular: kayitlar = [{ tur, id, veri }]. Bizdeki daha yeniyse dokunmaz.
  function uzaktanGeldi(kayitlar) {
    let degisti = false;
    kayitlar.forEach(({ tur, id, veri }) => {
      if (tur !== 'setler' && tur !== 'kartlar') return;
      const g = Number(veri && veri.g) || 0;
      const yerel = depo[tur][id];
      if (yerel && yerel.g >= g) return;
      depo[tur][id] = tur === 'setler'
        ? { ad: String(veri.ad || ''), sira: Number(veri.sira) || 0, g, silindi: !!veri.silindi }
        : { set: String(veri.set || ''), on: String(veri.on || ''), arka: String(veri.arka || ''),
            sira: Number(veri.sira) || 0, g, silindi: !!veri.silindi };
      const anahtar = tur + '/' + id;
      if (bekleyen[anahtar] !== undefined && bekleyen[anahtar] <= g) delete bekleyen[anahtar];
      if (g > sonZaman) sonZaman = g;
      degisti = true;
    });
    if (degisti) {
      depoyuKaydet();
      gorunumuKur();
      ekraniYenile();
    }
    return degisti;
  }

  // Gönderilecek kayıtlardan en fazla 'adet' tanesini verir.
  function bekleyenleriAl(adet) {
    return Object.keys(bekleyen).slice(0, adet).map((anahtar) => {
      const [tur, id] = anahtar.split('/');
      return { tur, id, veri: Object.assign({}, depo[tur][id]) };
    }).filter((k) => k.veri && k.veri.g);
  }
  // Bulut kayıtları aldı: o arada yeniden değişmemiş olanlar listeden çıkar.
  function gonderildi(paket) {
    paket.forEach(({ tur, id, veri }) => {
      const anahtar = tur + '/' + id;
      if (bekleyen[anahtar] === veri.g) delete bekleyen[anahtar];
    });
    hafizayaYaz(BEKLEYEN, bekleyen);
  }

  window.KK = {
    uzaktanGeldi, bekleyenleriAl, gonderildi, esitlemeDurumu, imlecAl, imlecYaz, kullaniciKontrol,
    bekleyenSayisi: () => Object.keys(bekleyen).length
  };

  async function esitlemeyiYukle() {
    if (esitleme.motor) return;
    if (!window.FIREBASE_AYAR) { esitlemeDurumu('kurulmadi'); return; }
    if (!location.protocol.startsWith('http')) { esitlemeDurumu('dosya'); return; }
    esitlemeDurumu('baglaniyor');
    try {
      const motor = await import(window.ESITLEME_MODULU || './esitleme.js');
      await motor.baslat(window.FIREBASE_AYAR, window.KK);
      esitleme.motor = motor;
    } catch (e) {
      // Çoğunlukla internet yokken olur: bağlantı gelince yeniden dene.
      esitlemeDurumu(navigator.onLine === false ? 'cevrimdisi' : 'hata', undefined, String(e && (e.code || e.message)));
      window.addEventListener('online', esitlemeyiYukle, { once: true });
    }
  }

  async function esitlemePenceresi() {
    const d = esitleme.durum;
    if (d === 'kurulmadi' || d === 'dosya') {
      await sor('Eşitleme', DURUM_YAZISI[d] + '.', []);
      return;
    }
    if (!esitleme.motor) {
      const c = await sor('Eşitleme', DURUM_YAZISI[d] + (esitleme.hata ? ' (' + esitleme.hata + ')' : '') + '.',
        [{ yazi: 'Yeniden dene', deger: 'dene', vurgulu: true }]);
      if (c === 'dene') esitlemeyiYukle();
      return;
    }
    const bilgi = esitleme.motor.bilgi();
    if (!bilgi.girisli) {
      const c = await sor('Eşitleme kapalı',
        'Google hesabınızla giriş yapınca kelimeleriniz bütün cihazlarınızda aynı olur. ' +
        'Bu cihazdaki kelimeler buluttakilerle birleşir, hiçbiri silinmez.',
        [{ yazi: 'Google ile giriş yap', deger: 'giris', vurgulu: true }]);
      if (c === 'giris') {
        try { await esitleme.motor.girisYap(); }
        catch (e) { bildir('Giriş yapılamadı: ' + (e.code || e.message)); }
      }
      return;
    }
    const n = Object.keys(bekleyen).length;
    const c = await sor('Eşitleme açık',
      bilgi.eposta + '\n' + DURUM_YAZISI[d] + (esitleme.hata ? ' (' + esitleme.hata + ')' : '') + '. ' +
      (n ? 'Gönderilmeyi bekleyen değişiklik: ' + n + '.' : 'Bekleyen değişiklik yok.'),
      [{ yazi: 'Şimdi eşitle', deger: 'simdi', vurgulu: true }, { yazi: 'Çıkış yap', deger: 'cikis' }]);
    if (c === 'simdi') esitlemeyiDurt();
    else if (c === 'cikis') {
      await esitleme.motor.cikisYap();
      bildir('Çıkış yapıldı. Kelimeler bu cihazda kaldı.');
    }
  }

  // ---------- Menü (sağ üstteki ⋯) ----------
  async function menuyuAc() {
    let secenekler;
    if (durum.set) {
      secenekler = [
        { yazi: '+ Kelime ekle', deger: 'ekle' },
        { yazi: 'Set adını değiştir', deger: 'adlandir' },
        { yazi: 'Seti sil', deger: 'sil', tehlike: true }
      ];
    } else {
      secenekler = [
        { yazi: '+ Yeni set', deger: 'yeni' },
        { yazi: 'Eşitleme (Google hesabı)', deger: 'esitleme' },
        { yazi: 'Yedeği indir (dosya)', deger: 'indir' },
        { yazi: 'Yedekten yükle', deger: 'yukle' }
      ];
    }
    const secim = await sor('Menü', durum.set ? durum.set.ad : 'Yedek dosyası, kelimelerinizi başka cihaza taşımak ve kaybolmasını önlemek içindir.', secenekler);
    if (secim === 'ekle') kelimePenceresi(durum.set, null, kartlarDegisti);
    else if (secim === 'adlandir') setiYenidenAdlandir();
    else if (secim === 'sil') setiSil();
    else if (secim === 'yeni') yeniSet();
    else if (secim === 'esitleme') esitlemePenceresi();
    else if (secim === 'indir') yedegiIndir();
    else if (secim === 'yukle') $('#yedek-dosya').click();
  }

  // ---------- Sayfa yönlendirme (#set/abc123 gibi adresler) ----------
  function adresiIsle() {
    const eslesme = location.hash.match(/^#set\/([\w-]+)$/);
    if (eslesme) setiAc(eslesme[1]);
    else anaSayfayiGoster();
  }

  // ---------- Olaylar (tıklama, tuş, kaydırma) ----------
  $('#geri').addEventListener('click', () => { location.hash = ''; });
  $('#menu').addEventListener('click', menuyuAc);
  $('#arama').addEventListener('input', aramaYap);
  $('#yeni-set').addEventListener('click', yeniSet);
  $('#kelime-ekle').addEventListener('click', () => kelimePenceresi(durum.set, null, kartlarDegisti));
  $('#kart').addEventListener('click', cevir);
  $('#onceki').addEventListener('click', () => git(-1));
  $('#sonraki').addEventListener('click', () => git(1));
  $('#karistir').addEventListener('click', karistir);
  $('#ters').addEventListener('click', tersCevir);
  $('#seslendir').addEventListener('click', seslendir);

  $('#kp-kaydet').addEventListener('click', () => { if (kelimeyiKaydet()) $('#kelime-pencere').close(); });
  $('#kp-yeni').addEventListener('click', () => {
    if (!kelimeyiKaydet()) return;
    kp.kartId = null;          // aynı sete bir sonraki kelime
    $('#k-on').value = '';
    $('#k-arka').value = '';
    onerileriTemizle();
    $('#k-on').focus();
  });
  $('#kp-sil').addEventListener('click', kelimeyiSil);
  $('#oner').addEventListener('click', oneriGetir);
  // İngilizce alanında Enter: Türkçe alanına geç
  $('#k-on').addEventListener('keydown', (o) => {
    if (o.key === 'Enter') { o.preventDefault(); $('#k-arka').focus(); }
  });
  $('#ap-tamam').addEventListener('click', adKaydet);
  $('#set-adi').addEventListener('keydown', (o) => {
    if (o.key === 'Enter') { o.preventDefault(); adKaydet(); }
  });
  $('#yedek-dosya').addEventListener('change', yedekDosyasiSecildi);

  document.addEventListener('keydown', (olay) => {
    if (!durum.set) return;
    if (document.querySelector('dialog[open]')) return;   // pencere açıkken kartlar tuşlara tepki vermesin
    if (olay.target.tagName === 'INPUT' || olay.target.tagName === 'TEXTAREA') return;
    // Boşluk her zaman kartı çevirir (Quizlet'teki gibi). Enter bir düğmedeyse o düğmeye basar.
    if (olay.key === 'Enter' && olay.target.tagName === 'BUTTON') return;
    if (olay.key === ' ' || olay.key === 'Enter' || olay.key === 'ArrowUp' || olay.key === 'ArrowDown') {
      olay.preventDefault();
      cevir();
    } else if (olay.key === 'ArrowLeft') {
      git(-1);
    } else if (olay.key === 'ArrowRight') {
      git(1);
    } else if (olay.key === 'Escape') {
      location.hash = '';
    }
  });

  // Telefonda kartı sola/sağa kaydırınca kart değişir.
  let dokunmaX = null;
  $('#kart').addEventListener('touchstart', (o) => { dokunmaX = o.touches[0].clientX; }, { passive: true });
  $('#kart').addEventListener('touchend', (o) => {
    if (dokunmaX === null) return;
    const fark = o.changedTouches[0].clientX - dokunmaX;
    dokunmaX = null;
    if (Math.abs(fark) > 50) {
      o.preventDefault(); // kaydırma tıklama sayılıp kartı çevirmesin
      git(fark < 0 ? 1 : -1);
    }
  });

  // Pencere kapanınca, açıkken gelen değişiklikleri ekrana yansıt.
  document.querySelectorAll('dialog').forEach((p) => {
    p.addEventListener('close', () => { if (yenilemeBekliyor) setTimeout(ekraniYenile, 0); });
  });
  $('#bulut').addEventListener('click', esitlemePenceresi);

  window.addEventListener('hashchange', adresiIsle);
  adresiIsle();
  esitlemeyiYukle();
})();

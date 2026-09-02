// ============================================================
// ADMIN SHARED LOGIC
// Dipakai di timeline.html, present.html, gallery.html, log-devs.html
// ============================================================

const ADMIN_SESSION_KEY = 'devs_admin_session'; // flag UI lokal saja ('true'/absen) — bukan sumber otorisasi sesungguhnya
const ADMIN_CLICK_THRESHOLD = 5;
const ADMIN_CLICK_WINDOW_MS = 2000;
const REACTION_STORAGE_KEY = 'devs_reactions'; // { [entryKey]: 'like' | 'dislike' } — mencegah spam klik dari browser yang sama

let _adminClickCount = 0;
let _adminClickTimer = null;
let _authPersistenceReady = false;

// Dipanggil di SETIAP halaman saat admin-shared.js dimuat -- bukan cuma saat
// submit PIN -- supaya Firebase Auth SDK di halaman ini (yang selalu instance
// BARU karena situs ini multi-halaman, bukan SPA) tahu untuk memulihkan sesi
// yang tersimpan. Pakai Persistence.LOCAL (bukan SESSION) karena SESSION
// terbukti tidak cukup andal untuk situs multi-halaman ini -- LOCAL adalah
// mode paling teruji di Firebase, dirancang khusus untuk bertahan lintas
// reload/navigasi halaman, bahkan lintas restart browser. Konsekuensinya:
// sesi admin bertahan sampai logout manual (klik nama 5x), bukan otomatis
// hilang saat tab ditutup -- trade-off yang wajar untuk situs pribadi.
//
// Dibungkus try/catch GANDA (synchronous DAN promise) supaya kalaupun gagal
// karena alasan apa pun, TIDAK merambat merusak sisa file ini seperti
// insiden crash yang pernah terjadi ketika kode serupa pernah ditaruh di
// top-level tanpa pengaman sebelumnya.
try {
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => { _authPersistenceReady = true; })
        .catch((err) => {
            console.error('Gagal set auth persistence di awal halaman (lanjut tanpa ini):', err);
        });
} catch (err) {
    console.error('Gagal memanggil setPersistence secara synchronous (lanjut tanpa ini):', err);
}

// ---------- Hashing (Web Crypto, native browser, tanpa library) ----------
async function sha256Hex(text) {
    const encoded = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Admin toggle: klik 5x -> buka popup PIN ----------
function setupAdminToggle(triggerElementId) {
    const trigger = document.getElementById(triggerElementId);
    if (!trigger) return;

    trigger.style.cursor = 'default';
    trigger.addEventListener('click', () => {
        _adminClickCount++;

        if (_adminClickTimer) clearTimeout(_adminClickTimer);
        _adminClickTimer = setTimeout(() => { _adminClickCount = 0; }, ADMIN_CLICK_WINDOW_MS);

        if (_adminClickCount >= ADMIN_CLICK_THRESHOLD) {
            _adminClickCount = 0;
            clearTimeout(_adminClickTimer);
            if (isAdminMode()) {
                // Sudah login -> klik 5x lagi untuk logout
                logoutAdmin();
            } else {
                openPinModal();
            }
        }
    });
}

function isAdminMode() {
    return localStorage.getItem(ADMIN_SESSION_KEY) === 'true';
}

function logoutAdmin() {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    firebase.auth().signOut().catch((err) => console.error('Gagal sign out:', err));
    showAdminToast('Admin mode nonaktif');
    setTimeout(() => window.location.reload(), 500);
}

// ---------- PIN modal (dibuat dinamis lewat JS supaya tidak perlu diulang di tiap file HTML) ----------
function ensurePinModalExists() {
    if (document.getElementById('pin-modal')) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
        <div id="pin-modal" class="pin-modal-overlay">
            <div class="pin-modal-card">
                <p class="pin-modal-label">Masukkan PIN admin</p>
                <input id="pin-input" autocomplete="off" class="pin-modal-input" inputmode="numeric" maxlength="12" type="password"/>
                <p id="pin-error" class="pin-modal-error"></p>
                <div class="pin-modal-actions">
                    <button id="pin-cancel" type="button">Batal</button>
                    <button id="pin-confirm" type="button">Masuk</button>
                </div>
            </div>
        </div>
    `.trim();
    document.body.appendChild(wrapper.firstChild);

    const style = document.createElement('style');
    style.textContent = `
        .pin-modal-overlay {
            position: fixed; inset: 0;
            background: rgba(26, 27, 34, 0.4);
            backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            z-index: 200; opacity: 0; pointer-events: none;
            transition: opacity 0.25s ease;
            padding: 24px;
        }
        .pin-modal-overlay.is-open { opacity: 1; pointer-events: auto; }
        .pin-modal-card {
            background: #ffffff; border-radius: 12px;
            width: 100%; max-width: 280px; padding: 24px;
            box-shadow: 0 20px 60px rgba(26, 27, 34, 0.18);
            transform: translateY(10px) scale(0.97); opacity: 0;
            transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.25s ease;
            text-align: center;
        }
        .pin-modal-overlay.is-open .pin-modal-card { transform: translateY(0) scale(1); opacity: 1; }
        .pin-modal-label {
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase;
            color: #77767b; margin-bottom: 14px;
        }
        .pin-modal-input {
            width: 100%; text-align: center;
            font-family: 'JetBrains Mono', monospace;
            font-size: 22px; letter-spacing: 0.3em;
            border: 1px solid #e3e1ec; border-radius: 8px;
            padding: 10px 12px; color: #1a1b22;
            transition: border-color 0.2s ease;
        }
        .pin-modal-input:focus { outline: none; border-color: #1a1b22; }
        .pin-modal-error {
            font-family: 'Geist', sans-serif; font-size: 12.5px;
            color: #ba1a1a; min-height: 16px; margin-top: 8px; opacity: 0;
            transition: opacity 0.2s ease;
        }
        .pin-modal-error.is-visible { opacity: 1; }
        .pin-modal-actions { display: flex; gap: 8px; margin-top: 16px; }
        .pin-modal-actions button {
            flex: 1; padding: 8px 0; border-radius: 8px;
            font-family: 'Geist', sans-serif; font-size: 14px;
            transition: background-color 0.2s ease, color 0.2s ease;
        }
        #pin-cancel { color: #77767b; }
        #pin-cancel:hover { background-color: #f4f2fd; }
        #pin-confirm { background-color: #1a1b22; color: #fff; }
        #pin-confirm:hover { background-color: #4b41e1; }
    `;
    document.head.appendChild(style);

    document.getElementById('pin-cancel').addEventListener('click', closePinModal);
    document.getElementById('pin-modal').addEventListener('click', (e) => {
        if (e.target.id === 'pin-modal') closePinModal();
    });
    document.getElementById('pin-confirm').addEventListener('click', submitPin);
    document.getElementById('pin-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitPin();
    });
}

function openPinModal() {
    ensurePinModalExists();
    const modal = document.getElementById('pin-modal');
    const input = document.getElementById('pin-input');
    const error = document.getElementById('pin-error');
    input.value = '';
    error.textContent = '';
    error.classList.remove('is-visible');
    modal.classList.add('is-open');
    setTimeout(() => input.focus(), 150);
}

function closePinModal() {
    const modal = document.getElementById('pin-modal');
    if (modal) modal.classList.remove('is-open');
}

async function ensureAnonSignIn() {
    if (!_authPersistenceReady) {
        // Dipanggil hanya di sini (saat admin benar-benar submit PIN), bukan di
        // level teratas file, supaya pengunjung biasa tidak pernah menyentuh
        // baris ini sama sekali. Dibungkus try/catch async (bukan .catch()
        // pada promise) supaya error apa pun -- termasuk yang synchronous --
        // tertangkap dan tidak merambat merusak sisa alur PIN.
        console.log('[PIN] Set auth persistence...');
        try {
            await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
            console.log('[PIN] Auth persistence berhasil di-set.');
        } catch (err) {
            console.error('[PIN] Gagal set auth persistence (lanjut tanpa ini):', err);
        }
        _authPersistenceReady = true;
    }

    if (firebase.auth().currentUser) {
        console.log('[PIN] Sudah ada sesi anonim, uid:', firebase.auth().currentUser.uid);
        return firebase.auth().currentUser;
    }
    console.log('[PIN] Memanggil signInAnonymously()...');
    const cred = await firebase.auth().signInAnonymously();
    console.log('[PIN] signInAnonymously() selesai, uid:', cred.user.uid);
    return cred.user;
}

const PIN_VERIFY_TIMEOUT_MS = 12000;

/**
 * Membungkus sebuah promise dengan batas waktu. Kalau promise tidak
 * resolve/reject dalam waktu ms milidetik, race ini akan reject duluan
 * dengan error yang bisa dibedakan (err.code === 'client-timeout').
 * Ini mencegah alur PIN menggantung selamanya tanpa pesan apa pun kalau
 * network call ke Firebase Auth/Firestore tidak pernah direspons (misal
 * karena browser tidak punya akses internet asli, bukan cuma internet
 * lokal ke server Python di Termux).
 */
function withTimeout(promise, ms, timeoutMessage) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            const err = new Error(timeoutMessage);
            err.code = 'client-timeout';
            reject(err);
        }, ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function submitPin() {
    const input = document.getElementById('pin-input');
    const error = document.getElementById('pin-error');
    const confirmBtn = document.getElementById('pin-confirm');
    const pin = input.value.trim();

    if (!pin) return;

    // Cegah klik ganda dan beri feedback visual bahwa proses sedang berjalan —
    // tanpa ini, delay jaringan (bahkan 1-2 detik) terasa seperti "tidak ada
    // respon sama sekali" padahal sebenarnya sedang menunggu Firestore/Auth.
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Memverifikasi...';
    error.textContent = '';
    error.classList.remove('is-visible');

    console.log('[PIN] === Mulai submitPin() ===');

    try {
        await withTimeout((async () => {
            console.log('[PIN] Menghitung hash SHA-256...');
            const hash = await sha256Hex(pin);
            console.log('[PIN] Hash selesai dihitung (panjang):', hash.length);

            const user = await ensureAnonSignIn();

            console.log('[PIN] Menulis ke Firestore verified_admins/' + user.uid + '...');
            // Verifikasi dilakukan lewat WRITE, bukan read+compare di klien.
            // config/admin (berisi pinHash asli) tidak pernah bisa dibaca dari klien
            // (lihat firestore.rules). Klien mencoba membuat dokumen
            // verified_admins/{uid miliknya sendiri} yang menyertakan hash yang
            // dimasukkan user; Firestore rules yang membandingkan hash itu dengan
            // pinHash asli di sisi server. Koleksi verified_admins sendiri TIDAK
            // PERNAH bisa dibaca siapa pun (termasuk pembuatnya), jadi hash ini
            // tidak pernah bocor ke dokumen publik manapun — beda dengan desain
            // sebelumnya yang menempelkan hash ke setiap entry (itu bug, sudah
            // diperbaiki). Jika hash salah, Firestore menolak write ini
            // (permission-denied).
            await db.collection('verified_admins').doc(user.uid).set({
                claimedHash: hash,
                verifiedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('[PIN] Tulis ke Firestore BERHASIL.');
        })(), PIN_VERIFY_TIMEOUT_MS, `Waktu habis setelah ${PIN_VERIFY_TIMEOUT_MS / 1000} detik. Penyebab paling umum: database Firestore belum benar-benar dibuat di Firebase Console (Firestore Database → Create database). Cek juga koneksi internet browser dan config Firebase.`);

        console.log('[PIN] === Verifikasi SUKSES ===');
        // Write berhasil -> hash valid menurut Firestore rules
        localStorage.setItem(ADMIN_SESSION_KEY, 'true');
        confirmBtn.textContent = 'Berhasil!';
        closePinModal();
        showAdminToast('Admin mode aktif');
        setTimeout(() => window.location.reload(), 500);
    } catch (err) {
        console.log('[PIN] === Verifikasi BERHENTI dengan error ===', err);
        if (err.code === 'client-timeout') {
            error.textContent = err.message;
        } else if (err.code === 'permission-denied') {
            error.textContent = 'PIN salah, coba lagi.';
        } else if (err.code === 'auth/admin-restricted-operation' || err.code === 'auth/operation-not-allowed') {
            error.textContent = 'Anonymous Authentication belum diaktifkan di Firebase Console.';
        } else if (err.name === 'TypeError' && String(err.message).includes('subtle')) {
            error.textContent = 'Browser butuh koneksi HTTPS atau alamat localhost untuk fitur ini.';
        } else if (err.code === 'auth/unauthorized-domain') {
            error.textContent = 'Domain ini belum diizinkan di Firebase Console → Authentication → Settings → Authorized domains. Coba akses lewat "localhost", bukan "127.0.0.1" atau alamat IP lain.';
        } else if (err.code && String(err.code).startsWith('auth/')) {
            error.textContent = 'Gagal autentikasi. Cek domain sudah diizinkan di Firebase Console.';
        } else {
            console.error('Gagal verifikasi PIN:', err);
            error.textContent = 'Gagal memverifikasi. Cek koneksi.';
        }
        error.classList.add('is-visible');
        input.value = '';
        input.focus();
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Masuk';
    }
}

function showAdminToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed; bottom: 24px; left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: #1a1b22; color: #ffffff;
        padding: 10px 20px; border-radius: 6px;
        font-family: 'JetBrains Mono', monospace; font-size: 13px; letter-spacing: 0.02em;
        z-index: 9999; opacity: 0;
        transition: opacity 0.3s ease, transform 0.3s ease;
        pointer-events: none;
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 1400);
}

/**
 * Upload file gambar ke Firebase Storage, return download URL.
 * CATATAN: fungsi ini tidak dipakai secara default saat ini karena Storage
 * butuh konfigurasi CORS di level bucket Google Cloud, yang di beberapa kasus
 * mensyaratkan billing/free trial GCP diaktifkan dulu. Dibiarkan di sini
 * kalau suatu saat mau dipakai lagi setelah itu beres. Untuk sekarang, gallery
 * & log devs pakai compressImageToDataUrl() di bawah sebagai gantinya.
 */
async function uploadImageToStorage(file, folder) {
    const filename = `${Date.now()}-${file.name}`;
    const ref = storage.ref().child(`${folder}/${filename}`);
    const snapshot = await ref.put(file);
    return await snapshot.ref.getDownloadURL();
}

// ---------- Kompresi gambar ke Base64, disimpan langsung di dokumen Firestore ----------
// Menghindari kebutuhan Firebase Storage + konfigurasi CORS bucket sama sekali.
// Firestore membatasi ukuran dokumen maksimal 1 MiB (1.048.576 byte) -- target
// di bawah sengaja disetel jauh di bawah itu (700KB untuk data gambar saja)
// supaya masih ada ruang aman untuk field lain di dokumen yang sama (order,
// likes, dislikes, createdAt, dst) plus overhead internal Firestore per field.
const COMPRESS_TARGET_BYTES = 700 * 1024;
// Dicoba dari resolusi terbesar ke terkecil, dan di TIAP resolusi dicoba dari
// kualitas tertinggi ke terendah -- begitu ketemu kombinasi yang muat, langsung
// dipakai (supaya kualitas hasil akhir sebaik mungkin, tidak asal kompres habis).
const COMPRESS_DIMENSION_STEPS = [1600, 1200, 900, 700, 500, 350, 250, 180, 120];
const COMPRESS_QUALITY_STEPS = [0.82, 0.7, 0.55, 0.4, 0.28, 0.18, 0.1];

function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Gagal memuat gambar (file mungkin rusak atau bukan gambar valid).'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Gagal membaca file.'));
        reader.readAsDataURL(file);
    });
}

/**
 * Membaca file sebagai teks mentah (bukan Base64 data URL seperti
 * loadImageFromFile) -- dipakai untuk fitur "detail sheet", di mana admin
 * bisa upload file .html berisi konten custom yang nanti disimpan langsung
 * sebagai string HTML di Firestore, bukan sebagai gambar.
 */
function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Gagal membaca file.'));
        reader.readAsText(file);
    });
}

function drawResizedCanvas(img, maxDimension) {
    let { width, height } = img;
    if (width > height && width > maxDimension) {
        height = Math.round(height * (maxDimension / width));
        width = maxDimension;
    } else if (height >= width && height > maxDimension) {
        width = Math.round(width * (maxDimension / height));
        height = maxDimension;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    // Latar putih dulu -- supaya PNG transparan tidak berubah jadi hitam
    // saat dikonversi ke JPEG (JPEG tidak mendukung transparansi).
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
}

/**
 * Mengompres file gambar jadi Base64 data URL yang DIJAMIN berada di bawah
 * COMPRESS_TARGET_BYTES, seberapa pun besar/kompleks gambar aslinya -- tidak
 * pernah menolak gambar karena "terlalu besar", selalu otomatis menurunkan
 * resolusi dan kualitas sampai muat. Mengembalikan data URL siap dipakai
 * langsung sebagai src <img> maupun disimpan sebagai field Firestore.
 */
async function compressImageToDataUrl(file) {
    const img = await loadImageFromFile(file);

    for (const maxDim of COMPRESS_DIMENSION_STEPS) {
        const canvas = drawResizedCanvas(img, maxDim);
        for (const quality of COMPRESS_QUALITY_STEPS) {
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            if (dataUrl.length <= COMPRESS_TARGET_BYTES) {
                return dataUrl;
            }
        }
        // Kualitas terendah di resolusi ini masih kebesaran -> coba resolusi lebih kecil lagi
    }

    // Fallback: resolusi & kualitas paling ekstrem yang tersedia. Pada titik
    // ini praktiknya nyaris mustahil masih di atas target untuk foto biasa,
    // tapi tetap dikembalikan apa adanya alih-alih menolak upload sama sekali.
    const lastDim = COMPRESS_DIMENSION_STEPS[COMPRESS_DIMENSION_STEPS.length - 1];
    const lastQuality = COMPRESS_QUALITY_STEPS[COMPRESS_QUALITY_STEPS.length - 1];
    return drawResizedCanvas(img, lastDim).toDataURL('image/jpeg', lastQuality);
}

/**
 * Crop persegi terpusat dari gambar sumber (berapa pun rasio aspeknya),
 * lalu digambar ulang ke ukuran target -- cocok untuk avatar bulat, supaya
 * tidak ada distorsi/pemadatan aneh kalau foto asli berbentuk persegi
 * panjang.
 */
function drawSquareCroppedCanvas(img, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const sourceSize = Math.min(img.width, img.height);
    const sourceX = (img.width - sourceSize) / 2;
    const sourceY = (img.height - sourceSize) / 2;

    ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
    return canvas;
}

// Avatar disematkan di SETIAP komentar (bukan file terpisah), jadi targetnya
// jauh lebih kecil dari kompresi gambar galeri/log -- sekitar 15KB cukup
// untuk avatar bulat kecil, menyisakan banyak ruang aman di bawah limit
// dokumen Firestore 1MB.
const AVATAR_TARGET_BYTES = 15 * 1024;
const AVATAR_SIZE_STEPS = [160, 120, 90, 64, 48];
const AVATAR_QUALITY_STEPS = [0.75, 0.6, 0.45, 0.3, 0.15];

/**
 * Mengompres file gambar jadi avatar bulat kecil (data URL), di-crop
 * persegi dari tengah, dijamin di bawah AVATAR_TARGET_BYTES apa pun ukuran
 * aslinya -- pola iterasi sama seperti compressImageToDataUrl.
 */
async function compressAvatarToDataUrl(file) {
    const img = await loadImageFromFile(file);

    for (const size of AVATAR_SIZE_STEPS) {
        const canvas = drawSquareCroppedCanvas(img, size);
        for (const quality of AVATAR_QUALITY_STEPS) {
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            if (dataUrl.length <= AVATAR_TARGET_BYTES) {
                return dataUrl;
            }
        }
    }

    const lastSize = AVATAR_SIZE_STEPS[AVATAR_SIZE_STEPS.length - 1];
    const lastQuality = AVATAR_QUALITY_STEPS[AVATAR_QUALITY_STEPS.length - 1];
    return drawSquareCroppedCanvas(img, lastSize).toDataURL('image/jpeg', lastQuality);
}

function sanitizeYearLabel(input) {
    return input.trim();
}

// ---------- Like / Dislike (tersimpan di Firestore, terlihat semua orang) ----------
function getLocalReactions() {
    try {
        return JSON.parse(localStorage.getItem(REACTION_STORAGE_KEY) || '{}');
    } catch {
        return {};
    }
}

function setLocalReaction(entryKey, reaction) {
    const reactions = getLocalReactions();
    if (reaction === null) {
        delete reactions[entryKey];
    } else {
        reactions[entryKey] = reaction;
    }
    localStorage.setItem(REACTION_STORAGE_KEY, JSON.stringify(reactions));
}

function getLocalReaction(entryKey) {
    return getLocalReactions()[entryKey] || null;
}

/**
 * Toggle like/dislike untuk satu entry. Membatasi 1 reaksi per browser per entry
 * (menekan tombol yang sama membatalkan, menekan yang lain mengganti).
 * collectionName: 'timeline_entries' | 'gallery_items' | 'log_entries'
 * Mengembalikan reaksi yang aktif setelah toggle ('like' | 'dislike' | null).
 */
async function toggleReaction(collectionName, entryId, reactionType) {
    const entryKey = `${collectionName}:${entryId}`;
    const current = getLocalReaction(entryKey);
    const docRef = db.collection(collectionName).doc(entryId);
    const increment = firebase.firestore.FieldValue.increment;

    const updates = {};
    let newReaction;

    if (current === reactionType) {
        updates[reactionType === 'like' ? 'likes' : 'dislikes'] = increment(-1);
        newReaction = null;
    } else if (current) {
        updates[current === 'like' ? 'likes' : 'dislikes'] = increment(-1);
        updates[reactionType === 'like' ? 'likes' : 'dislikes'] = increment(1);
        newReaction = reactionType;
    } else {
        updates[reactionType === 'like' ? 'likes' : 'dislikes'] = increment(1);
        newReaction = reactionType;
    }

    // PENTING: localStorage di-set SEBELUM Firestore write, bukan sesudahnya.
    // Firestore onSnapshot bisa terpicu lebih cepat dari await di bawah ini
    // selesai (perilaku "optimistic local cache") -- kalau localStorage baru
    // di-update SETELAH await, render ulang yang terpicu oleh snapshot lokal
    // itu akan membaca status LAMA, menyebabkan glow tombol tidak sinkron
    // dengan yang sebenarnya baru saja diklik (tombol tetap glow setelah
    // di-un-toggle, atau tombol lain terlihat glow padahal belum diklik).
    setLocalReaction(entryKey, newReaction);

    try {
        await docRef.update(updates);
    } catch (err) {
        // Write gagal -> kembalikan localStorage ke status sebelumnya supaya
        // tidak nyangkut salah menampilkan reaksi yang sebenarnya tidak tersimpan.
        setLocalReaction(entryKey, current);
        throw err;
    }

    return newReaction;
}

// ---------- Comments (tersimpan di Firestore, terlihat semua orang, tanpa login) ----------
/**
 * entryType: 'timeline' | 'gallery' | 'log'
 */
async function submitComment(entryType, entryId, name, text, avatarUrl) {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    await db.collection('comments').add({
        entryType,
        entryId,
        // entryKey menggabungkan entryType+entryId jadi satu field, supaya
        // query di bawah cuma butuh SATU where() + orderBy() -- pola ini
        // otomatis ter-index oleh Firestore tanpa perlu deploy composite
        // index terpisah. Dua where() pada field BERBEDA + orderBy pada
        // field ketiga (pola lama) butuh composite index eksplisit yang
        // tidak pernah dideploy, menyebabkan query gagal diam-diam dan UI
        // macet selamanya di skeleton loading (tidak pernah sampai ke
        // render komentar asli maupun ke pesan error).
        entryKey: `${entryType}:${entryId}`,
        name: name.trim() || 'Anonim',
        text: trimmedText,
        avatarUrl: avatarUrl || '',
        likes: 0,
        dislikes: 0,
        // isAdminComment cuma NIAT dari client -- localStorage bisa
        // dipalsukan siapa saja, jadi nilai true di sini TIDAK otomatis
        // dipercaya. Firestore rules (allow create pada /comments) yang
        // benar-benar memverifikasi ulang lewat isAdmin() (Firebase Auth +
        // verified_admins) sebelum mengizinkan field ini bernilai true.
        // Kalau klaim ini palsu (isAdminMode() true tapi Auth admin tidak
        // valid), rules akan menolak seluruh operasi create-nya.
        isAdminComment: isAdminMode(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

function listenToComments(entryType, entryId, callback, onError) {
    // SENGAJA tidak pakai orderBy() di query -- kombinasi where() equality +
    // orderBy() field berbeda SELALU butuh composite index di Firestore
    // (baik satu maupun banyak filter), dan itu bikin query gagal diam-diam
    // kalau index belum dideploy. Solusinya: query cuma filter (aman tanpa
    // index apa pun), lalu urutkan hasilnya di sini pakai JavaScript biasa.
    // Untuk jumlah komentar per entry yang wajar (personal portfolio, bukan
    // aplikasi skala besar), ini jauh lebih murah daripada kerumitan/risiko
    // kelola index di Firestore.
    return db.collection('comments')
        .where('entryKey', '==', `${entryType}:${entryId}`)
        .onSnapshot((snapshot) => {
            const comments = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(c => !c.deleted)
                .sort((a, b) => {
                    // Comment yang BARU dikirim (belum sempat di-resolve
                    // serverTimestamp()-nya) dianggap "sekarang" (Date.now())
                    // supaya muncul di paling bawah, sesuai ekspektasi chat app.
                    const aTime = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : Date.now();
                    const bTime = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : Date.now();
                    return aTime - bTime;
                });
            callback(comments);
        }, (error) => {
            console.error('Gagal memuat komentar:', error);
            // Penting: panggil onError (kalau disediakan) supaya UI TIDAK
            // terjebak diam di state loading selamanya -- ini persis bug
            // yang terjadi sebelumnya, error cuma tercatat di console tanpa
            // pernah mengubah tampilan.
            if (onError) onError(error);
        });
}

/**
 * Soft-delete: menandai dokumen sebagai deleted=true alih-alih menghapusnya
 * sungguhan. Firestore rules mensyaratkan _adminPinHash yang valid untuk ini,
 * persis seperti update biasa. Dipakai untuk timeline_entries, gallery_items,
 * log_entries, dan comments.
 */
async function softDeleteEntry(collectionName, entryId) {
    if (!isAdminMode()) throw new Error('Bukan admin mode');
    await db.collection(collectionName).doc(entryId).update({ deleted: true });
}

// ============================================================
// IKON BERSAMA — dipakai di timeline.html, gallery.html, log-devs.html
// supaya tidak triplikasi dan gampang diperbarui dari satu tempat.
// ============================================================
const ICONS = {
    like: `<svg fill="currentColor" fill-opacity="0" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" viewBox="0 0 24 24"><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Zm0 0 4.5-8.2c.3-.6 1-.8 1.6-.5.9.4 1.4 1.4 1.2 2.4L13.5 9H18a2 2 0 0 1 2 2.3l-1.1 6.5A2 2 0 0 1 16.9 19H10a3 3 0 0 1-3-3v-5Z"/></svg>`,
    dislike: `<svg fill="currentColor" fill-opacity="0" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" viewBox="0 0 24 24"><path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3Zm0 0-4.5 8.2c-.3.6-1 .8-1.6.5-.9-.4-1.4-1.4-1.2-2.4l.8-3.3H6a2 2 0 0 1-2-2.3l1.1-6.5A2 2 0 0 1 7.1 5H14a3 3 0 0 1 3 3v5Z"/></svg>`,
    comment: `<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" viewBox="0 0 24 24"><path d="M4 4.5h16a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H9l-4.6 3.4a.5.5 0 0 1-.8-.4V17H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z"/></svg>`,
    pencil: `<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" viewBox="0 0 24 24"><path d="m14.5 5.5 4 4L8 20H4v-4L14.5 5.5Z"/><path d="m13 7 4 4"/></svg>`,
    trash: `<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m3 0-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7h14Z"/></svg>`,
    up: `<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="m18 15-6-6-6 6"/></svg>`,
    down: `<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>`,
    close: `<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
    send: `<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="m3 3 18 9-18 9 4.5-9L3 3Z"/></svg>`,
    love: `<svg fill="currentColor" fill-opacity="0" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-10-9.3C.5 7.8 2.3 4.5 5.7 4c2.1-.3 4.2.8 5.3 2.6a.9.9 0 0 0 1.5 0C13.6 4.8 15.7 3.7 17.8 4c3.4.5 5.2 3.8 3.7 7.2-2.5 4.7-10 9.3-10 9.3Z"/></svg>`,
    avatar: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e3e1ec"/><circle cx="20" cy="16" r="6.5" fill="#a8a6b3"/><ellipse cx="20" cy="33" rx="12" ry="10" fill="#a8a6b3"/></svg>`,
    eye: `<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
    fullscreen: `<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" viewBox="0 0 24 24"><path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4"/></svg>`,
    verifiedBadge: `<svg viewBox="0 0 22 22" fill="none"><path fill="currentColor" d="M11 0 13.09 1.94 15.9 1.51 16.83 4.22 19.39 5.53 19.03 8.35 21 10.44 19.34 12.78 20.02 15.55 17.34 16.65 16.72 19.42 13.87 19.19 12 21.34 9.79 19.65 6.94 20.14 5.98 17.5 3.19 16.72 3.5 13.88 1.5 11.83 3.11 9.34 2.14 6.66 4.75 5.31 5.35 2.5 8.16 2.72 10 0.5Z"/><path stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m7 11.3 2.7 2.7L15 8.3"/></svg>`
};

function escapeHtmlShared(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

// ============================================================
// REORDER — memindahkan posisi entry di timeline/gallery/log devs
// ============================================================
/**
 * Menukar field 'order' antar dua entry yang berdekatan dalam array `entries`
 * (array HARUS sudah terurut sesuai order asc, persis urutan tampilan saat
 * ini). Dipakai lewat tombol panah atas/bawah yang muncul di admin mode.
 * Ditulis lewat batch supaya kedua dokumen berubah bersamaan (atomik) --
 * kalau salah satu gagal, keduanya gagal, tidak ada state setengah-jalan.
 */
async function moveEntryOrder(collectionName, entries, index, direction) {
    if (!isAdminMode()) throw new Error('Bukan admin mode');
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= entries.length) return;

    const current = entries[index];
    const target = entries[targetIndex];

    const batch = db.batch();
    batch.update(db.collection(collectionName).doc(current.id), { order: target.order });
    batch.update(db.collection(collectionName).doc(target.id), { order: current.order });
    await batch.commit();
}

/**
 * Membuat markup HTML tombol panah atas/bawah untuk admin mode. index dan
 * total dipakai untuk menonaktifkan panah di ujung list (item pertama tidak
 * bisa naik lagi, item terakhir tidak bisa turun lagi).
 */
function renderOrderButtons(index, total) {
    const disabledUp = index === 0 ? 'disabled' : '';
    const disabledDown = index === total - 1 ? 'disabled' : '';
    return `
        <button class="order-btn" data-move="up" data-index="${index}" title="Naikkan" ${disabledUp}>${ICONS.up}</button>
        <button class="order-btn" data-move="down" data-index="${index}" title="Turunkan" ${disabledDown}>${ICONS.down}</button>
    `;
}

// ============================================================
// COMMENT BOTTOM SHEET — dipakai bersama di timeline/gallery/log devs.
// Dibuat dinamis lewat JS (sama seperti pin-modal) supaya tidak perlu
// diulang manual di tiap file HTML.
// ============================================================
let _currentCommentContext = null;
let _commentSheetUnsubscribe = null;

function ensureCommentSheetExists() {
    if (document.getElementById('comment-sheet-overlay')) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
        <div id="comment-sheet-overlay" class="comment-sheet-overlay">
            <div class="comment-sheet" id="comment-sheet">
                <div class="comment-sheet-handle"></div>
                <div class="comment-sheet-list" id="comment-sheet-list"></div>
                <div class="comment-sheet-emoji-section">
                    <div class="comment-sheet-emoji-row" id="comment-sheet-emoji-row">
                        <button class="emoji-shortcut-btn" type="button">👍</button>
                        <button class="emoji-shortcut-btn" type="button">🔥</button>
                        <button class="emoji-shortcut-btn" type="button">👏</button>
                        <button class="emoji-shortcut-btn" type="button">😂</button>
                        <button class="emoji-shortcut-btn" type="button">😍</button>
                        <button class="emoji-shortcut-btn" type="button">😮</button>
                        <button class="emoji-shortcut-btn" type="button">🙌</button>
                        <button class="emoji-shortcut-btn" type="button">💯</button>
                        <button class="emoji-shortcut-btn" type="button">❤️</button>
                        <button class="emoji-shortcut-btn" type="button">🗿 </button>
                        <button class="emoji-shortcut-btn" type="button">🥀 </button>
                        <button class="emoji-shortcut-btn" type="button">🥰 </button>
                        <button class="emoji-shortcut-btn" type="button">🤍 </button>
                        <button class="emoji-shortcut-btn" type="button">😢</button>
                        <button class="emoji-shortcut-btn" type="button">🎉</button>
                        <button class="emoji-shortcut-btn" type="button">💪</button>
                        <button class="emoji-shortcut-btn" type="button">🤔</button>
                        <button class="emoji-shortcut-btn" type="button">👀</button>
                        <button class="emoji-shortcut-btn" type="button">😅</button>
                        <button class="emoji-shortcut-btn" type="button">✨</button>
                    </div>
                    <button class="emoji-row-toggle-btn" id="emoji-row-toggle-btn" title="Sembunyikan emoji" type="button">${ICONS.down}</button>
                </div>
                <div class="comment-sheet-input-area">
                    <div class="comment-sheet-avatar" id="comment-sheet-avatar">${ICONS.avatar}</div>
                    <button class="comment-sheet-name-btn" id="comment-sheet-name-btn" title="Ubah nama" type="button">${ICONS.pencil}</button>
                    <div class="comment-sheet-textbox-wrap">
                        <textarea id="comment-sheet-text" class="comment-sheet-textbox" maxlength="500" placeholder="Tulis komentar..." rows="1"></textarea>
                    </div>
                    <button class="comment-sheet-send-btn" id="comment-sheet-send" type="button">${ICONS.send}</button>
                </div>
            </div>
        </div>
        <div id="name-popup-overlay" class="name-popup-overlay">
            <div class="name-popup-card">
                <div class="name-popup-avatar-picker" id="name-popup-avatar-picker">
                    <div class="name-popup-avatar-preview" id="name-popup-avatar-preview">${ICONS.avatar}</div>
                    <span class="name-popup-avatar-hint">Ganti foto</span>
                </div>
                <input accept="image/*" id="name-popup-avatar-input" style="display:none" type="file"/>
                <input id="name-popup-input" class="name-popup-input" maxlength="60" placeholder="Masukkan nama..." type="text"/>
                <div class="name-popup-actions">
                    <button id="name-popup-cancel" type="button">Batal</button>
                    <button id="name-popup-save" type="button">Simpan</button>
                </div>
            </div>
        </div>
    `.trim();
    // Pakai while-loop append semua childNodes, bukan cuma firstChild --
    // sekarang ada DUA elemen top-level di sini (comment sheet + name popup),
    // firstChild saja akan membuat name popup tidak pernah ter-append ke DOM.
    while (wrapper.firstChild) {
        document.body.appendChild(wrapper.firstChild);
    }

    const style = document.createElement('style');
    style.textContent = `
        .comment-sheet-overlay {
            position: fixed; inset: 0;
            background: rgba(26, 27, 34, 0.42);
            backdrop-filter: blur(4px);
            z-index: 300; opacity: 0; pointer-events: none;
            transition: opacity 0.3s ease;
        }
        .comment-sheet-overlay.is-open { opacity: 1; pointer-events: auto; }

        .comment-sheet {
            position: fixed; left: 0; right: 0; bottom: 0;
            max-width: 768px; margin: 0 auto;
            background: #ffffff;
            border-radius: 20px 20px 0 0;
            box-shadow: 0 -8px 40px rgba(26, 27, 34, 0.22);
            max-height: 78vh;
            display: flex; flex-direction: column;
            transform: translateY(100%);
            transition: transform 0.38s cubic-bezier(0.32, 0.72, 0, 1);
        }
        .comment-sheet-overlay.is-open .comment-sheet { transform: translateY(0); }

        .comment-sheet-handle {
            width: 36px; height: 4px;
            background: #e3e1ec; border-radius: 999px;
            margin: 10px auto 2px; flex-shrink: 0;
        }

        .comment-sheet-list {
            flex: 1; overflow-y: auto;
            padding: 16px 18px;
            -webkit-overflow-scrolling: touch;
        }
        .comment-sheet-empty {
            font-family: 'Geist', sans-serif; font-size: 13.5px; color: #A1A1AA;
            text-align: center; padding: 24px 0;
        }
        .comment-sheet-empty-state {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 10px;
            padding: 48px 0;
            height: 100%;
            color: #d4d3db;
        }
        .comment-sheet-empty-state svg {
            width: 52px; height: 52px;
            opacity: 0.55;
        }
        .comment-sheet-empty-state p {
            font-family: 'Geist', sans-serif; font-size: 13.5px;
            color: #b8b7c0;
            margin: 0;
        }

        /* ===== Skeleton loading untuk komentar (saat sheet baru dibuka) ===== */
        .comment-skeleton-row {
            display: flex;
            align-items: flex-start;
            gap: 11px;
            margin-bottom: 20px;
        }
        .comment-skeleton-avatar {
            width: 34px; height: 34px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .comment-skeleton-lines {
            flex: 1;
            min-width: 0;
            padding-top: 3px;
            display: flex;
            flex-direction: column;
            gap: 7px;
        }
        .comment-skeleton-line {
            height: 10px;
            border-radius: 5px;
        }
        .comment-skeleton-avatar,
        .comment-skeleton-line {
            background: linear-gradient(100deg, #eeedf7 30%, #f7f6fc 50%, #eeedf7 70%);
            background-size: 250% 100%;
            animation: commentSkeletonShimmer 1.6s ease-in-out infinite;
        }
        @keyframes commentSkeletonShimmer {
            0% { background-position: 100% 0; }
            100% { background-position: -100% 0; }
        }

        .ig-comment-row {
            display: flex;
            align-items: flex-start;
            gap: 11px;
            margin-bottom: 20px;
            opacity: 0; transform: translateY(8px);
            animation: chatBubbleIn 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        @keyframes chatBubbleIn {
            to { opacity: 1; transform: translateY(0); }
        }
        .ig-comment-avatar {
            width: 34px; height: 34px;
            border-radius: 50%;
            overflow: hidden;
            flex-shrink: 0;
        }
        .ig-comment-avatar svg { width: 100%; height: 100%; display: block; }

        .ig-comment-body {
            flex: 1;
            min-width: 0;
        }
        .ig-comment-header {
            display: flex;
            align-items: baseline;
            gap: 7px;
            margin-bottom: 2px;
        }
        .ig-comment-name {
            font-family: 'Geist', sans-serif;
            font-size: 13.5px;
            font-weight: 600;
            color: #1a1b22;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .ig-comment-verified {
            display: inline-flex;
            align-items: center;
            align-self: center;
            flex-shrink: 0;
            color: #2563eb;
            margin-left: -3px;
        }
        .ig-comment-verified svg { width: 13px; height: 13px; display: block; }
        .ig-comment-time {
            font-family: 'Geist', sans-serif;
            font-size: 12px;
            color: #a1a1aa;
            flex-shrink: 0;
        }
        .ig-comment-text {
            font-family: 'Geist', sans-serif;
            font-size: 14px;
            color: #1a1b22;
            line-height: 1.5;
            word-break: break-word;
        }
        .ig-comment-delete {
            font-family: 'Geist', sans-serif;
            font-size: 12px;
            color: #a1a1aa;
            margin-top: 5px;
            transition: color 0.2s ease;
        }
        .ig-comment-delete:hover { color: #ba1a1a; }

        .ig-comment-love-col {
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 3px;
            padding-top: 3px;
        }
        .ig-love-btn {
            display: inline-flex; align-items: center; justify-content: center;
            width: 30px; height: 30px;
            color: #9c9aa3; background: transparent;
            transition: color 0.25s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .ig-love-btn:hover { color: #e0245e; transform: scale(1.15); }
        .ig-love-btn.is-active { color: #e0245e; }
        .ig-love-btn svg {
            width: 21px; height: 21px;
            transition: fill-opacity 0.3s ease, filter 0.3s ease;
            fill-opacity: 0;
        }
        .ig-love-btn.is-active svg {
            fill-opacity: 1;
            filter: drop-shadow(0 0 5px rgba(224, 36, 94, 0.4));
        }
        .ig-love-btn.pop-animate { animation: reactionPopTiny 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
        @keyframes reactionPopTiny {
            0% { transform: scale(1); }
            35% { transform: scale(1.4); }
            60% { transform: scale(0.88); }
            100% { transform: scale(1); }
        }
        .ig-love-count {
            font-family: 'Geist', sans-serif; font-size: 11.5px; color: #a1a1aa;
        }

        .comment-sheet-input-area {
            position: relative;
            flex-shrink: 0;
            border-top: 1px solid #eeedf7;
            padding: 12px 14px;
            padding-bottom: max(12px, env(safe-area-inset-bottom));
            display: flex; gap: 9px; align-items: center;
            background: #ffffff;
        }
        .comment-sheet-avatar {
            width: 42px; height: 42px;
            border-radius: 50%;
            overflow: hidden;
            flex-shrink: 0;
            background: transparent;
            border: 1px solid rgba(26, 27, 34, 0.15);
        }
        .comment-sheet-avatar svg { width: 100%; height: 100%; display: block; }

        .comment-sheet-emoji-section {
            flex-shrink: 0;
            display: flex; align-items: center; gap: 2px;
            border-top: 1px solid #eeedf7;
            padding-right: 6px;
        }
        .comment-sheet-emoji-row {
            flex: 1; min-width: 0;
            display: flex; gap: 4px;
            padding: 8px 6px 8px 14px;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            max-height: 50px;
            opacity: 1;
            transition: max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, padding 0.28s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .comment-sheet-emoji-row::-webkit-scrollbar { display: none; }
        .comment-sheet-emoji-row.is-collapsed {
            max-height: 0;
            opacity: 0;
            padding-top: 0; padding-bottom: 0;
        }
        .emoji-row-toggle-btn {
            flex-shrink: 0;
            width: 26px; height: 26px;
            display: flex; align-items: center; justify-content: center;
            border-radius: 999px;
            color: #a1a1aa; background: transparent;
            transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s ease, color 0.2s ease;
        }
        .emoji-row-toggle-btn:hover { background: #f4f2fd; color: #1a1b22; }
        .emoji-row-toggle-btn svg { width: 14px; height: 14px; }
        .emoji-row-toggle-btn.is-collapsed { transform: rotate(180deg); }
        .emoji-shortcut-btn {
            flex-shrink: 0;
            width: 34px; height: 34px;
            display: flex; align-items: center; justify-content: center;
            font-size: 18px;
            background: transparent;
            transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .emoji-shortcut-btn:hover { transform: scale(1.15); }
        .emoji-shortcut-btn:active { transform: scale(0.85); }
        @keyframes emojiSoftPop {
            0% { transform: scale(1) translateY(0); }
            45% { transform: scale(1.22) translateY(-3px); }
            100% { transform: scale(1) translateY(0); }
        }
        .emoji-shortcut-btn.pop-animate { animation: emojiSoftPop 0.4s cubic-bezier(0.25, 0.9, 0.35, 1); }

        .comment-sheet-name-btn {
            width: 38px; height: 38px; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
            border-radius: 999px;
            color: #77767b; background: transparent;
            border: 1px solid rgba(26, 27, 34, 0.15);
            transition: background-color 0.2s ease, color 0.2s ease;
        }
        .comment-sheet-name-btn:hover { background: #f4f2fd; color: #1a1b22; }
        .comment-sheet-name-btn svg { width: 17px; height: 17px; }

        .comment-sheet-textbox-wrap {
            position: relative;
            flex: 1;
            border-radius: 18px;
            align-self: flex-end;
        }
        .comment-sheet-textbox {
            position: relative;
            z-index: 1;
            width: 100%;
            resize: none; max-height: 90px; min-height: 44px;
            border: 1px solid rgba(26, 27, 34, 0.15); border-radius: 18px;
            padding: 15px 16px 7px; font-family: 'Geist', sans-serif; font-size: 13.5px;
            color: #1a1b22; background: transparent; line-height: 1.4;
            -webkit-appearance: none; appearance: none;
            -webkit-tap-highlight-color: transparent;
        }
        .comment-sheet-textbox:focus,
        .comment-sheet-textbox:focus-visible,
        .comment-sheet-textbox:active { outline: none; box-shadow: none; }
        .comment-sheet-send-btn {
            width: 46px; height: 46px; flex-shrink: 0;
            border-radius: 50%; background: #1a1b22; color: #fff;
            display: flex; align-items: center; justify-content: center;
            transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s ease, opacity 0.2s ease;
        }
        .comment-sheet-send-btn svg { width: 18px; height: 18px; margin-left: -1px; }
        .comment-sheet-send-btn:hover { background: #2c2d38; transform: scale(1.06); }
        .comment-sheet-send-btn:active { transform: scale(0.88); }
        .comment-sheet-send-btn:disabled { opacity: 0.5; }
        .comment-sheet-send-btn.sending svg { animation: sendPulse 0.5s ease; }
        /* Selagi dalam masa cooldown anti-spam, tombol kirim berubah biru
           supaya user tahu ada jeda aktif -- warna berbeda dari state
           normal/hover (hitam), sehingga terlihat jelas ini kondisi khusus,
           bukan sekadar hover biasa. */
        .comment-sheet-send-btn.on-cooldown { background: #2563eb; }
        .comment-sheet-send-btn.on-cooldown:hover { background: #1d4fc4; }
        @keyframes sendPulse {
            0% { transform: scale(1); }
            40% { transform: scale(1.3) rotate(10deg); }
            100% { transform: scale(1); }
        }
        .comment-sheet-send-btn.shake { animation: sendBtnShake 0.4s ease; }
        @keyframes sendBtnShake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-4px); }
            40% { transform: translateX(4px); }
            60% { transform: translateX(-3px); }
            80% { transform: translateX(3px); }
        }
        .comment-cooldown-hint {
            position: absolute;
            bottom: calc(100% + 8px);
            right: 0;
            background: #1a1b22;
            color: #fff;
            font-family: 'Geist', sans-serif; font-size: 11.5px; font-weight: 600;
            padding: 6px 11px;
            border-radius: 8px;
            white-space: nowrap;
            opacity: 0; transform: translateY(4px);
            pointer-events: none;
            transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .comment-cooldown-hint::after {
            content: '';
            position: absolute;
            top: 100%; right: 16px;
            border: 5px solid transparent;
            border-top-color: #1a1b22;
        }
        .comment-cooldown-hint.is-visible { opacity: 1; transform: translateY(0); }

        /* ===== Popup nama (dibuka lewat tombol pensil) ===== */
        .name-popup-overlay {
            position: fixed; inset: 0;
            background: rgba(26, 27, 34, 0.32);
            backdrop-filter: blur(6px);
            z-index: 400; opacity: 0; pointer-events: none;
            display: flex; align-items: center; justify-content: center;
            transition: opacity 0.25s ease;
            padding: 24px;
        }
        .name-popup-overlay.is-open { opacity: 1; pointer-events: auto; }
        .name-popup-card {
            position: relative;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.78);
            backdrop-filter: blur(28px) saturate(140%);
            -webkit-backdrop-filter: blur(28px) saturate(140%);
            border: 1px solid rgba(255, 255, 255, 0.9);
            border-radius: 22px;
            width: 100%; max-width: 300px; padding: 24px;
            box-shadow: 0 8px 28px rgba(26, 27, 34, 0.10), 0 24px 60px rgba(26, 27, 34, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.95);
            transform: translateY(10px) scale(0.97); opacity: 0;
            transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.25s ease;
        }
        .name-popup-overlay.is-open .name-popup-card { transform: translateY(0) scale(1); opacity: 1; }
        /* Blob bulat samar di sudut card -- meniru elemen dekoratif transparan
           pada referensi desain (kartu login abu-putih dengan lingkaran
           blur di latar). Murni dekoratif, tidak menangkap klik. */
        .name-popup-card::before,
        .name-popup-card::after {
            content: '';
            position: absolute;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0) 70%);
            pointer-events: none;
            z-index: 0;
        }
        .name-popup-card::before {
            width: 140px; height: 140px;
            top: -50px; right: -60px;
        }
        .name-popup-card::after {
            width: 110px; height: 110px;
            bottom: -40px; left: -50px;
        }
        .name-popup-card > * { position: relative; z-index: 1; }
        .name-popup-avatar-picker {
            display: flex; flex-direction: column; align-items: center; gap: 6px;
            margin-top: 4px; margin-bottom: 16px; cursor: pointer;
        }
        .name-popup-avatar-preview {
            width: 64px; height: 64px;
            border-radius: 50%;
            overflow: hidden;
            box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.9);
            transition: opacity 0.2s ease;
        }
        .name-popup-avatar-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .name-popup-avatar-preview svg { width: 100%; height: 100%; display: block; }
        .name-popup-avatar-picker:hover .name-popup-avatar-preview { opacity: 0.75; }
        .name-popup-avatar-hint {
            font-family: 'Geist', sans-serif; font-size: 11.5px; color: #1a1b22;
            font-weight: 600;
        }
        .name-popup-input {
            width: 100%; border: 1px solid rgba(26, 27, 34, 0.08); border-radius: 999px;
            padding: 11px 16px; font-family: 'Geist', sans-serif; font-size: 14.5px;
            color: #1a1b22; background: rgba(244, 242, 253, 0.6);
            box-shadow: inset 0 1px 2px rgba(26, 27, 34, 0.03);
            transition: border-color 0.2s ease, background-color 0.2s ease;
        }
        .name-popup-input::placeholder { color: rgba(26, 27, 34, 0.4); }
        .name-popup-input:focus { outline: none; border-color: rgba(26, 27, 34, 0.25); background: rgba(255, 255, 255, 0.85); }
        .name-popup-actions { display: flex; gap: 8px; margin-top: 16px; }
        .name-popup-actions button {
            flex: 1; padding: 10px 0; border-radius: 999px;
            font-family: 'Geist', sans-serif; font-size: 13.5px; font-weight: 600;
            border: 1px solid transparent;
            transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
        }
        .name-popup-actions button:active { transform: scale(0.96); }
        #name-popup-cancel {
            color: #1a1b22;
            background: rgba(255, 255, 255, 0.6);
            border-color: rgba(26, 27, 34, 0.08);
        }
        #name-popup-cancel:hover { background: rgba(255, 255, 255, 0.9); }
        #name-popup-save {
            color: #fff;
            background: #1a1b22;
        }
        #name-popup-save:hover { background: #2c2d38; }
    `;
    document.head.appendChild(style);

    // Tombol close & judul sengaja dihapus dari HTML -- klik di luar area
    // sheet (di overlay gelap) sekarang jadi satu-satunya cara menutup.
    document.getElementById('comment-sheet-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'comment-sheet-overlay') closeCommentSheet();
    });

    // Auto-resize textarea seiring teks bertambah baris, terasa lebih hidup
    // seperti aplikasi chat pada umumnya, dibanding kotak input statis.
    const textArea = document.getElementById('comment-sheet-text');
    textArea.addEventListener('input', () => {
        textArea.style.height = 'auto';
        textArea.style.height = Math.min(textArea.scrollHeight, 100) + 'px';
    });

    // Emoji shortcut: klik emoji -> masuk ke posisi kursor saat ini di textarea
    document.getElementById('comment-sheet-emoji-row').addEventListener('click', (e) => {
        const btn = e.target.closest('.emoji-shortcut-btn');
        if (!btn) return;
        insertEmojiAtCursor(textArea, btn.textContent);
        btn.classList.remove('pop-animate');
        void btn.offsetWidth;
        btn.classList.add('pop-animate');
    });

    // Tombol chevron di ujung kanan baris emoji -> sembunyikan/tampilkan
    // kembali baris shortcut emoji. State disimpan sebagai class di DOM
    // (bukan localStorage) -- ini state UI sesi sheet yang sedang dibuka,
    // bukan preferensi yang perlu bertahan lintas sesi, jadi cukup ada
    // di elemen itu sendiri seperti pola is-open yang dipakai di overlay lain.
    document.getElementById('emoji-row-toggle-btn').addEventListener('click', () => {
        const row = document.getElementById('comment-sheet-emoji-row');
        const toggleBtn = document.getElementById('emoji-row-toggle-btn');
        const collapsed = row.classList.toggle('is-collapsed');
        toggleBtn.classList.toggle('is-collapsed', collapsed);
        toggleBtn.title = collapsed ? 'Tampilkan emoji' : 'Sembunyikan emoji';
    });

    // Saat user mulai mengetik (fokus ke textarea), baris emoji otomatis
    // disembunyikan supaya area mengetik terasa lebih lega -- tapi tetap
    // memakai mekanisme toggle yang sama (classList.add, bukan set state
    // terpisah), jadi tombol chevron manual tetap bisa dipakai membuka
    // lagi kapan saja tanpa perlu logika tambahan.
    textArea.addEventListener('focus', () => {
        const row = document.getElementById('comment-sheet-emoji-row');
        const toggleBtn = document.getElementById('emoji-row-toggle-btn');
        if (!row.classList.contains('is-collapsed')) {
            row.classList.add('is-collapsed');
            toggleBtn.classList.add('is-collapsed');
            toggleBtn.title = 'Tampilkan emoji';
        }
    });

    // Tombol pensil nama -> buka popup ubah nama
    document.getElementById('comment-sheet-name-btn').addEventListener('click', openNamePopup);
    document.getElementById('name-popup-cancel').addEventListener('click', closeNamePopup);
    document.getElementById('name-popup-save').addEventListener('click', saveNameFromPopup);
    document.getElementById('name-popup-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'name-popup-overlay') closeNamePopup();
    });
    document.getElementById('name-popup-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveNameFromPopup();
    });

    // Klik area avatar preview -> buka file picker tersembunyi
    const avatarPicker = document.getElementById('name-popup-avatar-picker');
    const avatarInput = document.getElementById('name-popup-avatar-input');
    avatarPicker.addEventListener('click', () => avatarInput.click());
    avatarInput.addEventListener('change', () => {
        if (avatarInput.files[0]) handleAvatarFileSelect(avatarInput.files[0]);
    });
}

/**
 * Memasukkan emoji ke posisi kursor saat ini di textarea (bukan sekadar
 * ditempel di akhir), supaya terasa seperti keyboard emoji sungguhan.
 */
function insertEmojiAtCursor(textarea, emoji) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.slice(0, start) + emoji + text.slice(end);
    const newCursorPos = start + emoji.length;
    textarea.selectionStart = textarea.selectionEnd = newCursorPos;
    textarea.focus();
    textarea.dispatchEvent(new Event('input')); // supaya auto-resize ikut ter-trigger
}

// ---------- Profil komentator: nama & avatar (disimpan lokal, dipakai berulang) ----------
const COMMENT_NAME_KEY = 'devs_comment_name';
const COMMENT_AVATAR_KEY = 'devs_comment_avatar';

function getSavedCommentName() {
    return localStorage.getItem(COMMENT_NAME_KEY) || '';
}

function getSavedCommentAvatar() {
    return localStorage.getItem(COMMENT_AVATAR_KEY) || '';
}

/**
 * Markup avatar: pakai foto custom kalau sudah disimpan, kalau tidak
 * fallback ke ikon generik. avatarUrl bisa berasal dari localStorage
 * (avatar pengguna saat ini) ATAU dari field tersimpan di satu komentar.
 */
function renderAvatarMarkup(avatarUrl) {
    if (avatarUrl) {
        return `<img src="${escapeAttrShared(avatarUrl)}" alt=""/>`;
    }
    return ICONS.avatar;
}

function escapeAttrShared(str) {
    return (str || '').replace(/"/g, '&quot;');
}

function openNamePopup() {
    const overlay = document.getElementById('name-popup-overlay');
    const input = document.getElementById('name-popup-input');
    const preview = document.getElementById('name-popup-avatar-preview');
    input.value = getSavedCommentName();
    preview.innerHTML = renderAvatarMarkup(getSavedCommentAvatar());
    overlay.classList.add('is-open');
    setTimeout(() => input.focus(), 150);
}

function closeNamePopup() {
    const overlay = document.getElementById('name-popup-overlay');
    if (overlay) overlay.classList.remove('is-open');
}

function saveNameFromPopup() {
    const input = document.getElementById('name-popup-input');
    const preview = document.getElementById('name-popup-avatar-preview');

    localStorage.setItem(COMMENT_NAME_KEY, input.value.trim());

    // Kalau ada avatar baru yang dipilih (belum tersimpan permanen sampai
    // titik ini), commit sekarang ke localStorage.
    if (preview.dataset.pendingAvatar) {
        localStorage.setItem(COMMENT_AVATAR_KEY, preview.dataset.pendingAvatar);
        delete preview.dataset.pendingAvatar;
    }

    closeNamePopup();
    // Refresh avatar di input area comment sheet (kalau sedang terbuka)
    // supaya perubahan langsung terlihat tanpa perlu reload.
    const sheetAvatar = document.getElementById('comment-sheet-avatar');
    if (sheetAvatar) sheetAvatar.innerHTML = renderAvatarMarkup(getSavedCommentAvatar());
}

/**
 * Dipanggil saat user memilih file lewat input avatar di popup nama.
 * Mengompres jadi avatar bulat kecil, langsung tampil di preview (belum
 * tersimpan permanen sampai tombol Simpan ditekan, konsisten dengan field
 * nama yang juga baru tersimpan saat Simpan).
 */
async function handleAvatarFileSelect(file) {
    if (!file.type.startsWith('image/')) {
        alert('Hanya file gambar yang diperbolehkan.');
        return;
    }
    const preview = document.getElementById('name-popup-avatar-preview');
    try {
        const dataUrl = await compressAvatarToDataUrl(file);
        preview.innerHTML = renderAvatarMarkup(dataUrl);
        preview.dataset.pendingAvatar = dataUrl;
    } catch (err) {
        console.error('Gagal memproses foto profil:', err);
        alert('Gagal memproses foto. Coba foto lain.');
    }
}

/**
 * Membuka bottom sheet komentar untuk satu entry tertentu.
 * entryType: 'timeline' | 'gallery' | 'log'
 */
function openCommentSheet(entryType, entryId) {
    ensureCommentSheetExists();
    _currentCommentContext = { entryType, entryId };

    const overlay = document.getElementById('comment-sheet-overlay');
    const list = document.getElementById('comment-sheet-list');
    list.innerHTML = `
        <div class="comment-skeleton-row">
            <div class="comment-skeleton-avatar"></div>
            <div class="comment-skeleton-lines">
                <div class="comment-skeleton-line" style="width: 40%;"></div>
                <div class="comment-skeleton-line" style="width: 85%;"></div>
            </div>
        </div>
        <div class="comment-skeleton-row">
            <div class="comment-skeleton-avatar"></div>
            <div class="comment-skeleton-lines">
                <div class="comment-skeleton-line" style="width: 30%;"></div>
                <div class="comment-skeleton-line" style="width: 60%;"></div>
            </div>
        </div>
        <div class="comment-skeleton-row">
            <div class="comment-skeleton-avatar"></div>
            <div class="comment-skeleton-lines">
                <div class="comment-skeleton-line" style="width: 35%;"></div>
                <div class="comment-skeleton-line" style="width: 75%;"></div>
            </div>
        </div>
    `;

    // Catatan: state hide/unhide baris emoji SENGAJA tidak direset di sini.
    // Elemen sheet dipakai ulang antar entry (ensureCommentSheetExists cuma
    // membuat DOM-nya sekali), dan preferensi "saya sudah sembunyikan emoji"
    // terasa lebih wajar tetap berlaku sampai user membukanya lagi sendiri,
    // dibanding harus di-hide ulang tiap kali pindah entry.

    // Refresh avatar di input area, kalau sempat berubah sejak sheet
    // terakhir dibuat (mis. baru saja ganti foto profil).
    const sheetAvatar = document.getElementById('comment-sheet-avatar');
    if (sheetAvatar) sheetAvatar.innerHTML = renderAvatarMarkup(getSavedCommentAvatar());

    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    if (_commentSheetUnsubscribe) _commentSheetUnsubscribe();
    _commentSheetUnsubscribe = listenToComments(entryType, entryId, renderCommentSheetList, (error) => {
        const list = document.getElementById('comment-sheet-list');
        if (list) {
            list.innerHTML = `<p class="comment-sheet-empty">Gagal memuat komentar (${error.code || 'error'}). Coba tutup dan buka lagi.</p>`;
        }
    });

    const sendBtn = document.getElementById('comment-sheet-send');
    const textArea = document.getElementById('comment-sheet-text');
    sendBtn.onclick = submitCommentFromSheet;
    textArea.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitCommentFromSheet();
        }
    };

    list.onclick = handleCommentSheetListClick;
}

function closeCommentSheet() {
    const overlay = document.getElementById('comment-sheet-overlay');
    if (overlay) overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    if (_commentSheetUnsubscribe) {
        _commentSheetUnsubscribe();
        _commentSheetUnsubscribe = null;
    }
    _currentCommentContext = null;
}

/**
 * Bottom sheet "detail" -- menampilkan HTML custom (diisi admin lewat modal
 * Add/Edit) di dalam iframe sandboxed. Dipakai lewat ikon mata di list, dan
 * juga dipakai untuk tombol "Preview" di modal admin sebelum data disimpan.
 *
 * Kenapa sandboxed iframe, bukan innerHTML langsung: HTML yang disimpan di
 * sini ditulis bebas oleh admin (bisa berisi <script>, <style> sendiri,
 * dst) -- me-render itu langsung ke DOM halaman utama lewat innerHTML akan
 * membuat script di dalamnya berjalan dengan akses penuh ke halaman utama
 * (termasuk sesi admin yang sedang aktif). iframe dengan sandbox
 * "allow-scripts allow-popups allow-top-navigation-by-user-activation"
 * (TANPA allow-same-origin) membuat browser memberi origin unik/terisolasi
 * ke konten di dalamnya -- script di dalamnya tetap bisa jalan (jadi konten
 * interaktif seperti demo kecil tetap bisa), dan link di dalamnya (misalnya
 * tombol "Live URL") bisa dibuka ke TAB BARU saat diklik user -- tapi tetap
 * tidak bisa menyentuh window.parent, cookie, atau localStorage milik
 * halaman utama sama sekali, dan tidak bisa me-redirect diam-diam tanpa
 * klik user (allow-top-navigation-by-user-activation mensyaratkan interaksi
 * nyata, beda dari allow-top-navigation biasa yang mengizinkan redirect
 * otomatis lewat script kapan saja).
 */
function ensureDetailSheetExists() {
    if (document.getElementById('detail-sheet-overlay')) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
        <div id="detail-sheet-overlay" class="detail-sheet-overlay">
            <div class="detail-sheet" id="detail-sheet">
                <div class="detail-sheet-handle"></div>
                <div class="detail-sheet-frame-wrap" id="detail-sheet-frame-wrap"></div>
            </div>
        </div>
    `.trim();
    document.body.appendChild(wrapper.firstChild);

    const style = document.createElement('style');
    style.textContent = `
        .detail-sheet-overlay {
            position: fixed; inset: 0;
            background: rgba(26, 27, 34, 0.42);
            backdrop-filter: blur(4px);
            z-index: 300; opacity: 0; pointer-events: none;
            transition: opacity 0.3s ease;
        }
        .detail-sheet-overlay.is-open { opacity: 1; pointer-events: auto; }

        .detail-sheet {
            position: fixed; left: 0; right: 0; bottom: 0;
            max-width: 768px; margin: 0 auto;
            background: #ffffff;
            border-radius: 20px 20px 0 0;
            box-shadow: 0 -8px 40px rgba(26, 27, 34, 0.22);
            height: 82vh;
            display: flex; flex-direction: column;
            transform: translateY(100%);
            transition: transform 0.38s cubic-bezier(0.32, 0.72, 0, 1);
        }
        .detail-sheet-overlay.is-open .detail-sheet { transform: translateY(0); }

        .detail-sheet-handle {
            width: 36px; height: 4px;
            background: #e3e1ec; border-radius: 999px;
            margin: 10px auto 2px; flex-shrink: 0;
        }

        .detail-sheet-frame-wrap {
            flex: 1; min-height: 0;
            padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
        }
        .detail-sheet-frame {
            width: 100%; height: 100%;
            border: none; border-radius: 12px;
            background: #ffffff;
            display: block;
        }
        .detail-sheet-empty {
            width: 100%; height: 100%;
            display: flex; align-items: center; justify-content: center;
            font-family: 'Geist', sans-serif; font-size: 13.5px; color: #A1A1AA;
        }
    `;
    document.head.appendChild(style);

    // Sama seperti comment sheet: klik backdrop gelap di luar kartu sheet
    // adalah satu-satunya cara menutup (tidak ada tombol close terpisah).
    document.getElementById('detail-sheet-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'detail-sheet-overlay') closeDetailSheet();
    });
}

/**
 * Membuka detail sheet dan me-render htmlContent di dalam iframe sandboxed
 * lewat atribut srcdoc (bukan src=data:... atau blob: URL -- srcdoc paling
 * sederhana dan tidak perlu revoke/cleanup URL secara manual).
 */
function openDetailSheet(htmlContent) {
    ensureDetailSheetExists();

    const overlay = document.getElementById('detail-sheet-overlay');
    const frameWrap = document.getElementById('detail-sheet-frame-wrap');

    if (!htmlContent || !htmlContent.trim()) {
        frameWrap.innerHTML = `<div class="detail-sheet-empty">Belum ada detail untuk entry ini.</div>`;
    } else {
        frameWrap.innerHTML = `<iframe class="detail-sheet-frame" sandbox="allow-scripts allow-popups allow-top-navigation-by-user-activation"></iframe>`;
        // srcdoc diisi lewat properti JS (bukan attribute string langsung)
        // supaya tidak perlu escape tanda kutip yang mungkin ada di dalam
        // htmlContent -- lebih aman dan sederhana dibanding menyisipkannya
        // ke template string HTML di atas.
        frameWrap.querySelector('iframe').srcdoc = htmlContent;
    }

    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
}

function closeDetailSheet() {
    const overlay = document.getElementById('detail-sheet-overlay');
    if (overlay) overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    // Kosongkan iframe saat ditutup -- kalau kontennya punya audio/video/
    // animasi yang jalan terus, ini menghentikannya, bukan cuma
    // menyembunyikannya secara visual di belakang overlay yang tertutup.
    const frameWrap = document.getElementById('detail-sheet-frame-wrap');
    if (frameWrap) frameWrap.innerHTML = '';
}

/**
 * Format timestamp Firestore jadi teks relatif ("baru saja", "5 menit lalu",
 * dst), memberi nuansa chat app yang lebih hidup dibanding tanggal statis.
 */
function formatRelativeTime(timestamp) {
    if (!timestamp || !timestamp.toMillis) return 'baru saja';
    const diffSec = Math.floor((Date.now() - timestamp.toMillis()) / 1000);
    if (diffSec < 45) return 'baru saja';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} menit lalu`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} jam lalu`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} hari lalu`;
    return new Date(timestamp.toMillis()).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function renderCommentSheetList(comments) {
    const list = document.getElementById('comment-sheet-list');
    if (!list) return;
    if (comments.length === 0) {
        list.innerHTML = `
            <div class="comment-sheet-empty-state">
                ${ICONS.comment}
                <p>Belum ada Komentar...</p>
            </div>
        `;
        return;
    }
    const wasNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;

    list.innerHTML = comments.map(c => {
        const isLoved = getLocalReaction(`comments:${c.id}`) === 'like';
        return `
        <div class="ig-comment-row" data-comment-id="${c.id}">
            <div class="ig-comment-avatar">${renderAvatarMarkup(c.avatarUrl)}</div>
            <div class="ig-comment-body">
                <div class="ig-comment-header">
                    <span class="ig-comment-name">${escapeHtmlShared(c.name)}</span>
                    ${c.isAdminComment ? `<span class="ig-comment-verified" title="Admin">${ICONS.verifiedBadge}</span>` : ''}
                    <span class="ig-comment-time">${formatRelativeTime(c.createdAt)}</span>
                </div>
                <div class="ig-comment-text">${escapeHtmlShared(c.text)}</div>
                ${isAdminMode() ? `<button class="ig-comment-delete" data-delete-comment>Hapus</button>` : ''}
            </div>
            <div class="ig-comment-love-col">
                <button class="ig-love-btn ${isLoved ? 'is-active' : ''}" data-comment-reaction="like">${ICONS.love}</button>
                <span class="ig-love-count">${c.likes || 0}</span>
            </div>
        </div>
    `;
    }).join('');

    // Auto-scroll ke bawah hanya kalau posisi scroll sebelumnya memang sudah
    // dekat bawah (baru kirim komentar) -- supaya tidak mengganggu kalau
    // user sedang scroll baca komentar lama saat snapshot baru masuk.
    if (wasNearBottom) list.scrollTop = list.scrollHeight;
}

async function handleCommentSheetListClick(e) {
    const deleteBtn = e.target.closest('[data-delete-comment]');
    if (deleteBtn) {
        const bubble = deleteBtn.closest('[data-comment-id]');
        if (!confirm('Hapus komentar ini?')) return;
        try {
            await softDeleteEntry('comments', bubble.dataset.commentId);
        } catch (err) {
            console.error('Gagal menghapus komentar:', err);
            alert('Gagal menghapus komentar. Cek console untuk detail.');
        }
        return;
    }

    const reactionBtn = e.target.closest('[data-comment-reaction]');
    if (reactionBtn) {
        const bubble = reactionBtn.closest('[data-comment-id]');
        const commentId = bubble.dataset.commentId;
        const reactionType = reactionBtn.dataset.commentReaction;
        reactionBtn.disabled = true;
        try {
            const newReaction = await toggleReaction('comments', commentId, reactionType);
            if (newReaction === reactionType) {
                reactionBtn.classList.remove('pop-animate');
                void reactionBtn.offsetWidth;
                reactionBtn.classList.add('pop-animate');
            }
        } catch (err) {
            console.error('Gagal update reaksi komentar:', err);
        } finally {
            reactionBtn.disabled = false;
        }
    }
}

// Cooldown anti-spam: jeda minimum antar pengiriman komentar dari sheet yang
// sama. Disimpan sebagai timestamp terakhir kirim (bukan boolean sending
// biasa) supaya jeda tetap dihitung dari kapan komentar TERAKHIR berhasil
// terkirim, bukan cuma dari kapan tombol terakhir diklik.
let _lastCommentSubmitAt = 0;
let _cooldownColorTimeout = null;
const COMMENT_SUBMIT_COOLDOWN_MS = 5000;

async function submitCommentFromSheet() {
    if (!_currentCommentContext) return;
    const textInput = document.getElementById('comment-sheet-text');
    const sendBtn = document.getElementById('comment-sheet-send');

    if (!textInput.value.trim()) return;

    const elapsed = Date.now() - _lastCommentSubmitAt;
    if (elapsed < COMMENT_SUBMIT_COOLDOWN_MS) {
        const remainingSec = Math.ceil((COMMENT_SUBMIT_COOLDOWN_MS - elapsed) / 1000);
        showCommentCooldownHint(remainingSec);
        return;
    }

    sendBtn.classList.add('sending');
    sendBtn.disabled = true;
    try {
        await submitComment(_currentCommentContext.entryType, _currentCommentContext.entryId, getSavedCommentName(), textInput.value, getSavedCommentAvatar());
        _lastCommentSubmitAt = Date.now();
        textInput.value = '';
        textInput.style.height = 'auto';
        textInput.focus();

        // Tombol kirim berubah biru selama masa cooldown berjalan, memberi
        // sinyal visual real-time (bukan cuma saat user mencoba klik lagi)
        // bahwa ada jeda aktif sebelum bisa kirim komentar berikutnya.
        sendBtn.classList.add('on-cooldown');
        clearTimeout(_cooldownColorTimeout);
        _cooldownColorTimeout = setTimeout(() => {
            sendBtn.classList.remove('on-cooldown');
        }, COMMENT_SUBMIT_COOLDOWN_MS);
    } catch (err) {
        console.error('Gagal kirim komentar:', err);
        alert('Gagal mengirim komentar. Cek koneksi.');
    } finally {
        setTimeout(() => sendBtn.classList.remove('sending'), 500);
        sendBtn.disabled = false;
    }
}

/**
 * Menampilkan hint sementara di dekat tombol kirim saat user mencoba
 * mengirim komentar selagi masih dalam masa cooldown. Menggunakan tooltip
 * kecil yang muncul-hilang sendiri, bukan alert() -- alert() akan terasa
 * mengganggu kalau muncul berulang tiap kali user tidak sabar mencoba klik.
 */
let _cooldownHintTimeout = null;
function showCommentCooldownHint(remainingSec) {
    const sendBtn = document.getElementById('comment-sheet-send');
    let hint = document.getElementById('comment-cooldown-hint');
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'comment-cooldown-hint';
        hint.className = 'comment-cooldown-hint';
        sendBtn.parentElement.appendChild(hint);
    }
    hint.textContent = `Tunggu ${remainingSec}s lagi`;
    hint.classList.add('is-visible');
    sendBtn.classList.add('shake');

    clearTimeout(_cooldownHintTimeout);
    _cooldownHintTimeout = setTimeout(() => {
        hint.classList.remove('is-visible');
    }, 1500);
    setTimeout(() => sendBtn.classList.remove('shake'), 400);
}

// ============================================================
// FIREBASE CONFIG — isi dengan key project Firebase kamu sendiri
// ============================================================
// Ambil dari: Firebase Console → Project Settings → General →
// scroll ke "Your apps" → SDK setup and configuration → Config
//
// Firestore collections yang dipakai (dibuat otomatis saat data
// pertama ditulis, tidak perlu dibuat manual -- KECUALI config/admin
// dan verified_admins, lihat firestore.rules untuk instruksi setup):
//   - timeline_entries : { period, description, linkText, linkUrl, order, likes, dislikes, deleted?, createdAt }
//   - gallery_items    : { imageUrl, order, likes, dislikes, deleted?, createdAt }
//   - log_entries      : { date, description, imageUrl, order, likes, dislikes, deleted?, createdAt }
//   - comments         : { entryType, entryId, name, text, deleted?, createdAt }
//   - config/admin     : { pinHash } -- diisi MANUAL lewat Firebase Console, tidak pernah dari aplikasi
//   - verified_admins  : dibuat otomatis oleh aplikasi saat PIN benar dimasukkan
//
// Storage dipakai untuk upload gambar gallery & log devs, disimpan
// di path: gallery/{timestamp}-{filename} dan logs/{timestamp}-{filename}
//
// Lihat firestore.rules untuk instruksi lengkap setup PIN admin dan
// mengaktifkan Anonymous Authentication (wajib sebelum admin mode bisa
// dipakai).
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyA4dhtz1M8nVo0ljh9ekl_DiCkcuJlBPIQ",
    authDomain: "folio-8d740.firebaseapp.com",
    projectId: "folio-8d740",
    storageBucket: "folio-8d740.firebasestorage.app",
    messagingSenderId: "514372101152",
    appId: "1:514372101152:web:6ad18dca86d31ace0bc845"
};

// Inisialisasi Firebase (dipanggil via CDN compat SDK di setiap halaman)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// PENTING: settings ini HARUS dipanggil sebelum operasi Firestore apa pun
// (query, get, onSnapshot, dll) -- karena itu ditaruh di sini, tepat setelah
// db dibuat, sebelum file lain (admin-shared.js, script halaman) sempat
// memakainya.
//
// experimentalAutoDetectLongPolling: beberapa jaringan/perangkat (VPN,
// proxy tertentu, beberapa jaringan seluler, kadang lingkungan seperti
// Termux+browser Android) membuat koneksi real-time WebSocket bawaan
// Firestore gagal terhubung dengan baik atau menggantung tanpa pernah
// resolve/reject, meski permintaan REST biasa (seperti signInAnonymously)
// tetap normal. Setting ini membuat SDK mendeteksi kondisi itu dan otomatis
// beralih ke mode long-polling yang lebih kompatibel, tanpa perlu
// dipaksakan manual. Ini pengaturan resmi dari dokumentasi Firebase,
// bukan workaround yang saya karang sendiri.
db.settings({
    experimentalAutoDetectLongPolling: true,
    merge: true
});
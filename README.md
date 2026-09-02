# Devs Portfolio

Situs portofolio statis (HTML + Tailwind CDN + Firebase) dengan 4 halaman: Present (`index.html`), Timeline, Gallery, dan Log Devs. Admin bisa menambah/edit/hapus konten lewat mode admin yang dilindungi PIN, tanpa perlu backend server terpisah — semua data disimpan di Firestore dan gambar di Firebase Storage.

## Struktur folder

```
├── firebase.json              # Config Firebase Hosting + lokasi firestore.rules
├── .firebaserc                # ID project Firebase
├── firestore.rules            # Security rules (dideploy via CLI, bukan file yang diserve ke browser)
├── .gitignore
│
└── public/                    # Folder yang benar-benar diserve ke browser
    ├── index.html             # Halaman "Present"
    ├── timeline.html
    ├── gallery.html
    ├── log-devs.html
    └── js/
        ├── admin-shared.js
        ├── firebase-config.js          # Isi dengan key asli kamu (gitignored)
        └── firebase-config.example.js  # Template placeholder (aman di-commit)
```

## Setup dari nol

### 1. Buat project Firebase
Kalau belum punya, buat di [Firebase Console](https://console.firebase.google.com).

### 2. Isi config Firebase
Copy `public/js/firebase-config.example.js` jadi `public/js/firebase-config.js`, lalu isi 6 field-nya dengan value dari **Project Settings → General → Your apps → SDK setup and configuration**.

### 3. Aktifkan Firestore
Firebase Console → Firestore Database → Create database.

### 4. Aktifkan Storage
Firebase Console → Storage → Get started. Dipakai untuk upload gambar Gallery & Log Devs.

### 5. Aktifkan Anonymous Authentication
Firebase Console → Authentication → Sign-in method → **Anonymous** → Enable.

Ini bukan halaman login untuk pengunjung — pengunjung tidak melihat apa pun berubah. Ini dipakai di belakang layar untuk mengikat sesi admin secara aman ke satu browser, setelah PIN diverifikasi lewat popup.

### 6. Setup PIN admin
1. Firestore Database → tab **Data**
2. Buat collection `config`, dokumen dengan ID `admin`
3. Tambahkan field `pinHash` (tipe: string)
4. Ambil hash PIN kamu: buka halaman manapun di situs ini di browser, buka Console (F12), jalankan:
   ```js
   sha256Hex("PIN_KAMU_DISINI").then(console.log)
   ```
5. Copy hasil string 64 karakter itu ke field `pinHash`. **Jangan simpan PIN asli di Firestore, hanya hash-nya.**

### 7. Deploy Firestore rules
```bash
firebase deploy --only firestore:rules
```

### 8. Deploy hosting
```bash
firebase deploy --only hosting
```

## Cara pakai mode admin

Klik teks "Hai, I'm Fardhan 👋" di header sebanyak 5x dalam 2 detik → popup PIN muncul → masukkan PIN → halaman reload dengan tombol admin aktif (Add new / New log / icon edit). Sesi admin otomatis berakhir saat tab/browser ditutup. Klik 5x lagi saat sudah admin untuk logout manual.

## Troubleshooting

**PIN/write Firestore menggantung selamanya (paling umum: database belum benar-benar dibuat)**

Kalau PIN atau operasi tulis Firestore apa pun menggantung tanpa pernah selesai (baik sukses maupun error) — coba dulu tes ini di Console browser:
```js
fetch('https://firestore.googleapis.com/v1/projects/GANTI_PROJECT_ID/databases/(default)/documents/comments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { entryType: {stringValue:'timeline'}, entryId: {stringValue:'test'}, name: {stringValue:'Test'}, text: {stringValue:'test'} } })
}).then(r => r.json()).then(d => console.log(JSON.stringify(d)));
```
Kalau hasilnya berisi pesan seperti *"The database (default) does not exist for project ..."* — itu artinya Firestore Database **belum pernah benar-benar dibuat/diprovisioning**, meski API-nya sudah "enabled". Perbedaan ini penting: mengaktifkan API Firestore tidak sama dengan membuat instance database-nya.

**Solusi:** Firebase Console → **Firestore Database** (menu kiri) → kalau belum ada database sama sekali, klik **Create database** → pilih mode **Native mode** (bukan Datastore mode) → pilih lokasi → selesaikan wizard-nya. Setelah ini, ulangi tes fetch di atas — harusnya dapat respons sukses (atau permission-denied dari rules, yang juga tandanya database SUDAH ada, cuma ditolak rules), bukan lagi pesan "does not exist".

Ini menjelaskan kenapa operasi lewat SDK (WebChannel/real-time) terasa menggantung selamanya alih-alih error cepat: SDK mencoba membuka koneksi streaming ke database yang belum ada, sehingga tidak pernah dapat respons jelas. REST API biasa bisa langsung memvalidasi keberadaan database di lapisan gateway, makanya errornya muncul cepat dan jelas — inilah kenapa tes fetch di atas jadi cara diagnosis paling efektif untuk kasus ini.

**Setelah membuat ULANG database (bukan sekadar edit) — rules jadi permission-denied**

Rules Firestore terikat ke instance database spesifik, bukan otomatis berlaku untuk project secara umum. Kalau database di-**hapus dan dibuat ulang** (misal karena salah pilih edition/mode saat pertama kali membuat), Firebase mereset rules-nya ke default bawaan (production mode = deny semua, test mode = allow semua sementara) — rules custom yang sudah pernah di-deploy sebelumnya TIDAK ikut pindah ke database yang baru.

**Penting: membuat ulang database juga menghapus SEMUA DATA di dalamnya, termasuk dokumen `config/admin` yang berisi `pinHash`.** Setelah redeploy rules, PIN akan tetap ditolak (`permission-denied`) sampai dokumen `config/admin` dibuat ulang secara manual juga (lihat langkah setup PIN admin di atas) — bukan cuma rules-nya saja yang perlu di-deploy ulang.

**Solusi:** deploy ulang `firebase deploy --only firestore:rules` dari root project setelah setiap kali database dibuat ulang, lalu verifikasi isinya di Firebase Console → Firestore Database → tab Rules (harus mengandung `isAdmin` dan `verified_admins`, bukan cuma `allow read, write: if false/true`). Setelah itu, buat ulang juga dokumen `config/admin` dengan field `pinHash` (langkah setup PIN admin di bagian atas README ini).

**Salah jalankan `firebase init` atau `firebase deploy` dari dalam folder `public/`**

Kalau tidak sengaja menjalankan `firebase init` saat working directory-nya ada di `public/` (bukan root project), akan muncul `firebase.json`, `.firebaserc`, dan kemungkinan `firestore.rules` BARU di dalam `public/` — terpisah dan berpotensi BERBEDA dari `firestore.rules` asli di root yang berisi logic PIN admin (`isAdmin()`, `verified_admins`, dll). Kalau deploy dijalankan dari situ, rules yang benar-benar ter-deploy ke Firebase project-mu jadi rules yang salah (biasanya kosong/default), bukan rules yang dirancang untuk project ini.

**Cara cek dan perbaiki:**
1. Cek apakah ada `public/firebase.json` — kalau ada, itu tandanya kejadian ini
2. Hapus `public/firebase.json`, `public/.firebaserc`, dan `public/firestore.rules` (kalau ada) — `public/` seharusnya HANYA berisi file statis situs (html, folder js)
3. Pastikan working directory kembali ke root project (folder yang berisi `firebase.json` asli, sejajar dengan `public/`)
4. Deploy ulang dari sana: `firebase deploy --only firestore:rules`
5. Verifikasi di Firebase Console → Firestore Database → tab Rules, isinya harus mengandung kata `verified_admins` dan `isAdmin` — kalau tidak ada, berarti rules yang salah masih aktif

**PIN stuck di "Memverifikasi..." atau muncul pesan domain tidak diizinkan**

Kalau testing lokal (misal via `python -m http.server` di Termux) dan console browser menunjukkan pesan seperti *"The current domain is not authorized for OAuth operations"* dengan domain `127.0.0.1` — ini karena Firebase membedakan `127.0.0.1` dan `localhost` sebagai domain berbeda, dan `localhost` biasanya sudah otomatis masuk daftar Authorized domains bawaan, sementara `127.0.0.1` tidak.

**Solusi termudah:** akses situs lewat `http://localhost:PORT/...`, bukan `http://127.0.0.1:PORT/...`. Tidak perlu ubah apa pun di Firebase Console.

**Kalau tetap perlu pakai `127.0.0.1`:** tambahkan manual di Firebase Console → Authentication → Settings → tab **Authorized domains**.

**Firestore write/read menggantung selamanya tanpa error (di jaringan/perangkat tertentu)**

Beberapa jaringan (VPN, proxy, jaringan seluler tertentu, atau kombinasi Termux+browser Android) membuat koneksi real-time WebSocket bawaan Firestore gagal terhubung dengan baik — permintaan REST biasa (seperti Auth) tetap normal, tapi operasi baca/tulis Firestore bisa menggantung tanpa pernah selesai. `public/js/firebase-config.js` sudah mengaktifkan `experimentalAutoDetectLongPolling` untuk menangani ini secara otomatis. Kalau masih bermasalah setelah ini, coba jaringan WiFi yang berbeda untuk memastikan bukan soal pemblokiran jaringan spesifik.

**Warning "cdn.tailwindcss.com should not be used in production"**

Ini peringatan standar dari Tailwind Play CDN, bukan error — situs tetap berfungsi normal. CSS custom di project ini sengaja tetap dibiarkan pakai Tailwind CDN (bukan build step CLI/PostCSS) karena beberapa utility class custom bergantung pada compiler runtime CDN ini.

**Update: gambar sekarang disimpan langsung di Firestore, bukan Firebase Storage**

Karena konfigurasi CORS bucket Storage butuh akses Google Cloud Console yang di beberapa kasus mensyaratkan billing/free trial GCP diaktifkan (dan proses itu bisa gagal karena masalah verifikasi pembayaran di luar kendali project ini), upload gambar di Gallery & Log Devs sekarang **tidak lagi memakai Firebase Storage sama sekali**. Sebagai gantinya, gambar dikompres otomatis di browser (resize + kompresi JPEG, dijamin di bawah ~700KB apa pun ukuran aslinya) dan disimpan langsung sebagai Base64 data URL di field `imageUrl` pada dokumen Firestore.

**Trade-off yang perlu diketahui:**
- Firestore membatasi ukuran dokumen maksimal 1MB, jadi gambar dikompres cukup agresif untuk foto beresolusi sangat tinggi — kualitas visual gambar galeri/log akan lebih rendah dibanding upload langsung ke Storage, tapi tetap layak untuk tampilan web
- Gambar PNG transparan akan kehilangan transparansinya (dikonversi jadi latar putih) karena hasil akhir selalu JPEG
- `uploadImageToStorage()` di `admin-shared.js` masih ada (tidak dihapus) kalau suatu saat CORS/billing Storage sudah beres dan mau beralih kembali ke pendekatan Storage — tinggal ganti pemanggilan `compressImageToDataUrl()` balik ke `uploadImageToStorage()` di `gallery.html` dan `log-devs.html`

**(Arsip) Upload gambar (Gallery/Log Devs) gagal dengan error CORS di console — hanya relevan kalau memakai `uploadImageToStorage()`**

Firebase Storage tidak otomatis mengizinkan upload dari origin selain domain Firebase Hosting resminya (beda dengan Auth yang otomatis mengizinkan `localhost`). Kalau testing dari `localhost` atau domain lain (Vercel, dll), bucket Storage butuh konfigurasi CORS eksplisit.

**Solusi — buat file `cors.json`:**
```json
[
  {
    "origin": ["*"],
    "method": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Authorization", "Content-Length", "X-Goog-Upload-Protocol", "X-Goog-Upload-Command", "X-Goog-Upload-URL", "X-Goog-Upload-Status", "X-Goog-Upload-Header-Content-Length", "X-Goog-Upload-Header-Content-Type"]
  }
]
```

Lalu terapkan lewat salah satu cara:
- **Command line** (butuh Google Cloud SDK/`gsutil` terinstall): `gsutil cors set cors.json gs://NAMA_BUCKET_KAMU`
- **Web UI** (tanpa install apa pun): buka `console.cloud.google.com/storage/browser`, pilih bucket Storage project ini, cari bagian konfigurasi CORS di detail bucket, paste isi JSON di atas

Setelah CORS diterapkan, tunggu beberapa menit (kadang butuh waktu propagasi) sebelum mencoba upload lagi.

## Catatan keamanan

- Setiap penulisan data oleh admin (tambah/edit entry, upload gambar) diverifikasi di level Firestore Security Rules lewat sesi Firebase Anonymous Auth yang tercatat di collection `verified_admins` — bukan sekadar tombol yang disembunyikan di tampilan. Detail lengkap mekanismenya ada di komentar dalam `firestore.rules`.
- Hapus entry didesain sebagai *soft delete* (menandai `deleted: true`, bukan menghapus dokumen sungguhan), karena Firestore rules tidak bisa memverifikasi otorisasi pada operasi delete asli. Kalau admin salah hapus, bisa di-undo langsung dari Firebase Console.
- Komentar dan reaksi like/dislike sengaja dibuka untuk siapa saja tanpa login, sesuai desain situs ini.

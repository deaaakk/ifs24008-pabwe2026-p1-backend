# Frontend Netlify + backend terpisah

Status: kode disiapkan dan diuji di lingkungan pengembangan; belum dipasang pada akun hosting pengguna. Login online belum dapat bekerja sebelum backend memiliki URL HTTPS yang aktif. Keberhasilan lokal tidak otomatis berarti server online tersedia.

## 1. Jalankan backend pada hosting yang mendukung Bun atau Docker

Gunakan folder `backend` sebagai root layanan. Build tanpa Docker: `npm ci`. Start: `npm start` (Bun harus tersedia). Alternatif: gunakan Dockerfile di folder backend. Layanan harus menjalankan proses terus-menerus dan menyediakan penyimpanan persisten; jangan menjalankan SQLite pada filesystem sementara atau beberapa replika.

Atur environment backend:

- `PORT`: sesuai port layanan hosting (default 3000).
- `DB_PATH`: `/data/reservasi.db`, pasang disk/volume persisten pada `/data`.
- `FRONTEND_ORIGIN`: `https://ifs24008-pabwe2026-p1.netlify.app` (ganti bila domain frontend berbeda; tanpa garis miring terakhir).
- `COOKIE_SECURE`: `true`.
- `ADMIN_EMAIL`: email admin milikmu.
- `ADMIN_PASSWORD`: password baru 12–128 karakter; jangan kirim ke chat atau GitHub.

Pada console layanan backend dengan environment dan disk yang sama, jalankan `npm run admin:create` sekali. Ini membuat admin tanpa akun demo; bila email sudah ada, perintah berhenti tanpa mengubah akun. Masuk sebagai admin untuk menambahkan ruangan. Jangan menjalankan `npm run seed` di server publik karena membuat akun demo dengan password yang diketahui.

Jika memakai Docker secara manual, pasang volume ke /data dan masukkan environment ke container. Jalankan pembuatan admin di dalam container yang berjalan (`docker exec <nama-container> bun src/create-admin.js`). HTTPS/domain ditangani hosting atau reverse proxy. Dockerfile sendiri tidak menyediakan domain, sertifikat, atau volume persisten.

Buka `https://DOMAIN-BACKEND/api/health`. Lanjut hanya jika mendapat `{"status":"ok"}`. Catat origin backend tanpa `/api`.

## 2. Deploy frontend di Netlify

Upload/push kode versi ini ke repository milikmu. Hapus berkas API lama `frontend/netlify/` jika menimpa versi percobaan sebelumnya; paket ini tidak menggunakannya. Jangan unggah node_modules atau .env. Folder backend dan frontend boleh tetap dalam satu repo.

Build settings:

| Pengaturan | Isi |
|---|---|
| Base directory | frontend |
| Build command | npm run build:netlify |
| Publish directory | build (relatif terhadap frontend) |
| Environment BACKEND_URL | https://DOMAIN-BACKEND |

`BACKEND_URL` harus tersedia pada tahap Builds untuk konteks Production. Ganti contoh dengan alamat backend sesungguhnya, tanpa /api. Jangan gunakan domain frontend sebagai BACKEND_URL karena akan berputar kembali ke frontend. Deploy ulang setelah mengubah variabel ini.

Script build membuat proxy `/api/*` ke backend terpisah. Browser tetap mengakses `/api` pada alamat frontend agar sesi cookie konsisten; kode API dan database berjalan di backend. Produksi mengabaikan VITE_API_URL lokal. Jangan menambahkan redirect `/* /index.html` karena proyek memakai SvelteKit.

Dokumentasi proxy: https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/

## 3. Verifikasi online

1. Buka https://ifs24008-pabwe2026-p1.netlify.app/api/health dan periksa status ok.
2. Login dengan admin yang dibuat di backend, buat ruangan.
3. Daftarkan akun mahasiswa; gunakan admin untuk memberi peran ketua/dosen pada akun yang berhak.
4. Pastikan ketua/dosen bisa mengajukan reservasi, mahasiswa tidak bisa.
5. Muat ulang halaman profil dan coba logout/login. Periksa persistensi data setelah restart backend.

Jika health backend berhasil tetapi health frontend gagal, cek BACKEND_URL dan build terbaru. Jika muncul Origin tidak diizinkan, cocokkan FRONTEND_ORIGIN dengan URL frontend persis. Jika login berhasil tetapi profil 401, periksa cookie dan HTTPS lewat Network browser.

Hosting backend belum dipilih/dibuat oleh paket ini. Pengaturan volume dan HTTPS bergantung pada penyedia yang kamu gunakan; catat nama penyedia dan URL backend untuk melanjutkan konfigurasi. Jangan memasukkan data penting sebelum disk persisten dan backup sudah diuji.

# Backend reservasi ruangan

Ekstrak ZIP ini. Buka folder backend di VS Code, lalu Terminal > New Terminal. Perlu Node.js/npm dan Bun terpasang. Jalankan satu per satu di PowerShell:

```powershell
npm install
Copy-Item .env.example .env
npm run seed
npm run dev
```

Salin .env hanya jika belum ada. Biarkan terminal terbuka. Cek http://localhost:3000/api/health — hasilnya status ok. Aplikasi tampil dari frontend pada http://localhost:3005, bukan pada port backend.

Seed membuat akun demo lokal: admin@del.ac.id, ketua@del.ac.id, dosen@del.ac.id, mahasiswa@del.ac.id. Password akun baru: Praktikum123! (akun lama tidak ditimpa). Hanya ketua dan dosen boleh reservasi. Pendaftaran selalu mahasiswa; admin menetapkan peran.

Data tersimpan di data/reservasi.db. Jangan hapus data lama. Jangan jalankan seed demo di server publik. Panduan online ada di DEPLOY-ONLINE.md; pada layanan backend gunakan isi folder ini sebagai root.

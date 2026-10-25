import { db } from './db.js';
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !/^\S+@\S+\.\S+$/.test(email) || !password || password.length < 12 || password.length > 128) throw new Error('Isi ADMIN_EMAIL dan ADMIN_PASSWORD (12–128 karakter) di environment backend.');
if (db.query('SELECT id FROM users WHERE email=?').get(email)) throw new Error('Email sudah digunakan. Akun tidak diubah; gunakan email admin baru.');
const hash = await Bun.password.hash(password, {algorithm:'argon2id'});
db.query("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')").run('Admin Ruangan',email,hash);
console.log('Admin berhasil dibuat.');

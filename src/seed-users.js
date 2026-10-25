import { db } from './db.js';
const demo = [
 ['Admin Ruangan','admin@del.ac.id','admin',''],
 ['Ketua Kelas IF A','ketua@del.ac.id','ketua','IF A'],
 ['Dosen Demo','dosen@del.ac.id','dosen',''],
 ['Mahasiswa Demo','mahasiswa@del.ac.id','mahasiswa','IF A']
];
for(const [name,email,role,class_name] of demo){
 if(!db.query('SELECT id FROM users WHERE email=?').get(email)){
  const hash=await Bun.password.hash('Praktikum123!',{algorithm:'argon2id'});
  db.query('INSERT INTO users(name,email,password_hash,role,class_name) VALUES (?,?,?,?,?)').run(name,email,hash,role,class_name);
  console.log('Akun demo dibuat:',email);
 }
}
console.log('Seed selesai. Password akun demo baru: Praktikum123!');

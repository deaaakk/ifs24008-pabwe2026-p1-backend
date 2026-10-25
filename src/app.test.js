import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
process.env.DB_PATH=':memory:';
const {createApp}=await import('./app.js');const {db}=await import('./db.js');
let server,base;const cookies={};const users={};let roomId,reservationId;
const call=(path,method='GET',body,role,headers={})=>fetch(base+path,{method,headers:{'content-type':'application/json',...(role?{cookie:cookies[role]}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
const body=()=>({room_id:roomId,borrower_name:'Palsu',purpose:'Diskusi',date:'2026-11-01',start_time:'09:00',end_time:'10:00'});
beforeAll(async()=>{
 server=createApp().listen(0);base=`http://localhost:${server.address().port}/api`;
 for(const role of ['admin','ketua','dosen','mahasiswa']){
  const hash=await Bun.password.hash('Praktikum123!');
  const result=db.query('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(role,role+'@del.ac.id',hash,role);users[role]=Number(result.lastInsertRowid);
  const res=await call('/auth/login','POST',{email:role+'@del.ac.id',password:'Praktikum123!'});
  cookies[role]=res.headers.get('set-cookie').split(';')[0];
 }
});afterAll(()=>server.close());
describe('Login, profil dan otorisasi reservasi',()=>{
 test('health tersedia; data aplikasi memerlukan sesi',async()=>{expect((await call('/health')).status).toBe(200);expect((await call('/rooms')).status).toBe(401);});
 test('password salah ditolak dan hash tidak terekspos',async()=>{expect((await call('/auth/login','POST',{email:'ketua@del.ac.id',password:'salah'})).status).toBe(401);const res=await call('/users/me','GET',null,'ketua');expect((await res.json()).password_hash).toBeUndefined();});
 test('register tidak menerima eskalasi peran',async()=>{const res=await call('/auth/register','POST',{name:'Baru',email:'baru@del.ac.id',password:'Password123!',role:'admin'});expect(res.status).toBe(201);expect((await res.json()).role).toBe('mahasiswa');});
 test('profil dapat diubah tanpa eskalasi peran',async()=>{const res=await call('/users/me','PUT',{name:'Ketua Baru',class_name:'IF A',phone:'0812345',role:'admin'},'ketua');expect((await res.json()).role).toBe('ketua');});
 test('mahasiswa tidak boleh mengelola ruangan',async()=>{expect((await call('/rooms','POST',{name:'Lab',location:'A',capacity:10},'mahasiswa')).status).toBe(403);});
 test('admin dapat membuat ruangan',async()=>{const res=await call('/rooms','POST',{name:'Lab',location:'A',capacity:10},'admin');expect(res.status).toBe(201);roomId=(await res.json()).id;});
 test('mahasiswa dan admin tidak boleh mengajukan reservasi',async()=>{for(const role of ['mahasiswa','admin'])expect((await call('/reservations','POST',body(),role)).status).toBe(403);});
 test('ketua boleh reservasi; nama dan user_id dari sesi',async()=>{const res=await call('/reservations','POST',{...body(),user_id:users.dosen},'ketua');expect(res.status).toBe(201);const data=await res.json();reservationId=data.id;expect(data.user_id).toBe(users.ketua);expect(data.borrower_name).toBe('Ketua Baru');});
 test('dosen boleh reservasi pada jadwal tidak bentrok',async()=>{expect((await call('/reservations','POST',{...body(),start_time:'10:00',end_time:'11:00'},'dosen')).status).toBe(201);});
 test('jadwal bentrok ditolak',async()=>{expect((await call('/reservations','POST',body(),'dosen')).status).toBe(409);});
 test('tanggal kalender dan jam operasional divalidasi',async()=>{for(const data of [{date:'2026-02-30'},{date:'2026-99-01'},{start_time:'07:00'},{end_time:'08:00'}])expect((await call('/reservations','POST',{...body(),...data},'ketua')).status).toBe(400);});
 test('mahasiswa dapat melihat jadwal',async()=>{expect((await call('/reservations','GET',null,'mahasiswa')).status).toBe(200);});
 test('ketua tidak boleh menyetujui atau menghapus',async()=>{expect((await call(`/reservations/${reservationId}/status`,'PATCH',{status:'approved'},'ketua')).status).toBe(403);expect((await call(`/reservations/${reservationId}`,'DELETE',null,'ketua')).status).toBe(403);});
 test('dosen tidak boleh membatalkan/mengubah milik ketua',async()=>{expect((await call(`/reservations/${reservationId}/status`,'PATCH',{status:'cancelled'},'dosen')).status).toBe(403);expect((await call(`/reservations/${reservationId}`,'PUT',body(),'dosen')).status).toBe(403);});
 test('admin menyetujui dan pemilik membatalkan sendiri',async()=>{expect((await call(`/reservations/${reservationId}/status`,'PATCH',{status:'approved'},'admin')).status).toBe(200);expect((await call(`/reservations/${reservationId}/status`,'PATCH',{status:'cancelled'},'ketua')).status).toBe(200);});
 test('mengaktifkan kembali jadwal bentrok ditolak',async()=>{expect((await call('/reservations','POST',body(),'dosen')).status).toBe(201);expect((await call(`/reservations/${reservationId}/status`,'PATCH',{status:'approved'},'admin')).status).toBe(409);});
 test('hanya admin dapat menetapkan peran',async()=>{expect((await call(`/users/${users.mahasiswa}/role`,'PATCH',{role:'ketua'},'mahasiswa')).status).toBe(403);expect((await call(`/users/${users.mahasiswa}/role`,'PATCH',{role:'ketua'},'admin')).status).toBe(200);expect((await (await call('/users/me','GET',null,'mahasiswa')).json()).role).toBe('ketua');});
 test('perubahan peran langsung membatasi sesi lama',async()=>{await call(`/users/${users.ketua}/role`,'PATCH',{role:'mahasiswa'},'admin');expect((await call('/reservations','POST',{...body(),date:'2026-11-02'},'ketua')).status).toBe(403);});
 test('Origin asing ditolak',async()=>{expect((await call('/rooms','POST',{},'admin',{origin:'https://asing.example'})).status).toBe(403);});
 test('logout menghapus sesi di server',async()=>{expect((await call('/auth/logout','POST',null,'mahasiswa')).status).toBe(204);expect((await call('/users/me','GET',null,'mahasiswa')).status).toBe(401);});
 test('ubah password mematikan sesi lama',async()=>{expect((await call('/users/me/password','PUT',{current_password:'Praktikum123!',password:'PasswordBaru123!'},'dosen')).status).toBe(204);expect((await call('/users/me','GET',null,'dosen')).status).toBe(401);expect((await call('/auth/login','POST',{email:'dosen@del.ac.id',password:'PasswordBaru123!'})).status).toBe(200);});
});

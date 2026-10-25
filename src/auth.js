import { randomBytes, createHash } from 'node:crypto';
import { db } from './db.js';
export const roles = ['mahasiswa', 'ketua', 'dosen', 'admin'];
export const publicUser = user => ({id:user.id,name:user.name,email:user.email,role:user.role,class_name:user.class_name,phone:user.phone});
const digest = value => createHash('sha256').update(value).digest('hex');
export function sessionToken(req) {
 const pair = (req.headers.cookie ?? '').split(';').map(s=>s.trim()).find(s=>s.startsWith('reservasi_session='));
 return pair ? pair.slice('reservasi_session='.length) : '';
}
export function startSession(req, res, userId) {
 const token = randomBytes(32).toString('hex');
 db.query('INSERT INTO sessions VALUES (?,?,?)').run(digest(token),userId,Date.now()+7*86400000);
 res.cookie('reservasi_session',token,{httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE==='true',maxAge:7*86400000,path:'/'});
}
export function endSession(req,res) {
 db.query('DELETE FROM sessions WHERE token_hash=?').run(digest(sessionToken(req)));
 res.clearCookie('reservasi_session',{httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE==='true',path:'/'});
}
export function requireAuth(req,res,next) {
 const token=sessionToken(req);
 const user=token && db.query(`SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?`).get(digest(token),Date.now());
 if(!user) return res.status(401).json({error:'Silakan login terlebih dahulu'});
 req.user=user;next();
}
export const allowRoles = (...allowed) => (req,res,next) => {
 if(!allowed.includes(req.user.role)) return res.status(403).json({error:'Akses ditolak untuk peran akun ini'});
 next();
};
export function registerAuthRoutes(app) {
 app.post('/api/auth/register',async(req,res)=>{
  const {name,email,password,class_name=''}=req.body ?? {};
  if(typeof name!=='string'||!name.trim()||typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||typeof password!=='string'||password.length<8||password.length>128||typeof class_name!=='string')
   return res.status(400).json({error:'Isi nama, email valid, dan password 8–128 karakter'});
  const normalized=email.trim().toLowerCase();
  if(db.query('SELECT id FROM users WHERE email=?').get(normalized)) return res.status(409).json({error:'Email sudah terdaftar'});
  const hash=await Bun.password.hash(password,{algorithm:'argon2id'});
  try {
   const result=db.query('INSERT INTO users (name,email,password_hash,class_name) VALUES (?,?,?,?)').run(name.trim(),normalized,hash,class_name.trim());
   res.status(201).json(publicUser(db.query('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid)));
  }catch(e){if(String(e.message).includes('UNIQUE')) return res.status(409).json({error:'Email sudah terdaftar'});throw e;}
 });
 app.post('/api/auth/login',async(req,res)=>{
  const {email,password}=req.body ?? {};
  if(typeof email!=='string'||typeof password!=='string'||password.length>128) return res.status(400).json({error:'Email dan password wajib diisi'});
  const user=db.query('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase());
  if(!user||!await Bun.password.verify(password,user.password_hash)) return res.status(401).json({error:'Email atau password salah'});
  db.query('DELETE FROM sessions WHERE token_hash=?').run(digest(sessionToken(req)));startSession(req,res,user.id);res.json(publicUser(user));
 });
 app.post('/api/auth/logout',(req,res)=>{endSession(req,res);res.status(204).end();});
 app.get('/api/users/me',requireAuth,(req,res)=>res.json(publicUser(req.user)));
 app.put('/api/users/me',requireAuth,(req,res)=>{
  const {name,class_name='',phone=''}=req.body ?? {};
  if(typeof name!=='string'||!name.trim()||typeof class_name!=='string'||typeof phone!=='string') return res.status(400).json({error:'Data profil tidak valid'});
  db.query('UPDATE users SET name=?,class_name=?,phone=? WHERE id=?').run(name.trim(),class_name.trim(),phone.trim(),req.user.id);
  res.json(publicUser(db.query('SELECT * FROM users WHERE id=?').get(req.user.id)));
 });
 app.put('/api/users/me/password',requireAuth,async(req,res)=>{
  const {current_password,password}=req.body ?? {};
  if(typeof current_password!=='string'||typeof password!=='string'||password.length<8||password.length>128) return res.status(400).json({error:'Password baru harus 8–128 karakter'});
  if(!await Bun.password.verify(current_password,req.user.password_hash)) return res.status(400).json({error:'Password lama tidak sesuai'});
  const hash=await Bun.password.hash(password,{algorithm:'argon2id'});
  db.transaction(()=>{db.query('UPDATE users SET password_hash=? WHERE id=?').run(hash,req.user.id);db.query('DELETE FROM sessions WHERE user_id=?').run(req.user.id);})();
  endSession(req,res);res.status(204).end();
 });
 app.get('/api/users',requireAuth,allowRoles('admin'),(_req,res)=>res.json(db.query('SELECT * FROM users ORDER BY name').all().map(publicUser)));
 app.patch('/api/users/:id/role',requireAuth,allowRoles('admin'),(req,res)=>{
  const {role}=req.body ?? {};
  if(!roles.includes(role)) return res.status(400).json({error:'Peran tidak valid'});
  if(Number(req.params.id)===req.user.id) return res.status(400).json({error:'Admin tidak dapat mengubah perannya sendiri'});
  const result=db.query('UPDATE users SET role=? WHERE id=?').run(role,req.params.id);
  if(!result.changes) return res.status(404).json({error:'Pengguna tidak ditemukan'});
  res.json(publicUser(db.query('SELECT * FROM users WHERE id=?').get(req.params.id)));
 });
}

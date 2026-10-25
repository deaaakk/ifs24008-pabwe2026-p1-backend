import express from 'express';
import cors from 'cors';
import { db } from './db.js';
import { registerAuthRoutes, requireAuth, allowRoles } from './auth.js';

const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const bad = (res, message, status = 400) => res.status(status).json({ error: message });

function validateRoom(b) {
  if (typeof b.name !== 'string' || !b.name.trim()) return 'Nama ruangan wajib diisi';
  if (typeof b.location !== 'string' || !b.location.trim()) return 'Lokasi wajib diisi';
  if (!Number.isInteger(b.capacity) || b.capacity <= 0) return 'Kapasitas harus bilangan bulat positif';
  return null;
}

function validateReservation(b) {
  if (!Number.isInteger(b.room_id)) return 'room_id wajib diisi';
  if (typeof b.borrower_name !== 'string' || !b.borrower_name.trim()) return 'Nama peminjam wajib diisi';
  if (typeof b.purpose !== 'string' || !b.purpose.trim()) return 'Keperluan wajib diisi';
  if (!DATE_RE.test(b.date ?? '')) return 'Format tanggal harus YYYY-MM-DD';
  if (!TIME_RE.test(b.start_time ?? '') || !TIME_RE.test(b.end_time ?? ''))
    return 'Format jam harus HH:MM';
  if (!Number.isFinite(Date.parse(b.date + 'T00:00:00Z')) || new Date(b.date + 'T00:00:00Z').toISOString().slice(0,10) !== b.date) return 'Tanggal tidak valid';
  if (b.start_time < '08:00' || b.end_time > '20:00') return 'Jam operasional 08:00–20:00';
  if (b.start_time >= b.end_time) return 'Jam selesai harus setelah jam mulai';
  return null;
}

// Cek bentrok dengan reservasi aktif (pending/approved) pada ruangan & tanggal yang sama
function findConflict({ room_id, date, start_time, end_time }, excludeId = 0) {
  return db
    .query(
      `SELECT id, start_time, end_time, borrower_name FROM reservations
       WHERE room_id = ? AND date = ? AND id != ?
         AND status IN ('pending','approved')
         AND start_time < ? AND end_time > ?`
    )
    .get(room_id, date, excludeId, end_time, start_time);
}

export function createApp() {
  const app = express();
  const origins = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:3005,http://127.0.0.1:3005').split(',').map(x=>x.trim());
  app.use(cors({ origin: origins, credentials: true }));
  app.use((req,res,next)=>{
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin && !origins.includes(req.headers.origin))
      return bad(res,'Origin tidak diizinkan',403);
    next();
  });
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  registerAuthRoutes(app);
  app.use('/api', requireAuth);

  // ---------- ROOMS ----------
  app.get('/api/rooms', (_req, res) => {
    res.json(db.query('SELECT * FROM rooms ORDER BY name').all());
  });

  app.get('/api/rooms/:id', (req, res) => {
    const room = db.query('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
    if (!room) return bad(res, 'Ruangan tidak ditemukan', 404);
    res.json(room);
  });

  app.post('/api/rooms', allowRoles('admin'), (req, res) => {
    const err = validateRoom(req.body);
    if (err) return bad(res, err);
    const { name, location, capacity, facilities = '' } = req.body;
    try {
      const r = db
        .query('INSERT INTO rooms (name, location, capacity, facilities) VALUES (?,?,?,?)')
        .run(name.trim(), location.trim(), capacity, facilities);
      res.status(201).json(db.query('SELECT * FROM rooms WHERE id = ?').get(r.lastInsertRowid));
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return bad(res, 'Nama ruangan sudah ada', 409);
      throw e;
    }
  });

  app.put('/api/rooms/:id', allowRoles('admin'), (req, res) => {
    const err = validateRoom(req.body);
    if (err) return bad(res, err);
    const { name, location, capacity, facilities = '' } = req.body;
    try {
      const r = db
        .query('UPDATE rooms SET name=?, location=?, capacity=?, facilities=? WHERE id=?')
        .run(name.trim(), location.trim(), capacity, facilities, req.params.id);
      if (r.changes === 0) return bad(res, 'Ruangan tidak ditemukan', 404);
      res.json(db.query('SELECT * FROM rooms WHERE id = ?').get(req.params.id));
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return bad(res, 'Nama ruangan sudah ada', 409);
      throw e;
    }
  });

  app.delete('/api/rooms/:id', allowRoles('admin'), (req, res) => {
    const r = db.query('DELETE FROM rooms WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return bad(res, 'Ruangan tidak ditemukan', 404);
    res.status(204).end();
  });

  // Jadwal terpakai suatu ruangan pada tanggal tertentu
  app.get('/api/rooms/:id/availability', (req, res) => {
    const { date } = req.query;
    if (!DATE_RE.test(date ?? '')) return bad(res, 'Query date wajib (YYYY-MM-DD)');
    const booked = db
      .query(
        `SELECT id, start_time, end_time, borrower_name, status FROM reservations
         WHERE room_id = ? AND date = ? AND status IN ('pending','approved')
         ORDER BY start_time`
      )
      .all(req.params.id, date);
    res.json({ room_id: Number(req.params.id), date, booked });
  });

  // ---------- RESERVATIONS ----------
  app.get('/api/reservations', (req, res) => {
    const { date, room_id, status } = req.query;
    const where = [];
    const params = [];
    if (date) { where.push('r.date = ?'); params.push(date); }
    if (room_id) { where.push('r.room_id = ?'); params.push(room_id); }
    if (status) { where.push('r.status = ?'); params.push(status); }
    const sql = `
      SELECT r.*, rm.name AS room_name FROM reservations r
      JOIN rooms rm ON rm.id = r.room_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY r.date DESC, r.start_time`;
    res.json(db.query(sql).all(...params));
  });

  app.get('/api/reservations/:id', (req, res) => {
    const row = db
      .query(`SELECT r.*, rm.name AS room_name FROM reservations r
              JOIN rooms rm ON rm.id = r.room_id WHERE r.id = ?`)
      .get(req.params.id);
    if (!row) return bad(res, 'Reservasi tidak ditemukan', 404);
    res.json(row);
  });

  app.post('/api/reservations', allowRoles('ketua','dosen'), (req, res) => {
    req.body.borrower_name = req.user.name;
    const err = validateReservation(req.body);
    if (err) return bad(res, err);
    if (!db.query('SELECT 1 FROM rooms WHERE id = ?').get(req.body.room_id))
      return bad(res, 'Ruangan tidak ditemukan', 404);
    const clash = findConflict(req.body);
    if (clash)
      return bad(res, `Bentrok dengan reservasi ${clash.start_time}-${clash.end_time} (${clash.borrower_name})`, 409);

    const { room_id, borrower_name, purpose, date, start_time, end_time } = req.body;
    const r = db
      .query(`INSERT INTO reservations (room_id, borrower_name, purpose, date, start_time, end_time, user_id)
              VALUES (?,?,?,?,?,?,?)`)
      .run(room_id, borrower_name.trim(), purpose.trim(), date, start_time, end_time, req.user.id);
    res.status(201).json(db.query('SELECT * FROM reservations WHERE id = ?').get(r.lastInsertRowid));
  });

  app.put('/api/reservations/:id', allowRoles('ketua','dosen'), (req, res) => {
    const own = db.query('SELECT * FROM reservations WHERE id=?').get(req.params.id);
    if (!own) return bad(res,'Reservasi tidak ditemukan',404);
    if (own.user_id !== req.user.id) return bad(res,'Hanya pemilik yang dapat mengubah reservasi',403);
    if (own.status !== 'pending') return bad(res,'Hanya reservasi pending yang dapat diubah',409);
    req.body.borrower_name = req.user.name;
    const err = validateReservation(req.body);
    if (err) return bad(res, err);
    const id = Number(req.params.id);
    if (!db.query('SELECT 1 FROM reservations WHERE id = ?').get(id))
      return bad(res, 'Reservasi tidak ditemukan', 404);
    if (!db.query('SELECT 1 FROM rooms WHERE id = ?').get(req.body.room_id))
      return bad(res, 'Ruangan tidak ditemukan', 404);
    const clash = findConflict(req.body, id);
    if (clash) return bad(res, `Bentrok dengan reservasi ${clash.start_time}-${clash.end_time}`, 409);

    const { room_id, borrower_name, purpose, date, start_time, end_time } = req.body;
    db.query(`UPDATE reservations SET room_id=?, borrower_name=?, purpose=?, date=?, start_time=?, end_time=?
              WHERE id=?`)
      .run(room_id, borrower_name.trim(), purpose.trim(), date, start_time, end_time, id);
    res.json(db.query('SELECT * FROM reservations WHERE id = ?').get(id));
  });

  app.patch('/api/reservations/:id/status', (req, res) => {
    const { status } = req.body;
    const owned = db.query('SELECT * FROM reservations WHERE id=?').get(req.params.id);
    if (!owned) return bad(res,'Reservasi tidak ditemukan',404);
    if (req.user.role !== 'admin' && !(['ketua','dosen'].includes(req.user.role) && owned.user_id === req.user.id && status === 'cancelled'))
      return bad(res,'Hanya admin dapat menyetujui/menolak; pemilik hanya dapat membatalkan',403);
    if (req.user.role !== 'admin' && !['pending','approved'].includes(owned.status)) return bad(res,'Reservasi sudah tidak aktif',409);
    if (!STATUSES.includes(status)) return bad(res, `Status harus salah satu dari: ${STATUSES.join(', ')}`);
    const current = db.query('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
    if (!current) return bad(res, 'Reservasi tidak ditemukan', 404);
    if (['pending', 'approved'].includes(status) && findConflict(current, current.id))
      return bad(res, 'Jadwal bentrok dengan reservasi aktif', 409);
    const r = db.query('UPDATE reservations SET status = ? WHERE id = ?').run(status, req.params.id);
    if (r.changes === 0) return bad(res, 'Reservasi tidak ditemukan', 404);
    res.json(db.query('SELECT * FROM reservations WHERE id = ?').get(req.params.id));
  });

  app.delete('/api/reservations/:id', allowRoles('admin'), (req, res) => {
    const r = db.query('DELETE FROM reservations WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return bad(res, 'Reservasi tidak ditemukan', 404);
    res.status(204).end();
  });

  // 404 & error handler
  app.use((_req, res) => bad(res, 'Endpoint tidak ditemukan', 404));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    bad(res, 'Terjadi kesalahan pada server', 500);
  });

  return app;
}

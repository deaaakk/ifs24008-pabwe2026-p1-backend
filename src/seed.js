import { db } from './db.js';

const rooms = [
  ['Ruang Rapat A', 'Gedung 1 Lantai 2', 12, 'Proyektor, AC, Whiteboard'],
  ['Ruang Rapat B', 'Gedung 1 Lantai 3', 8, 'TV, AC'],
  ['Laboratorium Komputer 1', 'Gedung 2 Lantai 1', 40, 'PC, Proyektor, AC'],
  ['Aula Utama', 'Gedung 3 Lantai 1', 150, 'Sound system, Panggung, AC'],
];

const count = db.query('SELECT COUNT(*) AS n FROM rooms').get().n;
if (count === 0) {
  const ins = db.query('INSERT INTO rooms (name, location, capacity, facilities) VALUES (?,?,?,?)');
  rooms.forEach((r) => ins.run(...r));

  const today = new Date().toISOString().slice(0, 10);
  db.query(`INSERT INTO reservations (room_id, borrower_name, purpose, date, start_time, end_time, status)
            VALUES (1, 'Budi Santoso', 'Rapat panitia', ?, '09:00', '11:00', 'approved')`).run(today);
  console.log('Seed selesai.');
} else {
  console.log('Data sudah ada, seed dilewati.');
}

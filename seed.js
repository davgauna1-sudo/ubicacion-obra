// Carga datos de ejemplo (obras de GBA y Córdoba + obreros). Ejecutar: npm run seed
import { db } from './db.js';

console.log('Cargando datos de ejemplo...');

// Limpiar
db.exec('DELETE FROM registros; DELETE FROM obreros; DELETE FROM obras;');

const obras = [
  { nombre: 'Edificio San Martín',  localidad: 'Quilmes',     provincia: 'GBA',          encargado: 'Juan Pérez',   lat: -34.7206, lng: -58.2543, radio: 90,  fecha_inicio: '2026-05-01', dias_estimados: 120 },
  { nombre: 'Torre Centro',         localidad: 'Avellaneda',  provincia: 'GBA',          encargado: 'Roberto Díaz', lat: -34.6627, lng: -58.3650, radio: 70,  fecha_inicio: '2026-06-02', dias_estimados: 90  },
  { nombre: 'Barrio Cerrado Norte', localidad: 'Nueva Córdoba', provincia: 'Córdoba (CBA)', encargado: 'Marta Suárez', lat: -31.4290, lng: -64.1880, radio: 120, fecha_inicio: '2026-04-15', dias_estimados: 200 },
];

const obraIds = obras.map(o => db.prepare(`
  INSERT INTO obras (nombre, localidad, provincia, encargado, lat, lng, radio, fecha_inicio, dias_estimados)
  VALUES (?,?,?,?,?,?,?,?,?)`).run(o.nombre, o.localidad, o.provincia, o.encargado, o.lat, o.lng, o.radio, o.fecha_inicio, o.dias_estimados).lastInsertRowid);

const obreros = [
  { nombre: 'Carlos Gómez',   dni: '30.123.456', obra: 0 },
  { nombre: 'Luis Fernández', dni: '28.987.654', obra: 0 },
  { nombre: 'Diego Romero',   dni: '33.456.789', obra: 1 },
  { nombre: 'Pablo Acosta',   dni: '31.222.333', obra: 2 },
];
import crypto from 'node:crypto';
for (const w of obreros) {
  const token = crypto.randomBytes(9).toString('hex');
  const id = db.prepare('INSERT INTO obreros (nombre, dni, obra_id, token) VALUES (?,?,?,?)')
    .run(w.nombre, w.dni, obraIds[w.obra], token).lastInsertRowid;
  console.log(`  Obrero ${w.nombre} -> link: /o/${token}`);
}

console.log('\nDatos de ejemplo cargados. Iniciá con: npm start');

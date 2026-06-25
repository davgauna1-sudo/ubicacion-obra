import express from 'express';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuracion admin (cambiable por variables de entorno) ---
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'obra2026';

app.use(express.json());

// --- Helpers de fecha/hora en zona horaria Argentina (UTC-3) ---
function ahoraAR() {
  const fmt = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map(x => [x.type, x.value]));
  return {
    fecha: `${p.year}-${p.month}-${p.day}`,
    hora: `${p.hour}:${p.minute}`,
    timestamp: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-03:00`,
  };
}

// --- Distancia entre dos puntos GPS en metros (formula de Haversine) ---
function distanciaMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// --- Sesiones admin (cookie firmada, en memoria) ---
const sesiones = new Map();
function nuevoToken() { return crypto.randomBytes(24).toString('hex'); }

function leerCookie(req, nombre) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === nombre) return decodeURIComponent(v || '');
  }
  return null;
}

function requireAdmin(req, res, next) {
  const sid = leerCookie(req, 'sid');
  if (sid && sesiones.has(sid)) return next();
  return res.status(401).json({ error: 'No autorizado' });
}

// ============ AUTENTICACION ============
app.post('/api/login', (req, res) => {
  const { usuario, password } = req.body || {};
  if (usuario === ADMIN_USER && password === ADMIN_PASS) {
    const sid = nuevoToken();
    sesiones.set(sid, { usuario, creado: Date.now() });
    res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`);
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
});

app.post('/api/logout', (req, res) => {
  const sid = leerCookie(req, 'sid');
  if (sid) sesiones.delete(sid);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', requireAdmin, (req, res) => res.json({ usuario: ADMIN_USER }));

// ============ OBRAS ============
app.get('/api/obras', requireAdmin, (req, res) => {
  const obras = db.prepare(`
    SELECT o.*,
      (SELECT COUNT(*) FROM obreros w WHERE w.obra_id = o.id) AS cant_obreros
    FROM obras o ORDER BY o.activa DESC, o.creado DESC
  `).all();
  res.json(obras);
});

app.post('/api/obras', requireAdmin, (req, res) => {
  const { nombre, localidad, provincia, encargado, lat, lng, radio, fecha_inicio, dias_estimados } = req.body || {};
  if (!nombre || !localidad || !encargado || lat == null || lng == null) {
    return res.status(400).json({ error: 'Faltan datos obligatorios (nombre, localidad, encargado, ubicación)' });
  }
  const info = db.prepare(`
    INSERT INTO obras (nombre, localidad, provincia, encargado, lat, lng, radio, fecha_inicio, dias_estimados)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(nombre, localidad, provincia || 'GBA', encargado, Number(lat), Number(lng),
         Number(radio) || 80, fecha_inicio || null, Number(dias_estimados) || 0);
  res.json({ id: info.lastInsertRowid });
});

app.put('/api/obras/:id', requireAdmin, (req, res) => {
  const { nombre, localidad, provincia, encargado, lat, lng, radio, fecha_inicio, dias_estimados, activa } = req.body || {};
  db.prepare(`
    UPDATE obras SET nombre=?, localidad=?, provincia=?, encargado=?, lat=?, lng=?,
      radio=?, fecha_inicio=?, dias_estimados=?, activa=? WHERE id=?
  `).run(nombre, localidad, provincia || 'GBA', encargado, Number(lat), Number(lng),
         Number(radio) || 80, fecha_inicio || null, Number(dias_estimados) || 0,
         activa == null ? 1 : Number(activa), req.params.id);
  res.json({ ok: true });
});

app.delete('/api/obras/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM obras WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ============ OBREROS ============
app.get('/api/obreros', requireAdmin, (req, res) => {
  const obreros = db.prepare(`
    SELECT w.*, o.nombre AS obra_nombre, o.localidad, o.provincia, o.encargado,
           o.fecha_inicio, o.dias_estimados
    FROM obreros w JOIN obras o ON o.id = w.obra_id
    ORDER BY o.nombre, w.nombre
  `).all();
  res.json(obreros);
});

app.post('/api/obreros', requireAdmin, (req, res) => {
  const { nombre, dni, obra_id } = req.body || {};
  if (!nombre || !obra_id) return res.status(400).json({ error: 'Falta nombre u obra' });
  const token = crypto.randomBytes(9).toString('hex');
  const info = db.prepare('INSERT INTO obreros (nombre, dni, obra_id, token) VALUES (?,?,?,?)')
    .run(nombre, dni || null, Number(obra_id), token);
  res.json({ id: info.lastInsertRowid, token });
});

app.put('/api/obreros/:id', requireAdmin, (req, res) => {
  const { nombre, dni, obra_id } = req.body || {};
  db.prepare('UPDATE obreros SET nombre=?, dni=?, obra_id=? WHERE id=?')
    .run(nombre, dni || null, Number(obra_id), req.params.id);
  res.json({ ok: true });
});

app.delete('/api/obreros/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM obreros WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Regenerar link (token) de un obrero
app.post('/api/obreros/:id/regenerar', requireAdmin, (req, res) => {
  const token = crypto.randomBytes(9).toString('hex');
  db.prepare('UPDATE obreros SET token=? WHERE id=?').run(token, req.params.id);
  res.json({ token });
});

// ============ REGISTROS / ASISTENCIA (admin) ============
app.get('/api/registros', requireAdmin, (req, res) => {
  const { desde, hasta, obra_id } = req.query;
  let sql = `
    SELECT r.*, w.nombre AS obrero, w.dni, o.nombre AS obra, o.localidad, o.encargado
    FROM registros r
    JOIN obreros w ON w.id = r.obrero_id
    JOIN obras o ON o.id = r.obra_id
    WHERE 1=1`;
  const params = [];
  if (desde) { sql += ' AND r.fecha >= ?'; params.push(desde); }
  if (hasta) { sql += ' AND r.fecha <= ?'; params.push(hasta); }
  if (obra_id) { sql += ' AND r.obra_id = ?'; params.push(Number(obra_id)); }
  sql += ' ORDER BY r.fecha DESC, r.hora DESC';
  res.json(db.prepare(sql).all(...params));
});

// Resumen de asistencia (horas trabajadas por obrero/dia) en un rango
app.get('/api/asistencia', requireAdmin, (req, res) => {
  const { desde, hasta, obra_id } = req.query;
  let sql = `
    SELECT r.obrero_id, w.nombre AS obrero, w.dni, o.nombre AS obra, o.localidad,
           r.fecha, r.tipo, r.hora, r.verificado, r.distancia
    FROM registros r
    JOIN obreros w ON w.id = r.obrero_id
    JOIN obras o ON o.id = r.obra_id
    WHERE r.fecha >= ? AND r.fecha <= ?`;
  const params = [desde || '0000-01-01', hasta || '9999-12-31'];
  if (obra_id) { sql += ' AND r.obra_id = ?'; params.push(Number(obra_id)); }
  sql += ' ORDER BY w.nombre, r.fecha, r.hora';
  const rows = db.prepare(sql).all(...params);

  // Agrupar por obrero+fecha: primera entrada / ultima salida + horas + verificacion
  const mapa = new Map();
  for (const r of rows) {
    const key = `${r.obrero_id}|${r.fecha}`;
    if (!mapa.has(key)) {
      mapa.set(key, { obrero: r.obrero, dni: r.dni, obra: r.obra, localidad: r.localidad,
                      fecha: r.fecha, entrada: null, salida: null, verificado: null, distancia: null });
    }
    const d = mapa.get(key);
    if (r.tipo === 'entrada' && (!d.entrada || r.hora < d.entrada)) {
      d.entrada = r.hora; d.verificado = r.verificado; d.distancia = r.distancia;
    }
    if (r.tipo === 'salida' && (!d.salida || r.hora > d.salida)) d.salida = r.hora;
  }
  const resultado = [...mapa.values()].map(d => {
    let horas = null;
    if (d.entrada && d.salida) {
      const [h1, m1] = d.entrada.split(':').map(Number);
      const [h2, m2] = d.salida.split(':').map(Number);
      horas = Math.max(0, ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60);
      horas = Math.round(horas * 100) / 100;
    }
    return { ...d, horas };
  });
  resultado.sort((a, b) => a.obrero.localeCompare(b.obrero) || a.fecha.localeCompare(b.fecha));
  res.json(resultado);
});

// ============ VISTA DEL OBRERO (publica, por token) ============
app.get('/api/o/:token', (req, res) => {
  const obrero = db.prepare(`
    SELECT w.id, w.nombre, w.token, o.id AS obra_id, o.nombre AS obra, o.localidad,
           o.provincia, o.encargado, o.lat, o.lng, o.radio, o.fecha_inicio
    FROM obreros w JOIN obras o ON o.id = w.obra_id WHERE w.token = ?
  `).get(req.params.token);
  if (!obrero) return res.status(404).json({ error: 'Link inválido' });

  const { fecha } = ahoraAR();
  const hoy = db.prepare(`
    SELECT tipo, hora, verificado, distancia FROM registros WHERE obrero_id=? AND fecha=? ORDER BY hora ASC
  `).all(obrero.id, fecha);
  const ultimo = hoy.length ? hoy[hoy.length - 1].tipo : null;
  const estado = ultimo === 'entrada' ? 'dentro' : 'fuera';
  res.json({ obrero, fecha, estado, registros_hoy: hoy });
});

app.post('/api/o/:token/marcar', (req, res) => {
  const obrero = db.prepare(`
    SELECT w.id, w.obra_id, o.lat, o.lng, o.radio FROM obreros w JOIN obras o ON o.id = w.obra_id
    WHERE w.token = ?`).get(req.params.token);
  if (!obrero) return res.status(404).json({ error: 'Link inválido' });

  const { tipo, lat, lng } = req.body || {};
  if (!['entrada', 'salida'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });

  const { fecha, hora, timestamp } = ahoraAR();

  // Validar coherencia del estado actual
  const ult = db.prepare('SELECT tipo FROM registros WHERE obrero_id=? AND fecha=? ORDER BY hora DESC, id DESC LIMIT 1')
    .get(obrero.id, fecha);
  const estadoActual = ult?.tipo === 'entrada' ? 'dentro' : 'fuera';
  if (tipo === 'entrada' && estadoActual === 'dentro')
    return res.status(409).json({ error: 'Ya marcaste tu entrada hoy. Marcá la salida cuando te retires.' });
  if (tipo === 'salida' && estadoActual === 'fuera')
    return res.status(409).json({ error: 'Todavía no marcaste la entrada.' });

  // Verificacion por GPS real
  let distancia = null, verificado = 'sin_gps';
  if (lat != null && lng != null) {
    distancia = Math.round(distanciaMetros(Number(lat), Number(lng), obrero.lat, obrero.lng));
    verificado = distancia <= (obrero.radio + 30) ? 'dentro' : 'fuera';
  }

  db.prepare(`INSERT INTO registros (obrero_id, obra_id, tipo, lat, lng, distancia, verificado, fecha, hora, timestamp)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(obrero.id, obrero.obra_id, tipo,
         lat != null ? Number(lat) : obrero.lat,
         lng != null ? Number(lng) : obrero.lng,
         distancia, verificado, fecha, hora, timestamp);

  const estado = tipo === 'entrada' ? 'dentro' : 'fuera';
  res.json({ ok: true, tipo, fecha, hora, estado, verificado, distancia });
});

// ============ MAPA EN VIVO ============
app.get('/api/mapa-vivo', requireAdmin, (req, res) => {
  const { fecha } = ahoraAR();

  const obras = db.prepare('SELECT id, nombre, localidad, encargado, lat, lng, radio FROM obras WHERE activa = 1').all();

  const registros = db.prepare(`
    SELECT r.obrero_id, r.tipo, r.lat, r.lng, r.hora, r.verificado, r.distancia,
           w.nombre AS obrero, o.id AS obra_id, o.nombre AS obra, o.localidad
    FROM registros r
    JOIN obreros w ON w.id = r.obrero_id
    JOIN obras o ON o.id = r.obra_id
    WHERE r.fecha = ?
    ORDER BY r.obrero_id, r.hora DESC, r.id DESC
  `).all(fecha);

  const porObrero = new Map();
  for (const r of registros) {
    if (!porObrero.has(r.obrero_id)) porObrero.set(r.obrero_id, r);
  }

  res.json({ fecha, obras, obreros: [...porObrero.values()] });
});

// ============ ARCHIVOS ESTATICOS Y RUTAS DE PAGINAS ============
app.use(express.static(join(__dirname, 'public')));
app.get('/o/:token', (req, res) => res.sendFile(join(__dirname, 'public', 'obrero.html')));
app.get('/', (req, res) => res.redirect('/admin.html'));

app.listen(PORT, () => {
  console.log(`\n  Ubicación-Asistencia de Obra`);
  console.log(`  Servidor activo en  http://localhost:${PORT}`);
  console.log(`  Panel admin         http://localhost:${PORT}/admin.html`);
  console.log(`  Usuario: ${ADMIN_USER}   Contraseña: ${ADMIN_PASS}\n`);
});

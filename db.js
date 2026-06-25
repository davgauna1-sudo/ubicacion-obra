// Base de datos SQLite usando el modulo nativo de Node 22+ (node:sqlite).
// No requiere compilacion de modulos nativos: ideal para Windows/Mac/Linux y Render.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// DATA_DIR permite guardar la base en un disco persistente (Render).
// Si no se define, usa la carpeta del proyecto (local).
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_PATH = join(DATA_DIR, 'data.db');

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS obras (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre        TEXT NOT NULL,
    localidad     TEXT NOT NULL,
    provincia     TEXT NOT NULL DEFAULT 'GBA',
    encargado     TEXT NOT NULL,
    lat           REAL NOT NULL,
    lng           REAL NOT NULL,
    radio         INTEGER NOT NULL DEFAULT 80,
    fecha_inicio  TEXT,
    dias_estimados INTEGER DEFAULT 0,
    activa        INTEGER NOT NULL DEFAULT 1,
    creado        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS obreros (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre    TEXT NOT NULL,
    dni       TEXT,
    obra_id   INTEGER NOT NULL,
    token     TEXT NOT NULL UNIQUE,
    creado    TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS registros (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    obrero_id  INTEGER NOT NULL,
    obra_id    INTEGER NOT NULL,
    tipo       TEXT NOT NULL CHECK (tipo IN ('entrada','salida')),
    lat        REAL,
    lng        REAL,
    distancia  REAL,
    verificado TEXT,
    fecha      TEXT NOT NULL,
    hora       TEXT NOT NULL,
    timestamp  TEXT NOT NULL,
    FOREIGN KEY (obrero_id) REFERENCES obreros(id) ON DELETE CASCADE,
    FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_reg_ob ON registros(obrero_id);
  CREATE INDEX IF NOT EXISTS idx_reg_fe ON registros(fecha);
  CREATE INDEX IF NOT EXISTS idx_ob_obra ON obreros(obra_id);
`);

// Migracion: agrega columnas de verificacion GPS a bases ya existentes.
const cols = db.prepare('PRAGMA table_info(registros)').all().map((c) => c.name);
if (!cols.includes('distancia')) db.exec('ALTER TABLE registros ADD COLUMN distancia REAL');
if (!cols.includes('verificado')) db.exec('ALTER TABLE registros ADD COLUMN verificado TEXT');

export default db;

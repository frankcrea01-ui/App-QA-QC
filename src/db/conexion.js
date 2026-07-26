const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const { aplicarMigraciones } = require('./migraciones');

/**
 * Abre (o crea) la base de datos local del dispositivo, aplica el esquema y
 * las migraciones pendientes. Esta es la ÚNICA capa que sabe que la base es
 * SQLite — si en el futuro se migra a Firebase/Supabase, solo se reescribe
 * este archivo y src/sync/, no el resto de la app.
 *
 * @param {string} rutaArchivoDb
 * @returns {import('better-sqlite3').Database}
 */
function abrirBaseDeDatos(rutaArchivoDb) {
  const db = new Database(rutaArchivoDb);
  db.pragma('journal_mode = WAL');

  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schemaSql);

  // schema.sql usa CREATE TABLE IF NOT EXISTS: nunca modifica una tabla que ya
  // existe. Los cambios sobre bases de versiones anteriores pasan por acá.
  aplicarMigraciones(db);

  return db;
}

module.exports = { abrirBaseDeDatos };

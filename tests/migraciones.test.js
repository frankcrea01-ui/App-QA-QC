/**
 * Pruebas de migración: una base creada con el esquema anterior tiene que
 * poder abrirse y seguir funcionando, sin perder registros.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const { abrirBaseDeDatos } = require('../src/db/conexion');
const queries = require('../src/db/queries');

/** Reproduce el esquema viejo: CHECK sobre tipo_dato y 5 estados. */
function crearBaseVieja() {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'protocolos-vieja-'));
  const ruta = path.join(carpeta, 'vieja.db');
  const db = new Database(ruta);

  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE estados_protocolo (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE, orden INTEGER NOT NULL
    );
    INSERT INTO estados_protocolo (nombre, orden) VALUES
      ('en_proceso', 1), ('en_revision', 2), ('en_firma', 3), ('cerrado', 4), ('anulado', 5);

    CREATE TABLE templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT, codigo_plantilla TEXT NOT NULL, nombre TEXT NOT NULL,
      version TEXT NOT NULL, especialidad TEXT NOT NULL, activo INTEGER NOT NULL DEFAULT 1,
      ruta_pdf_origen TEXT, fecha_creacion TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(codigo_plantilla, version)
    );

    CREATE TABLE template_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      clave_campo TEXT NOT NULL, etiqueta TEXT NOT NULL,
      tipo_dato TEXT NOT NULL CHECK (tipo_dato IN ('texto','numero','fecha','lista')),
      obligatorio INTEGER NOT NULL DEFAULT 0, ejemplo TEXT, descripcion TEXT,
      pagina INTEGER NOT NULL DEFAULT 1,
      x REAL NOT NULL, y REAL NOT NULL, ancho REAL NOT NULL, alto REAL NOT NULL,
      orden INTEGER NOT NULL DEFAULT 0,
      UNIQUE(template_id, clave_campo)
    );

    CREATE TABLE protocolos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, codigo_protocolo TEXT NOT NULL UNIQUE,
      template_id INTEGER NOT NULL REFERENCES templates(id), version_usada TEXT NOT NULL,
      proyecto TEXT NOT NULL, empresa TEXT, especialidad TEXT NOT NULL,
      estado_id INTEGER NOT NULL REFERENCES estados_protocolo(id), creado_por TEXT NOT NULL,
      fecha_creacion TEXT NOT NULL DEFAULT (datetime('now')), fecha_cierre TEXT,
      pdf_escaneado_link TEXT, sincronizado INTEGER NOT NULL DEFAULT 0,
      fecha_modificacion TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE protocolo_valores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      protocolo_id INTEGER NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
      template_field_id INTEGER NOT NULL REFERENCES template_fields(id),
      valor TEXT, UNIQUE(protocolo_id, template_field_id)
    );

    CREATE TABLE historial_estado (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      protocolo_id INTEGER NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
      estado_anterior TEXT, estado_nuevo TEXT NOT NULL,
      fecha TEXT NOT NULL DEFAULT (datetime('now')), usuario TEXT NOT NULL
    );

    CREATE TABLE fotos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      protocolo_id INTEGER NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
      ruta_local TEXT NOT NULL, ruta_nube TEXT, descripcion TEXT, orden INTEGER NOT NULL,
      tamano_kb INTEGER, fecha_captura TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE config_dispositivo (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
  `);

  return { db, ruta, limpiar: () => fs.rmSync(carpeta, { recursive: true, force: true }) };
}

test('una base con el esquema viejo se abre, migra y conserva sus datos', () => {
  const vieja = crearBaseVieja();
  let templateId;
  let protocoloId;
  let campoNumeroId;

  try {
    // Datos con los tipos antiguos, que ya no existen.
    templateId = vieja.db.prepare(`
      INSERT INTO templates (codigo_plantilla, nombre, version, especialidad)
      VALUES ('PROT-EST', 'Estructura', 'v1', 'estructura')
    `).run().lastInsertRowid;

    const insertCampo = vieja.db.prepare(`
      INSERT INTO template_fields (template_id, clave_campo, etiqueta, tipo_dato, x, y, ancho, alto)
      VALUES (?, ?, ?, ?, 0.1, 0.1, 0.2, 0.05)
    `);
    campoNumeroId = insertCampo.run(templateId, 'cantidad', 'Cantidad', 'numero').lastInsertRowid;
    insertCampo.run(templateId, 'tipo_muro', 'Tipo de muro', 'lista');
    insertCampo.run(templateId, 'obs', 'Observación', 'texto');

    protocoloId = vieja.db.prepare(`
      INSERT INTO protocolos (codigo_protocolo, template_id, version_usada, proyecto, especialidad, estado_id, creado_por)
      VALUES ('EST-P-JP01-0001-2026', ?, 'v1', 'PROY01', 'estructura', 1, 'JP01')
    `).run(templateId).lastInsertRowid;

    vieja.db.prepare(`
      INSERT INTO protocolo_valores (protocolo_id, template_field_id, valor) VALUES (?, ?, '42')
    `).run(protocoloId, campoNumeroId);

    vieja.db.close();

    // Abrir con el código actual dispara las migraciones.
    const db = abrirBaseDeDatos(vieja.ruta);
    try {
      // 1. Los tipos que ya no existen se mapean a texto, sin perder filas.
      const campos = queries.obtenerCamposDeTemplate(db, templateId);
      assert.equal(campos.length, 3, 'no se debe perder ninguna zona');
      assert.deepEqual(campos.map((c) => c.tipo_dato).sort(), ['texto', 'texto', 'texto']);

      // 2. Los valores ya cargados siguen enlazados a su zona.
      const valores = queries.obtenerValoresDeProtocolo(db, protocoloId);
      assert.equal(valores.length, 1);
      assert.equal(valores[0].valor, '42');
      assert.equal(valores[0].etiqueta, 'Cantidad');

      // 3. Ahora sí se aceptan los tipos nuevos, que el CHECK viejo bloqueaba.
      assert.doesNotThrow(() => queries.agregarCampoATemplate(db, templateId, {
        clave_campo: 'correlativo', etiqueta: 'N°', tipo_dato: 'correlativo',
        x: 0.8, y: 0.05, ancho: 0.1, alto: 0.03,
      }));

      // 4. en_revision se retiró del catálogo y quedan los 4 del flujo.
      const estados = db.prepare('SELECT nombre FROM estados_protocolo ORDER BY orden').all();
      assert.deepEqual(estados.map((e) => e.nombre), ['en_proceso', 'en_firma', 'cerrado', 'anulado']);

      // 5. Las claves foráneas quedaron activas después de la reconstrucción.
      assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
      assert.throws(() => db.prepare(
        `INSERT INTO protocolo_valores (protocolo_id, template_field_id, valor) VALUES (?, 9999, 'x')`
      ).run(protocoloId), /FOREIGN KEY/);

      db.close();
    } catch (error) {
      db.close();
      throw error;
    }
  } finally {
    vieja.limpiar();
  }
});

test('en_revision no se borra si algún protocolo todavía lo usa', () => {
  const vieja = crearBaseVieja();
  try {
    const templateId = vieja.db.prepare(`
      INSERT INTO templates (codigo_plantilla, nombre, version, especialidad)
      VALUES ('PROT-EST', 'Estructura', 'v1', 'estructura')
    `).run().lastInsertRowid;

    const idEnRevision = vieja.db
      .prepare(`SELECT id FROM estados_protocolo WHERE nombre = 'en_revision'`).get().id;

    vieja.db.prepare(`
      INSERT INTO protocolos (codigo_protocolo, template_id, version_usada, proyecto, especialidad, estado_id, creado_por)
      VALUES ('EST-P-JP01-0002-2026', ?, 'v1', 'PROY01', 'estructura', ?, 'JP01')
    `).run(templateId, idEnRevision);

    vieja.db.close();

    const db = abrirBaseDeDatos(vieja.ruta);
    try {
      const estados = db.prepare('SELECT nombre FROM estados_protocolo').all().map((e) => e.nombre);
      assert.ok(estados.includes('en_revision'), 'un registro nunca debe quedar huérfano por una migración');
    } finally {
      db.close();
    }
  } finally {
    vieja.limpiar();
  }
});

test('abrir dos veces seguidas es seguro (las migraciones son idempotentes)', () => {
  const vieja = crearBaseVieja();
  try {
    vieja.db.close();

    const primera = abrirBaseDeDatos(vieja.ruta);
    primera.close();

    const segunda = abrirBaseDeDatos(vieja.ruta);
    const estados = segunda.prepare('SELECT nombre FROM estados_protocolo ORDER BY orden').all();
    assert.deepEqual(estados.map((e) => e.nombre), ['en_proceso', 'en_firma', 'cerrado', 'anulado']);
    segunda.close();
  } finally {
    vieja.limpiar();
  }
});

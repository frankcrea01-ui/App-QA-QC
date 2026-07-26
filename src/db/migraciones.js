/**
 * Migraciones de esquema para bases que ya existen en un dispositivo.
 *
 * `schema.sql` usa CREATE TABLE IF NOT EXISTS, así que por sí solo nunca
 * modifica una tabla ya creada. Todo cambio sobre una base existente pasa
 * por acá. Cada migración detecta su propia condición y no hace nada si ya
 * se aplicó, para que abrir la app sea siempre seguro.
 */

/**
 * El esquema original tenía CHECK (tipo_dato IN ('texto','numero','fecha','lista')).
 * Los tipos nuevos (check, correlativo, proyecto, responsable) serían rechazados
 * por ese CHECK, así que hay que reconstruir la tabla sin él.
 *
 * `numero` y `lista` se mapean a `texto`: el primero se escribe igual, y el
 * segundo nunca llegó a implementarse como lista (se comportaba como texto).
 */
function migrarTiposDeZona(db) {
  const tabla = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'template_fields'`)
    .get();

  // Sin tabla (base nueva) o sin CHECK (ya migrada): no hay nada que hacer.
  if (!tabla || !tabla.sql.includes('CHECK')) return false;

  // Las claves foráneas se desactivan durante la reconstrucción: hay que
  // borrar la tabla vieja mientras protocolo_valores todavía la referencia.
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE template_fields_nuevo (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          template_id   INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
          clave_campo   TEXT NOT NULL,
          etiqueta      TEXT NOT NULL,
          tipo_dato     TEXT NOT NULL,
          obligatorio   INTEGER NOT NULL DEFAULT 0,
          ejemplo       TEXT,
          descripcion   TEXT,
          pagina        INTEGER NOT NULL DEFAULT 1,
          x             REAL NOT NULL,
          y             REAL NOT NULL,
          ancho         REAL NOT NULL,
          alto          REAL NOT NULL,
          orden         INTEGER NOT NULL DEFAULT 0,
          UNIQUE(template_id, clave_campo)
        );

        INSERT INTO template_fields_nuevo
          (id, template_id, clave_campo, etiqueta, tipo_dato, obligatorio,
           ejemplo, descripcion, pagina, x, y, ancho, alto, orden)
        SELECT
          id, template_id, clave_campo, etiqueta,
          CASE tipo_dato WHEN 'numero' THEN 'texto' WHEN 'lista' THEN 'texto' ELSE tipo_dato END,
          obligatorio, ejemplo, descripcion, pagina, x, y, ancho, alto, orden
        FROM template_fields;

        DROP TABLE template_fields;
        ALTER TABLE template_fields_nuevo RENAME TO template_fields;
      `);
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }

  return true;
}

/**
 * `en_revision` se retiró del flujo (ver docs/decisiones-ui.md, D8). Se borra
 * del catálogo solo si ningún protocolo lo está usando — un registro nunca
 * queda huérfano por una migración.
 */
function retirarEstadoEnRevision(db) {
  const estado = db.prepare(`SELECT id FROM estados_protocolo WHERE nombre = 'en_revision'`).get();
  if (!estado) return false;

  const enUso = db
    .prepare(`SELECT COUNT(*) AS total FROM protocolos WHERE estado_id = ?`)
    .get(estado.id).total;
  if (enUso > 0) return false;

  db.prepare(`DELETE FROM estados_protocolo WHERE id = ?`).run(estado.id);
  // Se reordena para que el dashboard muestre las tarjetas en el orden del flujo.
  db.exec(`
    UPDATE estados_protocolo SET orden = CASE nombre
      WHEN 'en_proceso' THEN 1
      WHEN 'en_firma'   THEN 2
      WHEN 'cerrado'    THEN 3
      WHEN 'anulado'    THEN 4
      ELSE orden END
  `);
  return true;
}

/** Aplica todas las migraciones pendientes. Se llama al abrir la base. */
function aplicarMigraciones(db) {
  return {
    tiposDeZona: migrarTiposDeZona(db),
    estadoEnRevision: retirarEstadoEnRevision(db),
  };
}

module.exports = { aplicarMigraciones, migrarTiposDeZona, retirarEstadoEnRevision };

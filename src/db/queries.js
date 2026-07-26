/**
 * Funciones de acceso a datos. La lógica de negocio (código único,
 * validaciones) vive en /core y se le pasa aquí ya resuelta —
 * este archivo solo sabe leer y escribir filas.
 */

const { TIPOS_DATO } = require('../shared/constantes');

/**
 * Crea la plantilla como borrador (activo=0). Recién queda disponible para
 * modo campo cuando pasa por la vista previa y se confirma con
 * activarTemplate (ver sección 7, Paso 2 del brief).
 */
function crearTemplate(db, { codigo_plantilla, nombre, version, especialidad, ruta_pdf_origen }) {
  const stmt = db.prepare(`
    INSERT INTO templates (codigo_plantilla, nombre, version, especialidad, ruta_pdf_origen, activo)
    VALUES (@codigo_plantilla, @nombre, @version, @especialidad, @ruta_pdf_origen, 0)
  `);
  const info = stmt.run({ codigo_plantilla, nombre, version, especialidad, ruta_pdf_origen: ruta_pdf_origen || null });
  return info.lastInsertRowid;
}

/**
 * Pone una versión en producción y **retira las anteriores** del mismo
 * código de plantilla. Solo puede haber una vigente a la vez: si quedaran
 * dos, el registrador vería ambas en obra y podría llenar la versión vieja.
 * Es la regla de control documental — una revisión emitida reemplaza a la
 * anterior, que queda como histórico.
 */
function actualizarRutaPdfDeTemplate(db, templateId, rutaArchivo) {
  db.prepare(`UPDATE templates SET ruta_pdf_origen = ? WHERE id = ?`).run(rutaArchivo, templateId);
}

function activarTemplate(db, templateId) {
  const activar = db.transaction(() => {
    const template = db.prepare(`SELECT codigo_plantilla FROM templates WHERE id = ?`).get(templateId);
    if (!template) throw new Error(`Plantilla ${templateId} no existe.`);

    db.prepare(`UPDATE templates SET activo = 0 WHERE codigo_plantilla = ? AND id != ?`)
      .run(template.codigo_plantilla, templateId);
    db.prepare(`UPDATE templates SET activo = 1 WHERE id = ?`).run(templateId);
  });

  activar();
}

function agregarCampoATemplate(db, templateId, campo) {
  // El esquema ya no lleva CHECK sobre tipo_dato: la lista válida vive en
  // /shared y se valida acá, que es el único punto que escribe esta tabla.
  if (!TIPOS_DATO.includes(campo.tipo_dato)) {
    throw new Error(
      `Tipo de zona no válido: "${campo.tipo_dato}". Válidos: ${TIPOS_DATO.join(', ')}.`
    );
  }

  const stmt = db.prepare(`
    INSERT INTO template_fields
      (template_id, clave_campo, etiqueta, tipo_dato, obligatorio, ejemplo, descripcion, pagina, x, y, ancho, alto, orden)
    VALUES
      (@template_id, @clave_campo, @etiqueta, @tipo_dato, @obligatorio, @ejemplo, @descripcion, @pagina, @x, @y, @ancho, @alto, @orden)
  `);
  const info = stmt.run({
    template_id: templateId,
    clave_campo: campo.clave_campo,
    etiqueta: campo.etiqueta,
    tipo_dato: campo.tipo_dato,
    obligatorio: campo.obligatorio ? 1 : 0,
    ejemplo: campo.ejemplo || null,
    descripcion: campo.descripcion || null,
    pagina: campo.pagina || 1,
    x: campo.x, y: campo.y, ancho: campo.ancho, alto: campo.alto,
    orden: campo.orden || 0,
  });
  return info.lastInsertRowid;
}

function obtenerCamposDeTemplate(db, templateId) {
  return db.prepare(
    `SELECT * FROM template_fields WHERE template_id = ? ORDER BY orden ASC, id ASC`
  ).all(templateId);
}

function obtenerTemplate(db, templateId) {
  return db.prepare(`SELECT * FROM templates WHERE id = ?`).get(templateId);
}

/**
 * Todas las plantillas (borrador y activas), para que el editor muestre
 * qué versiones ya existen de cada codigo_plantilla antes de crear una nueva.
 *
 * Se ordena por id y no por fecha_creacion: la fecha tiene granularidad de
 * un segundo, y dos versiones creadas dentro del mismo segundo quedaban
 * empatadas, lo que hacía desaparecer un borrador del panel. El id siempre
 * crece, así que "más nuevo" nunca queda ambiguo.
 */
function listarTemplates(db) {
  return db.prepare(`
    SELECT id, codigo_plantilla, nombre, version, especialidad, activo,
           ruta_pdf_origen, fecha_creacion
    FROM templates
    ORDER BY codigo_plantilla ASC, id DESC
  `).all();
}

function obtenerEstadoIdPorNombre(db, nombre) {
  const row = db.prepare(`SELECT id FROM estados_protocolo WHERE nombre = ?`).get(nombre);
  if (!row) throw new Error(`Estado "${nombre}" no existe en el catálogo.`);
  return row.id;
}

/**
 * Crea un protocolo junto con sus valores, en una sola transacción.
 * codigoProtocolo debe venir ya generado (ver core/codigoUnico.js).
 */
function crearProtocolo(db, { codigo_protocolo, template_id, version_usada, proyecto, empresa, especialidad, creado_por, valores }) {
  const crear = db.transaction(() => {
    const estadoInicialId = obtenerEstadoIdPorNombre(db, 'en_proceso');

    const info = db.prepare(`
      INSERT INTO protocolos
        (codigo_protocolo, template_id, version_usada, proyecto, empresa, especialidad, estado_id, creado_por)
      VALUES
        (@codigo_protocolo, @template_id, @version_usada, @proyecto, @empresa, @especialidad, @estado_id, @creado_por)
    `).run({
      codigo_protocolo, template_id, version_usada, proyecto,
      empresa: empresa || null, especialidad, estado_id: estadoInicialId, creado_por,
    });

    const protocoloId = info.lastInsertRowid;

    const insertValor = db.prepare(`
      INSERT INTO protocolo_valores (protocolo_id, template_field_id, valor)
      VALUES (?, ?, ?)
    `);
    for (const [templateFieldId, valor] of Object.entries(valores || {})) {
      insertValor.run(protocoloId, templateFieldId, valor === undefined ? null : String(valor));
    }

    db.prepare(`
      INSERT INTO historial_estado (protocolo_id, estado_anterior, estado_nuevo, usuario)
      VALUES (?, NULL, 'en_proceso', ?)
    `).run(protocoloId, creado_por);

    return protocoloId;
  });

  return crear();
}

function cambiarEstadoProtocolo(db, protocoloId, estadoNuevoNombre, usuario) {
  const cambiar = db.transaction(() => {
    const actual = db.prepare(`
      SELECT p.id, ep.nombre AS estado_actual
      FROM protocolos p JOIN estados_protocolo ep ON ep.id = p.estado_id
      WHERE p.id = ?
    `).get(protocoloId);

    if (!actual) throw new Error(`Protocolo ${protocoloId} no existe.`);

    const nuevoEstadoId = obtenerEstadoIdPorNombre(db, estadoNuevoNombre);

    db.prepare(`
      UPDATE protocolos
      SET estado_id = ?, fecha_modificacion = datetime('now'),
          fecha_cierre = CASE WHEN ? = 'cerrado' THEN datetime('now') ELSE fecha_cierre END
      WHERE id = ?
    `).run(nuevoEstadoId, estadoNuevoNombre, protocoloId);

    db.prepare(`
      INSERT INTO historial_estado (protocolo_id, estado_anterior, estado_nuevo, usuario)
      VALUES (?, ?, ?, ?)
    `).run(protocoloId, actual.estado_actual, estadoNuevoNombre, usuario);
  });

  cambiar();
}

function resumenPorEstado(db) {
  return db.prepare(`
    SELECT ep.nombre AS estado, COUNT(p.id) AS total
    FROM estados_protocolo ep
    LEFT JOIN protocolos p ON p.estado_id = ep.id
    GROUP BY ep.nombre
    ORDER BY ep.orden
  `).all();
}

function listarProtocolos(db, { especialidad, estado } = {}) {
  let sql = `
    SELECT p.id, p.codigo_protocolo, p.proyecto, p.especialidad, ep.nombre AS estado,
           p.fecha_creacion, p.fecha_cierre
    FROM protocolos p
    JOIN estados_protocolo ep ON ep.id = p.estado_id
    WHERE 1=1
  `;
  const params = {};
  if (especialidad) { sql += ` AND p.especialidad = @especialidad`; params.especialidad = especialidad; }
  if (estado) { sql += ` AND ep.nombre = @estado`; params.estado = estado; }
  sql += ` ORDER BY p.fecha_creacion DESC`;
  return db.prepare(sql).all(params);
}

/**
 * Detalle completo de un protocolo para el log maestro: datos propios +
 * nombre de estado + nombre/version de la plantilla usada.
 */
function obtenerProtocolo(db, protocoloId) {
  return db.prepare(`
    SELECT p.*, ep.nombre AS estado, t.nombre AS template_nombre
    FROM protocolos p
    JOIN estados_protocolo ep ON ep.id = p.estado_id
    JOIN templates t ON t.id = p.template_id
    WHERE p.id = ?
  `).get(protocoloId);
}

function obtenerValoresDeProtocolo(db, protocoloId) {
  return db.prepare(`
    SELECT tf.clave_campo, tf.etiqueta, tf.tipo_dato, pv.valor
    FROM protocolo_valores pv
    JOIN template_fields tf ON tf.id = pv.template_field_id
    WHERE pv.protocolo_id = ?
    ORDER BY tf.orden ASC, tf.id ASC
  `).all(protocoloId);
}

function obtenerHistorialDeProtocolo(db, protocoloId) {
  return db.prepare(`
    SELECT * FROM historial_estado WHERE protocolo_id = ? ORDER BY fecha ASC, id ASC
  `).all(protocoloId);
}

function adjuntarPdfEscaneado(db, protocoloId, rutaArchivo) {
  const info = db.prepare(`
    UPDATE protocolos SET pdf_escaneado_link = ?, fecha_modificacion = datetime('now') WHERE id = ?
  `).run(rutaArchivo, protocoloId);
  if (info.changes === 0) throw new Error(`Protocolo ${protocoloId} no existe.`);
}

/**
 * Obras y responsables ya usados, del más reciente al más antiguo. Son las
 * listas que alimentan los desplegables del registro en obra: el sistema se
 * retroalimenta con sus propios datos, sin tabla ni pantalla de configuración.
 */
function listarProyectosUsados(db) {
  return db.prepare(`
    SELECT proyecto, MAX(fecha_creacion) AS ultimo
    FROM protocolos
    GROUP BY proyecto
    ORDER BY ultimo DESC
  `).all().map((fila) => fila.proyecto);
}

function listarResponsablesUsados(db) {
  return db.prepare(`
    SELECT creado_por, MAX(fecha_creacion) AS ultimo
    FROM protocolos
    GROUP BY creado_por
    ORDER BY ultimo DESC
  `).all().map((fila) => fila.creado_por);
}

/**
 * Plantillas ya aprobadas en la vista previa (activo=1), las únicas
 * disponibles para elegir en modo campo.
 */
function listarTemplatesActivos(db, { especialidad } = {}) {
  let sql = `SELECT * FROM templates WHERE activo = 1`;
  const params = {};
  if (especialidad) { sql += ` AND especialidad = @especialidad`; params.especialidad = especialidad; }
  sql += ` ORDER BY nombre, version DESC`;
  return db.prepare(sql).all(params);
}

function contarFotosDeProtocolo(db, protocoloId) {
  return db.prepare(`SELECT COUNT(*) AS total FROM fotos WHERE protocolo_id = ?`).get(protocoloId).total;
}

function agregarFoto(db, protocoloId, { ruta_local, ruta_nube, descripcion, orden, tamano_kb }) {
  const info = db.prepare(`
    INSERT INTO fotos (protocolo_id, ruta_local, ruta_nube, descripcion, orden, tamano_kb)
    VALUES (@protocolo_id, @ruta_local, @ruta_nube, @descripcion, @orden, @tamano_kb)
  `).run({
    protocolo_id: protocoloId,
    ruta_local,
    ruta_nube: ruta_nube || null,
    descripcion: descripcion || null,
    orden,
    tamano_kb: tamano_kb || null,
  });
  return info.lastInsertRowid;
}

function listarFotosDeProtocolo(db, protocoloId) {
  return db.prepare(`SELECT * FROM fotos WHERE protocolo_id = ? ORDER BY orden ASC, id ASC`).all(protocoloId);
}

module.exports = {
  crearTemplate,
  actualizarRutaPdfDeTemplate,
  activarTemplate,
  agregarCampoATemplate,
  obtenerCamposDeTemplate,
  obtenerTemplate,
  listarTemplates,
  obtenerEstadoIdPorNombre,
  crearProtocolo,
  cambiarEstadoProtocolo,
  resumenPorEstado,
  listarProtocolos,
  listarTemplatesActivos,
  listarProyectosUsados,
  listarResponsablesUsados,
  contarFotosDeProtocolo,
  agregarFoto,
  listarFotosDeProtocolo,
  obtenerProtocolo,
  obtenerValoresDeProtocolo,
  obtenerHistorialDeProtocolo,
  adjuntarPdfEscaneado,
};

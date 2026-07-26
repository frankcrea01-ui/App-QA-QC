/**
 * Pruebas de la capa de datos (/db). Verifican sobre todo las reglas de
 * negocio que el brief marca como innegociables: nada se borra, todo cambio
 * de estado queda en el historial, y las plantillas nacen como borrador.
 */
const test = require('node:test');
const assert = require('node:assert');

const { baseTemporal, plantillaDePrueba } = require('./ayudas');
const queries = require('../src/db/queries');
const constantes = require('../src/shared/constantes');

test('el esquema aplica claves foráneas', () => {
  const { db, limpiar } = baseTemporal();
  try {
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.throws(
      () => db.prepare(`INSERT INTO template_fields
        (template_id, clave_campo, etiqueta, tipo_dato, x, y, ancho, alto)
        VALUES (9999, 'x', 'X', 'texto', 0, 0, 1, 1)`).run(),
      /FOREIGN KEY/
    );
  } finally {
    limpiar();
  }
});

test('una plantilla nace como borrador y solo se activa explícitamente', () => {
  const { db, limpiar } = baseTemporal();
  try {
    const { templateId } = plantillaDePrueba(db, queries, { activar: false });

    assert.equal(db.prepare('SELECT activo FROM templates WHERE id = ?').get(templateId).activo, 0);
    assert.deepEqual(queries.listarTemplatesActivos(db), [], 'un borrador no debe aparecer en modo campo');

    queries.activarTemplate(db, templateId);
    assert.equal(queries.listarTemplatesActivos(db).length, 1);
  } finally {
    limpiar();
  }
});

test('activarTemplate falla si la plantilla no existe', () => {
  const { db, limpiar } = baseTemporal();
  try {
    assert.throws(() => queries.activarTemplate(db, 9999), /no existe/);
  } finally {
    limpiar();
  }
});

test('aprobar una versión retira la anterior: solo una vigente a la vez', () => {
  const { db, limpiar } = baseTemporal();
  try {
    const { templateId: idV1 } = plantillaDePrueba(db, queries); // v1 ya activa

    const idV2 = queries.crearTemplate(db, {
      codigo_plantilla: 'PROT-EST', nombre: 'Protocolo de Estructura', version: 'v2', especialidad: 'estructura',
    });
    // Otro formato distinto, no debe verse afectado.
    const idOtro = queries.crearTemplate(db, {
      codigo_plantilla: 'PROT-ARQ', nombre: 'Protocolo de Arquitectura', version: 'v1', especialidad: 'arquitectura',
    });
    queries.activarTemplate(db, idOtro);

    queries.activarTemplate(db, idV2);

    const activos = queries.listarTemplatesActivos(db);
    const deEstructura = activos.filter((t) => t.codigo_plantilla === 'PROT-EST');
    assert.equal(deEstructura.length, 1, 'el registrador no puede ver dos versiones del mismo formato');
    assert.equal(deEstructura[0].version, 'v2');

    assert.equal(db.prepare('SELECT activo FROM templates WHERE id = ?').get(idV1).activo, 0);
    assert.equal(
      activos.some((t) => t.id === idOtro), true,
      'otro código de plantilla no debe verse afectado'
    );
  } finally {
    limpiar();
  }
});

test('listarTemplates trae la ruta del PDF, necesaria para heredar zonas', () => {
  const { db, limpiar } = baseTemporal();
  try {
    queries.crearTemplate(db, {
      codigo_plantilla: 'PROT-EST', nombre: 'Estructura', version: 'v1',
      especialidad: 'estructura', ruta_pdf_origen: 'C:\\formatos\\estructura.pdf',
    });
    assert.equal(queries.listarTemplates(db)[0].ruta_pdf_origen, 'C:\\formatos\\estructura.pdf');
  } finally {
    limpiar();
  }
});

test('no se puede repetir la misma versión de una plantilla', () => {
  const { db, limpiar } = baseTemporal();
  try {
    plantillaDePrueba(db, queries);
    assert.throws(
      () => queries.crearTemplate(db, {
        codigo_plantilla: 'PROT-EST', nombre: 'Protocolo de Estructura', version: 'v1', especialidad: 'estructura',
      }),
      /UNIQUE/
    );
  } finally {
    limpiar();
  }
});

test('no se puede repetir una clave_campo dentro de la misma plantilla', () => {
  const { db, limpiar } = baseTemporal();
  try {
    const { templateId } = plantillaDePrueba(db, queries);
    assert.throws(
      () => queries.agregarCampoATemplate(db, templateId, {
        clave_campo: 'proyecto', etiqueta: 'Duplicado', tipo_dato: 'texto',
        x: 0, y: 0, ancho: 0.1, alto: 0.1,
      }),
      /UNIQUE/
    );
  } finally {
    limpiar();
  }
});

test('se aceptan los seis tipos de zona y se rechaza cualquier otro', () => {
  const { db, limpiar } = baseTemporal();
  try {
    const { templateId } = plantillaDePrueba(db, queries);

    for (const tipo of constantes.TIPOS_DATO) {
      assert.doesNotThrow(() => queries.agregarCampoATemplate(db, templateId, {
        clave_campo: `zona_${tipo}`, etiqueta: tipo, tipo_dato: tipo,
        x: 0.1, y: 0.5, ancho: 0.1, alto: 0.03,
      }), `el tipo "${tipo}" debería aceptarse`);
    }

    // Los tipos retirados ya no pasan, y el mensaje dice cuáles valen.
    for (const invalido of ['numero', 'lista', 'inventado']) {
      assert.throws(() => queries.agregarCampoATemplate(db, templateId, {
        clave_campo: `x_${invalido}`, etiqueta: 'X', tipo_dato: invalido,
        x: 0.1, y: 0.6, ancho: 0.1, alto: 0.03,
      }), /Tipo de zona no válido/);
    }
  } finally {
    limpiar();
  }
});

test('crearProtocolo deja el estado inicial y su primera entrada de historial', () => {
  const { db, limpiar } = baseTemporal();
  try {
    const { templateId, campos } = plantillaDePrueba(db, queries);
    const protocoloId = queries.crearProtocolo(db, {
      codigo_protocolo: 'EST-PROY01-JP01-0001-2026',
      template_id: templateId, version_usada: 'v1', proyecto: 'PROY01',
      empresa: 'Constructora Demo', especialidad: 'estructura', creado_por: 'Juan',
      valores: { [campos.proyecto]: 'Torre A', [campos.fecha]: '2026-07-25' },
    });

    const detalle = queries.obtenerProtocolo(db, protocoloId);
    assert.equal(detalle.estado, 'en_proceso');
    assert.equal(detalle.template_nombre, 'Protocolo de Estructura');

    const historial = queries.obtenerHistorialDeProtocolo(db, protocoloId);
    assert.equal(historial.length, 1);
    assert.equal(historial[0].estado_anterior, null);
    assert.equal(historial[0].estado_nuevo, 'en_proceso');
  } finally {
    limpiar();
  }
});

test('crearProtocolo es atómico: si un valor es inválido no queda protocolo a medias', () => {
  const { db, limpiar } = baseTemporal();
  try {
    const { templateId } = plantillaDePrueba(db, queries);
    assert.throws(() => queries.crearProtocolo(db, {
      codigo_protocolo: 'EST-PROY01-JP01-0002-2026',
      template_id: templateId, version_usada: 'v1', proyecto: 'PROY01',
      especialidad: 'estructura', creado_por: 'Juan',
      valores: { 99999: 'campo inexistente' }, // viola la FK a template_fields
    }));

    assert.equal(db.prepare('SELECT COUNT(*) AS t FROM protocolos').get().t, 0, 'no debe quedar el protocolo');
    assert.equal(db.prepare('SELECT COUNT(*) AS t FROM historial_estado').get().t, 0, 'ni su historial');
  } finally {
    limpiar();
  }
});

test('cada cambio de estado queda registrado en el historial', () => {
  const { db, limpiar } = baseTemporal();
  try {
    const { templateId, campos } = plantillaDePrueba(db, queries);
    const protocoloId = queries.crearProtocolo(db, {
      codigo_protocolo: 'EST-PROY01-JP01-0003-2026',
      template_id: templateId, version_usada: 'v1', proyecto: 'PROY01',
      especialidad: 'estructura', creado_por: 'Juan',
      valores: { [campos.proyecto]: 'Torre A' },
    });

    queries.cambiarEstadoProtocolo(db, protocoloId, 'en_firma', 'Jefe');
    queries.cambiarEstadoProtocolo(db, protocoloId, 'cerrado', 'Jefe');

    const historial = queries.obtenerHistorialDeProtocolo(db, protocoloId);
    assert.deepEqual(
      historial.map((h) => `${h.estado_anterior || '-'}>${h.estado_nuevo}`),
      ['->en_proceso', 'en_proceso>en_firma', 'en_firma>cerrado']
    );

    const detalle = queries.obtenerProtocolo(db, protocoloId);
    assert.equal(detalle.estado, 'cerrado');
    assert.ok(detalle.fecha_cierre, 'cerrar debe sellar la fecha de cierre');
  } finally {
    limpiar();
  }
});

test('anular es un estado, no un borrado: el registro sigue existiendo', () => {
  const { db, limpiar } = baseTemporal();
  try {
    const { templateId, campos } = plantillaDePrueba(db, queries);
    const protocoloId = queries.crearProtocolo(db, {
      codigo_protocolo: 'EST-PROY01-JP01-0004-2026',
      template_id: templateId, version_usada: 'v1', proyecto: 'PROY01',
      especialidad: 'estructura', creado_por: 'Juan',
      valores: { [campos.proyecto]: 'Torre A' },
    });

    queries.cambiarEstadoProtocolo(db, protocoloId, 'anulado', 'Jefe');

    assert.equal(queries.obtenerProtocolo(db, protocoloId).estado, 'anulado');
    assert.equal(queries.obtenerValoresDeProtocolo(db, protocoloId).length, 1, 'los valores no se borran');
  } finally {
    limpiar();
  }
});

test('cambiar el estado de un protocolo inexistente falla', () => {
  const { db, limpiar } = baseTemporal();
  try {
    assert.throws(() => queries.cambiarEstadoProtocolo(db, 9999, 'cerrado', 'Jefe'), /no existe/);
  } finally {
    limpiar();
  }
});

test('listarProtocolos filtra por especialidad y estado', () => {
  const { db, limpiar } = baseTemporal();
  try {
    const { templateId, campos } = plantillaDePrueba(db, queries);
    const crear = (codigo, especialidad) => queries.crearProtocolo(db, {
      codigo_protocolo: codigo, template_id: templateId, version_usada: 'v1',
      proyecto: 'PROY01', especialidad, creado_por: 'Juan',
      valores: { [campos.proyecto]: 'Torre A' },
    });

    crear('EST-A-JP01-0001-2026', 'estructura');
    const idArq = crear('ARQ-A-JP01-0002-2026', 'arquitectura');
    queries.cambiarEstadoProtocolo(db, idArq, 'cerrado', 'Jefe');

    assert.equal(queries.listarProtocolos(db).length, 2);
    assert.equal(queries.listarProtocolos(db, { especialidad: 'estructura' }).length, 1);
    assert.equal(queries.listarProtocolos(db, { estado: 'cerrado' }).length, 1);
    assert.equal(queries.listarProtocolos(db, { especialidad: 'estructura', estado: 'cerrado' }).length, 0);
    // El id es necesario para abrir el detalle desde la tabla del log maestro.
    assert.ok(queries.listarProtocolos(db)[0].id);
  } finally {
    limpiar();
  }
});

test('resumenPorEstado incluye los estados en cero', () => {
  const { db, limpiar } = baseTemporal();
  try {
    const resumen = queries.resumenPorEstado(db);
    // Las tarjetas del dashboard salen del catálogo y siguen el orden del flujo.
    assert.deepEqual(
      resumen.map((r) => r.estado),
      ['en_proceso', 'en_firma', 'cerrado', 'anulado']
    );
    assert.ok(resumen.every((r) => r.total === 0));
  } finally {
    limpiar();
  }
});

test('las fotos se listan ordenadas y se cuentan por protocolo', () => {
  const { db, limpiar } = baseTemporal();
  try {
    const { templateId, campos } = plantillaDePrueba(db, queries);
    const protocoloId = queries.crearProtocolo(db, {
      codigo_protocolo: 'EST-PROY01-JP01-0005-2026', template_id: templateId, version_usada: 'v1',
      proyecto: 'PROY01', especialidad: 'estructura', creado_por: 'Juan',
      valores: { [campos.proyecto]: 'Torre A' },
    });

    queries.agregarFoto(db, protocoloId, { ruta_local: '/b.jpg', orden: 2, tamano_kb: 10 });
    queries.agregarFoto(db, protocoloId, { ruta_local: '/a.jpg', orden: 1, tamano_kb: 20 });

    assert.equal(queries.contarFotosDeProtocolo(db, protocoloId), 2);
    assert.deepEqual(queries.listarFotosDeProtocolo(db, protocoloId).map((f) => f.ruta_local), ['/a.jpg', '/b.jpg']);
  } finally {
    limpiar();
  }
});

test('listarTemplates devuelve borradores y activas para el panel de versiones', () => {
  const { db, limpiar } = baseTemporal();
  try {
    plantillaDePrueba(db, queries); // v1 activa
    queries.crearTemplate(db, {
      codigo_plantilla: 'PROT-EST', nombre: 'Protocolo de Estructura', version: 'v2', especialidad: 'estructura',
    });

    const todas = queries.listarTemplates(db);
    assert.equal(todas.length, 2);
    assert.deepEqual(todas.map((t) => t.version).sort(), ['v1', 'v2']);
    assert.equal(queries.listarTemplatesActivos(db).length, 1, 'la v2 sigue siendo borrador');
  } finally {
    limpiar();
  }
});

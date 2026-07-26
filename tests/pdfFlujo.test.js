/**
 * Bloque 3 de punta a punta: el formato se copia dentro de la app, el
 * protocolo recibe su número visible, y al generar el PDF sale a firmarse.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { carpetaTemporal, plantillaDePrueba, entornoIpc, formatoPdfDePrueba } = require('./ayudas');
const queries = require('../src/db/queries');

/** Agrega al template una zona de correlativo. */
function agregarZonaCorrelativo(db, templateId) {
  return queries.agregarCampoATemplate(db, templateId, {
    clave_campo: 'nro', etiqueta: 'N°', tipo_dato: 'correlativo',
    x: 0.8, y: 0.05, ancho: 0.1, alto: 0.03, orden: 9,
  });
}

test('el formato se copia adentro de la app, no queda apuntando al archivo original', async () => {
  const fixture = carpetaTemporal();
  const rutaOriginal = await formatoPdfDePrueba(fixture.carpeta);
  const env = entornoIpc();

  try {
    const templateId = await env.invocar('templates:crear', {
      codigo_plantilla: 'PROT-EST', nombre: 'Estructura', version: 'v1',
      especialidad: 'estructura', ruta_pdf_origen: rutaOriginal,
    });

    const guardada = queries.obtenerTemplate(env.db, templateId);
    assert.notEqual(guardada.ruta_pdf_origen, rutaOriginal, 'no debe quedar la ruta externa');
    assert.ok(guardada.ruta_pdf_origen.startsWith(env.carpetaPlantillas));

    // Si el usuario mueve o borra su archivo, la plantilla sigue sirviendo.
    fs.rmSync(rutaOriginal);
    assert.ok(fs.existsSync(guardada.ruta_pdf_origen), 'la copia interna sobrevive');
  } finally {
    fixture.limpiar();
    env.limpiar();
  }
});

test('el correlativo visible avanza por formato y obra, y no se renumera', async () => {
  const env = entornoIpc();
  try {
    const { templateId } = plantillaDePrueba(env.db, queries);
    agregarZonaCorrelativo(env.db, templateId);

    const crear = (proyecto) => env.invocar('protocolos:crear', {
      templateId, versionUsada: 'v1', especialidad: 'estructura',
      proyecto, responsable: 'Juan',
      valoresPorClave: { proyecto: 'Torre A', fecha: '2026-07-25' },
    });

    assert.equal((await crear('OBRA-A')).correlativo, '001');
    assert.equal((await crear('OBRA-A')).correlativo, '002');
    // Otra obra arranca su propia serie.
    assert.equal((await crear('OBRA-B')).correlativo, '001');

    const tercero = await crear('OBRA-A');
    assert.equal(tercero.correlativo, '003');

    // Anular no devuelve el número a la serie: el hueco queda, a propósito.
    await env.invocar('log:cambiarEstado', {
      protocoloId: tercero.protocoloId, estadoNuevo: 'anulado', usuario: 'Jefe',
    });
    assert.equal((await crear('OBRA-A')).correlativo, '004');
  } finally {
    env.limpiar();
  }
});

test('la v2 de un formato continúa la numeración de la v1', async () => {
  const env = entornoIpc();
  try {
    const { templateId: idV1 } = plantillaDePrueba(env.db, queries);
    agregarZonaCorrelativo(env.db, idV1);

    const primero = await env.invocar('protocolos:crear', {
      templateId: idV1, versionUsada: 'v1', especialidad: 'estructura',
      proyecto: 'OBRA-A', responsable: 'Juan',
      valoresPorClave: { proyecto: 'Torre A', fecha: '2026-07-25' },
    });
    assert.equal(primero.correlativo, '001');

    // Nueva versión del mismo formato.
    const idV2 = queries.crearTemplate(env.db, {
      codigo_plantilla: 'PROT-EST', nombre: 'Protocolo de Estructura', version: 'v2',
      especialidad: 'estructura',
    });
    queries.agregarCampoATemplate(env.db, idV2, {
      clave_campo: 'proyecto', etiqueta: 'Proyecto', tipo_dato: 'texto', obligatorio: true,
      x: 0.1, y: 0.1, ancho: 0.3, alto: 0.05, orden: 1,
    });
    agregarZonaCorrelativo(env.db, idV2);

    const segundo = await env.invocar('protocolos:crear', {
      templateId: idV2, versionUsada: 'v2', especialidad: 'estructura',
      proyecto: 'OBRA-A', responsable: 'Juan',
      valoresPorClave: { proyecto: 'Torre A' },
    });
    assert.equal(segundo.correlativo, '002', 'la numeración es del formato, no de la revisión');
  } finally {
    env.limpiar();
  }
});

test('sin zona de correlativo no se consume numeración', async () => {
  const env = entornoIpc();
  try {
    const { templateId } = plantillaDePrueba(env.db, queries);
    const creado = await env.invocar('protocolos:crear', {
      templateId, versionUsada: 'v1', especialidad: 'estructura',
      proyecto: 'OBRA-A', responsable: 'Juan',
      valoresPorClave: { proyecto: 'Torre A', fecha: '2026-07-25' },
    });
    assert.equal(creado.correlativo, null);
  } finally {
    env.limpiar();
  }
});

test('un protocolo inválido no consume número de la serie', async () => {
  const env = entornoIpc();
  try {
    const { templateId } = plantillaDePrueba(env.db, queries);
    agregarZonaCorrelativo(env.db, templateId);

    const base = {
      templateId, versionUsada: 'v1', especialidad: 'estructura',
      proyecto: 'OBRA-A', responsable: 'Juan',
    };

    const fallido = await env.invocar('protocolos:crear', {
      ...base, valoresPorClave: { proyecto: '', fecha: 'no-es-fecha' },
    });
    assert.equal(fallido.ok, false);

    const bueno = await env.invocar('protocolos:crear', {
      ...base, valoresPorClave: { proyecto: 'Torre A', fecha: '2026-07-25' },
    });
    assert.equal(bueno.correlativo, '001', 'el intento fallido no debe haber gastado el 001');
  } finally {
    env.limpiar();
  }
});

test('generar el PDF: crea el archivo, lo abre y pasa el protocolo a en_firma', async () => {
  const fixture = carpetaTemporal();
  const rutaOriginal = await formatoPdfDePrueba(fixture.carpeta);
  const env = entornoIpc();

  try {
    const templateId = await env.invocar('templates:crear', {
      codigo_plantilla: 'PROT-EST', nombre: 'Estructura', version: 'v1',
      especialidad: 'estructura', ruta_pdf_origen: rutaOriginal,
    });
    await env.invocar('templates:agregarCampo', templateId, {
      clave_campo: 'proyecto', etiqueta: 'Proyecto', tipo_dato: 'texto', obligatorio: true,
      x: 0.1, y: 0.1, ancho: 0.4, alto: 0.04, orden: 1,
    });
    await env.invocar('templates:activar', templateId);

    const creado = await env.invocar('protocolos:crear', {
      templateId, versionUsada: 'v1', especialidad: 'estructura',
      proyecto: 'OBRA-A', responsable: 'Juan',
      valoresPorClave: { proyecto: 'Torre A - Piso 3' },
    });

    assert.equal(
      (await env.invocar('log:obtenerDetalle', creado.protocoloId)).protocolo.estado,
      'en_proceso'
    );

    const resultado = await env.invocar('protocolos:generarPdf', creado.protocoloId);
    assert.equal(resultado.ok, true);
    assert.deepEqual(resultado.advertencias, []);
    assert.ok(fs.existsSync(resultado.ruta), 'el PDF debe quedar en disco');
    assert.ok(resultado.ruta.includes(creado.codigoProtocolo), 'se nombra con el código del protocolo');
    assert.deepEqual(env.abiertos, [resultado.ruta], 'se abre en el visor del sistema');

    // Generar es el momento en que el protocolo sale a firmarse.
    const detalle = await env.invocar('log:obtenerDetalle', creado.protocoloId);
    assert.equal(detalle.protocolo.estado, 'en_firma');
    assert.equal(detalle.historial.at(-1).estado_nuevo, 'en_firma');
    assert.equal(detalle.historial.at(-1).usuario, 'Juan');

    // Regenerar no hace retroceder el estado ni ensucia el historial.
    await env.invocar('protocolos:generarPdf', creado.protocoloId);
    const despues = await env.invocar('log:obtenerDetalle', creado.protocoloId);
    assert.equal(despues.protocolo.estado, 'en_firma');
    assert.equal(despues.historial.length, detalle.historial.length);
  } finally {
    fixture.limpiar();
    env.limpiar();
  }
});

test('el PDF generado lleva los valores automáticos, no solo lo que se tipeó', async () => {
  const fixture = carpetaTemporal();
  const rutaOriginal = await formatoPdfDePrueba(fixture.carpeta);
  const env = entornoIpc();

  try {
    const templateId = await env.invocar('templates:crear', {
      codigo_plantilla: 'PROT-EST', nombre: 'Estructura', version: 'v1',
      especialidad: 'estructura', ruta_pdf_origen: rutaOriginal,
    });
    const zonas = [
      { clave_campo: 'obra', etiqueta: 'Obra', tipo_dato: 'proyecto', x: 0.1, y: 0.05 },
      { clave_campo: 'firma', etiqueta: 'Elaborado por', tipo_dato: 'responsable', x: 0.1, y: 0.9 },
      { clave_campo: 'nro', etiqueta: 'N°', tipo_dato: 'correlativo', x: 0.8, y: 0.05 },
    ];
    for (const [indice, zona] of zonas.entries()) {
      await env.invocar('templates:agregarCampo', templateId, {
        ...zona, ancho: 0.3, alto: 0.03, orden: indice + 1,
      });
    }

    const creado = await env.invocar('protocolos:crear', {
      templateId, versionUsada: 'v1', especialidad: 'estructura',
      proyecto: 'TORRE-NORTE', responsable: 'Ana Torres',
      valoresPorClave: {},
    });

    const resultado = await env.invocar('protocolos:generarPdf', creado.protocoloId);
    assert.equal(resultado.ok, true);

    // Se lee el PDF generado para confirmar que los tres datos salieron impresos.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const documento = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(resultado.ruta)) }).promise;
    const contenido = await (await documento.getPage(1)).getTextContent();
    const impreso = contenido.items.map((i) => i.str).join(' ');

    assert.match(impreso, /TORRE-NORTE/);
    assert.match(impreso, /Ana Torres/);
    assert.match(impreso, /001/);
  } finally {
    fixture.limpiar();
    env.limpiar();
  }
});

test('generar el PDF avisa si falta el formato en vez de romper', async () => {
  const env = entornoIpc();
  try {
    const { templateId } = plantillaDePrueba(env.db, queries); // creada sin PDF
    const creado = await env.invocar('protocolos:crear', {
      templateId, versionUsada: 'v1', especialidad: 'estructura',
      proyecto: 'OBRA-A', responsable: 'Juan',
      valoresPorClave: { proyecto: 'Torre A', fecha: '2026-07-25' },
    });

    const resultado = await env.invocar('protocolos:generarPdf', creado.protocoloId);
    assert.equal(resultado.ok, false);
    assert.match(resultado.mensaje, /formato PDF/);
    // Y el protocolo no se mueve de estado.
    assert.equal(
      (await env.invocar('log:obtenerDetalle', creado.protocoloId)).protocolo.estado,
      'en_proceso'
    );
  } finally {
    env.limpiar();
  }
});

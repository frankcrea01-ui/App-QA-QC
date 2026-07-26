/**
 * Bloque 4: el cierre del ciclo. Cargar el protocolo firmado y escaneado
 * es lo que lo da por terminado, y ese respaldo tiene que quedar guardado
 * dentro de la app — es lo que se conserva si se pierde el papel.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { carpetaTemporal, plantillaDePrueba, entornoIpc } = require('./ayudas');
const queries = require('../src/db/queries');

/** Crea un protocolo listo para cerrar y devuelve su id y código. */
async function protocoloDePrueba(env, { proyecto = 'OBRA-A', responsable = 'Juan' } = {}) {
  const { templateId } = plantillaDePrueba(env.db, queries);
  const creado = await env.invocar('protocolos:crear', {
    templateId, versionUsada: 'v1', especialidad: 'estructura',
    proyecto, responsable,
    valoresPorClave: { proyecto: 'Torre A', fecha: '2026-07-25' },
  });
  return creado;
}

/** Deja un archivo que simula el protocolo firmado y escaneado. */
function escaneadoDePrueba(carpeta, nombre = 'escaneo.pdf') {
  fs.mkdirSync(carpeta, { recursive: true });
  const ruta = path.join(carpeta, nombre);
  fs.writeFileSync(ruta, '%PDF-1.4\n% protocolo firmado\n%%EOF');
  return ruta;
}

test('cargar el escaneado cierra el protocolo y guarda el archivo adentro de la app', async () => {
  const fixture = carpetaTemporal();
  const rutaEscaneo = escaneadoDePrueba(fixture.carpeta);
  const env = entornoIpc({ rutasDialog: [rutaEscaneo] });

  try {
    const creado = await protocoloDePrueba(env);
    assert.equal((await env.invocar('log:obtenerDetalle', creado.protocoloId)).protocolo.estado, 'en_proceso');

    const resultado = await env.invocar('log:adjuntarPdfEscaneado', creado.protocoloId);
    assert.equal(resultado.ok, true);
    assert.equal(resultado.reemplazado, false);

    // El respaldo queda adentro de la app, nombrado con el código del protocolo.
    assert.ok(resultado.ruta.startsWith(env.carpetaEscaneados));
    assert.ok(resultado.ruta.includes(creado.codigoProtocolo));
    assert.ok(fs.existsSync(resultado.ruta));

    // Si el usuario borra su copia, el respaldo de la app sobrevive.
    fs.rmSync(rutaEscaneo);
    assert.ok(fs.existsSync(resultado.ruta));

    const detalle = await env.invocar('log:obtenerDetalle', creado.protocoloId);
    assert.equal(detalle.protocolo.estado, 'cerrado', 'cargar el firmado cierra el protocolo solo');
    assert.equal(detalle.protocolo.pdf_escaneado_link, resultado.ruta);
    assert.ok(detalle.protocolo.fecha_cierre, 'cerrar sella la fecha de cierre');
    assert.equal(detalle.historial.at(-1).estado_nuevo, 'cerrado');
  } finally {
    fixture.limpiar();
    env.limpiar();
  }
});

test('el cierre automático queda firmado por el responsable de la sesión', async () => {
  const fixture = carpetaTemporal();
  const env = entornoIpc({ rutasDialog: [escaneadoDePrueba(fixture.carpeta)] });

  try {
    const creado = await protocoloDePrueba(env, { responsable: 'Registrador de Obra' });
    // El jefe de calidad es quien recibe el firmado y lo carga.
    await env.invocar('config:guardarSesion', { proyecto: 'OBRA-A', responsable: 'Jefe de Calidad' });

    await env.invocar('log:adjuntarPdfEscaneado', creado.protocoloId);

    const detalle = await env.invocar('log:obtenerDetalle', creado.protocoloId);
    assert.equal(detalle.historial.at(-1).usuario, 'Jefe de Calidad');
    // Y sigue constando quién lo llenó en obra.
    assert.equal(detalle.protocolo.creado_por, 'Registrador de Obra');
  } finally {
    fixture.limpiar();
    env.limpiar();
  }
});

test('sin sesión configurada el cierre lo firma quien llenó el protocolo', async () => {
  const fixture = carpetaTemporal();
  const env = entornoIpc({ rutasDialog: [escaneadoDePrueba(fixture.carpeta)] });

  try {
    const creado = await protocoloDePrueba(env, { responsable: 'Ana Torres' });
    await env.invocar('log:adjuntarPdfEscaneado', creado.protocoloId);

    const detalle = await env.invocar('log:obtenerDetalle', creado.protocoloId);
    assert.equal(detalle.historial.at(-1).usuario, 'Ana Torres', 'el historial nunca queda sin responsable');
  } finally {
    fixture.limpiar();
    env.limpiar();
  }
});

test('volver a cargar el escaneado lo reemplaza y el protocolo sigue cerrado', async () => {
  const fixture = carpetaTemporal();
  const primero = escaneadoDePrueba(fixture.carpeta, 'primero.pdf');
  const env = entornoIpc({ rutasDialog: [primero] });

  try {
    const creado = await protocoloDePrueba(env);
    await env.invocar('log:adjuntarPdfEscaneado', creado.protocoloId);

    const trasPrimera = await env.invocar('log:obtenerDetalle', creado.protocoloId);
    const historialInicial = trasPrimera.historial.length;

    const resultado = await env.invocar('log:adjuntarPdfEscaneado', creado.protocoloId);
    assert.equal(resultado.ok, true);
    assert.equal(resultado.reemplazado, true, 'debe avisar que reemplazó, no que cerró de nuevo');

    const trasSegunda = await env.invocar('log:obtenerDetalle', creado.protocoloId);
    assert.equal(trasSegunda.protocolo.estado, 'cerrado');
    assert.equal(
      trasSegunda.historial.length, historialInicial,
      'reemplazar no debe ensuciar el historial con un cierre repetido'
    );
  } finally {
    fixture.limpiar();
    env.limpiar();
  }
});

test('reemplazar por otro formato no deja dos archivos del mismo protocolo', async () => {
  const fixture = carpetaTemporal();
  const comoPdf = escaneadoDePrueba(fixture.carpeta, 'firmado.pdf');
  const env = entornoIpc({ rutasDialog: [comoPdf] });

  try {
    const creado = await protocoloDePrueba(env);
    const primera = await env.invocar('log:adjuntarPdfEscaneado', creado.protocoloId);
    assert.ok(primera.ruta.endsWith('.pdf'));

    // Lo vuelve a cargar, ahora como foto del celular.
    const comoFoto = path.join(fixture.carpeta, 'firmado.jpg');
    fs.writeFileSync(comoFoto, 'jpeg de prueba');
    env.elegirEnDialogo([comoFoto]);

    const segunda = await env.invocar('log:adjuntarPdfEscaneado', creado.protocoloId);
    assert.ok(segunda.ruta.endsWith('.jpg'), 'acepta foto además de PDF');

    // El PDF anterior no debe quedar suelto: un solo firmado por protocolo.
    assert.ok(!fs.existsSync(primera.ruta), 'el archivo anterior debe eliminarse');
    assert.deepEqual(
      fs.readdirSync(env.carpetaEscaneados).filter((n) => n.includes(creado.codigoProtocolo)),
      [path.basename(segunda.ruta)]
    );
  } finally {
    fixture.limpiar();
    env.limpiar();
  }
});

test('cancelar el diálogo no cambia nada', async () => {
  const env = entornoIpc({ rutasDialog: [] }); // dialog cancelado
  try {
    const creado = await protocoloDePrueba(env);
    const resultado = await env.invocar('log:adjuntarPdfEscaneado', creado.protocoloId);

    assert.equal(resultado.ok, false);
    const detalle = await env.invocar('log:obtenerDetalle', creado.protocoloId);
    assert.equal(detalle.protocolo.estado, 'en_proceso');
    assert.equal(detalle.protocolo.pdf_escaneado_link, null);
  } finally {
    env.limpiar();
  }
});

test('abrir el escaneado: avisa si todavía no hay o si el archivo desapareció', async () => {
  const fixture = carpetaTemporal();
  const env = entornoIpc({ rutasDialog: [escaneadoDePrueba(fixture.carpeta)] });

  try {
    const creado = await protocoloDePrueba(env);

    const sinCargar = await env.invocar('log:abrirEscaneado', creado.protocoloId);
    assert.equal(sinCargar.ok, false);
    assert.match(sinCargar.mensaje, /todavía no tiene/);

    const cargado = await env.invocar('log:adjuntarPdfEscaneado', creado.protocoloId);
    const abierto = await env.invocar('log:abrirEscaneado', creado.protocoloId);
    assert.equal(abierto.ok, true);
    assert.deepEqual(env.abiertos, [cargado.ruta]);

    // Si alguien borra el archivo por fuera, se avisa en vez de fallar.
    fs.rmSync(cargado.ruta);
    const perdido = await env.invocar('log:abrirEscaneado', creado.protocoloId);
    assert.equal(perdido.ok, false);
    assert.match(perdido.mensaje, /ya no está disponible/);
  } finally {
    fixture.limpiar();
    env.limpiar();
  }
});

test('ciclo completo: llenar → generar → firmar → cerrar', async () => {
  const fixture = carpetaTemporal();
  const { formatoPdfDePrueba } = require('./ayudas');
  const rutaFormato = await formatoPdfDePrueba(fixture.carpeta);
  const rutaEscaneo = escaneadoDePrueba(fixture.carpeta, 'firmado.pdf');

  // El diálogo devuelve primero el formato (al crear la plantilla no se usa)
  // y después el escaneado; acá alcanza con el escaneado.
  const env = entornoIpc({ rutasDialog: [rutaEscaneo] });

  try {
    const templateId = await env.invocar('templates:crear', {
      codigo_plantilla: 'PROT-EST', nombre: 'Estructura', version: 'v1',
      especialidad: 'estructura', ruta_pdf_origen: rutaFormato,
    });
    await env.invocar('templates:agregarCampo', templateId, {
      clave_campo: 'proyecto', etiqueta: 'Proyecto', tipo_dato: 'texto', obligatorio: true,
      x: 0.1, y: 0.1, ancho: 0.4, alto: 0.04, orden: 1,
    });
    await env.invocar('templates:activar', templateId);

    const creado = await env.invocar('protocolos:crear', {
      templateId, versionUsada: 'v1', especialidad: 'estructura',
      proyecto: 'OBRA-A', responsable: 'Juan',
      valoresPorClave: { proyecto: 'Torre A' },
    });

    await env.invocar('protocolos:generarPdf', creado.protocoloId);
    await env.invocar('log:adjuntarPdfEscaneado', creado.protocoloId);

    const detalle = await env.invocar('log:obtenerDetalle', creado.protocoloId);
    assert.equal(detalle.protocolo.estado, 'cerrado');

    // El historial cuenta la historia completa, sin pasos manuales.
    assert.deepEqual(
      detalle.historial.map((h) => h.estado_nuevo),
      ['en_proceso', 'en_firma', 'cerrado']
    );

    const resumen = await env.invocar('log:resumenPorEstado');
    assert.equal(resumen.find((r) => r.estado === 'cerrado').total, 1);
    assert.equal(resumen.find((r) => r.estado === 'en_firma').total, 0);
  } finally {
    fixture.limpiar();
    env.limpiar();
  }
});

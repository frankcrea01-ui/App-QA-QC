/**
 * Pruebas de la revisión de los bloques 1 a 4.
 *
 * Cada una fija un bug que existió y que las pruebas de su bloque no
 * atrapaban: son los casos que aparecen cuando algo sale mal (un archivo que
 * no está, una fila equivocada, dos versiones en el mismo segundo), no
 * cuando todo va bien.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { carpetaTemporal, plantillaDePrueba, entornoIpc } = require('./ayudas');
const queries = require('../src/db/queries');
const { validarTransicionEstado } = require('../src/core/validaciones');

function escaneadoDePrueba(carpeta, nombre = 'firmado.pdf') {
  fs.mkdirSync(carpeta, { recursive: true });
  const ruta = path.join(carpeta, nombre);
  fs.writeFileSync(ruta, '%PDF-1.4\n% protocolo firmado\n%%EOF');
  return ruta;
}

async function protocoloDePrueba(env, proyecto = 'Torre A') {
  const { templateId } = plantillaDePrueba(env.db, queries);
  return env.invocar('protocolos:crear', {
    templateId, versionUsada: 'v1', especialidad: 'estructura',
    proyecto: 'OBRA-A', responsable: 'Juan',
    valoresPorClave: { proyecto, fecha: '2026-07-25' },
  });
}

// ---------------------------------------------------------------------------
// 1. Anulado es terminal
// ---------------------------------------------------------------------------

test('anulado no sale de ese estado salvo que se pida reactivarlo', () => {
  const bloqueado = validarTransicionEstado('anulado', 'cerrado');
  assert.equal(bloqueado.permitido, false);
  assert.match(bloqueado.mensaje, /reactivarlo/);

  assert.equal(validarTransicionEstado('anulado', 'cerrado', { reactivar: true }).permitido, true);
  // El resto del flujo sigue libre: corregir un estado mal puesto es válido.
  assert.equal(validarTransicionEstado('cerrado', 'en_proceso').permitido, true);
});

test('cargar el escaneado en un protocolo anulado no lo cierra', async () => {
  const fixture = carpetaTemporal();
  const env = entornoIpc({ rutasDialog: [escaneadoDePrueba(fixture.carpeta)] });

  try {
    const creado = await protocoloDePrueba(env);
    await env.invocar('log:cambiarEstado', {
      protocoloId: creado.protocoloId, estadoNuevo: 'anulado', usuario: 'Jefe',
    });

    const resultado = await env.invocar('log:adjuntarPdfEscaneado', creado.protocoloId);
    assert.equal(resultado.ok, false, 'un anulado no se cierra cargando el firmado');
    assert.match(resultado.mensaje, /anulado/);

    const detalle = await env.invocar('log:obtenerDetalle', creado.protocoloId);
    assert.equal(detalle.protocolo.estado, 'anulado', 'la baja no se deshace sola');
    assert.equal(detalle.protocolo.fecha_cierre, null, 'un anulado no lleva fecha de cierre');
    assert.equal(detalle.protocolo.pdf_escaneado_link, null);
    assert.deepEqual(
      detalle.historial.map((h) => h.estado_nuevo),
      ['en_proceso', 'anulado'],
      'el historial no inventa un cierre que nadie decidió'
    );
    // Y no queda ningún archivo copiado por un cierre que no ocurrió.
    assert.ok(!fs.existsSync(env.carpetaEscaneados) || fs.readdirSync(env.carpetaEscaneados).length === 0);
  } finally {
    fixture.limpiar();
    env.limpiar();
  }
});

test('reactivar un anulado sí funciona, y queda firmado en el historial', async () => {
  const env = entornoIpc({});

  try {
    const creado = await protocoloDePrueba(env);
    await env.invocar('log:cambiarEstado', {
      protocoloId: creado.protocoloId, estadoNuevo: 'anulado', usuario: 'Jefe',
    });

    const sinPedirlo = await env.invocar('log:cambiarEstado', {
      protocoloId: creado.protocoloId, estadoNuevo: 'en_proceso', usuario: 'Jefe',
    });
    assert.equal(sinPedirlo.ok, false, 'ni siquiera a mano se sale de anulado por descuido');

    const reactivado = await env.invocar('log:cambiarEstado', {
      protocoloId: creado.protocoloId, estadoNuevo: 'en_proceso', usuario: 'Ana', reactivar: true,
    });
    assert.equal(reactivado.ok, true);

    const detalle = await env.invocar('log:obtenerDetalle', creado.protocoloId);
    assert.equal(detalle.protocolo.estado, 'en_proceso');
    assert.equal(detalle.historial.at(-1).estado_anterior, 'anulado');
    assert.equal(detalle.historial.at(-1).usuario, 'Ana', 'la reactivación tiene responsable');
  } finally {
    env.limpiar();
  }
});

// ---------------------------------------------------------------------------
// 2. El firmado guardado no se pierde
// ---------------------------------------------------------------------------

test('si la copia del escaneado falla, el firmado que ya estaba sigue intacto', async () => {
  const fixture = carpetaTemporal();
  const env = entornoIpc({ rutasDialog: [escaneadoDePrueba(fixture.carpeta)] });

  try {
    const creado = await protocoloDePrueba(env);
    const primera = await env.invocar('log:adjuntarPdfEscaneado', creado.protocoloId);
    assert.equal(primera.ok, true);

    // El usuario elige un archivo que ya no está donde estaba (lo movió, o
    // era de un USB que desconectó).
    env.elegirEnDialogo([path.join(fixture.carpeta, 'se-movio.jpg')]);
    const segunda = await env.invocar('log:adjuntarPdfEscaneado', creado.protocoloId);

    assert.equal(segunda.ok, false, 'avisa en vez de romper');
    assert.match(segunda.mensaje, /no se tocó/);

    assert.ok(fs.existsSync(primera.ruta), 'el respaldo del papel firmado no se puede perder');
    const detalle = await env.invocar('log:obtenerDetalle', creado.protocoloId);
    assert.equal(detalle.protocolo.pdf_escaneado_link, primera.ruta, 'la base sigue apuntando al que existe');
    assert.equal(detalle.protocolo.estado, 'cerrado');
  } finally {
    fixture.limpiar();
    env.limpiar();
  }
});

// ---------------------------------------------------------------------------
// 3. Ningún borrador queda invisible
// ---------------------------------------------------------------------------

test('dos versiones creadas en el mismo segundo no se pisan en el orden', async () => {
  const env = entornoIpc({});

  try {
    const v1 = queries.crearTemplate(env.db, {
      codigo_plantilla: 'PROT-A', nombre: 'A', version: 'v1', especialidad: 'gas',
    });
    const v2 = queries.crearTemplate(env.db, {
      codigo_plantilla: 'PROT-A', nombre: 'A', version: 'v2', especialidad: 'gas',
    });

    const listado = await env.invocar('templates:listarTodas');
    assert.deepEqual(
      listado.map((t) => t.version), ['v2', 'v1'],
      'la más nueva primero, aunque fecha_creacion empate'
    );
    // fecha_creacion sí empata: por eso el orden no puede depender de ella.
    assert.equal(listado[0].fecha_creacion, listado[1].fecha_creacion);
    assert.ok(v2 > v1);
  } finally {
    env.limpiar();
  }
});

test('todos los borradores posteriores a la vigente quedan a la vista', async () => {
  const env = entornoIpc({});

  try {
    const base = { codigo_plantilla: 'PROT-B', nombre: 'B', especialidad: 'gas' };
    const v1 = queries.crearTemplate(env.db, { ...base, version: 'v1' });
    queries.activarTemplate(env.db, v1);
    queries.crearTemplate(env.db, { ...base, version: 'v2' });
    queries.crearTemplate(env.db, { ...base, version: 'v3' });

    const listado = await env.invocar('templates:listarTodas');
    const vigente = listado.find((t) => t.activo === 1);
    const borradores = listado.filter((t) => t.activo === 0 && t.id > vigente.id);

    assert.equal(vigente.version, 'v1');
    assert.deepEqual(
      borradores.map((b) => b.version), ['v3', 'v2'],
      'ningún borrador puede quedar sin forma de aprobarse'
    );
  } finally {
    env.limpiar();
  }
});

// ---------------------------------------------------------------------------
// 4. Una plantilla sin zonas no llega a obra
// ---------------------------------------------------------------------------

test('una plantilla sin zonas no pasa a producción', async () => {
  const env = entornoIpc({});

  try {
    const vacia = await env.invocar('templates:crear', {
      codigo_plantilla: 'PROT-VACIA', nombre: 'Vacía', version: 'v1', especialidad: 'gas',
    });

    const resultado = await env.invocar('templates:activar', vacia);
    assert.equal(resultado.ok, false);
    assert.match(resultado.mensaje, /zona/);
    assert.deepEqual(await env.invocar('templates:listarActivos'), [], 'no llega al selector de obra');

    // Con una zona dibujada, se activa normalmente.
    await env.invocar('templates:agregarCampo', vacia, {
      clave_campo: 'obs', etiqueta: 'Observación', tipo_dato: 'texto', obligatorio: false,
      x: 0.1, y: 0.1, ancho: 0.3, alto: 0.05, orden: 1,
    });
    assert.equal((await env.invocar('templates:activar', vacia)).ok, true);
    assert.equal((await env.invocar('templates:listarActivos')).length, 1);
  } finally {
    env.limpiar();
  }
});

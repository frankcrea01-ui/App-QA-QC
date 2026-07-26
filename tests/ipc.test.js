/**
 * Pruebas de los handlers IPC (src/main/ipc). Se ejercita el mismo código
 * que corre en el proceso principal, con un ipcMain y un dialog falsos,
 * sin necesidad de levantar Electron ni hacer clic en la ventana.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { carpetaTemporal, plantillaDePrueba, entornoIpc } = require('./ayudas');
const { inicialesDe, idDeEsteDispositivo } = require('../src/main/ipc/protocolos');
const queries = require('../src/db/queries');
const constantes = require('../src/shared/constantes');

const entorno = entornoIpc;

test('el preload y los handlers exponen exactamente los mismos canales', () => {
  const env = entorno();
  try {
    const registrados = env.canales().sort();

    // Se extraen los canales que usa el preload leyendo el archivo, para que
    // agregar un método en la UI sin su handler (o al revés) rompa acá.
    const preload = fs.readFileSync(path.join(__dirname, '../src/main/preload.js'), 'utf-8');
    const usados = [...preload.matchAll(/invoke\('([^']+)'/g)].map((m) => m[1]).sort();

    assert.deepEqual(usados, registrados);
  } finally {
    env.limpiar();
  }
});

test('meta:constantes entrega una sola fuente de verdad a la UI', async () => {
  const env = entorno();
  try {
    const c = await env.invocar('meta:constantes');
    assert.deepEqual(c.estados, constantes.ESTADOS_PROTOCOLO);
    assert.deepEqual(c.tiposDato, constantes.TIPOS_DATO);
    assert.deepEqual(c.tiposAutomaticos, constantes.TIPOS_AUTOMATICOS);
    assert.equal(c.maxFotos, constantes.MAX_FOTOS_POR_PROTOCOLO);
    assert.ok(c.especialidades.includes('estructura'));

    // La UI depende de estos nombres: si cambian, se rompe sin aviso.
    assert.deepEqual(
      c.tiposDato,
      ['texto', 'fecha', 'check', 'correlativo', 'proyecto', 'responsable']
    );
    assert.deepEqual(c.estados, ['en_proceso', 'en_firma', 'cerrado', 'anulado']);
    // Los tipos automáticos tienen que ser un subconjunto de los tipos válidos.
    assert.ok(c.tiposAutomaticos.every((t) => c.tiposDato.includes(t)));
  } finally {
    env.limpiar();
  }
});

test('meta:leerPdf abre el PDF de una versión anterior y tolera que ya no esté', async () => {
  const fixture = carpetaTemporal();
  const rutaPdf = path.join(fixture.carpeta, 'formato.pdf');
  fs.writeFileSync(rutaPdf, '%PDF-1.4\n% contenido de prueba\n%%EOF');

  const env = entorno();
  try {
    const leido = await env.invocar('meta:leerPdf', rutaPdf);
    assert.equal(leido.rutaArchivo, rutaPdf);
    assert.ok(leido.datos.length > 0);

    // Si el archivo se movió o se borró, se devuelve null y la UI lo vuelve a pedir.
    assert.equal(await env.invocar('meta:leerPdf', path.join(fixture.carpeta, 'no-existe.pdf')), null);
    assert.equal(await env.invocar('meta:leerPdf', null), null);
    // Y no se lee cualquier archivo del disco por las dudas.
    assert.equal(await env.invocar('meta:leerPdf', 'C:\\Windows\\System32\\drivers\\etc\\hosts'), null);
  } finally {
    fixture.limpiar();
    env.limpiar();
  }
});

test('nueva versión: las zonas de la vigente se pueden copiar tal cual', async () => {
  const env = entorno();
  try {
    const { templateId } = plantillaDePrueba(env.db, queries);
    const originales = await env.invocar('templates:obtenerCampos', templateId);

    // La v2 se crea calcando las zonas de la v1 (lo que hace el editor).
    const idV2 = await env.invocar('templates:crear', {
      codigo_plantilla: 'PROT-EST', nombre: 'Protocolo de Estructura', version: 'v2', especialidad: 'estructura',
    });
    for (const campo of originales) {
      await env.invocar('templates:agregarCampo', idV2, {
        clave_campo: campo.clave_campo, etiqueta: campo.etiqueta, tipo_dato: campo.tipo_dato,
        obligatorio: campo.obligatorio === 1, pagina: campo.pagina,
        x: campo.x, y: campo.y, ancho: campo.ancho, alto: campo.alto, orden: campo.orden,
      });
    }

    const copiadas = await env.invocar('templates:obtenerCampos', idV2);
    assert.equal(copiadas.length, originales.length);
    assert.deepEqual(
      copiadas.map((c) => [c.clave_campo, c.tipo_dato, c.obligatorio, c.x, c.y]),
      originales.map((c) => [c.clave_campo, c.tipo_dato, c.obligatorio, c.x, c.y])
    );

    // Y las zonas de la v1 quedan intactas: cada versión es independiente.
    assert.equal((await env.invocar('templates:obtenerCampos', templateId)).length, originales.length);
  } finally {
    env.limpiar();
  }
});

test('onboarding: se marca una vez y queda marcado', async () => {
  const env = entorno();
  try {
    assert.equal(await env.invocar('config:obtenerOnboardingVisto'), false);
    await env.invocar('config:marcarOnboardingVisto');
    assert.equal(await env.invocar('config:obtenerOnboardingVisto'), true);
    await env.invocar('config:marcarOnboardingVisto');
    assert.equal(await env.invocar('config:obtenerOnboardingVisto'), true);
  } finally {
    env.limpiar();
  }
});

test('inicialesDe: textos cortos, con tildes y vacíos no rompen el código único', () => {
  assert.equal(inicialesDe('Juan Perez'), 'JU');
  assert.equal(inicialesDe('Ñoño'), 'NO');
  assert.equal(inicialesDe('A'), 'AX', 'un texto de una letra debe completarse, no fallar');
  assert.equal(inicialesDe(''), 'XX');
  assert.equal(inicialesDe(null), 'XX');
  assert.equal(inicialesDe('123'), 'XX');
  // El caso real: nombres de equipo tipo DESKTOP-9F2K1.
  assert.equal(inicialesDe('DESKTOP-9F2K1'), 'DE');
});

test('sin login: el protocolo queda firmado por el responsable y por el dispositivo', async () => {
  const env = entorno();
  try {
    const { templateId } = plantillaDePrueba(env.db, queries);
    const datos = {
      templateId, versionUsada: 'v1', proyecto: 'PROY01', especialidad: 'estructura', responsable: 'Juan Perez',
      valoresPorClave: { proyecto: 'Torre A', fecha: '2026-07-25' },
    };

    const primero = await env.invocar('protocolos:crear', datos);
    const segundo = await env.invocar('protocolos:crear', datos);
    assert.equal(primero.ok, true);

    // Quién llenó: el responsable del turno, sin que nadie inicie sesión.
    const detalle = await env.invocar('log:obtenerDetalle', primero.protocoloId);
    assert.equal(detalle.protocolo.creado_por, 'Juan Perez');
    assert.equal(detalle.historial[0].usuario, 'Juan Perez');

    // Desde dónde: el dispositivo, dentro del código único.
    const idDispositivo = idDeEsteDispositivo(env.db);
    assert.match(idDispositivo, /^[A-Z]{2}\d{2}$/);
    assert.ok(primero.codigoProtocolo.includes(idDispositivo));
    assert.ok(segundo.codigoProtocolo.includes(idDispositivo));
    assert.notEqual(primero.codigoProtocolo, segundo.codigoProtocolo);
  } finally {
    env.limpiar();
  }
});

test('crear protocolo exige obra y responsable de la sesión', async () => {
  const env = entorno();
  try {
    const { templateId } = plantillaDePrueba(env.db, queries);
    const base = {
      templateId, versionUsada: 'v1', especialidad: 'estructura',
      valoresPorClave: { proyecto: 'Torre A', fecha: '2026-07-25' },
    };

    await assert.rejects(
      () => env.invocar('protocolos:crear', { ...base, responsable: 'Juan' }), /obra/
    );
    await assert.rejects(
      () => env.invocar('protocolos:crear', { ...base, proyecto: 'PROY01', responsable: '  ' }), /responsable/
    );
  } finally {
    env.limpiar();
  }
});

test('las zonas automáticas se llenan solas, sin pedirlas al registrador', async () => {
  const env = entorno();
  try {
    const { templateId } = plantillaDePrueba(env.db, queries);
    // Zonas que la app completa: el registrador nunca las escribe.
    queries.agregarCampoATemplate(env.db, templateId, {
      clave_campo: 'obra', etiqueta: 'Obra', tipo_dato: 'proyecto', obligatorio: true,
      x: 0.1, y: 0.02, ancho: 0.3, alto: 0.03, orden: 10,
    });
    queries.agregarCampoATemplate(env.db, templateId, {
      clave_campo: 'elaborado_por', etiqueta: 'Elaborado por', tipo_dato: 'responsable', obligatorio: true,
      x: 0.1, y: 0.9, ancho: 0.3, alto: 0.03, orden: 11,
    });

    const creado = await env.invocar('protocolos:crear', {
      templateId, versionUsada: 'v1', proyecto: 'TORRE-NORTE', especialidad: 'estructura',
      responsable: 'Ana Torres',
      // No se mandan 'obra' ni 'elaborado_por': las completa el proceso principal.
      valoresPorClave: { proyecto: 'Torre A', fecha: '2026-07-25' },
    });
    assert.equal(creado.ok, true, 'no deben reportarse como obligatorios vacíos');

    const detalle = await env.invocar('log:obtenerDetalle', creado.protocoloId);
    const porClave = Object.fromEntries(detalle.valores.map((v) => [v.clave_campo, v.valor]));
    assert.equal(porClave.obra, 'TORRE-NORTE');
    assert.equal(porClave.elaborado_por, 'Ana Torres');
  } finally {
    env.limpiar();
  }
});

test('sugerencias: obras y responsables ya usados, el más reciente primero', async () => {
  const env = entorno();
  try {
    const { templateId } = plantillaDePrueba(env.db, queries);
    const crear = (proyecto, responsable) => env.invocar('protocolos:crear', {
      templateId, versionUsada: 'v1', especialidad: 'estructura', proyecto, responsable,
      valoresPorClave: { proyecto: 'Torre A', fecha: '2026-07-25' },
    });

    assert.deepEqual(await env.invocar('protocolos:sugerencias'), { proyectos: [], responsables: [] });

    await crear('OBRA-A', 'Ana');
    await crear('OBRA-B', 'Beto');
    await crear('OBRA-A', 'Ana'); // repetir no duplica

    const sugerencias = await env.invocar('protocolos:sugerencias');
    assert.deepEqual(sugerencias.proyectos.sort(), ['OBRA-A', 'OBRA-B']);
    assert.deepEqual(sugerencias.responsables.sort(), ['Ana', 'Beto']);
  } finally {
    env.limpiar();
  }
});

test('la sesión de obra sobrevive al cierre de la app', async () => {
  const env = entorno();
  try {
    assert.deepEqual(await env.invocar('config:obtenerSesion'), { proyecto: null, responsable: null });

    await env.invocar('config:guardarSesion', { proyecto: '  PROY01 ', responsable: '  Juan Pérez ' });
    assert.deepEqual(
      await env.invocar('config:obtenerSesion'),
      { proyecto: 'PROY01', responsable: 'Juan Pérez' }
    );

    await assert.rejects(() => env.invocar('config:guardarSesion', { proyecto: '', responsable: 'Juan' }), /obra/);
    await assert.rejects(() => env.invocar('config:guardarSesion', { proyecto: 'P', responsable: ' ' }), /responsable/);
  } finally {
    env.limpiar();
  }
});

test('crear protocolo: devuelve los errores de validación en vez de guardar', async () => {
  const env = entorno();
  try {
    const { templateId } = plantillaDePrueba(env.db, queries);
    const respuesta = await env.invocar('protocolos:crear', {
      templateId, versionUsada: 'v1', proyecto: 'PROY01', especialidad: 'estructura', responsable: 'Juan Perez',
      valoresPorClave: { proyecto: '', fecha: 'no-es-fecha' },
    });

    assert.equal(respuesta.ok, false);
    assert.equal(respuesta.errores.length, 2);
    assert.equal(env.db.prepare('SELECT COUNT(*) AS t FROM protocolos').get().t, 0);
  } finally {
    env.limpiar();
  }
});

test('protocolos:validar usa las mismas reglas que el guardado', async () => {
  const env = entorno();
  try {
    const { templateId } = plantillaDePrueba(env.db, queries);

    const mal = await env.invocar('protocolos:validar', templateId, { proyecto: '', fecha: 'x' });
    assert.equal(mal.valido, false);
    assert.deepEqual(mal.errores.map((e) => e.clave_campo).sort(), ['fecha', 'proyecto']);

    const bien = await env.invocar('protocolos:validar', templateId, { proyecto: 'Torre A', fecha: '2026-07-25' });
    assert.equal(bien.valido, true);
  } finally {
    env.limpiar();
  }
});

test('crear protocolo sobre una plantilla sin campos falla con un mensaje claro', async () => {
  const env = entorno();
  try {
    const templateId = queries.crearTemplate(env.db, {
      codigo_plantilla: 'VACIA', nombre: 'Vacía', version: 'v1', especialidad: 'estructura',
    });
    await assert.rejects(
      () => env.invocar('protocolos:crear', {
        templateId, versionUsada: 'v1', proyecto: 'P', especialidad: 'estructura', responsable: 'Juan Perez',
        valoresPorClave: {},
      }),
      /no tiene campos/
    );
  } finally {
    env.limpiar();
  }
});

test('fotos: comprime, respeta el tope de 5 y avisa lo que quedó afuera', async () => {
  const sharp = require('sharp');
  const fixture = carpetaTemporal();
  const rutaOriginal = path.join(fixture.carpeta, 'grande.jpg');
  await sharp({ create: { width: 2400, height: 1800, channels: 3, background: { r: 10, g: 90, b: 180 } } })
    .jpeg().toFile(rutaOriginal);

  // Se piden 7 archivos de una: deben entrar 5 y avisarse los 2 restantes.
  const env = entorno({ rutasDialog: new Array(7).fill(rutaOriginal) });
  try {
    const { templateId } = plantillaDePrueba(env.db, queries);
    const creado = await env.invocar('protocolos:crear', {
      templateId, versionUsada: 'v1', proyecto: 'PROY01', especialidad: 'estructura', responsable: 'Juan Perez',
      valoresPorClave: { proyecto: 'Torre A', fecha: '2026-07-25' },
    });

    const resultado = await env.invocar('fotos:elegirYAgregar', creado.protocoloId);
    assert.equal(resultado.ok, true);
    assert.equal(resultado.agregadas.length, constantes.MAX_FOTOS_POR_PROTOCOLO);
    assert.match(resultado.mensaje, /2 archivo/);

    // La compresión debe achicar de verdad: 2400px de ancho → 1280px.
    const metadatos = await sharp(resultado.agregadas[0].ruta_local).metadata();
    assert.equal(metadatos.width, 1280);
    assert.equal(metadatos.format, 'jpeg');

    // Un intento posterior ya no entra.
    const lleno = await env.invocar('fotos:elegirYAgregar', creado.protocoloId);
    assert.equal(lleno.ok, false);
    assert.match(lleno.mensaje, /Límite/);

    const listadas = await env.invocar('fotos:listar', creado.protocoloId);
    assert.deepEqual(listadas.map((f) => f.orden), [1, 2, 3, 4, 5]);
  } finally {
    fixture.limpiar();
    env.limpiar();
  }
});

test('fotos: un archivo ilegible no aborta la carga completa', async () => {
  const fixture = carpetaTemporal();
  const rutaRota = path.join(fixture.carpeta, 'rota.jpg');
  fs.writeFileSync(rutaRota, 'esto no es una imagen');

  const env = entorno({ rutasDialog: [rutaRota] });
  try {
    const { templateId } = plantillaDePrueba(env.db, queries);
    const creado = await env.invocar('protocolos:crear', {
      templateId, versionUsada: 'v1', proyecto: 'PROY01', especialidad: 'estructura', responsable: 'Juan Perez',
      valoresPorClave: { proyecto: 'Torre A', fecha: '2026-07-25' },
    });

    const resultado = await env.invocar('fotos:elegirYAgregar', creado.protocoloId);
    assert.equal(resultado.ok, true);
    assert.equal(resultado.agregadas.length, 0);
    assert.match(resultado.mensaje, /rota\.jpg/);
  } finally {
    fs.rmSync(rutaRota, { force: true });
    env.limpiar();
  }
});

test('log: cambiar estado exige usuario y rechaza transiciones inválidas', async () => {
  const env = entorno();
  try {
    const { templateId } = plantillaDePrueba(env.db, queries);
    const creado = await env.invocar('protocolos:crear', {
      templateId, versionUsada: 'v1', proyecto: 'PROY01', especialidad: 'estructura', responsable: 'Juan Perez',
      valoresPorClave: { proyecto: 'Torre A', fecha: '2026-07-25' },
    });
    const protocoloId = creado.protocoloId;

    const sinUsuario = await env.invocar('log:cambiarEstado', { protocoloId, estadoNuevo: 'cerrado', usuario: '  ' });
    assert.equal(sinUsuario.ok, false, 'el historial no puede quedar sin responsable');

    const mismoEstado = await env.invocar('log:cambiarEstado', { protocoloId, estadoNuevo: 'en_proceso', usuario: 'Jefe' });
    assert.equal(mismoEstado.ok, false);

    const inexistente = await env.invocar('log:cambiarEstado', { protocoloId: 9999, estadoNuevo: 'cerrado', usuario: 'Jefe' });
    assert.equal(inexistente.ok, false);

    // en_revision se retiró del flujo: ya no debe aceptarse.
    const retirado = await env.invocar('log:cambiarEstado', { protocoloId, estadoNuevo: 'en_revision', usuario: 'Jefe' });
    assert.equal(retirado.ok, false);

    const valido = await env.invocar('log:cambiarEstado', { protocoloId, estadoNuevo: 'en_firma', usuario: 'Jefe' });
    assert.equal(valido.ok, true);

    const detalle = await env.invocar('log:obtenerDetalle', protocoloId);
    assert.equal(detalle.protocolo.estado, 'en_firma');
    assert.equal(detalle.historial.length, 2);
  } finally {
    env.limpiar();
  }
});

test('log: el detalle de un protocolo inexistente devuelve null, no explota', async () => {
  const env = entorno();
  try {
    assert.equal(await env.invocar('log:obtenerDetalle', 9999), null);
  } finally {
    env.limpiar();
  }
});

test('flujo completo: plantilla borrador → producción → protocolo llenado → cerrado', async () => {
  const env = entorno({ rutasDialog: [] });
  try {
    // 1. El jefe crea la plantilla: nace como borrador.
    const templateId = await env.invocar('templates:crear', {
      codigo_plantilla: 'PROT-EST', nombre: 'Protocolo de Estructura', version: 'v1', especialidad: 'estructura',
    });
    await env.invocar('templates:agregarCampo', templateId, {
      clave_campo: 'proyecto', etiqueta: 'Proyecto', tipo_dato: 'texto', obligatorio: true,
      x: 0.1, y: 0.1, ancho: 0.3, alto: 0.05, orden: 1,
    });

    assert.deepEqual(await env.invocar('templates:listarActivos'), [], 'un borrador no llega a modo campo');

    // 2. Pasa por vista previa y se activa.
    await env.invocar('templates:activar', templateId);
    const activas = await env.invocar('templates:listarActivos');
    assert.equal(activas.length, 1);

    // 3. El registrador la llena, con la obra y el responsable de su sesión.
    const creado = await env.invocar('protocolos:crear', {
      templateId, versionUsada: activas[0].version,
      especialidad: activas[0].especialidad,
      proyecto: 'PROY01', responsable: 'Juan Perez',
      valoresPorClave: { proyecto: 'Torre A - Piso 3' },
    });
    assert.equal(creado.ok, true);

    // 4. El jefe lo ve en el log y lo cierra.
    const listado = await env.invocar('log:listarProtocolos');
    assert.equal(listado.length, 1);
    assert.equal(listado[0].id, creado.protocoloId);

    await env.invocar('log:cambiarEstado', { protocoloId: creado.protocoloId, estadoNuevo: 'cerrado', usuario: 'Jefe' });

    const resumen = await env.invocar('log:resumenPorEstado');
    assert.equal(resumen.find((r) => r.estado === 'cerrado').total, 1);
    assert.equal(resumen.find((r) => r.estado === 'en_proceso').total, 0);

    const detalle = await env.invocar('log:obtenerDetalle', creado.protocoloId);
    assert.equal(detalle.protocolo.version_usada, 'v1', 'el protocolo queda anclado a la versión con la que se llenó');
    assert.equal(detalle.valores[0].valor, 'Torre A - Piso 3');
    assert.equal(detalle.historial.length, 2);
  } finally {
    env.limpiar();
  }
});

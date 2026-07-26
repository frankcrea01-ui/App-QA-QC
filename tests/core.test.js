/**
 * Pruebas de la lógica de negocio pura (/core): código único y validaciones.
 * Son las reglas que el brief marca como críticas, así que se prueban tanto
 * el camino feliz como los bordes.
 */
const test = require('node:test');
const assert = require('node:assert');

const { baseTemporal } = require('./ayudas');
const {
  generarCodigoUnico,
  prefijoEspecialidad,
  normalizarProyecto,
  obtenerOCrearIdDispositivo,
  siguienteCorrelativo,
} = require('../src/core/codigoUnico');
const {
  validarValoresProtocolo,
  validarLimiteFotos,
  validarTransicionEstado,
  MAX_FOTOS_POR_PROTOCOLO,
} = require('../src/core/validaciones');
const { PREFIJOS_ESPECIALIDAD } = require('../src/shared/constantes');

test('prefijoEspecialidad: catálogo conocido y desconocido', () => {
  assert.equal(prefijoEspecialidad('estructura'), 'EST');
  assert.equal(prefijoEspecialidad('  ARQUITECTURA  '), 'ARQ');
  // Una especialidad fuera del catálogo no debe bloquear la creación.
  assert.equal(prefijoEspecialidad('paisajismo'), 'PAI');
  // Menos de 3 letras se rellena para mantener el largo fijo del código.
  assert.equal(prefijoEspecialidad('ab'), 'ABX');
  assert.throws(() => prefijoEspecialidad(''), /obligatoria/);
});

test('prefijoEspecialidad: cada instalación tiene su propio prefijo', () => {
  // Sin catálogo propio, las tres caerían en el comodín "INS" y los códigos
  // no distinguirían entre especialidades distintas.
  const prefijos = [
    prefijoEspecialidad('instalaciones sanitarias'),
    prefijoEspecialidad('instalaciones electricas'),
    prefijoEspecialidad('instalaciones mecanicas'),
  ];
  assert.deepEqual(prefijos, ['SAN', 'ELE', 'MEC']);
  assert.equal(new Set(prefijos).size, 3, 'no puede haber dos especialidades con el mismo prefijo');
});

test('prefijoEspecialidad: las tildes y mayúsculas no cambian el código', () => {
  assert.equal(prefijoEspecialidad('Instalaciones Eléctricas'), 'ELE');
  assert.equal(prefijoEspecialidad('instalaciones electricas'), 'ELE');
  assert.equal(prefijoEspecialidad('INSTALACIONES  SANITARIAS'), 'SAN');
});

test('todos los prefijos del catálogo son únicos y de 3 letras', () => {
  const prefijos = Object.values(PREFIJOS_ESPECIALIDAD);
  assert.equal(new Set(prefijos).size, prefijos.length, 'dos especialidades no pueden compartir prefijo');
  assert.ok(prefijos.every((p) => /^[A-Z]{3}$/.test(p)));
});

test('normalizarProyecto: mayúsculas y sin espacios', () => {
  assert.equal(normalizarProyecto(' torre a '), 'TORREA');
  assert.throws(() => normalizarProyecto(''), /obligatorio/);
});

test('id de dispositivo: se crea una sola vez y se reutiliza', () => {
  const { db, limpiar } = baseTemporal();
  try {
    const primero = obtenerOCrearIdDispositivo(db, 'Juan');
    const segundo = obtenerOCrearIdDispositivo(db, 'Otro Nombre');
    assert.equal(primero, segundo, 'el id de dispositivo no debe cambiar nunca');
    assert.match(primero, /^JU\d{2}$/);
  } finally {
    limpiar();
  }
});

test('id de dispositivo: exige al menos 2 iniciales la primera vez', () => {
  const { db, limpiar } = baseTemporal();
  try {
    assert.throws(() => obtenerOCrearIdDispositivo(db, 'J'), /2 iniciales/);
  } finally {
    limpiar();
  }
});

test('correlativo: avanza de a uno y es independiente por año', () => {
  const { db, limpiar } = baseTemporal();
  try {
    assert.equal(siguienteCorrelativo(db, 2026), 1);
    assert.equal(siguienteCorrelativo(db, 2026), 2);
    assert.equal(siguienteCorrelativo(db, 2027), 1, 'cada año reinicia su propio contador');
    assert.equal(siguienteCorrelativo(db, 2026), 3);
  } finally {
    limpiar();
  }
});

test('generarCodigoUnico: formato y unicidad sin red', () => {
  const { db, limpiar } = baseTemporal();
  try {
    const codigos = new Set();
    for (let i = 0; i < 25; i++) {
      codigos.add(generarCodigoUnico(db, {
        especialidad: 'estructura', proyecto: 'PROY01', inicialesUsuario: 'JP', anio: 2026,
      }));
    }
    assert.equal(codigos.size, 25, 'no debe haber colisiones en el mismo dispositivo');

    const primero = [...codigos][0];
    assert.match(primero, /^EST-PROY01-JP\d{2}-\d{4}-2026$/);
  } finally {
    limpiar();
  }
});

test('validarValoresProtocolo: obligatorios y fechas', () => {
  const campos = [
    { clave_campo: 'proyecto', etiqueta: 'Proyecto', tipo_dato: 'texto', obligatorio: 1 },
    { clave_campo: 'cantidad', etiqueta: 'Cantidad', tipo_dato: 'texto', obligatorio: 0 },
    { clave_campo: 'fecha', etiqueta: 'Fecha', tipo_dato: 'fecha', obligatorio: 0 },
  ];

  const ok = validarValoresProtocolo(campos, { proyecto: 'Torre A', cantidad: '12', fecha: '2026-07-25' });
  assert.equal(ok.valido, true);
  assert.deepEqual(ok.errores, []);

  // Opcionales vacíos son válidos.
  const opcionalesVacios = validarValoresProtocolo(campos, { proyecto: 'Torre A' });
  assert.equal(opcionalesVacios.valido, true);

  // `texto` acepta cualquier contenido: en el papel un "espesor" puede decir
  // "3/4 pulg." y eso es lo que hay que escribir.
  const textoLibre = validarValoresProtocolo(campos, { proyecto: 'Torre A', cantidad: '3/4 pulg.' });
  assert.equal(textoLibre.valido, true);

  const mal = validarValoresProtocolo(campos, { proyecto: '   ', fecha: 'no-es-fecha' });
  assert.equal(mal.valido, false);
  assert.equal(mal.errores.length, 2, 'debe reportar los dos problemas juntos, no solo el primero');
  assert.deepEqual(mal.errores.map((e) => e.clave_campo).sort(), ['fecha', 'proyecto']);
});

test('validarLimiteFotos: corta exactamente en el máximo', () => {
  assert.equal(validarLimiteFotos(0).permitido, true);
  assert.equal(validarLimiteFotos(MAX_FOTOS_POR_PROTOCOLO - 1).permitido, true);
  assert.equal(validarLimiteFotos(MAX_FOTOS_POR_PROTOCOLO).permitido, false);
  assert.match(validarLimiteFotos(MAX_FOTOS_POR_PROTOCOLO).mensaje, /Límite/);
});

test('validarTransicionEstado: estado desconocido y transición al mismo estado', () => {
  assert.equal(validarTransicionEstado('en_proceso', 'en_firma').permitido, true);
  // Volver atrás está permitido a propósito (reabrir un cerrado por error).
  assert.equal(validarTransicionEstado('cerrado', 'en_proceso').permitido, true);
  assert.equal(validarTransicionEstado('en_proceso', 'en_proceso').permitido, false);
  assert.equal(validarTransicionEstado('en_proceso', 'inventado').permitido, false);
  // Anular sigue siendo posible desde cualquier estado; salir de anulado no
  // (ver tests/revision.test.js).
  assert.equal(validarTransicionEstado('cerrado', 'anulado').permitido, true);
});

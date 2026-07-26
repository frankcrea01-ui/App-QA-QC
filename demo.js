/**
 * Demo de validación del núcleo (Fase 1 de la hoja de ruta):
 * esquema + código único + validaciones + queries, sin UI.
 * Ejecutar: node demo.js
 */
const fs = require('fs');
const path = require('path');
const { abrirBaseDeDatos } = require('./src/db/conexion');
const { generarCodigoUnico } = require('./src/core/codigoUnico');
const { validarValoresProtocolo, validarLimiteFotos, validarTransicionEstado } = require('./src/core/validaciones');
const queries = require('./src/db/queries');

const RUTA_DB = path.join(__dirname, 'demo.sqlite');
if (fs.existsSync(RUTA_DB)) fs.unlinkSync(RUTA_DB); // reset limpio para la demo

console.log('=== 1. Abrir base de datos y aplicar esquema ===');
const db = abrirBaseDeDatos(RUTA_DB);
console.log('OK — base creada en', RUTA_DB);

console.log('\n=== 2. Crear plantilla "Protocolo de Estructura" v1 ===');
const templateId = queries.crearTemplate(db, {
  codigo_plantilla: 'PROT-EST',
  nombre: 'Protocolo de Estructura',
  version: 'v1',
  especialidad: 'estructura',
});
console.log('template_id =', templateId);

console.log('\n=== 3. Agregar zonas/campos a la plantilla ===');
const campoProyecto = queries.agregarCampoATemplate(db, templateId, {
  clave_campo: 'proyecto', etiqueta: 'Proyecto', tipo_dato: 'texto',
  obligatorio: true, ejemplo: 'Torre A - Piso 3', descripcion: 'Nombre del proyecto',
  x: 0.05, y: 0.05, ancho: 0.3, alto: 0.04, orden: 1,
});
const campoFecha = queries.agregarCampoATemplate(db, templateId, {
  clave_campo: 'fecha', etiqueta: 'Fecha', tipo_dato: 'fecha',
  obligatorio: true, ejemplo: '24/07/2026', descripcion: 'Fecha de llenado',
  x: 0.4, y: 0.05, ancho: 0.2, alto: 0.04, orden: 2,
});
const campoObs = queries.agregarCampoATemplate(db, templateId, {
  clave_campo: 'observacion', etiqueta: 'Observación', tipo_dato: 'texto',
  obligatorio: false, ejemplo: 'Sin observaciones', descripcion: 'Comentario libre',
  x: 0.05, y: 0.12, ancho: 0.5, alto: 0.06, orden: 3,
});
console.log('Campos creados:', { campoProyecto, campoFecha, campoObs });

console.log('\n=== 4. Generar código único (offline, dispositivo nuevo) ===');
const codigo = generarCodigoUnico(db, {
  especialidad: 'estructura',
  proyecto: 'PROY01',
  inicialesUsuario: 'JP', // solo se usa la primera vez, para crear el id_dispositivo
});
console.log('Código generado:', codigo);

console.log('\n=== 4b. Generar un segundo código (mismo dispositivo, correlativo avanza) ===');
const codigo2 = generarCodigoUnico(db, { especialidad: 'arquitectura', proyecto: 'PROY01' });
console.log('Código generado:', codigo2);

console.log('\n=== 5. Validar valores capturados en modo campo ===');
const campos = queries.obtenerCamposDeTemplate(db, templateId);

const valoresOk = { proyecto: 'Torre A - Piso 3', fecha: '2026-07-24', observacion: '' };
const resultadoOk = validarValoresProtocolo(campos, valoresOk);
console.log('Validación (caso válido):', resultadoOk);

const valoresMalos = { proyecto: '', fecha: 'no-es-fecha', observacion: 'ok' };
const resultadoMal = validarValoresProtocolo(campos, valoresMalos);
console.log('Validación (caso con errores):', resultadoMal);

console.log('\n=== 6. Crear protocolo con valores válidos ===');
const valoresPorCampoId = {
  [campoProyecto]: 'Torre A - Piso 3',
  [campoFecha]: '2026-07-24',
  [campoObs]: '',
};
const protocoloId = queries.crearProtocolo(db, {
  codigo_protocolo: codigo,
  template_id: templateId,
  version_usada: 'v1',
  proyecto: 'PROY01',
  empresa: 'Constructora Demo S.A.',
  especialidad: 'estructura',
  creado_por: 'JP01',
  valores: valoresPorCampoId,
});
console.log('protocolo_id =', protocoloId, '| código =', codigo);

console.log('\n=== 7. Validar límite de fotos (5 máximo) ===');
console.log('Con 4 fotos actuales:', validarLimiteFotos(4));
console.log('Con 5 fotos actuales:', validarLimiteFotos(5));

console.log('\n=== 8. Cambiar estado del protocolo (en_proceso -> en_firma -> cerrado) ===');
console.log('Transición válida en_proceso -> en_firma:', validarTransicionEstado('en_proceso', 'en_firma'));
queries.cambiarEstadoProtocolo(db, protocoloId, 'en_firma', 'jefe_calidad');
queries.cambiarEstadoProtocolo(db, protocoloId, 'cerrado', 'jefe_calidad');
console.log('Estado final aplicado: cerrado');

console.log('\n=== 9. Resumen por estado (para el dashboard/log maestro) ===');
console.log(queries.resumenPorEstado(db));

console.log('\n=== 10. Listar protocolos (filtrable por especialidad/estado) ===');
console.log(queries.listarProtocolos(db, { especialidad: 'estructura' }));

console.log('\n✅ Demo completa. Núcleo funcional validado de punta a punta.');
db.close();

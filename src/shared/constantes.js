/**
 * Constantes comunes a toda la app. Fuente única: /core y /db las usan
 * directamente, y la UI las recibe por IPC (`meta:constantes`) en vez de
 * mantener su propia copia. Si un estado o un tipo cambia, se cambia aquí
 * y en ningún otro lado.
 */

/**
 * Estados del catálogo, en el orden del flujo real (ver docs/decisiones-ui.md, D8):
 * llenar → imprimir → firmar → escanear → cerrado.
 */
const ESTADOS_PROTOCOLO = ['en_proceso', 'en_firma', 'cerrado', 'anulado'];

/**
 * Tipos de zona del editor: responden a "¿qué va aquí?" sobre el PDF.
 * Todos los tipos posibles de zonas que se pueden dibujar en una plantilla.
 */
const TIPOS_DATO = ['texto', 'fecha', 'check', 'correlativo', 'proyecto', 'cliente', 'responsable'];

/** Tipos que la app completa sin intervención: no se piden ni pueden ser obligatorios. */
const TIPOS_AUTOMATICOS = ['correlativo', 'proyecto', 'cliente'];

module.exports = {
  ESTADOS_PROTOCOLO,
  TIPOS_DATO,
  TIPOS_AUTOMATICOS,
};

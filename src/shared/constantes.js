/**
 * Constantes comunes a toda la app. Fuente única: /core y /db las usan
 * directamente, y la UI las recibe por IPC (`meta:constantes`) en vez de
 * mantener su propia copia. Si un estado o un tipo cambia, se cambia acá
 * y en ningún otro lado.
 */

/**
 * Estados del catálogo, en el orden del flujo real (ver docs/decisiones-ui.md, D8):
 * llenar → imprimir → firmar → escanear → cerrado.
 */
const ESTADOS_PROTOCOLO = ['en_proceso', 'en_firma', 'cerrado', 'anulado'];

/**
 * Tipos de zona del editor: responden a "¿qué va acá?" sobre el PDF.
 * Los tres últimos se llenan solos, el registrador nunca los toca.
 */
const TIPOS_DATO = ['texto', 'fecha', 'check', 'correlativo', 'proyecto', 'responsable'];

/** Tipos que la app completa sin intervención: no se piden ni pueden ser obligatorios. */
const TIPOS_AUTOMATICOS = ['correlativo', 'proyecto', 'responsable'];

/** Tope de fotos por protocolo (regla de negocio, se valida en /core). */
const MAX_FOTOS_POR_PROTOCOLO = 5;

/**
 * Prefijo de 3 letras usado en el código único, por especialidad.
 *
 * Las claves van sin tilde a propósito: la búsqueda normaliza el texto, así
 * "instalaciones electricas" e "instalaciones eléctricas" dan el mismo prefijo.
 *
 * Cada especialidad necesita su propio prefijo. Si varias cayeran en el
 * comodín (las 3 primeras letras), todas las "instalaciones ..." quedarían
 * como INS y los códigos no distinguirían entre sanitarias, eléctricas y
 * mecánicas. Agregar una especialidad nueva es agregarla acá.
 */
const PREFIJOS_ESPECIALIDAD = {
  estructura: 'EST',
  arquitectura: 'ARQ',
  'instalaciones sanitarias': 'SAN',
  'instalaciones electricas': 'ELE',
  'instalaciones mecanicas': 'MEC',
  comunicaciones: 'COM',
  gas: 'GAS',
};

module.exports = {
  ESTADOS_PROTOCOLO,
  TIPOS_DATO,
  TIPOS_AUTOMATICOS,
  MAX_FOTOS_POR_PROTOCOLO,
  PREFIJOS_ESPECIALIDAD,
};

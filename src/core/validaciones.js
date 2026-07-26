/**
 * Validaciones de negocio puras — sin dependencia de UI ni de base de datos
 * directamente (reciben datos ya cargados). Esto permite reusarlas igual
 * en el editor, en modo campo, o en tests, sin duplicar reglas.
 */

const { ESTADOS_PROTOCOLO, MAX_FOTOS_POR_PROTOCOLO } = require('../shared/constantes');

/**
 * Valida los valores capturados en modo campo contra la definición
 * de campos de la plantilla (template_fields).
 *
 * @param {Array} templateFields - filas de template_fields de la plantilla usada
 * @param {Object} valores - { clave_campo: valor }
 * @returns {{ valido: boolean, errores: Array<{clave_campo:string, mensaje:string}> }}
 */
function validarValoresProtocolo(templateFields, valores) {
  const errores = [];

  for (const field of templateFields) {
    const valor = valores[field.clave_campo];
    const vacio = valor === undefined || valor === null || String(valor).trim() === '';

    if (field.obligatorio && vacio) {
      errores.push({
        clave_campo: field.clave_campo,
        mensaje: `"${field.etiqueta}" es obligatorio y está vacío.`,
      });
      continue;
    }

    if (vacio) continue; // opcional y vacío: válido

    // `fecha` es el único tipo con formato propio. `texto`, `check` y los
    // automáticos aceptan cualquier contenido: el registrador escribe lo que
    // dice el papel, y el formato no es la app quien lo define.
    if (field.tipo_dato === 'fecha' && isNaN(Date.parse(valor))) {
      errores.push({
        clave_campo: field.clave_campo,
        mensaje: `"${field.etiqueta}" debe ser una fecha válida. Valor recibido: "${valor}".`,
      });
    }
  }

  return { valido: errores.length === 0, errores };
}

/**
 * Valida que agregar una nueva foto no exceda el límite de 5 por protocolo.
 * Se valida aquí (capa /core) y NO se duplica esta regla en editor ni campo.
 *
 * @param {number} fotosActuales - cantidad de fotos ya guardadas para el protocolo
 * @returns {{ permitido: boolean, mensaje?: string }}
 */
function validarLimiteFotos(fotosActuales) {
  if (fotosActuales >= MAX_FOTOS_POR_PROTOCOLO) {
    return {
      permitido: false,
      mensaje: `Límite de ${MAX_FOTOS_POR_PROTOCOLO} fotos por protocolo alcanzado.`,
    };
  }
  return { permitido: true };
}

/**
 * Valida una transición de estado contra el flujo esperado.
 *
 * No bloquea transiciones "hacia atrás" (ej: corregir un estado mal puesto),
 * pero exige que sea una transición explícita y quede en el historial.
 *
 * `anulado` es la excepción: es terminal. Anular es la única decisión que la
 * app deja en manos de una persona, y salir de ahí no puede ser un efecto
 * secundario de otra acción — un cierre automático nunca debe revivir un
 * protocolo que alguien dio de baja. Se sale solo reactivándolo a propósito.
 *
 * @param {{ reactivar?: boolean }} [opciones] - reactivar: el usuario pidió
 *   explícitamente sacar el protocolo de anulado.
 */
function validarTransicionEstado(estadoActual, estadoNuevo, { reactivar = false } = {}) {
  if (!ESTADOS_PROTOCOLO.includes(estadoNuevo)) {
    return {
      permitido: false,
      mensaje: `Estado "${estadoNuevo}" no reconocido. Estados válidos: ${ESTADOS_PROTOCOLO.join(', ')}.`,
    };
  }
  if (estadoActual === estadoNuevo) {
    return { permitido: false, mensaje: `El protocolo ya está en estado "${estadoNuevo}".` };
  }
  if (estadoActual === 'anulado' && !reactivar) {
    return {
      permitido: false,
      mensaje: 'Este protocolo está anulado. Para volver a usarlo hay que reactivarlo a propósito.',
    };
  }
  return { permitido: true };
}

module.exports = {
  MAX_FOTOS_POR_PROTOCOLO,
  validarValoresProtocolo,
  validarLimiteFotos,
  validarTransicionEstado,
};

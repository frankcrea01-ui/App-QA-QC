/**
 * Correlativo visible del protocolo: el número impreso en el papel (001,
 * 002, 003…), el que ve el cliente y el auditor.
 *
 * No confundir con el correlativo de codigoUnico.js, que forma parte del
 * código interno de trazabilidad (EST-PROY01-JP68-0007-2026). Son dos
 * numeraciones distintas y ambas conviven.
 *
 * La serie es **por formato y por obra**: el mismo protocolo usado en dos
 * obras lleva su propia numeración en cada una. Sigue por versión: la v2 de
 * un formato continúa donde quedó la v1, porque la numeración pertenece al
 * formato, no a la revisión.
 */

const DIGITOS = 3;

function clave(codigoPlantilla, proyecto) {
  return `correlativo_visible_${codigoPlantilla}_${proyecto}`.toLowerCase();
}

/**
 * Devuelve el siguiente número de la serie y lo deja reservado.
 *
 * Se reserva aunque después el protocolo se anule: un hueco en la serie es
 * correcto en auditoría, y renumerar sería justamente lo que se lee como
 * manipulación del registro.
 */
function siguienteCorrelativoVisible(db, { codigoPlantilla, proyecto }) {
  if (!codigoPlantilla || !proyecto) {
    throw new Error('Se necesitan el código de plantilla y la obra para numerar el protocolo.');
  }

  const claveContador = clave(codigoPlantilla, proyecto);
  const fila = db.prepare(`SELECT valor FROM config_dispositivo WHERE clave = ?`).get(claveContador);
  const siguiente = (fila ? parseInt(fila.valor, 10) : 0) + 1;

  db.prepare(`
    INSERT INTO config_dispositivo (clave, valor) VALUES (?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
  `).run(claveContador, String(siguiente));

  return formatearCorrelativo(siguiente);
}

/** 7 → "007". Si la serie supera los 3 dígitos, se deja crecer. */
function formatearCorrelativo(numero) {
  return String(numero).padStart(DIGITOS, '0');
}

module.exports = { siguienteCorrelativoVisible, formatearCorrelativo, DIGITOS };

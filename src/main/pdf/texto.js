/**
 * Ajuste de texto dentro de una zona del formato.
 *
 * El texto tiene que entrar en el recuadro que el jefe de calidad dibujó
 * sobre el PDF: se parte en líneas de izquierda a derecha y de arriba a
 * abajo, y si aún no entra se achica la letra hasta un mínimo legible.
 */

const TAMANO_INICIAL = 10;
const TAMANO_MINIMO = 6;
const INTERLINEADO = 1.15;

/**
 * Las fuentes estándar del PDF usan WinAnsi, que no cubre comillas
 * tipográficas, guiones largos ni emojis. Si llega uno de esos caracteres
 * pdf-lib lanza una excepción y no se genera nada — así que se reemplazan
 * por su equivalente ASCII antes de escribir.
 */
const REEMPLAZOS = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'",
  '“': '"', '”': '"', '„': '"', '‟': '"',
  '–': '-', '—': '-', '−': '-', '‐': '-', '‑': '-',
  '…': '...', ' ': ' ', '•': '-', '·': '-',
  '′': "'", '″': '"',
};

function sanitizarTexto(valor) {
  const texto = String(valor ?? '');
  let salida = '';

  for (const caracter of texto) {
    if (REEMPLAZOS[caracter] !== undefined) {
      salida += REEMPLAZOS[caracter];
      continue;
    }
    const codigo = caracter.codePointAt(0);
    // Rango imprimible de WinAnsi (latín, incluye tildes y ñ).
    if ((codigo >= 0x20 && codigo <= 0x7e) || (codigo >= 0xa1 && codigo <= 0xff)) {
      salida += caracter;
      continue;
    }
    // Cualquier otra cosa se descarta en vez de romper la generación.
  }

  return salida;
}

/** Parte el texto en líneas que entren en el ancho dado. */
function partirEnLineas(texto, fuente, tamano, anchoDisponible) {
  const lineas = [];

  for (const parrafo of texto.split(/\r?\n/)) {
    let lineaActual = '';

    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = lineaActual ? `${lineaActual} ${palabra}` : palabra;

      if (fuente.widthOfTextAtSize(tentativa, tamano) <= anchoDisponible) {
        lineaActual = tentativa;
        continue;
      }

      if (lineaActual) lineas.push(lineaActual);

      // Una palabra sola más ancha que la zona (un código largo, una URL):
      // se corta por caracteres para no desbordar.
      if (fuente.widthOfTextAtSize(palabra, tamano) > anchoDisponible) {
        let resto = palabra;
        while (fuente.widthOfTextAtSize(resto, tamano) > anchoDisponible && resto.length > 1) {
          let corte = resto.length;
          while (corte > 1 && fuente.widthOfTextAtSize(resto.slice(0, corte), tamano) > anchoDisponible) {
            corte -= 1;
          }
          lineas.push(resto.slice(0, corte));
          resto = resto.slice(corte);
        }
        lineaActual = resto;
      } else {
        lineaActual = palabra;
      }
    }

    lineas.push(lineaActual);
  }

  return lineas;
}

/**
 * Busca el tamaño de letra más grande con el que el texto entra completo en
 * la zona. Devuelve también si hubo que recortar, para poder avisarle al
 * registrador en vez de entregar un PDF con información faltante.
 *
 * @returns {{ lineas: string[], tamano: number, recortado: boolean }}
 */
function ajustarTextoEnZona(texto, fuente, { ancho, alto }) {
  const limpio = sanitizarTexto(texto);
  if (!limpio.trim()) return { lineas: [], tamano: TAMANO_INICIAL, recortado: false };

  for (let tamano = TAMANO_INICIAL; tamano >= TAMANO_MINIMO; tamano -= 0.5) {
    const lineas = partirEnLineas(limpio, fuente, tamano, ancho);
    if (lineas.length * tamano * INTERLINEADO <= alto) {
      return { lineas, tamano, recortado: false };
    }
  }

  // Ni en el tamaño mínimo entra: se escribe lo que quepa y se avisa.
  const lineas = partirEnLineas(limpio, fuente, TAMANO_MINIMO, ancho);
  const caben = Math.max(1, Math.floor(alto / (TAMANO_MINIMO * INTERLINEADO)));

  return {
    lineas: lineas.slice(0, caben),
    tamano: TAMANO_MINIMO,
    recortado: lineas.length > caben,
  };
}

module.exports = {
  ajustarTextoEnZona,
  sanitizarTexto,
  partirEnLineas,
  TAMANO_INICIAL,
  TAMANO_MINIMO,
  INTERLINEADO,
};

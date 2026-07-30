const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const { ajustarTextoEnZona, INTERLINEADO } = require('./texto');

/** Margen interno de la zona, para que el texto no toque la línea del formato. */
const PADDING = 2;

/**
 * Convierte una zona en coordenadas relativas (0..1, origen arriba-izquierda,
 * como se dibujó en pantalla) a la caja del PDF, cuyo origen está
 * abajo-izquierda y crece hacia arriba.
 */
function zonaAPdf(campo, anchoPagina, altoPagina) {
  const ancho = campo.ancho * anchoPagina;
  const alto = campo.alto * altoPagina;
  const izquierda = campo.x * anchoPagina;
  // y viene medido desde arriba; el PDF mide desde abajo.
  const abajo = altoPagina - (campo.y * altoPagina) - alto;

  return { izquierda, abajo, ancho, alto, arriba: abajo + alto };
}

/** Dibuja un ✓ con dos líneas: no depende de que la fuente tenga el símbolo. */
function dibujarCheck(pagina, caja) {
  const lado = Math.min(caja.ancho, caja.alto) * 0.6;
  const centroX = caja.izquierda + caja.ancho / 2;
  const centroY = caja.abajo + caja.alto / 2;
  const grosor = Math.max(0.8, lado * 0.12);
  const color = rgb(0, 0, 0);

  const inicio = { x: centroX - lado / 2, y: centroY };
  const vertice = { x: centroX - lado / 8, y: centroY - lado / 2.6 };
  const fin = { x: centroX + lado / 2, y: centroY + lado / 2.4 };

  pagina.drawLine({ start: inicio, end: vertice, thickness: grosor, color });
  pagina.drawLine({ start: vertice, end: fin, thickness: grosor, color });
}

/**
 * Escribe los valores de un protocolo sobre su formato original.
 *
 * @param {Uint8Array|Buffer} bytesPdfOriginal
 * @param {Array} campos - filas de template_fields
 * @param {Object} valores - { clave_campo: valor }
 * @returns {Promise<{ bytes: Uint8Array, advertencias: string[] }>}
 */
async function generarPdfLlenado(bytesPdfOriginal, campos, valores) {
  const documento = await PDFDocument.load(bytesPdfOriginal);
  const fuente = await documento.embedFont(StandardFonts.Helvetica);
  const paginas = documento.getPages();
  const advertencias = [];

  for (const campo of campos) {
    const indicePagina = (campo.pagina || 1) - 1;
    const pagina = paginas[indicePagina];

    if (!pagina) {
      advertencias.push(`"${campo.etiqueta}" apunta a la página ${campo.pagina}, que no existe en el PDF.`);
      continue;
    }

    const { width: anchoPagina, height: altoPagina } = pagina.getSize();
    const caja = zonaAPdf(campo, anchoPagina, altoPagina);
    const valor = valores[campo.clave_campo];

    if (campo.tipo_dato === 'check') {
      let opciones = {};
      try { opciones = JSON.parse(campo.opciones || '{}'); } catch(e){}
      const filas = opciones.filas || 1;
      const columnas = opciones.columnas || 1;

      if (filas > 1 || columnas > 1) {
        if (!valor) continue;
        let selecciones = [];
        try { selecciones = JSON.parse(valor); } catch(e){}
        
        // Se asume que el usuario dibuja la zona solo sobre las columnas de checkboxes.
        const cWidth = caja.ancho / columnas;
        const cHeight = caja.alto / filas;

        selecciones.forEach((colIndex, r) => {
          if (colIndex !== null && colIndex !== undefined) {
            const subCaja = {
              izquierda: caja.izquierda + colIndex * cWidth,
              abajo: caja.arriba - (r + 1) * cHeight,
              ancho: cWidth,
              alto: cHeight
            };
            dibujarCheck(pagina, subCaja);
          }
        });
      } else {
        if (valor) dibujarCheck(pagina, caja);
      }
      continue;
    }

    if (valor === undefined || valor === null || String(valor).trim() === '') continue;

    const ajuste = ajustarTextoEnZona(valor, fuente, {
      ancho: Math.max(1, caja.ancho - PADDING * 2),
      alto: Math.max(1, caja.alto - PADDING),
    });

    if (ajuste.recortado) {
      advertencias.push(`"${campo.etiqueta}" no entró completo en su espacio del formato.`);
    }

    const altoLinea = ajuste.tamano * INTERLINEADO;
    ajuste.lineas.forEach((linea, indice) => {
      pagina.drawText(linea, {
        x: caja.izquierda + PADDING,
        // Se apoya desde arriba de la zona hacia abajo. El baseline del
        // texto queda por debajo del tope, de ahí el descuento del tamaño.
        y: caja.arriba - PADDING - ajuste.tamano - indice * altoLinea,
        size: ajuste.tamano,
        font: fuente,
        color: rgb(0, 0, 0),
      });
    });
  }

  return { bytes: await documento.save(), advertencias };
}

module.exports = { generarPdfLlenado, zonaAPdf, dibujarCheck };

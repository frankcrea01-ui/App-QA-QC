/**
 * Arma un formato de protocolo de ejemplo con recuadros visibles, define
 * zonas que calzan exactamente con esos recuadros y genera el PDF llenado.
 *
 * Sirve para revisar a ojo que lo impreso caiga donde corresponde, sin
 * necesidad de abrir la app ni tener un formato real a mano. Conviene
 * correrlo cada vez que se toca src/main/pdf/.
 *
 * Uso: npm run muestra
 */
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const { generarPdfLlenado } = require('../src/main/pdf/generarPdf');

const ANCHO = 612;
const ALTO = 792;
const SALIDA = path.join(__dirname, '..', 'muestras');

// Recuadros del formato, en coordenadas relativas (como los dibujaría el editor).
const RECUADROS = [
  { clave_campo: 'proyecto',   etiqueta: 'PROYECTO',      tipo_dato: 'texto',       x: 0.12, y: 0.115, ancho: 0.45, alto: 0.030 },
  { clave_campo: 'nro',        etiqueta: 'N°',            tipo_dato: 'correlativo', x: 0.72, y: 0.115, ancho: 0.16, alto: 0.030 },
  { clave_campo: 'fecha',      etiqueta: 'FECHA',         tipo_dato: 'fecha',       x: 0.12, y: 0.165, ancho: 0.25, alto: 0.030 },
  { clave_campo: 'partida',    etiqueta: 'PARTIDA',       tipo_dato: 'texto',       x: 0.45, y: 0.165, ancho: 0.43, alto: 0.030 },
  { clave_campo: 'c1',         etiqueta: 'Verticalidad',  tipo_dato: 'check',       x: 0.74, y: 0.290, ancho: 0.05, alto: 0.025 },
  { clave_campo: 'c2',         etiqueta: 'Alineamiento',  tipo_dato: 'check',       x: 0.74, y: 0.330, ancho: 0.05, alto: 0.025 },
  { clave_campo: 'c3',         etiqueta: 'Recubrimiento', tipo_dato: 'check',       x: 0.82, y: 0.370, ancho: 0.05, alto: 0.025 },
  { clave_campo: 'obs',        etiqueta: 'OBSERVACIONES', tipo_dato: 'texto',       x: 0.12, y: 0.470, ancho: 0.76, alto: 0.110 },
  { clave_campo: 'responsable',etiqueta: 'ELABORADO POR', tipo_dato: 'responsable', x: 0.12, y: 0.760, ancho: 0.33, alto: 0.030 },
];

/** Convierte una zona relativa a la caja del PDF (origen abajo-izquierda). */
function caja(z) {
  const ancho = z.ancho * ANCHO;
  const alto = z.alto * ALTO;
  return { x: z.x * ANCHO, y: ALTO - z.y * ALTO - alto, ancho, alto };
}

async function crearFormatoVacio() {
  const doc = await PDFDocument.create();
  const pagina = doc.addPage([ANCHO, ALTO]);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const gris = rgb(0.35, 0.35, 0.35);

  pagina.drawText('PROTOCOLO DE CALIDAD - ESTRUCTURAS', {
    x: 0.12 * ANCHO, y: ALTO - 0.06 * ALTO, size: 14, font: negrita,
  });
  pagina.drawText('(formato de prueba para verificar alineacion)', {
    x: 0.12 * ANCHO, y: ALTO - 0.082 * ALTO, size: 8, font: normal, color: gris,
  });

  for (const zona of RECUADROS) {
    const c = caja(zona);
    pagina.drawRectangle({
      x: c.x, y: c.y, width: c.ancho, height: c.alto,
      borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.8,
    });
    // Etiqueta impresa del formato, arriba a la izquierda del recuadro.
    pagina.drawText(zona.etiqueta, {
      x: c.x, y: c.y + c.alto + 2, size: 6.5, font: negrita, color: gris,
    });
  }

  // Encabezado de la tablita de verificación.
  pagina.drawText('ITEM A VERIFICAR', {
    x: 0.12 * ANCHO, y: ALTO - 0.272 * ALTO, size: 7, font: negrita, color: gris,
  });
  pagina.drawText('CUMPLE    NO CUMPLE', {
    x: 0.72 * ANCHO, y: ALTO - 0.272 * ALTO, size: 7, font: negrita, color: gris,
  });
  const items = ['1. Verticalidad de elementos', '2. Alineamiento de ejes', '3. Recubrimiento de acero'];
  items.forEach((texto, i) => {
    pagina.drawText(texto, {
      x: 0.12 * ANCHO, y: ALTO - (0.297 + i * 0.04) * ALTO, size: 8, font: normal,
    });
  });

  return doc.save();
}

async function main() {
  fs.mkdirSync(SALIDA, { recursive: true });

  const vacio = await crearFormatoVacio();
  fs.writeFileSync(path.join(SALIDA, 'formato-vacio.pdf'), vacio);

  const valores = {
    proyecto: 'TORRE NORTE - EDIFICIO A',
    nro: '007',
    fecha: '25/07/2026',
    partida: 'Muro anclado - Eje 3',
    c1: 'si',
    c2: 'si',
    c3: 'si',
    obs: 'Se verifica el alineamiento y la verticalidad de los elementos estructurales '
       + 'segun los planos aprobados. Se observa una desviacion menor en el eje 3, '
       + 'dentro de la tolerancia admitida por la norma.',
    responsable: 'Ana Torres Quispe',
  };

  const { bytes, advertencias } = await generarPdfLlenado(vacio, RECUADROS, valores);
  fs.writeFileSync(path.join(SALIDA, 'protocolo-llenado.pdf'), bytes);

  console.log('formato-vacio.pdf     -> el formato, como lo cargaria el jefe de calidad');
  console.log('protocolo-llenado.pdf -> el mismo formato con los datos escritos por la app');
  console.log('advertencias:', advertencias.length ? advertencias : '(ninguna)');
}

main().catch((e) => { console.error(e); process.exit(1); });

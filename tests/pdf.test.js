/**
 * Pruebas del generador de PDF. La parte crítica es la conversión de
 * coordenadas: las zonas se dibujan en pantalla con origen arriba-izquierda
 * y el PDF mide desde abajo-izquierda. Un error acá imprime todos los
 * protocolos corridos de lugar.
 *
 * Para verificarlo de verdad, se genera el PDF y después se **vuelve a leer
 * con pdf.js**, comprobando dónde quedó el texto realmente.
 */
const test = require('node:test');
const assert = require('node:assert');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const { generarPdfLlenado, zonaAPdf } = require('../src/main/pdf/generarPdf');
const { ajustarTextoEnZona, sanitizarTexto, TAMANO_MINIMO, TAMANO_INICIAL } = require('../src/main/pdf/texto');

const ANCHO_PAGINA = 612; // carta, en puntos
const ALTO_PAGINA = 792;

/** PDF en blanco de N páginas, para usar de formato base. */
async function pdfEnBlanco(paginas = 1) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) doc.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
  return doc.save();
}

function zona(clave, extra = {}) {
  return {
    clave_campo: clave,
    etiqueta: clave,
    tipo_dato: 'texto',
    pagina: 1,
    x: 0.1,
    y: 0.1,
    ancho: 0.3,
    alto: 0.05,
    ...extra,
  };
}

/**
 * Lee el PDF generado y devuelve cada fragmento de texto con su posición
 * absoluta en puntos, medida desde abajo-izquierda (sistema del PDF).
 */
async function leerTextosConPosicion(bytes, numeroPagina = 1) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const documento = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const pagina = await documento.getPage(numeroPagina);
  const contenido = await pagina.getTextContent();

  return contenido.items
    // pdf.js intercala ítems vacíos como marcadores de salto de línea, con
    // la misma y que la línea siguiente. No son contenido.
    .filter((item) => item.str.trim() !== '')
    .map((item) => ({
      texto: item.str,
      x: item.transform[4],
      y: item.transform[5],
      alto: item.height,
    }));
}

test('el texto cae en la zona dibujada, con el eje Y invertido correctamente', async () => {
  const campos = [zona('proyecto', { x: 0.1, y: 0.1, ancho: 0.4, alto: 0.04 })];
  const { bytes } = await generarPdfLlenado(await pdfEnBlanco(), campos, { proyecto: 'Torre A' });

  const textos = await leerTextosConPosicion(bytes);
  assert.equal(textos.length, 1);
  assert.equal(textos[0].texto, 'Torre A');

  // x=0.1 sobre 612pt → 61.2pt desde la izquierda (más el padding interno).
  assert.ok(
    Math.abs(textos[0].x - 61.2) < 4,
    `x quedó en ${textos[0].x}, se esperaba ~61 (0.1 × 612)`
  );

  // y=0.1 medido DESDE ARRIBA → 79.2pt desde arriba → 712.8pt desde abajo.
  // El texto se apoya bajo el borde superior de la zona, así que su baseline
  // queda algo por debajo: entre el tope y el piso de la zona.
  const topeZona = ALTO_PAGINA - 0.1 * ALTO_PAGINA;         // 712.8
  const pisoZona = topeZona - 0.04 * ALTO_PAGINA;           // 681.1
  assert.ok(
    textos[0].y < topeZona && textos[0].y > pisoZona - 2,
    `y quedó en ${textos[0].y}, fuera de la zona [${pisoZona}, ${topeZona}]`
  );
});

test('una zona arriba y una abajo no se invierten entre sí', async () => {
  // Es el error clásico al confundir el origen: el encabezado sale al pie.
  const campos = [
    zona('encabezado', { x: 0.1, y: 0.05, ancho: 0.4, alto: 0.03 }),
    zona('pie', { x: 0.1, y: 0.90, ancho: 0.4, alto: 0.03 }),
  ];
  const { bytes } = await generarPdfLlenado(await pdfEnBlanco(), campos, {
    encabezado: 'ARRIBA', pie: 'ABAJO',
  });

  const textos = await leerTextosConPosicion(bytes);
  const arriba = textos.find((t) => t.texto === 'ARRIBA');
  const abajo = textos.find((t) => t.texto === 'ABAJO');

  assert.ok(arriba && abajo);
  assert.ok(
    arriba.y > abajo.y,
    `"ARRIBA" (y=${arriba.y}) debe quedar por encima de "ABAJO" (y=${abajo.y})`
  );
  assert.ok(arriba.y > ALTO_PAGINA * 0.85, 'el encabezado debe caer en el tercio superior');
  assert.ok(abajo.y < ALTO_PAGINA * 0.15, 'el pie debe caer en el tercio inferior');
});

test('cada valor va a su página', async () => {
  const campos = [
    zona('uno', { pagina: 1 }),
    zona('dos', { pagina: 2, clave_campo: 'dos' }),
  ];
  const { bytes } = await generarPdfLlenado(await pdfEnBlanco(2), campos, {
    uno: 'PAGINA UNO', dos: 'PAGINA DOS',
  });

  const pagina1 = await leerTextosConPosicion(bytes, 1);
  const pagina2 = await leerTextosConPosicion(bytes, 2);

  assert.deepEqual(pagina1.map((t) => t.texto), ['PAGINA UNO']);
  assert.deepEqual(pagina2.map((t) => t.texto), ['PAGINA DOS']);
});

test('una zona que apunta a una página inexistente avisa en vez de romper', async () => {
  const campos = [zona('fantasma', { pagina: 5, etiqueta: 'Fantasma' })];
  const { advertencias } = await generarPdfLlenado(await pdfEnBlanco(1), campos, { fantasma: 'X' });

  assert.equal(advertencias.length, 1);
  assert.match(advertencias[0], /página 5/);
});

test('las zonas vacías no dejan rastro en el PDF', async () => {
  const campos = [zona('a'), zona('b', { clave_campo: 'b', y: 0.3 })];
  const { bytes } = await generarPdfLlenado(await pdfEnBlanco(), campos, { a: '', b: '   ' });

  assert.deepEqual(await leerTextosConPosicion(bytes), []);
});

test('un texto largo se parte en varias líneas dentro de la zona', async () => {
  const campos = [zona('obs', { x: 0.1, y: 0.2, ancho: 0.3, alto: 0.15 })];
  const texto = 'Se verifica el alineamiento y la verticalidad de los elementos estructurales '
    + 'según lo indicado en los planos aprobados por la supervisión.';

  const { bytes, advertencias } = await generarPdfLlenado(await pdfEnBlanco(), campos, { obs: texto });
  const textos = await leerTextosConPosicion(bytes);

  assert.ok(textos.length > 1, 'debería haber varias líneas');
  assert.deepEqual(advertencias, [], 'con esa altura tiene que entrar completo');

  // Todas las líneas dentro del ancho de la zona y en orden de arriba a abajo.
  const izquierda = 0.1 * ANCHO_PAGINA;
  const derecha = izquierda + 0.3 * ANCHO_PAGINA;
  for (const t of textos) {
    assert.ok(t.x >= izquierda - 1 && t.x <= derecha, `línea fuera del ancho: x=${t.x}`);
  }
  for (let i = 1; i < textos.length; i++) {
    assert.ok(textos[i].y < textos[i - 1].y, 'las líneas deben ir de arriba hacia abajo');
  }
});

test('si el texto no entra ni achicando, se avisa y no se pierde el resto del PDF', async () => {
  const campos = [zona('obs', { etiqueta: 'Observaciones', ancho: 0.15, alto: 0.02 })];
  const texto = 'Texto extremadamente largo que no puede entrar de ninguna manera en una zona '
    + 'tan chica por más que se reduzca el tamaño de la letra hasta el mínimo legible posible.';

  const { bytes, advertencias } = await generarPdfLlenado(await pdfEnBlanco(), campos, { obs: texto });

  assert.equal(advertencias.length, 1);
  assert.match(advertencias[0], /Observaciones/);
  assert.match(advertencias[0], /no entró completo/);
  assert.ok((await leerTextosConPosicion(bytes)).length > 0, 'igual se escribe lo que entra');
});

test('los caracteres que la fuente no soporta no rompen la generación', async () => {
  // Comillas tipográficas y guiones largos aparecen al copiar y pegar desde Word.
  const campos = [zona('obs')];
  const texto = 'Se “verifica” el muro —según norma— …';

  const { bytes } = await generarPdfLlenado(await pdfEnBlanco(), campos, { obs: texto });
  const textos = await leerTextosConPosicion(bytes);

  const escrito = textos.map((t) => t.texto).join(' ');
  assert.match(escrito, /"verifica"/);
  assert.ok(!escrito.includes('“'), 'las comillas tipográficas deben quedar convertidas');
});

test('las tildes y la ñ se imprimen tal cual', async () => {
  const campos = [zona('obs')];
  const { bytes } = await generarPdfLlenado(await pdfEnBlanco(), campos, {
    obs: 'Año construcción señalización',
  });

  const escrito = (await leerTextosConPosicion(bytes)).map((t) => t.texto).join(' ');
  assert.match(escrito, /Año/);
  assert.match(escrito, /construcción/);
  assert.match(escrito, /señalización/);
});

test('un check marcado dibuja algo y uno sin marcar no', async () => {
  const campos = [zona('cumple', { tipo_dato: 'check', ancho: 0.03, alto: 0.02 })];

  const marcado = await generarPdfLlenado(await pdfEnBlanco(), campos, { cumple: 'si' });
  const vacio = await generarPdfLlenado(await pdfEnBlanco(), campos, { cumple: '' });

  // El ✓ se dibuja con líneas, no con texto: se compara el peso del archivo.
  assert.ok(
    marcado.bytes.length > vacio.bytes.length,
    'el PDF con el check marcado debe tener contenido extra'
  );
  assert.deepEqual(await leerTextosConPosicion(vacio.bytes), []);
});

test('zonaAPdf: el mapeo de coordenadas, caso por caso', () => {
  // Zona que ocupa el cuarto superior izquierdo.
  const caja = zonaAPdf({ x: 0, y: 0, ancho: 0.5, alto: 0.25 }, 600, 800);
  assert.equal(caja.izquierda, 0);
  assert.equal(caja.ancho, 300);
  assert.equal(caja.alto, 200);
  assert.equal(caja.arriba, 800, 'el borde superior de la página es y=alto en el PDF');
  assert.equal(caja.abajo, 600);

  // Zona al pie: y=0.9 desde arriba → cerca de y=0 en el PDF.
  const pie = zonaAPdf({ x: 0, y: 0.9, ancho: 1, alto: 0.1 }, 600, 800);
  assert.equal(pie.abajo, 0);
  assert.equal(pie.arriba, 80);
});

test('ajustarTextoEnZona: achica la letra antes de recortar', async () => {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const texto = 'Verificación de alineamiento y verticalidad de elementos estructurales';

  const holgado = ajustarTextoEnZona(texto, fuente, { ancho: 400, alto: 100 });
  assert.equal(holgado.tamano, TAMANO_INICIAL, 'con espacio de sobra usa el tamaño normal');
  assert.equal(holgado.recortado, false);

  const ajustado = ajustarTextoEnZona(texto, fuente, { ancho: 120, alto: 30 });
  assert.ok(ajustado.tamano < TAMANO_INICIAL, 'con menos espacio debe achicar');
  assert.ok(ajustado.tamano >= TAMANO_MINIMO, 'pero nunca por debajo del mínimo legible');
});

test('ajustarTextoEnZona: una palabra más ancha que la zona se corta, no desborda', async () => {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);

  const { lineas, tamano } = ajustarTextoEnZona('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', fuente, { ancho: 40, alto: 100 });
  for (const linea of lineas) {
    assert.ok(fuente.widthOfTextAtSize(linea, tamano) <= 40 + 0.01, `"${linea}" desborda la zona`);
  }
});

test('sanitizarTexto: convierte lo convertible y descarta lo que rompería', () => {
  assert.equal(sanitizarTexto('“hola”'), '"hola"');
  assert.equal(sanitizarTexto('a—b'), 'a-b');
  assert.equal(sanitizarTexto('espere…'), 'espere...');
  assert.equal(sanitizarTexto('Año ñandú'), 'Año ñandú');
  assert.equal(sanitizarTexto('ok 🙂'), 'ok ');
  assert.equal(sanitizarTexto(null), '');
  assert.equal(sanitizarTexto(42), '42');
});

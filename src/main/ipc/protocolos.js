const path = require('path');
const fs = require('fs');
const os = require('os');
const sharp = require('sharp');

const queries = require('../../db/queries');
const { generarCodigoUnico, obtenerOCrearIdDispositivo } = require('../../core/codigoUnico');
const { siguienteCorrelativoVisible } = require('../../core/correlativo');
const { validarValoresProtocolo, validarLimiteFotos } = require('../../core/validaciones');
const { generarPdfLlenado } = require('../pdf/generarPdf');

const ANCHO_MAXIMO_FOTO = 1280;
const CALIDAD_JPEG = 72;

/**
 * Deriva las 2 iniciales que van en el id de dispositivo. Se limpian tildes
 * y símbolos, y se rellena si el texto es más corto que 2 letras — de lo
 * contrario /core rechazaría crear el id y la app quedaría bloqueada.
 */
function inicialesDe(texto) {
  const limpio = String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase();
  return `${limpio}XX`.slice(0, 2);
}

/**
 * Identidad del dispositivo, creada una sola vez a partir del nombre del
 * equipo. Sin módulo de usuario, esto es lo que responde "de dónde salió
 * este protocolo" en una auditoría.
 */
function idDeEsteDispositivo(db) {
  return obtenerOCrearIdDispositivo(db, inicialesDe(os.hostname()));
}

/**
 * Completa las zonas que la app llena sola, para que el registrador no
 * tipee lo mismo en cada protocolo.
 *
 * `correlativo` solo se pide si el formato tiene esa zona, y consume un
 * número de la serie — por eso se resuelve una única vez, al crear.
 */
function valoresAutomaticos(campos, { proyecto, responsable, correlativo }) {
  const automaticos = {};
  for (const campo of campos) {
    if (campo.tipo_dato === 'proyecto') automaticos[campo.clave_campo] = proyecto;
    if (campo.tipo_dato === 'responsable') automaticos[campo.clave_campo] = responsable;
    if (campo.tipo_dato === 'correlativo' && correlativo) automaticos[campo.clave_campo] = correlativo;
  }
  return automaticos;
}

function tieneZonaDeCorrelativo(campos) {
  return campos.some((campo) => campo.tipo_dato === 'correlativo');
}

function registrar(ipcMain, { db, dialog, shell, carpetaFotos, carpetaProtocolos }) {
  /** Obras y responsables ya usados, para los desplegables del registro. */
  ipcMain.handle('protocolos:sugerencias', () => ({
    proyectos: queries.listarProyectosUsados(db),
    responsables: queries.listarResponsablesUsados(db),
  }));

  /** Validación de los valores capturados, contra las reglas reales de /core. */
  ipcMain.handle('protocolos:validar', (event, templateId, valoresPorClave) => {
    const campos = queries.obtenerCamposDeTemplate(db, templateId);
    return validarValoresProtocolo(campos, valoresPorClave || {});
  });

  ipcMain.handle('protocolos:crear', (event, datos) => {
    const { templateId, versionUsada, proyecto, especialidad, responsable, valoresPorClave } = datos;

    if (!proyecto || !String(proyecto).trim()) throw new Error('Falta la obra en la sesión.');
    if (!responsable || !String(responsable).trim()) throw new Error('Falta el responsable en la sesión.');

    const campos = queries.obtenerCamposDeTemplate(db, templateId);
    if (campos.length === 0) throw new Error(`La plantilla ${templateId} no tiene campos configurados.`);

    // Se valida antes de tocar los contadores: un intento fallido no debe
    // consumir un número de la serie ni del código único.
    const validacionPrevia = validarValoresProtocolo(
      campos,
      { ...(valoresPorClave || {}), ...valoresAutomaticos(campos, { proyecto, responsable, correlativo: '0' }) }
    );
    if (!validacionPrevia.valido) return { ok: false, errores: validacionPrevia.errores };

    const plantilla = queries.obtenerTemplate(db, templateId);
    const correlativo = tieneZonaDeCorrelativo(campos)
      ? siguienteCorrelativoVisible(db, { codigoPlantilla: plantilla.codigo_plantilla, proyecto })
      : null;

    // Lo automático se resuelve antes de guardar: si no, una zona de tipo
    // proyecto o responsable quedaría vacía en el papel.
    const valores = {
      ...(valoresPorClave || {}),
      ...valoresAutomaticos(campos, { proyecto, responsable, correlativo }),
    };

    const valoresPorCampoId = {};
    for (const campo of campos) {
      valoresPorCampoId[campo.id] = valores[campo.clave_campo] ?? '';
    }

    // El dispositivo se resuelve igual, porque va dentro del código único.
    idDeEsteDispositivo(db);
    const codigoProtocolo = generarCodigoUnico(db, { especialidad, proyecto });

    const protocoloId = queries.crearProtocolo(db, {
      codigo_protocolo: codigoProtocolo,
      template_id: templateId,
      version_usada: versionUsada,
      proyecto,
      especialidad,
      // Quién llenó: el responsable del turno. El dispositivo ya quedó
      // identificado dentro del código único.
      creado_por: responsable,
      valores: valoresPorCampoId,
    });

    return { ok: true, protocoloId, codigoProtocolo, correlativo };
  });

  /**
   * Escribe los valores sobre el formato original y deja el PDF listo para
   * imprimir. No se guarda en la base: se regenera cuando haga falta a
   * partir de los datos, que es la promesa de la app si se pierde el papel.
   */
  ipcMain.handle('protocolos:generarPdf', async (event, protocoloId) => {
    const protocolo = queries.obtenerProtocolo(db, protocoloId);
    if (!protocolo) throw new Error(`El protocolo ${protocoloId} no existe.`);

    const plantilla = queries.obtenerTemplate(db, protocolo.template_id);
    if (!plantilla.ruta_pdf_origen || !fs.existsSync(plantilla.ruta_pdf_origen)) {
      return { ok: false, mensaje: 'No se encontró el formato PDF de la plantilla.' };
    }

    const campos = queries.obtenerCamposDeTemplate(db, protocolo.template_id);
    const valores = Object.fromEntries(
      queries.obtenerValoresDeProtocolo(db, protocoloId).map((v) => [v.clave_campo, v.valor])
    );

    const { bytes, advertencias } = await generarPdfLlenado(
      fs.readFileSync(plantilla.ruta_pdf_origen),
      campos,
      valores
    );

    fs.mkdirSync(carpetaProtocolos, { recursive: true });
    const rutaSalida = path.join(carpetaProtocolos, `${protocolo.codigo_protocolo}.pdf`);
    fs.writeFileSync(rutaSalida, bytes);

    // Generar el PDF es el momento en que el protocolo sale a firmarse.
    // Si ya estaba en firma o cerrado, regenerar no lo hace retroceder.
    if (protocolo.estado === 'en_proceso') {
      queries.cambiarEstadoProtocolo(db, protocoloId, 'en_firma', protocolo.creado_por);
    }

    if (shell) await shell.openPath(rutaSalida);

    return { ok: true, ruta: rutaSalida, advertencias };
  });

  ipcMain.handle('fotos:elegirYAgregar', async (event, protocoloId) => {
    const permiso = validarLimiteFotos(queries.contarFotosDeProtocolo(db, protocoloId));
    if (!permiso.permitido) return { ok: false, mensaje: permiso.mensaje };

    const resultado = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (resultado.canceled || resultado.filePaths.length === 0) return { ok: true, agregadas: [] };

    fs.mkdirSync(carpetaFotos, { recursive: true });

    const agregadas = [];
    const omitidas = [];
    let total = queries.contarFotosDeProtocolo(db, protocoloId);

    for (const rutaOrigen of resultado.filePaths) {
      if (!validarLimiteFotos(total).permitido) {
        omitidas.push(path.basename(rutaOrigen));
        continue;
      }

      const nombreArchivo = `protocolo${protocoloId}_${Date.now()}_${total + 1}.jpg`;
      const rutaDestino = path.join(carpetaFotos, nombreArchivo);

      try {
        await sharp(rutaOrigen)
          .resize({ width: ANCHO_MAXIMO_FOTO, height: ANCHO_MAXIMO_FOTO, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: CALIDAD_JPEG })
          .toFile(rutaDestino);
      } catch (error) {
        // Un archivo corrupto no debe abortar las fotos que sí sirven.
        omitidas.push(path.basename(rutaOrigen));
        continue;
      }

      total += 1;
      const tamanoKb = Math.round(fs.statSync(rutaDestino).size / 1024);
      const fotoId = queries.agregarFoto(db, protocoloId, {
        ruta_local: rutaDestino,
        orden: total,
        tamano_kb: tamanoKb,
      });

      agregadas.push({ id: fotoId, ruta_local: rutaDestino, tamano_kb: tamanoKb, orden: total });
    }

    const mensaje = omitidas.length > 0
      ? `No se pudieron agregar ${omitidas.length} archivo(s): ${omitidas.join(', ')}.`
      : undefined;

    return { ok: true, agregadas, mensaje };
  });

  ipcMain.handle('fotos:listar', (event, protocoloId) => queries.listarFotosDeProtocolo(db, protocoloId));
}

module.exports = { registrar, inicialesDe, idDeEsteDispositivo, valoresAutomaticos };

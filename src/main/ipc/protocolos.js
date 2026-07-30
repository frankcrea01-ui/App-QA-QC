const path = require('path');
const fs = require('fs');
const os = require('os');


const queries = require('../../db/queries');
const { generarCodigoUnico, obtenerOCrearIdDispositivo } = require('../../core/codigoUnico');
const { siguienteCorrelativoVisible } = require('../../core/correlativo');
const { validarValoresProtocolo } = require('../../core/validaciones');
const { generarPdfLlenado } = require('../pdf/generarPdf');

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
 * Completa las zonas que la app llena sola, para que el registrador no
 * tipee lo mismo en cada protocolo.
 *
 * `correlativo` solo se pide si el formato tiene esa zona, y consume un
 * número de la serie — por eso se resuelve una única vez, al crear.
 */
function valoresAutomaticos(campos, { proyecto, cliente, correlativo }) {
  const automaticos = {};
  for (const campo of campos) {
    if (campo.tipo_dato === 'proyecto') automaticos[campo.clave_campo] = proyecto;
    if (campo.tipo_dato === 'cliente') automaticos[campo.clave_campo] = cliente;
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

  ipcMain.handle('protocolos:crear', (event, { templateId, versionUsada, especialidad, proyecto, cliente, responsable, valoresPorClave }) => {
    if (!proyecto || !String(proyecto).trim()) throw new Error('Falta la obra en la sesión.');
    if (!responsable || !String(responsable).trim()) throw new Error('Falta el responsable en la sesión.');

    const campos = queries.obtenerCamposDeTemplate(db, templateId);
    if (campos.length === 0) throw new Error(`La plantilla ${templateId} no tiene campos configurados.`);

    // Se valida antes de tocar los contadores: un intento fallido no debe
    // consumir un número de la serie ni del código único.
    const validacionPrevia = validarValoresProtocolo(
      campos,
      { ...(valoresPorClave || {}), ...valoresAutomaticos(campos, { proyecto, cliente, correlativo: '0' }) }
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
      ...valoresAutomaticos(campos, { proyecto, cliente, correlativo }),
    };

    const valoresPorCampoId = {};
    for (const campo of campos) {
      valoresPorCampoId[campo.id] = valores[campo.clave_campo] ?? '';
    }

    // El código único se genera con Proyecto, Especialidad y Correlativo
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

}

module.exports = { registrar, inicialesDe, valoresAutomaticos };

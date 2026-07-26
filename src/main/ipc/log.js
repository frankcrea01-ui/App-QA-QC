const fs = require('fs');
const path = require('path');

const queries = require('../../db/queries');
const { validarTransicionEstado } = require('../../core/validaciones');
const { leerConfig } = require('./config');

/** Formatos aceptados como respaldo del protocolo firmado. */
const EXTENSIONES_ESCANEADO = ['pdf', 'jpg', 'jpeg', 'png'];

/**
 * Quién firma un cierre automático. Se usa el responsable configurado en la
 * sesión; si todavía no hay ninguno, queda quien llenó el protocolo. Nunca
 * se deja una entrada de historial sin responsable.
 */
function responsableDelCierre(db, protocolo) {
  return leerConfig(db, 'sesion_responsable') || protocolo.creado_por;
}

/** Log maestro: consulta, detalle, cambios de estado y cierre del ciclo. */
function registrar(ipcMain, { db, dialog, shell, carpetaEscaneados }) {
  ipcMain.handle('log:resumenPorEstado', () => queries.resumenPorEstado(db));

  ipcMain.handle('log:listarProtocolos', (event, filtro) => queries.listarProtocolos(db, filtro || {}));

  ipcMain.handle('log:obtenerDetalle', (event, protocoloId) => {
    const protocolo = queries.obtenerProtocolo(db, protocoloId);
    if (!protocolo) return null;
    return {
      protocolo,
      valores: queries.obtenerValoresDeProtocolo(db, protocoloId),
      fotos: queries.listarFotosDeProtocolo(db, protocoloId),
      historial: queries.obtenerHistorialDeProtocolo(db, protocoloId),
    };
  });

  ipcMain.handle('log:cambiarEstado', (event, { protocoloId, estadoNuevo, usuario, reactivar } = {}) => {
    if (!usuario || !String(usuario).trim()) {
      return { ok: false, mensaje: 'Hay que indicar quién hace el cambio (queda en el historial).' };
    }

    const actual = queries.obtenerProtocolo(db, protocoloId);
    if (!actual) return { ok: false, mensaje: `El protocolo ${protocoloId} no existe.` };

    // `reactivar` solo llega cuando el usuario confirmó que quiere sacar el
    // protocolo de anulado: es una decisión suya, no un paso más del flujo.
    const permiso = validarTransicionEstado(actual.estado, estadoNuevo, { reactivar: Boolean(reactivar) });
    if (!permiso.permitido) return { ok: false, mensaje: permiso.mensaje };

    queries.cambiarEstadoProtocolo(db, protocoloId, estadoNuevo, String(usuario).trim());
    return { ok: true };
  });

  /**
   * Cierra el ciclo: se carga el protocolo ya firmado y escaneado.
   *
   * El archivo se copia adentro de la app — si quedara apuntando a la ruta
   * donde el usuario lo dejó, mover esa carpeta dejaría al log maestro sin
   * el respaldo, que es justamente lo que la app promete conservar.
   *
   * Al cargarlo el protocolo pasa a `cerrado` automáticamente. Volver a
   * cargarlo reemplaza el archivo y lo deja cerrado igual.
   *
   * Un protocolo anulado se rechaza antes de abrir el diálogo: cerrarlo sin
   * que nadie lo haya decidido borraría una baja del registro, y elegir la
   * fila equivocada en el log es un error fácil de cometer.
   */
  ipcMain.handle('log:adjuntarPdfEscaneado', async (event, protocoloId) => {
    const protocolo = queries.obtenerProtocolo(db, protocoloId);
    if (!protocolo) throw new Error(`El protocolo ${protocoloId} no existe.`);

    const yaEstabaCerrado = protocolo.estado === 'cerrado';
    if (!yaEstabaCerrado) {
      const permiso = validarTransicionEstado(protocolo.estado, 'cerrado');
      if (!permiso.permitido) return { ok: false, mensaje: permiso.mensaje };
    }

    const resultado = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Protocolo firmado', extensions: EXTENSIONES_ESCANEADO }],
    });
    if (resultado.canceled || resultado.filePaths.length === 0) return { ok: false };

    const origen = resultado.filePaths[0];
    const extension = path.extname(origen).toLowerCase().replace('.', '') || 'pdf';
    if (!EXTENSIONES_ESCANEADO.includes(extension)) {
      return { ok: false, mensaje: `Formato no admitido: .${extension}` };
    }

    fs.mkdirSync(carpetaEscaneados, { recursive: true });
    const destino = path.join(carpetaEscaneados, `${protocolo.codigo_protocolo}-firmado.${extension}`);

    // Primero se copia el nuevo. Si esto falla —el archivo se movió, está en
    // un USB desconectado, lo tiene tomado el escáner— el firmado que ya
    // estaba guardado sigue intacto: es el único respaldo del papel.
    try {
      fs.copyFileSync(origen, destino);
    } catch (error) {
      return {
        ok: false,
        mensaje: `No se pudo copiar el escaneado (${error.code || error.message}). `
          + 'El documento que ya estaba cargado no se tocó.',
      };
    }

    // Recién con la copia hecha se retira el anterior, y solo si quedó en
    // otra ruta (cambió la extensión): un firmado por protocolo, no dos.
    const anterior = protocolo.pdf_escaneado_link;
    if (anterior && anterior !== destino && fs.existsSync(anterior)) {
      fs.rmSync(anterior, { force: true });
    }

    queries.adjuntarPdfEscaneado(db, protocoloId, destino);

    if (!yaEstabaCerrado) {
      queries.cambiarEstadoProtocolo(db, protocoloId, 'cerrado', responsableDelCierre(db, protocolo));
    }

    return { ok: true, ruta: destino, reemplazado: yaEstabaCerrado };
  });

  /** Abre el documento firmado con el visor del sistema. */
  ipcMain.handle('log:abrirEscaneado', async (event, protocoloId) => {
    const protocolo = queries.obtenerProtocolo(db, protocoloId);
    if (!protocolo || !protocolo.pdf_escaneado_link) {
      return { ok: false, mensaje: 'Este protocolo todavía no tiene el escaneado cargado.' };
    }
    if (!fs.existsSync(protocolo.pdf_escaneado_link)) {
      return { ok: false, mensaje: 'El archivo del escaneado ya no está disponible.' };
    }

    if (shell) await shell.openPath(protocolo.pdf_escaneado_link);
    return { ok: true };
  });
}

module.exports = { registrar, EXTENSIONES_ESCANEADO };

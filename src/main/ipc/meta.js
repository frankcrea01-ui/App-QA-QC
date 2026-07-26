const fs = require('fs');

const constantes = require('../../shared/constantes');

/**
 * Constantes y diálogos genéricos. La UI pide las constantes una sola vez
 * al arrancar en vez de mantener copias propias de estados/tipos/límites.
 */
function registrar(ipcMain, { dialog }) {
  ipcMain.handle('meta:constantes', () => ({
    especialidades: Object.keys(constantes.PREFIJOS_ESPECIALIDAD),
    estados: constantes.ESTADOS_PROTOCOLO,
    tiposDato: constantes.TIPOS_DATO,
    tiposAutomaticos: constantes.TIPOS_AUTOMATICOS,
    maxFotos: constantes.MAX_FOTOS_POR_PROTOCOLO,
  }));

  /**
   * Lee un PDF que ya se había elegido antes (templates.ruta_pdf_origen), para
   * poder heredar las zonas de una versión anterior y verlas sobre el formato.
   * Devuelve null si el archivo se movió o se borró — no es un error.
   */
  ipcMain.handle('meta:leerPdf', (event, rutaArchivo) => {
    if (!rutaArchivo || !rutaArchivo.toLowerCase().endsWith('.pdf')) return null;
    if (!fs.existsSync(rutaArchivo)) return null;

    return { rutaArchivo, datos: new Uint8Array(fs.readFileSync(rutaArchivo)) };
  });

  ipcMain.handle('meta:elegirPdf', async () => {
    const resultado = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (resultado.canceled || resultado.filePaths.length === 0) return null;

    const rutaArchivo = resultado.filePaths[0];
    return { rutaArchivo, datos: new Uint8Array(fs.readFileSync(rutaArchivo)) };
  });
}

module.exports = { registrar };

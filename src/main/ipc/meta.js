const fs = require('fs');

const constantes = require('../../shared/constantes');

/**
 * Constantes y diálogos genéricos. La UI pide las constantes una sola vez
 * al arrancar en vez de mantener copias propias de estados/tipos/límites.
 */
function registrar(ipcMain, { db, dialog }) {
  ipcMain.handle('meta:constantes', () => {
    let especialidadesNombres = [];
    let staffNombres = [];
    let registradoresNombres = [];
    let proyectosList = [];
    try {
      const row = db.prepare(`SELECT valor FROM config_dispositivo WHERE clave = 'oficina_especialidades'`).get();
      if (row && row.valor) {
        const parsed = JSON.parse(row.valor);
        especialidadesNombres = parsed.map(e => e.nombre);
      }
      
      const rowStaff = db.prepare(`SELECT valor FROM config_dispositivo WHERE clave = 'oficina_staff'`).get();
      if (rowStaff && rowStaff.valor) {
        const parsed = JSON.parse(rowStaff.valor);
        staffNombres = parsed.map(e => e.nombre);
      }

      const rowReg = db.prepare(`SELECT valor FROM config_dispositivo WHERE clave = 'oficina_registradores'`).get();
      if (rowReg && rowReg.valor) {
        const parsed = JSON.parse(rowReg.valor);
        registradoresNombres = parsed.map(e => e.nombre);
      }

      const rowProyectos = db.prepare(`SELECT valor FROM config_dispositivo WHERE clave = 'oficina_proyectos'`).get();
      if (rowProyectos && rowProyectos.valor) {
        proyectosList = JSON.parse(rowProyectos.valor);
      }
    } catch(e) {}
    
    // Si no hay configuradas, por ahora no mostramos nada o mostramos un default.
    return {
      especialidades: especialidadesNombres,
      staff: staffNombres,
      registradores: registradoresNombres,
      proyectos: proyectosList,
      estados: constantes.ESTADOS_PROTOCOLO,
      tiposDato: constantes.TIPOS_DATO,
      tiposAutomaticos: constantes.TIPOS_AUTOMATICOS,
    };
  });

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

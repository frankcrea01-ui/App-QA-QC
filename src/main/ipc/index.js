/**
 * Punto único de registro de handlers IPC. Agregar un módulo nuevo es
 * sumarlo a esta lista — el proceso principal no necesita enterarse.
 */
const modulos = [
  require('./meta'),
  require('./templates'),
  require('./config'),
  require('./protocolos'),
  require('./log'),
];

/**
 * @param {object} ipcMain
 * @param {{ db: object, dialog: object, carpetaFotos: string }} contexto
 */
function registrarTodos(ipcMain, contexto) {
  for (const modulo of modulos) modulo.registrar(ipcMain, contexto);
}

module.exports = { registrarTodos };

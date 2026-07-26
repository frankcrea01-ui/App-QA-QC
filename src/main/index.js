const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

const { abrirBaseDeDatos } = require('../db/conexion');
const { registrarTodos } = require('./ipc');

let db;

function crearVentana() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  } else {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
    // Reenvía la consola del renderer al terminal, para no depender de DevTools.
    win.webContents.on('console-message', (event, nivel, mensaje, linea, origen) => {
      console.log(`[renderer] ${mensaje} (${origen}:${linea})`);
    });
  }
}

app.whenReady().then(() => {
  const carpetaDatos = app.getPath('userData');
  db = abrirBaseDeDatos(path.join(carpetaDatos, 'protocolos.db'));

  registrarTodos(ipcMain, {
    db,
    dialog,
    shell,
    carpetaFotos: path.join(carpetaDatos, 'fotos'),
    // Los formatos originales y los protocolos generados viven dentro de la
    // app, para no depender de archivos que el usuario pueda mover.
    carpetaPlantillas: path.join(carpetaDatos, 'plantillas'),
    carpetaProtocolos: path.join(carpetaDatos, 'protocolos'),
    carpetaEscaneados: path.join(carpetaDatos, 'escaneados'),
  });

  crearVentana();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// La base se cierra recién al salir: en macOS la app sigue viva sin ventanas
// y puede volver a abrir una, que necesita la conexión todavía abierta.
app.on('before-quit', () => {
  if (db) {
    db.close();
    db = null;
  }
});

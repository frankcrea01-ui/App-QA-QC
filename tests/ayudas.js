/**
 * Utilidades compartidas por las pruebas. Cada prueba trabaja sobre una base
 * temporal propia, así ninguna depende del orden ni del estado de otra.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const { abrirBaseDeDatos } = require('../src/db/conexion');

/**
 * Crea una base SQLite descartable y devuelve la conexión junto con una
 * función para borrarla al terminar.
 */
function baseTemporal() {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'protocolos-test-'));
  const rutaDb = path.join(carpeta, 'test.db');
  const db = abrirBaseDeDatos(rutaDb);

  return {
    db,
    carpeta,
    limpiar() {
      db.close();
      fs.rmSync(carpeta, { recursive: true, force: true });
    },
  };
}

/**
 * ipcMain falso: guarda los handlers registrados y permite invocarlos
 * igual que lo haría el renderer, sin levantar Electron.
 */
function ipcFalso() {
  const handlers = {};
  return {
    ipcMain: {
      handle(canal, fn) {
        handlers[canal] = fn;
      },
    },
    // Siempre asíncrono, igual que ipcRenderer.invoke: un handler que lanza
    // llega al renderer como promesa rechazada, no como throw sincrónico.
    invocar: async (canal, ...args) => {
      if (!handlers[canal]) throw new Error(`Canal IPC no registrado: ${canal}`);
      return handlers[canal]({}, ...args);
    },
    canales: () => Object.keys(handlers),
  };
}

/** Carpeta temporal independiente, para fixtures que no deben morir con la base. */
function carpetaTemporal() {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'protocolos-fixture-'));
  return {
    carpeta,
    limpiar: () => fs.rmSync(carpeta, { recursive: true, force: true }),
  };
}

/**
 * dialog falso. `estado.rutas` se puede cambiar durante la prueba para
 * simular que el usuario elige otro archivo en una segunda apertura.
 */
function dialogFalso(rutasIniciales) {
  const estado = { rutas: rutasIniciales || [] };

  return {
    dialog: {
      showOpenDialog: async () => {
        if (estado.rutas.length === 0) return { canceled: true, filePaths: [] };
        return { canceled: false, filePaths: estado.rutas };
      },
    },
    configurar: (rutas) => { estado.rutas = rutas; },
  };
}

/** Plantilla mínima ya activada, lista para llenar en modo campo. */
function plantillaDePrueba(db, queries, { activar = true } = {}) {
  const templateId = queries.crearTemplate(db, {
    codigo_plantilla: 'PROT-EST',
    nombre: 'Protocolo de Estructura',
    version: 'v1',
    especialidad: 'estructura',
  });

  const campos = {
    proyecto: queries.agregarCampoATemplate(db, templateId, {
      clave_campo: 'proyecto', etiqueta: 'Proyecto', tipo_dato: 'texto', obligatorio: true,
      ejemplo: 'Torre A', x: 0.1, y: 0.1, ancho: 0.3, alto: 0.05, orden: 1,
    }),
    fecha: queries.agregarCampoATemplate(db, templateId, {
      clave_campo: 'fecha', etiqueta: 'Fecha', tipo_dato: 'fecha', obligatorio: true,
      ejemplo: '2026-07-25', x: 0.5, y: 0.1, ancho: 0.2, alto: 0.05, orden: 2,
    }),
    observacion: queries.agregarCampoATemplate(db, templateId, {
      clave_campo: 'observacion', etiqueta: 'Observación', tipo_dato: 'texto', obligatorio: false,
      x: 0.1, y: 0.2, ancho: 0.5, alto: 0.06, orden: 3,
    }),
  };

  if (activar) queries.activarTemplate(db, templateId);

  return { templateId, campos };
}

/**
 * Entorno IPC completo sobre una base temporal: los mismos handlers que
 * corren en el proceso principal, con dialog y shell falsos.
 */
function entornoIpc({ rutasDialog = [] } = {}) {
  const { registrarTodos } = require('../src/main/ipc');

  const base = baseTemporal();
  const ipc = ipcFalso();
  const carpetaFotos = path.join(base.carpeta, 'fotos');
  const carpetaPlantillas = path.join(base.carpeta, 'plantillas');
  const carpetaProtocolos = path.join(base.carpeta, 'protocolos');
  const carpetaEscaneados = path.join(base.carpeta, 'escaneados');
  const abiertos = [];
  const dialogo = dialogFalso(rutasDialog);

  registrarTodos(ipc.ipcMain, {
    db: base.db,
    dialog: dialogo.dialog,
    // shell falso: registra qué se habría abierto en el visor del sistema.
    shell: { openPath: async (ruta) => { abiertos.push(ruta); return ''; } },
    carpetaFotos,
    carpetaPlantillas,
    carpetaProtocolos,
    carpetaEscaneados,
  });

  return {
    ...base,
    ...ipc,
    carpetaFotos,
    carpetaPlantillas,
    carpetaProtocolos,
    carpetaEscaneados,
    abiertos,
    // Cambia qué archivo "elige" el usuario en la próxima apertura.
    elegirEnDialogo: dialogo.configurar,
  };
}

/** Escribe un PDF mínimo en disco, para usar como formato de plantilla. */
async function formatoPdfDePrueba(carpeta, paginas = 1) {
  const { PDFDocument } = require('pdf-lib');

  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) doc.addPage([612, 792]);

  fs.mkdirSync(carpeta, { recursive: true });
  const ruta = path.join(carpeta, 'formato.pdf');
  fs.writeFileSync(ruta, await doc.save());
  return ruta;
}

module.exports = {
  baseTemporal,
  carpetaTemporal,
  ipcFalso,
  dialogFalso,
  plantillaDePrueba,
  entornoIpc,
  formatoPdfDePrueba,
};

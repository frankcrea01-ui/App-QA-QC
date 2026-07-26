/**
 * Borra todo lo que la app guardó, para probarla como instalación nueva:
 * base de datos, fotos comprimidas y la base de la demo.
 *
 * Se usa al terminar cada bloque de construcción, para que la prueba
 * arranque desde cero (onboarding incluido) y no quede contaminada por
 * datos de bloques anteriores.
 *
 * Uso: npm run limpiar
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const NOMBRE_APP = require('../package.json').name;

/** Misma carpeta que usa Electron en app.getPath('userData'). */
function carpetaDatosDeLaApp() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), NOMBRE_APP);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', NOMBRE_APP);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), NOMBRE_APP);
}

const datosApp = carpetaDatosDeLaApp();

// Solo datos de la app. Las cachés de Chromium no se tocan: no guardan nada
// de protocolos ni de plantillas, y se regeneran solas.
const objetivos = [
  path.join(datosApp, 'protocolos.db'),
  path.join(datosApp, 'protocolos.db-shm'),
  path.join(datosApp, 'protocolos.db-wal'),
  path.join(datosApp, 'fotos'),
  path.join(datosApp, 'plantillas'),
  path.join(datosApp, 'protocolos'),
  path.join(datosApp, 'escaneados'),
  path.join(RAIZ, 'demo.sqlite'),
  path.join(RAIZ, 'demo.sqlite-shm'),
  path.join(RAIZ, 'demo.sqlite-wal'),
];

let borrados = 0;
const bloqueados = [];

for (const objetivo of objetivos) {
  if (!fs.existsSync(objetivo)) continue;
  try {
    fs.rmSync(objetivo, { recursive: true, force: true });
    console.log(`  borrado  ${objetivo}`);
    borrados += 1;
  } catch (error) {
    bloqueados.push(objetivo);
  }
}

if (bloqueados.length > 0) {
  console.error(
    '\n> No se pudo borrar:\n' +
    bloqueados.map((b) => `  ${b}`).join('\n') +
    '\n> Suele ser porque la app está abierta y tiene tomada la base.\n' +
    '> Cerrala y volvé a correr: npm run limpiar\n'
  );
  process.exit(1);
}

console.log(
  borrados === 0
    ? '> Ya estaba limpio: no había datos guardados.'
    : `> Listo. La próxima vez que abras la app va a arrancar como instalación nueva.`
);

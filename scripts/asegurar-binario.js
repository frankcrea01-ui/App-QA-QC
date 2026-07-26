/**
 * better-sqlite3 es un módulo nativo: el binario compilado para Node puro
 * (tests, demo) no sirve dentro de Electron y viceversa. En vez de dejar
 * que el desarrollador recuerde cuál toca, este script recompila solo
 * cuando el destino cambió, y deja una marca para no repetir trabajo.
 *
 * Uso: node scripts/asegurar-binario.js node|electron
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const MARCADOR = path.join(RAIZ, 'node_modules', '.destino-binario');

const destino = process.argv[2];
if (destino !== 'node' && destino !== 'electron') {
  console.error('Destino inválido. Usar: node scripts/asegurar-binario.js node|electron');
  process.exit(1);
}

const actual = fs.existsSync(MARCADOR) ? fs.readFileSync(MARCADOR, 'utf-8').trim() : null;
if (actual === destino) process.exit(0);

console.log(`> Recompilando better-sqlite3 para ${destino}…`);
const comando = destino === 'electron'
  ? 'npx electron-rebuild -f -w better-sqlite3'
  : 'npm rebuild better-sqlite3';

try {
  execSync(comando, { stdio: 'inherit', cwd: RAIZ, windowsHide: true });
  fs.writeFileSync(MARCADOR, destino);
} catch (error) {
  // Si falla, se borra la marca para que el próximo intento vuelva a probar.
  if (fs.existsSync(MARCADOR)) fs.unlinkSync(MARCADOR);

  // Causa habitual: la app está abierta y tiene tomado el binario. El error
  // que devuelve node-gyp (EPERM al borrar un .node) no lo explica.
  console.error(
    '\n> No se pudo recompilar better-sqlite3.\n' +
    '> Si la app está abierta, cerrala y volvé a intentar: mientras corre,\n' +
    '> Electron mantiene tomado el binario y Windows no deja reemplazarlo.\n'
  );
  process.exit(1);
}

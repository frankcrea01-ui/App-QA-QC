/**
 * Configuración del dispositivo (tabla config_dispositivo), el mismo
 * mecanismo que ya usa id_dispositivo en /core.
 *
 * No hay usuarios ni login: el brief pide cero fricción para el usuario de
 * campo, y el PIN nunca fue una credencial real de seguridad. La trazabilidad
 * se apoya en el id_dispositivo (el esquema admite "id_dispositivo o usuario"
 * en creado_por) y en el historial de estados, donde el jefe sí firma con su
 * nombre cada cambio.
 */
function leerConfig(db, clave) {
  const row = db.prepare(`SELECT valor FROM config_dispositivo WHERE clave = ?`).get(clave);
  return row ? row.valor : null;
}

function escribirConfig(db, clave, valor) {
  db.prepare(`
    INSERT INTO config_dispositivo (clave, valor) VALUES (?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
  `).run(clave, valor);
}

function registrar(ipcMain, { db }) {
  /**
   * Obra y responsable del turno. Se guardan acá y no en memoria para que
   * sobrevivan al cierre de la app: un turno no termina cuando se cierra
   * la ventana, y volver a elegirlos cada mañana sería fricción evitable.
   */
  ipcMain.handle('config:obtenerSesion', () => ({
    proyecto: leerConfig(db, 'sesion_proyecto'),
    responsable: leerConfig(db, 'sesion_responsable'),
  }));

  ipcMain.handle('config:guardarSesion', (event, { proyecto, responsable } = {}) => {
    if (!proyecto || !proyecto.trim()) throw new Error('La obra es obligatoria.');
    if (!responsable || !responsable.trim()) throw new Error('El responsable es obligatorio.');

    db.transaction(() => {
      escribirConfig(db, 'sesion_proyecto', proyecto.trim());
      escribirConfig(db, 'sesion_responsable', responsable.trim());
    })();

    return { proyecto: proyecto.trim(), responsable: responsable.trim() };
  });

  ipcMain.handle('config:obtenerOnboardingVisto', () => leerConfig(db, 'onboarding_visto') === '1');

  ipcMain.handle('config:marcarOnboardingVisto', () => {
    escribirConfig(db, 'onboarding_visto', '1');
  });
}

module.exports = { registrar, leerConfig, escribirConfig };

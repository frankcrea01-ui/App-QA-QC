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
    cliente: leerConfig(db, 'sesion_cliente'),
  }));

  ipcMain.handle('config:guardarSesion', (event, { proyecto, responsable, cliente } = {}) => {
    if (!proyecto || !proyecto.trim()) throw new Error('La obra es obligatoria.');
    if (!responsable || !responsable.trim()) throw new Error('El responsable es obligatorio.');

    db.transaction(() => {
      escribirConfig(db, 'sesion_proyecto', proyecto.trim());
      escribirConfig(db, 'sesion_responsable', responsable.trim());
      escribirConfig(db, 'sesion_cliente', (cliente || '').trim());
    })();

    return { proyecto: proyecto.trim(), responsable: responsable.trim(), cliente: (cliente || '').trim() };
  });

  ipcMain.handle('config:obtenerOficina', () => ({
    proyectos: JSON.parse(leerConfig(db, 'oficina_proyectos') || '[]'),
    jefe: leerConfig(db, 'oficina_jefe') || '',
    registradores: JSON.parse(leerConfig(db, 'oficina_registradores') || '[]'),
    staff: JSON.parse(leerConfig(db, 'oficina_staff') || '[]'),
    especialidades: JSON.parse(leerConfig(db, 'oficina_especialidades') || '[]'),
  }));

  ipcMain.handle('config:guardarOficina', (event, config) => {
    db.transaction(() => {
      escribirConfig(db, 'oficina_proyectos', JSON.stringify(config.proyectos || []));
      escribirConfig(db, 'oficina_jefe', (config.jefe || '').trim());
      escribirConfig(db, 'oficina_registradores', JSON.stringify(config.registradores || []));
      escribirConfig(db, 'oficina_staff', JSON.stringify(config.staff || []));
      escribirConfig(db, 'oficina_especialidades', JSON.stringify(config.especialidades || []));
    })();
    return true;
  });

  ipcMain.handle('config:obtenerOnboardingVisto', () => leerConfig(db, 'onboarding_visto') === '1');

  ipcMain.handle('config:marcarOnboardingVisto', () => {
    escribirConfig(db, 'onboarding_visto', '1');
  });
}

module.exports = { registrar, leerConfig, escribirConfig };

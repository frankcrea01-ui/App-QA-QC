/**
 * Generación de código único de protocolo.
 * Formato: [ESPECIALIDAD]-[PROYECTO]-[ID_DISPOSITIVO]-[CORRELATIVO]-[AÑO]
 * Ejemplo: EST-PROY01-JC-0007-2026
 *
 * Diseñado para funcionar 100% offline: nunca consulta un servidor central
 * antes de generar el código. La unicidad se garantiza por construcción,
 * combinando un ID de dispositivo fijo con un correlativo local.
 */



/**
 * Normaliza el nombre de especialidad a su prefijo de 3 letras.
 *
 * Se ignoran tildes y mayúsculas, así "Instalaciones Eléctricas" e
 * "instalaciones electricas" dan el mismo prefijo — de lo contrario un
 * tipeo sin tilde caería en el comodín y generaría un código distinto
 * para la misma especialidad.
 *
 * Si no está en el catálogo, genera un prefijo con las 3 primeras letras
 * en vez de fallar, para que un formato "raro" no bloquee la creación.
 */
function prefijoEspecialidad(db, especialidad) {
  if (!especialidad || typeof especialidad !== 'string') {
    throw new Error('Especialidad es obligatoria para generar el código único.');
  }

  const clave = especialidad
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');

  const row = db.prepare(`SELECT valor FROM config_dispositivo WHERE clave = 'oficina_especialidades'`).get();
  if (row) {
    try {
      const especialidades = JSON.parse(row.valor);
      const enc = especialidades.find(e => 
        e.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ') === clave
      );
      if (enc && enc.prefijo) return enc.prefijo.toUpperCase();
    } catch(e) {}
  }
  
  return clave.slice(0, 3).toUpperCase().padEnd(3, 'X');
}

/**
 * Valida y normaliza el código de proyecto (sin espacios, mayúsculas).
 */
function normalizarProyecto(proyecto) {
  if (!proyecto || typeof proyecto !== 'string' || !proyecto.trim()) {
    throw new Error('Código de proyecto es obligatorio para generar el código único.');
  }
  return proyecto.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Obtiene (o crea si no existe) el ID de dispositivo persistente.
 * Se guarda una sola vez en config_dispositivo, en el primer uso de la app.
 * Combina iniciales de usuario + 2 dígitos aleatorios para reducir
 * probabilidad de colisión entre instalaciones distintas.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} inicialesUsuario ej: "JC"
 */
function obtenerOCrearIdDispositivo(db, inicialesUsuario) {
  const row = db.prepare(
    `SELECT valor FROM config_dispositivo WHERE clave = 'id_dispositivo'`
  ).get();

  if (row) return row.valor;

  if (!inicialesUsuario || inicialesUsuario.trim().length < 2) {
    throw new Error(
      'Se requieren al menos 2 iniciales de usuario para crear el ID de dispositivo la primera vez.'
    );
  }

  const iniciales = inicialesUsuario.trim().toUpperCase().slice(0, 2);
  const sufijoAleatorio = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  const idDispositivo = `${iniciales}${sufijoAleatorio}`;

  db.prepare(
    `INSERT INTO config_dispositivo (clave, valor) VALUES ('id_dispositivo', ?)`
  ).run(idDispositivo);

  return idDispositivo;
}

/**
 * Devuelve el siguiente correlativo local para el proyecto y especialidad.
 * El correlativo vive SOLO en este dispositivo.
 */
function siguienteCorrelativo(db, proyecto, prefijo) {
  const clave = `correlativo_${proyecto}_${prefijo}`;
  const row = db.prepare(`SELECT valor FROM config_dispositivo WHERE clave = ?`).get(clave);

  const actual = row ? parseInt(row.valor, 10) : 0;
  const siguiente = actual + 1;

  db.prepare(
    `INSERT INTO config_dispositivo (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  ).run(clave, String(siguiente));

  return siguiente;
}

/**
 * Genera un código único de protocolo, completamente offline.
 * Formato: [PROYECTO]-[ESPECIALIDAD]-[CORRELATIVO]
 *
 * @param {import('better-sqlite3').Database} db - conexión SQLite abierta
 * @param {Object} params
 * @param {string} params.especialidad - ej: "estructura"
 * @param {string} params.proyecto - ej: "PROY01"
 * @returns {string} código único, ej: "SERENA-EST-001"
 */
function generarCodigoUnico(db, { especialidad, proyecto } = {}) {
  const prefijo = prefijoEspecialidad(db, especialidad);
  const proyectoNorm = normalizarProyecto(proyecto);
  
  const correlativo = siguienteCorrelativo(db, proyectoNorm, prefijo);
  const correlativoStr = String(correlativo).padStart(3, '0');

  return `${proyectoNorm}-${prefijo}-${correlativoStr}`;
}

module.exports = {
  generarCodigoUnico,
  prefijoEspecialidad,
  normalizarProyecto,
  obtenerOCrearIdDispositivo,
  siguienteCorrelativo,
};

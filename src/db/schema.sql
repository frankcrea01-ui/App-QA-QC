-- ============================================================
-- Esquema de base de datos — App Trazabilidad de Protocolos
-- SQLite local por dispositivo
-- ============================================================

PRAGMA foreign_keys = ON;

-- Catálogo de estados (evita texto libre, orden y consistencia)
CREATE TABLE IF NOT EXISTS estados_protocolo (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL UNIQUE,
  orden         INTEGER NOT NULL
);

-- Alineados al flujo real: llenar → imprimir → firmar → escanear → cerrado.
INSERT OR IGNORE INTO estados_protocolo (nombre, orden) VALUES
  ('en_proceso', 1),
  ('en_firma', 2),
  ('cerrado', 3),
  ('anulado', 4);

-- Definición de plantillas (una fila por versión de formato)
CREATE TABLE IF NOT EXISTS templates (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_plantilla  TEXT NOT NULL,
  nombre            TEXT NOT NULL,
  version           TEXT NOT NULL,
  especialidad      TEXT NOT NULL,       -- estructura | arquitectura | instalaciones | ...
  -- Nace como borrador: recién pasa a 1 cuando el jefe la aprueba en la
  -- vista previa. Así ninguna plantilla llega a modo campo sin revisarse.
  activo            INTEGER NOT NULL DEFAULT 0,
  ruta_pdf_origen   TEXT,
  fecha_creacion    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(codigo_plantilla, version)
);

-- Zonas dibujadas en el editor (coordenadas relativas 0-1)
CREATE TABLE IF NOT EXISTS template_fields (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id   INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  clave_campo   TEXT NOT NULL,           -- identificador interno estable, se genera desde la etiqueta
  etiqueta      TEXT NOT NULL,           -- texto mostrado al usuario
  -- Sin chequeo estricto a propósito: la lista de tipos válidos vive en /shared/constantes.js
  -- y se valida en queries.agregarCampoATemplate. Un CHECK acá duplicaría esa
  -- lista y obligaría a migrar la base cada vez que se agrega un tipo.
  tipo_dato     TEXT NOT NULL,
  obligatorio   INTEGER NOT NULL DEFAULT 0,   -- 0/1
  opciones      TEXT,                    -- JSON de configuración adicional (filas, columnas, formato, etc.)
  ejemplo       TEXT,                    -- sin uso desde el bloque 1 (ver docs/decisiones-ui.md, D1)
  descripcion   TEXT,                    -- sin uso desde el bloque 1
  pagina        INTEGER NOT NULL DEFAULT 1,
  x             REAL NOT NULL,           -- 0..1 relativo al ancho de página
  y             REAL NOT NULL,           -- 0..1 relativo al alto de página
  ancho         REAL NOT NULL,
  alto          REAL NOT NULL,
  orden         INTEGER NOT NULL DEFAULT 0,
  UNIQUE(template_id, clave_campo)
);

-- Registro maestro de protocolos llenados
CREATE TABLE IF NOT EXISTS protocolos (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_protocolo   TEXT NOT NULL UNIQUE,   -- ej: EST-PROY01-JP-0007-2026
  template_id        INTEGER NOT NULL REFERENCES templates(id),
  version_usada      TEXT NOT NULL,          -- ancla el registro a la versión de plantilla con la que se llenó
  proyecto           TEXT NOT NULL,
  empresa            TEXT,
  especialidad       TEXT NOT NULL,
  estado_id          INTEGER NOT NULL REFERENCES estados_protocolo(id),
  creado_por         TEXT NOT NULL,          -- id_dispositivo o usuario
  fecha_creacion     TEXT NOT NULL DEFAULT (datetime('now')),
  fecha_cierre       TEXT,
  pdf_escaneado_link TEXT,
  sincronizado       INTEGER NOT NULL DEFAULT 0,
  fecha_modificacion TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Valores dinámicos (patrón clave-valor, evita hardcodear columnas por plantilla)
CREATE TABLE IF NOT EXISTS protocolo_valores (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  protocolo_id        INTEGER NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
  template_field_id   INTEGER NOT NULL REFERENCES template_fields(id),
  valor                TEXT,
  UNIQUE(protocolo_id, template_field_id)
);

-- Historial de cambios de estado (auditoría real: quién, cuándo, de qué a qué)
CREATE TABLE IF NOT EXISTS historial_estado (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  protocolo_id      INTEGER NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
  estado_anterior   TEXT,
  estado_nuevo      TEXT NOT NULL,
  fecha             TEXT NOT NULL DEFAULT (datetime('now')),
  usuario           TEXT NOT NULL
);

-- Fotos asociadas a un protocolo (máx. 5, validado en /core, no aquí)
CREATE TABLE IF NOT EXISTS fotos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  protocolo_id   INTEGER NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
  ruta_local     TEXT NOT NULL,
  ruta_nube      TEXT,
  descripcion    TEXT,
  orden          INTEGER NOT NULL,
  tamano_kb      INTEGER,
  fecha_captura  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Config local del dispositivo (id_dispositivo persistente, se crea una sola vez)
CREATE TABLE IF NOT EXISTS config_dispositivo (
  clave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_protocolos_estado ON protocolos(estado_id);
CREATE INDEX IF NOT EXISTS idx_protocolos_especialidad ON protocolos(especialidad);
CREATE INDEX IF NOT EXISTS idx_protocolo_valores_protocolo ON protocolo_valores(protocolo_id);

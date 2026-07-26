# App de Trazabilidad de Protocolos de Calidad — Brief Técnico Completo

> Documento de referencia para desarrollo con Claude Code. Contiene el problema, las
> decisiones ya tomadas, el esquema de datos, la lógica ya validada, la estructura de
> carpetas y el orden de construcción. El prototipo del núcleo (Fase 1) ya fue probado
> y funciona — este documento describe cómo continuar desde ahí.

---

## 1. Objetivo del proyecto

Resolver la falta de trazabilidad en protocolos de calidad de obra (construcción/ingeniería).
Actualmente los protocolos se llenan en papel, sin registro digital centralizado, lo que
dificulta demostrar trazabilidad ante una auditoría (pequeña o gran empresa).

La app debe permitir:
1. Diseñar plantillas digitales a partir de PDFs de protocolos existentes (drag-and-drop de zonas).
2. Que un segundo/tercer usuario en campo llene esas plantillas de forma simple e intuitiva.
3. Mantener un log maestro centralizado con estado y trazabilidad completa de cada protocolo.
4. Servir como respaldo digital ante pérdida de la documentación física.

**Usuarios:**
- **Jefe/encargado de calidad**: diseña plantillas, supervisa el log maestro, cambia estados, requiere mínima capacitación (interfaz intuitiva).
- **Usuario de campo** ("hasta el jardinero podría usarlo"): solo llena protocolos y toma fotos, requiere cero fricción, login simple local.

---

## 2. Decisiones de arquitectura ya tomadas

| Área | Decisión | Razón |
|---|---|---|
| Framework desktop | **Electron** | Velocidad de desarrollo con JS/TS, sin curva de Rust. El peso del instalable no es una restricción real para una app interna. |
| UI | **React** | Mejor soporte/ejemplos para editores drag-and-drop tipo canvas. |
| Render de PDF | **pdf.js** | Estándar de facto, gratuito, mismo motor que usa Firefox/Chrome. |
| Base de datos | **SQLite local** (por dispositivo) vía `better-sqlite3` | Escritura simple, sin servidor, funciona 100% offline. Un escritor por archivo — resuelto porque cada dispositivo tiene su propia copia. |
| Backend futuro (al escalar) | Firebase o Supabase (capa gratuita) | Migración acotada gracias a la separación `/core` `/db` `/sync`. |
| Transporte de sincronización | Carpeta compartida en Google Drive, scope `drive.file` | Scope no sensible → sin proceso de verificación de Google. Drive es apropiado para archivos binarios (PDFs, fotos, paquetes de datos), no como base de datos. |
| Autenticación campo | Usuario simple local (usuario/PIN), sin OAuth | El usuario de campo no debe lidiar con consentimiento OAuth de Google. |
| Autenticación jefe/admin | Google (para acceso a Drive) | Solo el rol que gestiona sync/almacenamiento necesita esto. |
| Firma | Física = cierre legal real. App = historial/respaldo digital, **no** firma electrónica con validez legal | Evita toda la complejidad y riesgo legal de firma electrónica certificada. |
| Mapeo de zonas en PDF | 100% manual, sin IA | Control de costos (gratis) y mayor confiabilidad que un reconocimiento automático probabilístico. |
| Compresión de fotos | `sharp`, redimensionar a ~1280px lado mayor, JPEG calidad ~70-75% | Suficiente para evidencia de auditoría, liviano para sync con señal débil. |

---

## 3. Esquema de base de datos (SQLite)

Ya implementado y probado. Principio clave: **`protocolo_valores` usa patrón clave-valor**
para no hardcodear una columna por cada campo de cada plantilla — así el mismo esquema
sirve para cualquier formato de protocolo sin tocar la base de datos.

```sql
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

INSERT OR IGNORE INTO estados_protocolo (nombre, orden) VALUES
  ('en_proceso', 1),
  ('en_revision', 2),
  ('en_firma', 3),
  ('cerrado', 4),
  ('anulado', 5);

-- Definición de plantillas (una fila por versión de formato)
CREATE TABLE IF NOT EXISTS templates (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_plantilla  TEXT NOT NULL,
  nombre            TEXT NOT NULL,
  version           TEXT NOT NULL,
  especialidad      TEXT NOT NULL,       -- estructura | arquitectura | instalaciones | ...
  activo            INTEGER NOT NULL DEFAULT 1,
  ruta_pdf_origen   TEXT,
  fecha_creacion    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(codigo_plantilla, version)
);

-- Zonas dibujadas en el editor (coordenadas relativas 0-1)
CREATE TABLE IF NOT EXISTS template_fields (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id   INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  clave_campo   TEXT NOT NULL,           -- identificador interno estable, ej: "proyecto"
  etiqueta      TEXT NOT NULL,           -- texto mostrado al usuario
  tipo_dato     TEXT NOT NULL CHECK (tipo_dato IN ('texto','numero','fecha','lista')),
  obligatorio   INTEGER NOT NULL DEFAULT 0,   -- 0/1
  ejemplo       TEXT,
  descripcion   TEXT,
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
  version_usada      TEXT NOT NULL,          -- ancla el registro a la versión con la que se llenó
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
```

---

## 4. Código único de protocolo — ya implementado y probado

**Formato:** `[ESPECIALIDAD]-[PROYECTO]-[ID_DISPOSITIVO]-[CORRELATIVO]-[AÑO]`
**Ejemplo real generado en pruebas:** `EST-PROY01-JP68-0001-2026`

Diseñado para nunca colisionar entre dispositivos **sin necesitar red**:
- `ESPECIALIDAD`: prefijo fijo derivado de la plantilla (EST/ARQ/INS...).
- `PROYECTO`: código corto normalizado, definido por el jefe.
- `ID_DISPOSITIVO`: se genera una sola vez por instalación (iniciales de usuario + 2 dígitos aleatorios) y se guarda localmente en `config_dispositivo`.
- `CORRELATIVO`: contador que solo sube desde ese dispositivo, nunca compartido ni consultado a un servidor antes de generarse.
- `AÑO`: permite reiniciar correlativos anualmente si se desea.

Archivo de referencia: `src/core/codigoUnico.js` (funciones `generarCodigoUnico`,
`obtenerOCrearIdDispositivo`, `siguienteCorrelativo`) — ya validado con pruebas reales
generando múltiples códigos consecutivos sin colisión.

---

## 5. Validaciones — ya implementadas y probadas

Archivo de referencia: `src/core/validaciones.js`. Reglas ya verificadas con casos
válidos e inválidos:

- **`validarValoresProtocolo`**: obligatorios vacíos, tipo `numero` no numérico, tipo `fecha` inválida.
- **`validarLimiteFotos`**: bloquea a partir de 5 fotos por protocolo.
- **`validarTransicionEstado`**: valida contra el catálogo de 5 estados, evita transición al mismo estado.

Estas funciones son puras (sin UI ni base de datos directamente) para reusarse igual
en el editor, en modo campo, o en tests.

---

## 6. Estructura de carpetas del proyecto (KISS)

```
/app
  /src
    /main         → proceso principal Electron
    /renderer      → UI (editor, preview, campo, log)
      /editor
      /preview
      /campo
      /log
    /core          → lógica de negocio pura (código único, validaciones) — YA IMPLEMENTADO
    /db            → schema.sql, conexion.js, queries.js — YA IMPLEMENTADO
    /sync          → lógica de sincronización (exportar/importar paquetes, subida a Drive)
    /shared        → tipos y constantes comunes (lista de estados, tipos de dato)
  /assets
  /docs            → decisiones de diseño, este documento
```

**Principio clave a mantener:** `/core` y `/db` no deben depender de `/renderer` ni de
Electron directamente — así se pueden testear con Node puro (como ya se hizo con
`demo.js`) y migrar de SQLite a Firebase más adelante tocando solo `/db` y `/sync`.

---

## 7. Flujo funcional completo

### Paso 1 — Editor de plantilla (jefe de calidad)
- Cargar PDF del protocolo (pdf.js lo renderiza a canvas).
- Drag-and-drop para dibujar zonas rectangulares sobre el PDF.
- Al soltar una zona: popover con tipo de dato (botonera: texto/número/fecha/lista),
  obligatorio/opcional (check), ejemplo, descripción breve.
- Coordenadas se guardan **relativas** (0 a 1 sobre ancho/alto de página), no en píxeles
  absolutos, para que la zona no se desalinee entre pantallas distintas.
- Metadatos del formato: código de plantilla, versión, especialidad.
- Tabla resumen temporal de campos configurados (anti-duplicidad).

### Paso 2 — Vista previa
- Mismo PDF con las zonas rellenas con su dato de ejemplo.
- Color **verde** = obligatorio, color **ámbar** = opcional. Leyenda visible.
- Botón para pasar la plantilla a "producción" (disponible para modo campo).

### Paso 3 — Modo campo (usuario de campo)
- Login simple local (usuario/PIN).
- Formulario generado dinámicamente desde `template_fields` de la plantilla activa.
- Validación en tiempo real usando `validarValoresProtocolo`.
- Módulo de fotos: máximo 5, comprimidas al capturar, con descripción breve cada una.
- Al guardar: se genera el código único (`generarCodigoUnico`), y el protocolo queda
  en estado `en_proceso`, guardado localmente.

### Paso 4 — Sincronización
- El dispositivo de campo exporta solo lo nuevo/modificado desde la última sync
  (registros + referencias a fotos comprimidas).
- Sube el paquete a una carpeta compartida de Google Drive (`/Sync/entrada/`).
- Fotos se suben una por una (no como lote), para tolerar cortes de señal a mitad de sync.
- El jefe de calidad, al abrir la app, importa los paquetes pendientes, valida duplicados
  por código (capa de seguridad extra) y mueve los archivos a `/Sync/procesados/`.
- El log maestro es de **consolidación, no de edición paralela** (evita conflictos de sync).

### Paso 5 — Log maestro / dashboard
- Tarjetas resumen por estado (en_proceso, en_revision, en_firma, cerrado, anulado).
- Tabla filtrable por especialidad y estado.
- Detalle por protocolo: valores llenados, fotos, PDF escaneado firmado (si se adjuntó),
  historial completo de cambios de estado (quién, cuándo, de qué a qué).

---

## 8. Reglas de negocio a respetar siempre

- Un protocolo nace y vive en un solo dispositivo hasta que se sincroniza — nunca dos
  dispositivos editan el mismo protocolo en paralelo.
- Cada protocolo queda anclado a `version_usada` de su plantilla — si la plantilla
  cambia de versión, los registros viejos no se reinterpretan con el nuevo mapeo de zonas.
- La firma física es el cierre legal real. El estado `cerrado` en la app es una
  **declaración** de que el físico ya se firmó, no una firma electrónica con validez legal.
- Ningún registro se borra — `anulado` es un estado, no una eliminación (requisito de auditoría).
- Todo cambio de estado debe quedar en `historial_estado`, sin excepción.

---

## 9. Deuda técnica aceptada conscientemente (no ignorada, pospuesta)

- Las zonas se anclan solo a coordenadas relativas, no a texto de referencia del PDF.
  Si el layout cambia entre versiones de un formato, el mapeo de zonas debe rehacerse
  para la nueva versión — no se debe asumir que las coordenadas viejas siguen sirviendo.
- El log maestro no soporta edición concurrente — está aceptado para el volumen y
  escala del MVP.

---

## 10. Estado actual del desarrollo

**Ya construido y probado (ejecutar `npm install && npm run demo` para verificar):**
- Esquema de base de datos completo.
- Generación de código único, sin colisiones, 100% offline.
- Validaciones de campos, fotos y transición de estados.
- Queries de acceso a datos: crear plantilla, agregar campos, crear protocolo,
  cambiar estado con historial, resumen por estado, listar protocolos filtrado.
- Wireframes de baja fidelidad de las 4 pantallas (editor, preview, campo, log).

**Pendiente de construir (orden recomendado):**
1. UI del editor de plantillas (Electron + React + pdf.js sobre `/core` y `/db` ya existentes).
2. UI de vista previa.
3. UI de modo campo + login simple local + módulo de fotos con compresión (`sharp`).
4. Módulo de sincronización (`/sync`): exportación de paquetes, subida/bajada vía Google Drive API (scope `drive.file`), importación e integración en el dispositivo del jefe.
5. UI de log maestro / dashboard.
6. Manejo de versionado de plantillas en la UI del editor.
7. Onboarding mínimo para el jefe de calidad.

---

## 11. Nota para Claude Code

Este documento es el brief completo del proyecto. El código del núcleo (`/core` y `/db`,
sección 3-5) ya está implementado, probado con una demo funcional de punta a punta, y no
requiere reescritura — debe reusarse tal cual al construir la UI en Electron/React.
El trabajo pendiente es principalmente de interfaz (secciones 7 y 10), respetando las
reglas de negocio de la sección 8 y la estructura de carpetas de la sección 6.

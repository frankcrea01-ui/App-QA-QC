# Estado del proyecto — App de Trazabilidad de Protocolos de Calidad

> Informe de estado para revisión externa. Fecha: 2026-07-26.
> Escrito para exponer problemas, no para presentar avance. No contiene propuestas
> de solución.

**Cómo leer este documento:** todo lo afirmado acá fue verificado ejecutando el
código o leyendo el archivo citado. Donde no pude verificar algo, lo digo
explícitamente en vez de estimarlo.

---

## 1. Qué existe hoy, de verdad

Criterio usado: incluyo solo lo que un usuario puede recorrer de punta a punta.
Marco de forma separada **cómo** está probado cada cosa, porque "probado" no
significa lo mismo en todos los casos.

### Flujo completo que funciona

```
diseñar plantilla sobre el PDF → aprobar → llenar en obra → generar PDF llenado
→ imprimir → firmar a mano → escanear → cargar el escaneado → cerrado
```

Ese recorrido está cerrado y se puede hacer entero en la app hoy.

| Pantalla / función | Qué hace | Cobertura de pruebas |
|---|---|---|
| **Editor de plantillas** | Carga un PDF, dibuja zonas con el mouse sobre el canvas, configura etiqueta + tipo + obligatoriedad, navega páginas, tabla resumen con borrado | IPC y base sí; **el componente React no** |
| **Vista previa** | Muestra el PDF con las zonas superpuestas y su etiqueta; botón "Pasar a producción" | IPC y base sí; React no |
| **Versionado de plantillas** | Panel de plantillas existentes, "+ Nueva versión" hereda zonas y PDF de la vigente, una sola versión vigente por código, borradores retomables | Sí, a nivel queries + IPC |
| **Registro en obra** | Sesión persistente de obra/responsable con desplegables retroalimentados, selector de plantilla activa, formulario generado desde `template_fields`, validación por IPC contra `/core` | Sí, a nivel IPC |
| **Zonas automáticas** | `proyecto`, `responsable` y `correlativo` se llenan solos, no se le piden al registrador | Sí |
| **Correlativo visible** | Serie 001, 002… por formato y por obra; la v2 continúa la serie de la v1; un protocolo inválido no consume número | Sí |
| **Fotos** | Hasta 5 por protocolo, comprimidas con `sharp` a 1280px / JPEG 72 | Sí (IPC + compresión real) |
| **Generación del PDF llenado** | Escribe los valores sobre el formato original en sus coordenadas, parte el texto en líneas, achica la letra antes de recortar, dibuja ✓ con líneas, sanitiza caracteres que WinAnsi no soporta | **Sí, verificado numéricamente**: se relee el PDF generado con pdf.js y se comprueban las posiciones reales |
| **Cierre del ciclo** | Carga el escaneado firmado (PDF o foto), lo copia dentro de la app, cierra el protocolo automáticamente con responsable en el historial | Sí |
| **Log maestro** | Tarjetas por estado, tabla filtrable por especialidad y estado, detalle con valores, fotos e historial completo | Sí, a nivel IPC |
| **Onboarding** | Guía de 4 pasos, se muestra una vez y queda marcada | **Sin pruebas** |

### Qué significa "probado" acá

- **88 pruebas automatizadas**, todas pasando, con el runner nativo de Node.
  Distribución: `db` 17, `ipc` 19, `pdf` 14, `core` 12, `cierre` 8, `pdfFlujo` 8,
  `revision` 7, `migraciones` 3.
- **Ninguna de las 88 monta un componente React.** No hay ni una prueba de UI.
  Todo lo que dice "React no" en la tabla de arriba está respaldado únicamente
  por pruebas manuales del usuario.
- **La app nunca se ejecutó contra un PDF de protocolo real del cliente.** Todas
  las verificaciones de alineación se hicieron sobre PDFs sintéticos generados
  por `scripts/muestra-pdf.js`. Esta es la suposición no verificada más grande
  del proyecto: que el texto caiga sobre las líneas de un formato real es la
  razón de ser de la app y sigue sin comprobarse.
- **No se probó nunca el diálogo real de selección de archivos ni la apertura en
  el visor del sistema** (`shell.openPath`). Ambos se ejercitan con dobles.

---

## 2. Divergencias respecto a `CLAUDE.md`

### Aclaración necesaria antes de responder

**No existe `CLAUDE.md` en este proyecto.** Nunca existió. Lo verifiqué:

```
find . -maxdepth 3 -iname "CLAUDE.md" -not -path "./node_modules/*"   → sin resultados
ls .claude/                                                           → solo settings.local.json
```

**Tampoco existe `tokens.css`, ni ningún archivo de tokens de diseño**, ni una
sola variable CSS (`--nombre: valor`) en todo el proyecto.

Y **no hay ninguna regla escrita de "una fase por sesión"** en ningún documento
del repositorio.

Las tres premisas de esta sección apuntan a artefactos que no se crearon. No sé
si venían de otro proyecto o de una intención que no llegó a materializarse,
pero responder sobre ellas como si existieran sería inventar hallazgos.

Lo que sí existe son reglas de arquitectura escritas en otros dos lugares. Comparo
contra esas, que son las que este proyecto realmente se comprometió a cumplir:

- `brief-tecnico-app-protocolos.md` §6 (líneas 219-221)
- `README.md` líneas 56-62

### Divergencia real 1 — `/core` escribe SQL directamente

Es la violación más clara y no es menor.

`README.md:46` describe `db/` como la **"única capa que sabe de SQLite"**, y
`src/db/conexion.js:9` lo repite: *"Esta es la ÚNICA capa que sabe que la base es
SQLite — si en el futuro se migra a Firebase/Supabase, solo se reescribe este
archivo y src/sync/"*.

Pero `/core` ejecuta SQL crudo en dos archivos:

| Archivo:línea | Qué hace |
|---|---|
| `src/core/codigoUnico.js:60-62` | `SELECT valor FROM config_dispositivo WHERE clave = 'id_dispositivo'` |
| `src/core/codigoUnico.js:76-78` | `INSERT INTO config_dispositivo ...` |
| `src/core/codigoUnico.js:91` | `SELECT valor FROM config_dispositivo WHERE clave = ?` |
| `src/core/codigoUnico.js:96-99` | `INSERT ... ON CONFLICT(clave) DO UPDATE` |
| `src/core/correlativo.js:34` | `SELECT valor FROM config_dispositivo WHERE clave = ?` |
| `src/core/correlativo.js:37-40` | `INSERT ... ON CONFLICT(clave) DO UPDATE` |

Además de escribir SQL, `/core` depende de la **API de `better-sqlite3`**
específicamente: usa `db.prepare(...).get()` y `.run()`, que son sincrónicos y
propios de esa librería. Firebase y Supabase son asincrónicos.

Consecuencia concreta: la justificación declarada para la separación de capas
—"migrar a Firebase tocando solo `/db` y `/sync`"— no se cumple. Migrar
obligaría a reescribir `codigoUnico.js` y `correlativo.js`, que son justamente
la lógica que el brief marca como ya validada y que no había que tocar.

**Matiz honesto:** la regla textual del brief (§6, línea 219) dice *"`/core` y
`/db` no deben depender de `/renderer` ni de Electron directamente"*. Esa regla
literal **sí se cumple**. La violación es contra la afirmación más fuerte del
README y del propio comentario de `conexion.js`. Es decir: el código contradice
su propia documentación, pero no la línea exacta del brief.

### Divergencia real 2 — `/core` no importa React (esto sí está limpio)

Verificado: los únicos `require` en `src/core/*.js` son
`../shared/constantes`. Cero React, cero Electron, cero acceso a `window`.
`/core` y `/db` se prueban con Node puro, como el brief pedía.

### Divergencia real 3 — no hay sistema de tokens de diseño

No es una violación de una regla escrita (no existe tal regla), pero es un hecho
del estado actual: **24 valores de color distintos, hardcodeados**, repartidos en
6 archivos CSS sin ninguna variable compartida.

| Archivo | Colores hardcodeados |
|---|---|
| `src/renderer/editor/editor.css` | 31 apariciones |
| `src/renderer/log/log.css` | 14 |
| `src/renderer/app.css` | 9 |
| `src/renderer/campo/campo.css` | 7 |
| `src/renderer/onboarding/onboarding.css` | 3 |
| `src/renderer/preview/preview.css` | 1 |

El azul `#1565c0` aparece repetido en al menos `app.css` y `log.css`. El verde de
"obligatorio" y el ámbar de "opcional" —que son semánticos, definidos en el brief
§7 Paso 2— están escritos literalmente en cada archivo que los usa, sin nombre.

También hay estilos inline en JSX que mezclan layout con lógica:
`src/renderer/preview/VistaPrevia.jsx:105` (`marginLeft: 8`),
`src/renderer/App.jsx:99` (`display`),
`src/renderer/editor/EditorPlantilla.jsx:296` y `VistaPrevia.jsx:78` (`width`).
Los de `ZonaOverlay.jsx:71,84` y `ZonasRellenas.jsx:15` son posicionamiento
calculado en tiempo de ejecución y no podrían vivir en CSS.

### Divergencia real 4 — el orden de construcción del brief fue reemplazado

El brief §10 define 7 ítems pendientes en un orden recomendado. Ese orden **no se
siguió**: fue reemplazado a mitad del proyecto por un plan de 6 bloques distinto,
acordado en conversación y documentado en `docs/decisiones-ui.md`. El detalle está
en la sección 7 de este informe.

No hubo una regla de "una fase por sesión" que violar, pero sí hubo una
concentración notable: la primera sesión construyó **6 de los 7 ítems** del plan
original.

---

## 3. Funciones que se agregaron y no estaban en el plan original

Todas surgieron de pedidos explícitos del usuario o de problemas encontrados al
probar. Ninguna fue iniciativa unilateral sin pedido.

### 3.1 Generación de PDF llenado con `pdf-lib`

- **Qué se pidió:** *"si debe generar un pdf llenado, este es impreso en obra y
  firmado"*.
- **Por qué:** el brief nunca dijo cómo salía la información de la app al papel.
  Sin esto la app era un formulario que no producía nada imprimible, y la promesa
  central —regenerar un protocolo perdido— no existía.
- **Esfuerzo:** **grande.** Dependencia nueva (`pdf-lib`), dos módulos
  (`src/main/pdf/generarPdf.js`, `src/main/pdf/texto.js`, ~225 líneas), inversión
  del eje Y entre el editor (origen arriba-izquierda) y el PDF (origen
  abajo-izquierda), ajuste de texto multilínea con reducción de tamaño, dibujo
  del ✓ con dos líneas porque Helvetica no tiene el glifo, y sanitización WinAnsi
  porque las comillas tipográficas de Word hacían fallar la generación entera.
  22 pruebas entre `pdf.test.js` y `pdfFlujo.test.js`.

### 3.2 Correlativo visible del protocolo

- **Qué se pidió:** un tipo de zona `correlativo` que se llene solo.
- **Por qué:** el código único del brief (`EST-PROY01-JP68-0007-2026`) es interno
  y no sirve como número visible en un papel que ve un cliente o un auditor.
- **Esfuerzo:** **chico.** `src/core/correlativo.js`, 50 líneas. Serie por
  formato y por obra; la v2 continúa la serie de la v1; anular deja un hueco a
  propósito.
- **Nota:** este archivo es uno de los dos que escriben SQL en `/core` (ver §2).

### 3.3 Cierre automático al cargar el escaneado

- **Qué se pidió:** *"cuando se tenga la firma se carga en el log maestro y se
  cambia al estado cerrado, que debería ser automático una vez cargado"*.
- **Por qué:** el brief tenía cambios de estado manuales. El usuario quería que
  cargar el papel firmado fuera lo que cierra.
- **Esfuerzo:** **medio.** Reescritura de `src/main/ipc/log.js`, componente
  `CierreProtocolo.jsx` con indicador "Paso N de 3", copia del escaneado dentro
  de la app, carpeta `escaneados/`. 8 pruebas.

### 3.4 Copia de archivos dentro de la app (formatos y escaneados)

- **Qué se pidió:** no se pidió explícitamente; salió de la finalidad declarada
  (respaldo ante pérdida del papel).
- **Por qué:** originalmente `templates.ruta_pdf_origen` apuntaba al archivo
  donde el usuario lo tenía. Si movía esa carpeta, la plantilla quedaba sin poder
  regenerar protocolos.
- **Esfuerzo:** **chico**, pero cambió el modelo de almacenamiento: ahora la app
  tiene 4 carpetas propias (`plantillas/`, `protocolos/`, `escaneados/`, `fotos/`).

### 3.5 Sesión persistente de obra y responsable

- **Qué se pidió:** *"D6 podríamos dejarlo una primera vez y el resto se coloque
  como el anterior por defecto… También podría ser un desplegable"*.
- **Por qué:** el registrador tipeaba obra y responsable en cada protocolo.
- **Esfuerzo:** **chico.** Se guardan en `config_dispositivo`, sobreviven al
  cierre de la app, y los desplegables se retroalimentan de los protocolos ya
  cargados (`listarProyectosUsados`, `listarResponsablesUsados`).

### 3.6 Versionado con una sola versión vigente + herencia de zonas

- **Qué se pidió:** *"cuando coloque nueva versión, aparezca la configuración de
  esa plantilla, pero lista para editar… debe aparecer la versión vigente, no
  todas"*.
- **Por qué:** redibujar 30 zonas a mano por cada revisión de un formato es
  inviable. Y dos versiones vigentes a la vez significan que en obra alguien
  puede llenar la vieja.
- **Esfuerzo:** **medio.** `activarTemplate` se volvió excluyente,
  `PanelPlantillasExistentes.jsx` (140 líneas) agrupa por código y deduce
  vigente/borrador/reemplazada.

### 3.7 Migraciones de esquema

- **Qué se pidió:** nada. Fue consecuencia de cambiar los tipos de zona.
- **Por qué:** `schema.sql` usa `CREATE TABLE IF NOT EXISTS`, así que nunca
  modifica una tabla existente. Sin migración, la base del usuario habría quedado
  con el `CHECK` viejo rechazando los tipos nuevos.
- **Esfuerzo:** **medio.** `src/db/migraciones.js`, 105 líneas. Se probó sobre
  una copia de la base real del usuario antes de dejar que la app la tocara.
- **Estado:** tiene un defecto, ver §6.2.

### 3.8 Herramientas de desarrollo no pedidas

- `scripts/asegurar-binario.js` — recompila `better-sqlite3` según el destino
  (Node vs Electron ABI). **Esfuerzo chico, valor alto:** este problema bloqueó
  el arranque del proyecto durante horas.
- `scripts/limpiar-datos.js` (`npm run limpiar`) — borra todo lo almacenado para
  probar desde cero. Pedido explícito del usuario.
- `scripts/muestra-pdf.js` (`npm run muestra`) — genera un formato de prueba con
  recuadros visibles y su versión llenada.

### 3.9 Reducción de la configuración de campo (quita, no agrega)

- **Qué se pidió:** *"en configuración de campo habilitar solo Etiqueta"*.
- **Por qué:** simplificar para producir.
- **Efecto:** se retiraron de la UI `clave_campo` (ahora se genera sola desde la
  etiqueta), `ejemplo` y `descripcion`. Las columnas siguen en la base sin uso.

---

## 4. Funciones planeadas que quedaron a medias o se abandonaron

### Abandonadas por decisión explícita del usuario

| Función planeada | Dónde estaba | Qué pasó |
|---|---|---|
| **Login local usuario/PIN** | brief §2 y §7 Paso 3 | Eliminado. *"Qué opinas de dejar el módulo de usuario por ahora, y solo damos dos botones"*. Se reemplazó por dos modos por rol, sin autenticación. La trazabilidad se apoya en `id_dispositivo` y en el nombre que se firma en cada cambio de estado. |
| **Estado `en_revision`** | brief §3 y §7 Paso 5 | Retirado del catálogo (decisión D8). Hay una migración que lo borra solo si ningún protocolo lo usa. |
| **Tipos de dato `número` y `lista`** | brief §7 Paso 1 | Retirados (decisión D1). La migración los mapea a `texto`. |
| **`ejemplo` y `descripción` por zona** | brief §7 Paso 1 | Retirados de la UI (decisión D1). Columnas huérfanas en la base. |
| **Vista previa con datos de ejemplo** | brief §7 Paso 2 | Se construyó distinto: muestra las zonas con su **etiqueta**, no con un dato de ejemplo, porque el campo `ejemplo` desapareció. |
| **Descripción por foto** | brief §7 Paso 3 | Nunca se construyó la UI. La columna `fotos.descripcion` existe y siempre queda `NULL`. |
| **Campo `empresa` del protocolo** | brief §3 | Retirado del formulario. Columna huérfana. |

### No construidas

| Función planeada | Estado |
|---|---|
| **Módulo de sincronización `/sync`** | **La carpeta `src/sync/` existe y está completamente vacía.** Es el ítem 4 de los 7 del brief §10 y el único no construido. Bloqueado por credenciales OAuth (Client ID/Secret) que debe generar el usuario en Google Cloud Console. Sin esto: exportación de paquetes, subida/bajada por Drive, importación y deduplicación por código no existen. |
| **Checklist en matriz** | Planeado como bloque 5. No empezado. Requiere una columna `opciones` en `template_fields` que todavía no existe. El usuario describió esto como lo más importante que falta: *"es para hacer checklist, datos, comentario, firmas, fechas, etc. es lo complicado"*. |
| **Registro a dos columnas** (PDF a la izquierda con la zona activa resaltada, formulario a la derecha) | Planeado como bloque 5. No empezado. |
| **Árbol EDT / partidas** | Planeado como bloque 6. No empezado. Requiere una columna `partida` en `templates` y un catálogo sembrado por especialidad. |
| **Empaquetado / instalador** | Nunca estuvo en el plan explícito, pero no existe. No hay `electron-builder` ni equivalente. La app solo corre desde el código fuente con `npm run dev`. No se puede entregar a nadie. |

### A medias

- **Fotos.** Se pueden agregar y se comprimen bien, pero:
  - solo se pueden agregar **inmediatamente después de guardar** el protocolo;
    desde el log maestro no hay forma de agregar fotos a un protocolo existente;
  - **no se pueden ver**: tanto en `PanelFotos.jsx:44` como en
    `DetalleProtocolo.jsx:92` solo se lista el nombre de archivo y el tamaño en KB.
    Nunca se muestra la imagen.
  - las fotos **no salen en el PDF generado**. Existen en la base y en disco, y no
    aparecen en ningún entregable.

---

## 5. Estado real del modelo de datos

Esquema volcado de una base **recién creada** por `abrirBaseDeDatos()`, es decir,
`schema.sql` + las migraciones aplicadas. No es el esquema planeado en el brief.

```sql
CREATE TABLE estados_protocolo (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL UNIQUE,
  orden         INTEGER NOT NULL
);
-- filas sembradas:
-- en_proceso(1), en_firma(2), cerrado(3), anulado(4)

CREATE TABLE templates (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_plantilla  TEXT NOT NULL,
  nombre            TEXT NOT NULL,
  version           TEXT NOT NULL,
  especialidad      TEXT NOT NULL,
  activo            INTEGER NOT NULL DEFAULT 0,
  ruta_pdf_origen   TEXT,
  fecha_creacion    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(codigo_plantilla, version)
);

-- OJO: nombre entre comillas e indentación distinta. Esta tabla NO es la que
-- declara schema.sql: es la que reconstruye la migración migrarTiposDeZona.
-- Ver §6.2 — la migración se dispara incluso en bases nuevas.
CREATE TABLE "template_fields" (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          template_id   INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
          clave_campo   TEXT NOT NULL,
          etiqueta      TEXT NOT NULL,
          tipo_dato     TEXT NOT NULL,
          obligatorio   INTEGER NOT NULL DEFAULT 0,
          ejemplo       TEXT,
          descripcion   TEXT,
          pagina        INTEGER NOT NULL DEFAULT 1,
          x             REAL NOT NULL,
          y             REAL NOT NULL,
          ancho         REAL NOT NULL,
          alto          REAL NOT NULL,
          orden         INTEGER NOT NULL DEFAULT 0,
          UNIQUE(template_id, clave_campo)
        );

CREATE TABLE protocolos (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_protocolo   TEXT NOT NULL UNIQUE,
  template_id        INTEGER NOT NULL REFERENCES templates(id),
  version_usada      TEXT NOT NULL,
  proyecto           TEXT NOT NULL,
  empresa            TEXT,
  especialidad       TEXT NOT NULL,
  estado_id          INTEGER NOT NULL REFERENCES estados_protocolo(id),
  creado_por         TEXT NOT NULL,
  fecha_creacion     TEXT NOT NULL DEFAULT (datetime('now')),
  fecha_cierre       TEXT,
  pdf_escaneado_link TEXT,
  sincronizado       INTEGER NOT NULL DEFAULT 0,
  fecha_modificacion TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE protocolo_valores (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  protocolo_id        INTEGER NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
  template_field_id   INTEGER NOT NULL REFERENCES template_fields(id),
  valor                TEXT,
  UNIQUE(protocolo_id, template_field_id)
);

CREATE TABLE historial_estado (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  protocolo_id      INTEGER NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
  estado_anterior   TEXT,
  estado_nuevo      TEXT NOT NULL,
  fecha             TEXT NOT NULL DEFAULT (datetime('now')),
  usuario           TEXT NOT NULL
);

CREATE TABLE fotos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  protocolo_id   INTEGER NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
  ruta_local     TEXT NOT NULL,
  ruta_nube      TEXT,
  descripcion    TEXT,
  orden          INTEGER NOT NULL,
  tamano_kb      INTEGER,
  fecha_captura  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE config_dispositivo (
  clave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL
);

CREATE INDEX idx_protocolos_estado ON protocolos(estado_id);
CREATE INDEX idx_protocolos_especialidad ON protocolos(especialidad);
CREATE INDEX idx_protocolo_valores_protocolo ON protocolo_valores(protocolo_id);
```

### Observaciones sobre el modelo tal como está

**Columnas que existen y nunca se escriben:**

| Columna | Situación |
|---|---|
| `protocolos.empresa` | Siempre `NULL`. Se retiró del formulario. |
| `protocolos.sincronizado` | Siempre `0`. No hay módulo de sync que lo mueva. |
| `template_fields.ejemplo` | Siempre `NULL` desde el bloque 1. |
| `template_fields.descripcion` | Siempre `NULL` desde el bloque 1. |
| `fotos.descripcion` | Siempre `NULL`. La UI nunca la pide. |
| `fotos.ruta_nube` | Siempre `NULL`. Depende del sync inexistente. |

**`config_dispositivo` es una tabla de propósito general sobrecargada.** Empezó
guardando solo `id_dispositivo`. Hoy guarda, sin ningún esquema que lo declare:

- `id_dispositivo`
- `correlativo_<año>` (correlativo del código único)
- `correlativo_visible_<codigo_plantilla>_<proyecto>` (serie visible, una clave
  por combinación formato×obra — crece sin límite)
- `sesion_proyecto`, `sesion_responsable`
- `onboarding_visto`

Todo como texto plano clave-valor. No hay forma de saber qué claves son válidas
mirando el esquema.

**`historial_estado.estado_anterior` y `estado_nuevo` son texto libre**, no claves
foráneas a `estados_protocolo`. Nada impide escribir un estado inexistente ahí.

**Granularidad temporal de un segundo.** Todos los `datetime('now')` tienen
resolución de segundos. Esto ya causó un bug real (dos versiones de plantilla
creadas en el mismo segundo hacían desaparecer un borrador del panel), corregido
ordenando por `id`. La granularidad sigue igual en el resto de las tablas.

**Diferencias contra el esquema planeado en el brief §3:**

- El brief tenía 5 estados incluyendo `en_revision` (con `anulado` en orden 5).
  El actual tiene 4.
- El brief declaraba `CHECK (tipo_dato IN ('texto','numero','fecha','lista'))`.
  Se eliminó; la validación vive ahora en `queries.agregarCampoATemplate:50`.
- Los tipos de zona reales hoy son:
  `texto`, `fecha`, `check`, `correlativo`, `proyecto`, `responsable`.

---

## 6. Deuda técnica conocida

Cosas que sé que están mal y se dejaron pasar. Ordenadas por lo que más me
preocupa.

### 6.1 El proyecto no está bajo control de versiones

```
git rev-parse --is-inside-work-tree
→ fatal: not a git repository
```

**No hay repositorio git.** Existe un `.gitignore` bien escrito, pero nunca se
corrió `git init`. Consecuencias del estado actual:

- No hay historial. Nada de lo que se construyó en semanas se puede revisar,
  comparar ni revertir.
- Los "bloques" de construcción no tienen commits: la única traza de qué se hizo
  en cada uno son los documentos y la lista de tareas.
- Un error destructivo no tiene vuelta atrás.
- Este informe describe un estado que no se puede verificar contra ninguna
  historia — todo lo que digo en §7 lo reconstruí de memoria y de documentos, no
  de commits.

Es la deuda más grande del proyecto y no es técnica de código: es de proceso.

### 6.2 La migración de esquema se dispara en bases nuevas, por un comentario

Defecto encontrado mientras escribía este informe. `migrarTiposDeZona` decide si
tiene que correr así (`src/db/migraciones.js:24`):

```js
if (!tabla || !tabla.sql.includes('CHECK')) return false;
```

Pero `schema.sql:43` contiene, dentro de un **comentario**:

```sql
-- Sin CHECK a propósito: la lista de tipos válidos vive en /shared/constantes.js
```

La palabra `CHECK` está en el comentario, no en una restricción. Verificado sobre
una base nueva:

```
1a apertura (base nueva): {"tiposDeZona":true,  "estadoEnRevision":false}
2a apertura:              {"tiposDeZona":false, "estadoEnRevision":false}
contiene la palabra CHECK? false
tiene un CHECK real?       false
```

Toda instalación nueva reconstruye `template_fields` sin necesidad, con
`foreign_keys = OFF`, un `DROP TABLE` y un `RENAME`, la primera vez que se abre.
Después no vuelve a pasar, porque la tabla reconstruida ya no lleva el comentario.

Efectos observables: la tabla real queda con el nombre entrecomillado y sin
ninguno de los comentarios del esquema (los que documentan que `x`/`y` son
relativos 0..1). Las 3 pruebas de `migraciones.test.js` no lo detectan porque
construyen el esquema viejo con un `CHECK` de verdad.

No corrompe datos, pero significa que la detección de "¿esta migración ya se
aplicó?" está basada en una coincidencia de texto frágil.

### 6.3 Cero pruebas de interfaz

88 pruebas, ninguna monta un componente React. Todo lo que el usuario ve —el
editor de zonas, el canvas, el arrastre del mouse, los formularios, la navegación
entre modos— está cubierto **solo por pruebas manuales**.

Los bugs de UI encontrados hasta ahora lo fueron por inspección de código o por
el usuario probando, nunca por una prueba. Al menos tres eran de pérdida de datos
del usuario (progreso del editor perdido al ir a vista previa; perdido al cambiar
de sección; borradores sin forma de aprobarse).

### 6.4 `/core` acoplado a SQLite

Detallado en §2. Resumen: `codigoUnico.js` y `correlativo.js` escriben SQL y usan
la API sincrónica de `better-sqlite3`, contradiciendo lo que dicen `README.md:46`
y `conexion.js:9`.

### 6.5 Reemplazar un escaneado no deja rastro de auditoría

Sustituir el PDF firmado de un protocolo ya cerrado solo actualiza
`fecha_modificacion`. No genera entrada en `historial_estado` porque no hay cambio
de estado, y esa tabla solo registra estados.

Para una auditoría estricta, cambiar el documento firmado de un protocolo cerrado
es exactamente el evento que habría que poder rastrear. Se lo señalé al usuario al
cerrar el bloque 4 y quedó pendiente de decisión.

### 6.6 La especialidad es texto libre

`FormMetadatosPlantilla.jsx:43-53` usa `<input list="...">`, no un `<select>`. El
usuario puede escribir cualquier cosa. Si no coincide con las 7 claves de
`PREFIJOS_ESPECIALIDAD`, `codigoUnico.js:37` cae en un comodín:

```js
return clave.slice(0, 3).toUpperCase().padEnd(3, 'X');
```

Un error de tipeo como `"instalaciones sanitaria"` (singular) genera prefijo
`INS` en vez de `SAN`, silenciosamente. Además, el filtro de especialidad del log
maestro se arma con las 7 canónicas, así que una plantilla con especialidad
tipeada distinto **nunca aparece al filtrar**.

### 6.7 `meta:leerPdf` lee cualquier ruta del sistema

`src/main/ipc/meta.js:23-28` recibe una ruta desde el renderer y devuelve el
contenido del archivo si termina en `.pdf`. No valida que esté dentro de las
carpetas de la app. En una app local de un solo usuario el riesgo práctico es
bajo, pero es una superficie del proceso principal sin restricción.

### 6.8 No hay empaquetado

No existe configuración de `electron-builder` ni equivalente. La app solo se
ejecuta con `npm run dev` desde el código fuente, con Vite y Electron corriendo en
paralelo. **No hay forma de entregarla a un usuario final.** Para un producto
cuyo objetivo es que lo use personal de obra, esto es una brecha grande entre lo
construido y lo usable.

### 6.9 Las fotos no llegan a ningún entregable

Se capturan, se comprimen y se guardan, pero no se pueden ver en la app (solo
nombre y KB) ni se incorporan al PDF generado. Hoy son datos que entran y no
salen por ningún lado.

### 6.10 Deuda aceptada conscientemente desde el brief (§9), todavía vigente

- Las zonas se anclan **solo a coordenadas relativas**, no a texto de referencia
  del PDF. Si el layout cambia entre versiones de un formato, el mapeo hay que
  rehacerlo. Se mitigó con un aviso en la UI al heredar zonas, no con una
  solución técnica.
- El log maestro no soporta edición concurrente.

### 6.11 Artefactos de build en el árbol del proyecto

`dist/` y `muestras/` están en el directorio (ambos listados en `.gitignore`, que
no tiene efecto porque no hay repositorio). `assets/` está vacía. `src/sync/`
está vacía.

---

## 7. Historial de fases

**Advertencia sobre esta sección:** sin repositorio git no hay forma de verificar
qué se hizo en cada sesión. Lo que sigue está reconstruido a partir de
`docs/decisiones-ui.md`, la lista de tareas y el historial de conversación. Las
fronteras entre sesiones son aproximadas; el contenido de cada una es fiable.

### El plan original (brief §10) — 7 ítems

1. UI del editor de plantillas
2. UI de vista previa
3. UI de modo campo + login local + fotos
4. Módulo de sincronización `/sync`
5. UI de log maestro / dashboard
6. Versionado de plantillas en la UI
7. Onboarding mínimo

### Qué pasó realmente

| Sesión | Qué se suponía que era | Qué se construyó realmente | Divergencia |
|---|---|---|---|
| **1** | Ítem 1: editor de plantillas | Ítems **1, 2, 3, 5, 6 y 7**: shell de Electron, editor, vista previa, modo campo con fotos, log maestro, versionado y onboarding | **Muy grande.** Una sesión cubrió 6 de los 7 ítems. Solo quedó fuera el sync (ítem 4), bloqueado por credenciales. |
| **2** | — (continuación) | Completar pendientes de lo anterior | — |
| **3** | Depuración | *"Prueba y corrige los posibles bugs, reorganiza con filosofía KISS"*. Reorganización de los handlers IPC en un módulo por área, pruebas | No estaba en el plan; fue pedido explícito |
| **4** | Simplificación | El usuario retira el módulo de usuario/PIN: *"solo damos dos botones"*. Se reemplaza por dos modos por rol | Abandono de una función del brief §2 y §7 |
| **5** | Evaluación de 8 observaciones del usuario | **Entrevista de diseño** (skill `entrevistador-procesos`) → decisiones D1 a D9 → **el plan de 7 ítems se reemplaza por uno de 6 bloques** | **El pivote central del proyecto.** A partir de acá el brief §10 deja de ser la hoja de ruta. |
| **6** | Bloque 1: limpiar el editor | Tipos de zona reducidos, fuera ejemplo/descripción/clave, retiro de `en_revision`, migraciones, arreglo de pérdida de progreso al volver de vista previa | Cumplido |
| **7** | (dentro del bloque 1) | Ajustes pedidos: una sola versión vigente, nueva versión hereda zonas y PDF, panel muestra solo la vigente | Ampliación del bloque 1 |
| **8** | Bloque 2: registro en obra simplificado | Sesión persistente obra/responsable, desplegables retroalimentados, campos automáticos resueltos en el main | Cumplido |
| **9** | Bloque 3: generar el PDF llenado | `pdf-lib`, ajuste de texto, coordenadas con eje Y invertido, correlativo visible, copia del formato dentro de la app | Cumplido. El bloque más grande. |
| **10** | Bloque 4: cerrar el ciclo | Carga del escaneado → cierre automático, copia dentro de la app, "Paso N de 3", `log:abrirEscaneado` | Cumplido |
| **11 (actual)** | Bloque 5 | **No se construyó el bloque 5.** El usuario pidió revisar lo hecho antes de continuar. Se encontraron y corrigieron 4 bugs (uno de auditoría, uno de pérdida de datos, dos de UI), se agregó la decisión D18 y 7 pruebas nuevas | Desvío deliberado, a pedido |

### Plan vigente al día de hoy (docs/decisiones-ui.md)

1. ✅ Limpiar el editor
2. ✅ Registro en obra simplificado
3. ✅ Generar el PDF llenado
4. ✅ Cerrar el ciclo
5. ⬜ **Checklist en matriz + registro a dos columnas** — no empezado
6. ⬜ **Árbol EDT** — no empezado

Fuera de este plan y sin fecha: el módulo de sincronización con Google Drive.

### Observación sobre el patrón de trabajo

El proyecto cambió de método a mitad de camino. Las primeras sesiones fueron de
construcción amplia y rápida (una sesión, seis ítems). Desde la sesión 5 pasó a
un ritmo de un bloque por sesión, con prueba manual del usuario entre bloques y
decisiones documentadas (D1–D18) antes de escribir código.

El segundo método encontró más problemas: los cuatro bugs de la última revisión
son todos de código escrito bajo el primer método.

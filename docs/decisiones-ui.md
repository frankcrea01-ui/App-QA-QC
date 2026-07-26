# Decisiones de diseño de la UI (D1–D9)

> Complementa `brief-tecnico-app-protocolos.md`. Ese documento define el núcleo
> de datos y lógica; este define cómo se comporta la interfaz y por qué.
> Fecha: 25 de julio de 2026.

## Cambio de fondo: la app genera el PDF llenado

El flujo real quedó confirmado y **cambia la naturaleza de la app**:

```
llenar en la app → generar PDF llenado → imprimir en obra → firmar a mano
→ escanear → cargar el escaneado → cerrado
```

El propósito es que, si se pierden los protocolos físicos, se puedan **regenerar
con sus datos** y solo requieran firma nuevamente.

Esto no contradice el brief: la app sigue sin firmar nada. Solo imprime lo que
después se firma a mano, y la firma física sigue siendo el cierre legal real.

Consecuencia técnica: hace falta escribir sobre el PDF (`pdf-lib`), no solo
mostrarlo (`pdf.js`). Las coordenadas relativas dejan de ser una guía visual y
pasan a ser críticas.

---

## D1 — Tipos de zona

Seis tipos, cada uno responde a "¿qué va acá?":

| Tipo | Quién lo llena |
|---|---|
| `texto` | el registrador escribe |
| `fecha` | el registrador elige en un calendario |
| `check` | el registrador marca (matriz de checklist) |
| `correlativo` | automático — 001, 002, 003 |
| `proyecto` | automático — dato de la obra |
| `responsable` | automático — quien está llenando |

**Descartados:** `lista` (nunca se implementó, se comportaba como texto) y
`numero` (un valor numérico se escribe igual como texto y el destino es
imprimirlo en papel; validar que sea numérico aportaba poco frente a la
simplicidad ganada).

La configuración de un campo se reduce a **etiqueta + obligatorio + tipo**.
Se eliminan `ejemplo` y `descripcion`, y la columna `clave` deja de mostrarse
(es un identificador interno, se genera solo a partir de la etiqueta).

**Firmas:** no requieren tipo. Lo que el editor no dibuja, el PDF lo deja en
blanco para firmar a mano.

## D2 — Correlativo

Es el **número visible impreso en el papel** (001, 002…), distinto del
`codigo_protocolo` interno (`EST-PROY01-JP68-0001-2026`). Ambos conviven.

- Contador **por plantilla + obra**: cada formato lleva su propia serie en esa obra.
- Se asigna al crear el protocolo y **no se puede editar nunca**, ni desde el
  log maestro.

**Por qué no se renumera:** si un protocolo se anula queda un hueco en la serie,
y eso es correcto. En auditoría, un hueco explicado por un estado `anulado` vale
más que una renumeración — renumerar es exactamente lo que se lee como
manipulación del registro.

## D3 — Checklist en matriz

Una tabla de 20 ítems × 3 columnas serían 60 zonas dibujadas a mano. En su lugar:

- El editor dibuja **un rectángulo** sobre toda la tabla y declara
  "N filas × M columnas", nombrando las columnas (ej. Cumple / No cumple / N/A).
- La app divide la grilla y genera N campos de M opciones.
- El registrador ve N filas con M opciones; la ✓ se imprime en el centro de la
  celda elegida.

**Supuesto:** filas de alto uniforme (lo habitual). Si una tabla es irregular, se
dibujan varias matrices. La vista previa muestra la grilla superpuesta para
verificar la alineación antes de aprobar.

Las descripciones de cada ítem ya están impresas en el PDF, así que no se
guardan: los campos se llaman "Ítem 1, Ítem 2…". Esto **solo se entiende con el
PDF a la vista**, por eso D3 y D5 se construyen juntos.

## D4 — Texto largo

Ajuste automático dentro de la zona: salta de línea de izquierda a derecha y de
arriba a abajo; si aún no entra, reduce el tamaño de letra hasta un mínimo
legible. Si ni así entra, **avisa al registrador mientras escribe** que el texto
no va a caber.

No se recorta ni se limita la cantidad de caracteres: no se pierde información, y
el aviso evita que salga un PDF ilegible.

## D5 — Registro en obra a dos columnas

PDF grande a la izquierda, formulario angosto a la derecha. Al enfocar un campo
se resalta su zona y el PDF salta solo a esa página. Así el registrador sabe
**qué llenar y dónde**.

Se descartó escribir directamente sobre el PDF (WYSIWYG): se vuelve incómodo con
zonas chicas y con las matrices de checklist.

## D6 — Proyecto y responsable

Ninguno se escribe en cada protocolo. Ambos son **desplegables que se
retroalimentan**: texto libre la primera vez, y desde ahí una lista de los
valores ya usados, con el último como opción por defecto.

No requieren pantalla de configuración ni tabla nueva: la lista sale de los
propios protocolos (`SELECT DISTINCT`). El sistema se alimenta de sus datos.

- **`proyecto`** se mantiene porque alimenta el código único (unicidad offline
  entre obras), permite separar obras cuando el jefe consolide varios
  dispositivos, y se imprime solo en la casilla "Proyecto" del formato.
- **`responsable`** queda registrado por protocolo y por cambio de estado. Sin
  login: filtrando el log maestro se ve si llena una sola persona o varias.
- **`empresa`** se retira de la interfaz. La columna queda en la base (nullable,
  sin uso) por si más adelante se pide.

`creado_por` pasa a ser el responsable elegido. El dispositivo sigue
identificado dentro del código único, que es donde cumple su función.

## D7 — Árbol EDT de partidas

Se agrega un nivel de **partida** entre especialidad y plantilla, precargado con
las partidas habituales del rubro:

- **Estructuras:** muro anclado, cimentaciones, cisterna, verticales, horizontales
- **Arquitectura:** asentado de ladrillo, solaqueo, tarrajeo, enchapes, pintura
- **Instalaciones sanitarias:** estanqueidad (casco), hidrostática (casco),
  hidrostática (acabados), escorrentía
- **Instalaciones eléctricas:** megado
- **Gas:** hermeticidad

El panel de plantillas se convierte en ese árbol y muestra también las partidas
**sin plantilla**, para ver la cobertura de un vistazo:

```
Estructuras
  ├─ Cimentaciones ......... PROT-CIM  v1 (activa), v2 (borrador)
  ├─ Muro anclado .......... PROT-MUR  v1 (activa)
  └─ Cisterna .............. — sin plantilla —
```

Los PDFs los aporta cada empresa (cada constructora tiene su propio formato);
lo que se precarga es solo la clasificación, que sí es estándar del rubro.

La hidrostática se hace en dos etapas (casco y antes de enchapar) y se modela
como **dos partidas distintas**, para no introducir el concepto de "etapa".

## D8 — Estados

Se retira `en_revision`: el flujo real no lo usa. Quedan cuatro.

| Evento | Estado resultante |
|---|---|
| El registrador guarda el protocolo | `en_proceso` |
| Se exporta/imprime el PDF llenado | `en_firma` (automático) |
| Se carga el escaneado firmado | `cerrado` (automático) |
| Se vuelve a cargar un escaneado | sigue `cerrado`, reemplaza el archivo |
| Decisión manual | `anulado` |

Solo `anulado` requiere intervención humana. Como los cierres son automáticos,
el responsable configurado es quien firma el `historial_estado` — sin él no
habría trazabilidad de quién cerró.

## D9 — Datos de obra impresos

`proyecto` y `responsable` existen como tipos de zona (ver D1) para que se
impriman solos en el formato. Sin esto, el registrador tendría que tipearlos
como texto común en cada protocolo, que es justamente lo que se eliminó.

## D18 — `anulado` es terminal

*Decidido en la revisión de los bloques 1 a 4.*

Un protocolo anulado **no cambia de estado como efecto secundario de otra
acción**. Cargar el escaneado firmado en un anulado se rechaza; antes hay que
reactivarlo a propósito desde el detalle, y esa reactivación queda firmada en
`historial_estado`.

El resto del flujo sigue sin restricciones: corregir un estado mal puesto es
válido y queda registrado. La excepción es solo la salida de `anulado`.

Por qué: anular es la única decisión que la app deja enteramente en manos de
una persona (ver D8). Si un cierre automático pudiera deshacerla, bastaría con
cargar el escaneado en la fila equivocada del log —los códigos se parecen
mucho— para borrar una baja del registro sin que nadie se entere.

---

## Orden de construcción

Cada bloque deja la app en un estado verificable.

1. **Limpiar el editor** — configuración de campo reducida (D1), fuera
   ejemplo/descripción/clave, arreglo de la pérdida de progreso al volver de la
   vista previa, retiro de `en_revision` (D8).
2. **Registro en obra simplificado** — fuera código de proyecto y empresa del
   formulario; proyecto y responsable como desplegables retroalimentados (D6);
   fecha con selector.
3. **Generar el PDF llenado, con los tipos simples** — `pdf-lib` escribiendo
   texto, fecha, correlativo, proyecto y responsable en sus coordenadas, con
   ajuste automático de texto (D4). Al exportar → `en_firma`.
   *Va antes que la matriz a propósito: es la pieza de mayor riesgo técnico
   (que lo impreso caiga exactamente sobre las líneas del formato real), y
   conviene descubrir un problema de alineación acá y no tres bloques después.*
4. **Cerrar el ciclo** — cargar el escaneado → `cerrado` automático con
   responsable en el historial; recargar reemplaza sin cambiar el estado.
5. **Checklist en matriz + registro a dos columnas** (D3 + D5, juntos porque se
   necesitan mutuamente) y extensión del generador de PDF para dibujar las ✓.
   *Acá la app cubre protocolos reales completos: datos, checklist, comentarios
   y firmas.*
6. **Árbol EDT** (D7).

Pendiente fuera de este alcance: el módulo de sincronización con Google Drive,
que requiere credenciales OAuth propias.

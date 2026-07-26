# App de Trazabilidad de Protocolos de Calidad

Aplicación de escritorio (Electron + React) para digitalizar protocolos de calidad
de obra: diseñar plantillas sobre el PDF original, llenarlas en terreno y mantener
un log maestro con trazabilidad completa.

El detalle de decisiones, esquema de datos y reglas de negocio está en
[`brief-tecnico-app-protocolos.md`](brief-tecnico-app-protocolos.md).

## Comandos

```bash
npm install
```

| Comando | Para qué |
|---|---|
| `npm run dev` | Levanta la app (Vite + Electron). |
| `npm test` | Suite de pruebas de `/core`, `/db` y los handlers IPC. |
| `npm run demo` | Recorre el núcleo de punta a punta por consola, sin UI. |
| `npm run build` | Compila el renderer a `dist/renderer`. |

`better-sqlite3` es un módulo nativo y necesita binarios distintos para Node y
para Electron. No hay que acordarse de nada: `scripts/asegurar-binario.js` lo
recompila solo cuando hace falta, antes de cada comando.

## Los dos modos

La app se organiza por rol, no por pantalla:

- **Oficina de calidad** — el jefe de calidad diseña plantillas (editor sobre el
  PDF + vista previa) y supervisa el **log maestro**.
- **Registro en obra** — el personal de terreno elige un protocolo y lo llena.
  Sin login ni pasos previos: cada registro queda identificado por el
  `id_dispositivo`, y quien cambia un estado firma con su nombre en el historial.

Una plantilla nace como **borrador** y solo llega a obra cuando se aprueba
explícitamente en la vista previa ("Pasar a producción").

## Estructura

```
src/
  shared/constantes.js   → estados, tipos de dato, límites (fuente única)
  core/                  → lógica de negocio pura: código único, validaciones
  db/                    → schema.sql, conexión, queries (única capa que sabe de SQLite)
  main/                  → proceso principal de Electron
    ipc/                 → handlers, uno por área (meta, templates, config, protocolos, log)
    preload.js           → única superficie que el renderer ve del main
  renderer/              → UI en React
    editor/ preview/ campo/ log/ onboarding/
tests/                   → pruebas con el runner nativo de Node
scripts/                 → utilidades de build
```

Reglas que sostienen la arquitectura:

- `/core` y `/db` no dependen de React ni de Electron — por eso se pueden probar
  con Node puro y migrar a Firebase/Supabase tocando solo `/db` y `/sync`.
- El renderer nunca toca SQLite: todo pasa por `window.api` (ver `preload.js`).
- Las reglas de negocio viven una sola vez en `/core`. La UI no tiene copias
  propias: valida por IPC contra las mismas funciones.

## Estado

Construido: editor de plantillas, vista previa, registro en obra con fotos
comprimidas, log maestro, versionado de plantillas y onboarding.

Pendiente: el módulo de **sincronización** (`/sync`) con Google Drive, que
requiere credenciales OAuth propias (Client ID/Secret desde Google Cloud Console).

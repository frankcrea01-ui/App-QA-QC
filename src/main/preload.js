const { contextBridge, ipcRenderer } = require('electron');

/**
 * Única superficie que el renderer ve del proceso principal. Cada método
 * mapea 1 a 1 con un handler de src/main/ipc/ — si algo no está acá, la UI
 * no puede hacerlo.
 */
contextBridge.exposeInMainWorld('api', {
  meta: {
    constantes: () => ipcRenderer.invoke('meta:constantes'),
    elegirPdf: () => ipcRenderer.invoke('meta:elegirPdf'),
    leerPdf: (rutaArchivo) => ipcRenderer.invoke('meta:leerPdf', rutaArchivo),
  },
  templates: {
    crear: (datos) => ipcRenderer.invoke('templates:crear', datos),
    agregarCampo: (templateId, campo) => ipcRenderer.invoke('templates:agregarCampo', templateId, campo),
    obtenerCampos: (templateId) => ipcRenderer.invoke('templates:obtenerCampos', templateId),
    activar: (templateId) => ipcRenderer.invoke('templates:activar', templateId),
    listarActivos: (filtro) => ipcRenderer.invoke('templates:listarActivos', filtro),
    listarTodas: () => ipcRenderer.invoke('templates:listarTodas'),
  },
  config: {
    obtenerSesion: () => ipcRenderer.invoke('config:obtenerSesion'),
    guardarSesion: (datos) => ipcRenderer.invoke('config:guardarSesion', datos),
    obtenerOnboardingVisto: () => ipcRenderer.invoke('config:obtenerOnboardingVisto'),
    marcarOnboardingVisto: () => ipcRenderer.invoke('config:marcarOnboardingVisto'),
    obtenerOficina: () => ipcRenderer.invoke('config:obtenerOficina'),
    guardarOficina: (config) => ipcRenderer.invoke('config:guardarOficina', config),
  },
  protocolos: {
    sugerencias: () => ipcRenderer.invoke('protocolos:sugerencias'),
    validar: (templateId, valores) => ipcRenderer.invoke('protocolos:validar', templateId, valores),
    crear: (datos) => ipcRenderer.invoke('protocolos:crear', datos),
    generarPdf: (protocoloId) => ipcRenderer.invoke('protocolos:generarPdf', protocoloId),
  },

  log: {
    resumenPorEstado: () => ipcRenderer.invoke('log:resumenPorEstado'),
    listarProtocolos: (filtro) => ipcRenderer.invoke('log:listarProtocolos', filtro),
    obtenerDetalle: (protocoloId) => ipcRenderer.invoke('log:obtenerDetalle', protocoloId),
    cambiarEstado: (datos) => ipcRenderer.invoke('log:cambiarEstado', datos),
    adjuntarPdfEscaneado: (datos) => ipcRenderer.invoke('log:adjuntarPdfEscaneado', datos),
    abrirEscaneado: (protocoloId) => ipcRenderer.invoke('log:abrirEscaneado', protocoloId),
  },
});

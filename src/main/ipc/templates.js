const fs = require('fs');
const path = require('path');

const queries = require('../../db/queries');

/**
 * Editor de plantillas y su versionado. Handlers delgados a propósito:
 * la lógica vive en /db y /core.
 */
function registrar(ipcMain, { db, carpetaPlantillas }) {
  ipcMain.handle('templates:crear', (event, datosTemplate) => {
    const templateId = queries.crearTemplate(db, datosTemplate);

    // El formato se copia adentro de la app. Si quedara apuntando al archivo
    // original, mover o borrar ese PDF dejaría a la plantilla sin poder
    // regenerar protocolos — que es justamente para lo que existe la app.
    const origen = datosTemplate.ruta_pdf_origen;
    if (origen && fs.existsSync(origen)) {
      fs.mkdirSync(carpetaPlantillas, { recursive: true });
      const destino = path.join(carpetaPlantillas, `plantilla-${templateId}.pdf`);
      fs.copyFileSync(origen, destino);
      queries.actualizarRutaPdfDeTemplate(db, templateId, destino);
    }

    return templateId;
  });

  ipcMain.handle('templates:agregarCampo', (event, templateId, campo) =>
    queries.agregarCampoATemplate(db, templateId, campo));

  ipcMain.handle('templates:obtenerCampos', (event, templateId) =>
    queries.obtenerCamposDeTemplate(db, templateId));

  /**
   * Pasa una plantilla a producción. Sin zonas no se activa: en obra se
   * podría elegir, pero al guardar el protocolo fallaría — un formulario
   * vacío que no lleva a ningún lado.
   */
  ipcMain.handle('templates:activar', (event, templateId) => {
    if (queries.obtenerCamposDeTemplate(db, templateId).length === 0) {
      return {
        ok: false,
        mensaje: 'Esta plantilla no tiene ninguna zona dibujada, así que no se puede llenar en obra.',
      };
    }

    queries.activarTemplate(db, templateId);
    return { ok: true };
  });

  ipcMain.handle('templates:listarActivos', (event, filtro) =>
    queries.listarTemplatesActivos(db, filtro || {}));

  ipcMain.handle('templates:listarTodas', () => queries.listarTemplates(db));
}

module.exports = { registrar };

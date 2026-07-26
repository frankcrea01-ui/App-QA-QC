import React, { useEffect, useState } from 'react';

function sugerirSiguienteVersion(versiones) {
  const numeros = versiones
    .map((v) => /^v(\d+)$/i.exec(v.trim()))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10));
  if (numeros.length === 0) return '';
  return `v${Math.max(...numeros) + 1}`;
}

/**
 * Agrupa las plantillas por código y decide qué mostrar de cada una.
 *
 * Solo puede haber una versión vigente (activo=1). Las demás son:
 *  - borrador: creada después de la vigente y todavía sin aprobar
 *  - reemplazada: quedó atrás cuando se aprobó una nueva
 *
 * La base no marca esa diferencia, se deduce por el id: crece siempre y no
 * empata, a diferencia de fecha_creacion, que se mide en segundos.
 *
 * Se listan **todos** los borradores, no solo el último. Un borrador que no
 * se muestra es un borrador que no se puede aprobar ni descartar: queda
 * ocupando una versión para siempre.
 */
function agruparPorCodigo(templates) {
  const grupos = new Map();

  for (const t of templates) {
    if (!grupos.has(t.codigo_plantilla)) grupos.set(t.codigo_plantilla, []);
    grupos.get(t.codigo_plantilla).push(t);
  }

  return [...grupos.entries()].map(([codigo, versiones]) => {
    // Vienen ordenadas por id DESC: la primera es la más nueva.
    const vigente = versiones.find((v) => v.activo === 1) || null;
    const borradores = vigente
      ? versiones.filter((v) => v.activo === 0 && v.id > vigente.id)
      : versiones.filter((v) => v.activo === 0);

    const reemplazadas = versiones.length - (vigente ? 1 : 0) - borradores.length;

    return {
      codigo,
      nombre: versiones[0].nombre,
      especialidad: versiones[0].especialidad,
      vigente,
      borradores,
      reemplazadas,
      // La nueva versión se calca de la vigente; si todavía no hay ninguna
      // aprobada, de lo último que se haya creado.
      origen: vigente || versiones[0],
      todasLasVersiones: versiones.map((v) => v.version),
    };
  });
}

export default function PanelPlantillasExistentes({ recargarToken, onElegirNuevaVersion, onRevisarBorrador }) {
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    let vigente = true;
    window.api.templates.listarTodas().then((t) => {
      if (vigente) setTemplates(t);
    });
    return () => {
      vigente = false;
    };
  }, [recargarToken]);

  const grupos = agruparPorCodigo(templates);

  if (grupos.length === 0) {
    return <p className="tabla-campos-vacia">Todavía no hay plantillas creadas.</p>;
  }

  return (
    <div className="panel-plantillas-existentes">
      <h2>Plantillas existentes</h2>
      <ul>
        {grupos.map((grupo) => (
          <li key={grupo.codigo}>
            <div className="plantilla-datos">
              <strong>{grupo.nombre}</strong>
              <span className="plantilla-meta">{grupo.codigo} · {grupo.especialidad}</span>
              <span className="plantilla-versiones">
                {grupo.vigente ? (
                  <span className="etiqueta-vigente">{grupo.vigente.version} vigente</span>
                ) : (
                  <span className="etiqueta-sin-vigente">sin versión en producción</span>
                )}
                {grupo.borradores.map((b) => (
                  <span key={b.id} className="etiqueta-borrador">{b.version} borrador</span>
                ))}
                {grupo.reemplazadas > 0 && (
                  <span className="etiqueta-reemplazadas">
                    {grupo.reemplazadas} reemplazada{grupo.reemplazadas === 1 ? '' : 's'}
                  </span>
                )}
              </span>
            </div>

            <div className="plantilla-acciones">
              {/* Un borrador sin este botón sería un callejón sin salida:
                  se ve en el panel pero no habría forma de aprobarlo. */}
              {grupo.borradores.map((borrador) => (
                <button
                  key={borrador.id}
                  type="button"
                  className="accion-borrador"
                  onClick={() =>
                    onRevisarBorrador({
                      templateId: borrador.id,
                      codigoPlantilla: grupo.codigo,
                      rutaPdfOrigen: borrador.ruta_pdf_origen,
                    })
                  }
                >
                  Revisar y aprobar {borrador.version}
                </button>
              ))}

              <button
                type="button"
                onClick={() =>
                  onElegirNuevaVersion({
                    templateIdOrigen: grupo.origen.id,
                    rutaPdfOrigen: grupo.origen.ruta_pdf_origen,
                    versionOrigen: grupo.origen.version,
                    codigo_plantilla: grupo.codigo,
                    nombre: grupo.nombre,
                    especialidad: grupo.especialidad,
                    version: sugerirSiguienteVersion(grupo.todasLasVersiones),
                  })
                }
              >
                + Nueva versión
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import CanvasPdf from '../editor/CanvasPdf.jsx';
import ZonasRellenas from './ZonasRellenas.jsx';
import '../editor/editor.css';
import './preview.css';

/**
 * Paso de verificación antes de liberar una plantilla a obra: muestra el
 * formato con las zonas superpuestas para confirmar que caen donde deben.
 * Aprobar acá es lo que la hace visible para el registrador.
 */
export default function VistaPrevia({ pdfBytes, templateId, codigoPlantilla, onVolver }) {
  const [campos, setCampos] = useState([]);
  const [paginaActual, setPaginaActual] = useState(1);
  const [numPaginas, setNumPaginas] = useState(1);
  const [dimensionesCanvas, setDimensionesCanvas] = useState({ ancho: 0, alto: 0 });
  const [activando, setActivando] = useState(false);
  const [activado, setActivado] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    window.api.templates.obtenerCampos(templateId).then((c) => {
      if (vigente) setCampos(c);
    });
    return () => {
      vigente = false;
    };
  }, [templateId]);

  const camposDePaginaActual = useMemo(
    () => campos.filter((c) => c.pagina === paginaActual),
    [campos, paginaActual]
  );

  function manejarRenderizado(info) {
    if (info.numPaginas) setNumPaginas(info.numPaginas);
    if (info.ancho && info.alto) setDimensionesCanvas({ ancho: info.ancho, alto: info.alto });
  }

  async function manejarActivar() {
    setError(null);
    setActivando(true);
    try {
      const resultado = await window.api.templates.activar(templateId);
      if (resultado && !resultado.ok) {
        setError(resultado.mensaje);
        return;
      }
      setActivado(true);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setActivando(false);
    }
  }

  return (
    <div className="editor-plantilla vista-previa">
      <h1>Vista previa — {codigoPlantilla}</h1>

      {pdfBytes ? (
        <>
          <div className="navegacion-paginas">
            <button type="button" disabled={paginaActual <= 1} onClick={() => setPaginaActual((p) => p - 1)}>
              ← Anterior
            </button>
            <span>
              Página {paginaActual} de {numPaginas}
              {' · '}
              {camposDePaginaActual.length} zona{camposDePaginaActual.length === 1 ? '' : 's'} aquí
            </span>
            <button type="button" disabled={paginaActual >= numPaginas} onClick={() => setPaginaActual((p) => p + 1)}>
              Siguiente →
            </button>
          </div>

          <div className="lienzo-container" style={{ width: dimensionesCanvas.ancho || undefined }}>
            <CanvasPdf datosPdf={pdfBytes} pagina={paginaActual} onRenderizado={manejarRenderizado} />
            {dimensionesCanvas.ancho > 0 && <ZonasRellenas camposDePagina={camposDePaginaActual} />}
          </div>

          <p className="leyenda">
            <span className="muestra-color zona-obligatoria" /> Obligatorio &nbsp;
            <span className="muestra-color zona-opcional" /> Opcional
          </p>
        </>
      ) : (
        // Pasa al retomar un borrador viejo cuyo PDF se movió o se borró.
        <p className="aviso-heredado">
          No se encontró el PDF original de esta plantilla, así que no se puede
          verificar visualmente dónde caen las zonas. Tiene {campos.length}{' '}
          zona{campos.length === 1 ? '' : 's'} configurada{campos.length === 1 ? '' : 's'}.
        </p>
      )}

      <div className="panel-guardar">
        <button type="button" onClick={onVolver} disabled={activando}>
          {activado ? 'Volver al editor' : 'Volver sin aprobar'}
        </button>
        <button
          type="button"
          onClick={manejarActivar}
          disabled={activando || activado}
          style={{ marginLeft: 8 }}
        >
          {activado ? 'En producción ✓' : activando ? 'Activando…' : 'Pasar a producción'}
        </button>
        {error && <p className="mensaje-error">{error}</p>}
        {activado && (
          <p className="mensaje-ok">
            Ya está disponible en obra. Si había una versión anterior, quedó reemplazada.
          </p>
        )}
      </div>
    </div>
  );
}

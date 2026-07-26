import React, { useMemo, useState } from 'react';
import FormMetadatosPlantilla from './FormMetadatosPlantilla.jsx';
import CanvasPdf from './CanvasPdf.jsx';
import ZonaOverlay from './ZonaOverlay.jsx';
import PopoverCampo from './PopoverCampo.jsx';
import TablaCampos from './TablaCampos.jsx';
import PanelPlantillasExistentes from './PanelPlantillasExistentes.jsx';
import VistaPrevia from '../preview/VistaPrevia.jsx';
import { useConstantes } from '../constantes.js';
import './editor.css';

let contadorIdLocal = 0;
const siguienteIdLocal = () => `campo-${++contadorIdLocal}`;

const METADATOS_VACIOS = { codigo_plantilla: '', nombre: '', version: '', especialidad: '' };
const SIN_PDF = { ancho: 0, alto: 0 };

/** Identificador interno estable derivado de la etiqueta. */
function slugificar(texto) {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * La clave nunca se le pide al usuario: se genera desde la etiqueta y, si dos
 * zonas se llaman igual, se desambigua sola (proyecto, proyecto_2…). Así se
 * respeta el UNIQUE(template_id, clave_campo) sin que nadie tenga que saberlo.
 */
function claveUnica(etiqueta, camposExistentes) {
  const base = slugificar(etiqueta) || 'zona';
  let clave = base;
  let n = 2;
  while (camposExistentes.some((c) => c.clave_campo === clave)) {
    clave = `${base}_${n}`;
    n += 1;
  }
  return clave;
}

export default function EditorPlantilla() {
  const { especialidades, tiposDato, tiposAutomaticos } = useConstantes();
  const [metadatos, setMetadatos] = useState(METADATOS_VACIOS);
  const [pdf, setPdf] = useState(null); // { rutaArchivo, datos }
  const [paginaActual, setPaginaActual] = useState(1);
  const [numPaginas, setNumPaginas] = useState(1);
  const [dimensionesCanvas, setDimensionesCanvas] = useState(SIN_PDF);
  const [campos, setCampos] = useState([]);
  const [zonaPendiente, setZonaPendiente] = useState(null);
  const [errorPopover, setErrorPopover] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [resultadoGuardado, setResultadoGuardado] = useState(null);
  const [errorGuardado, setErrorGuardado] = useState(null);
  const [recargarTemplates, setRecargarTemplates] = useState(0);
  // Plantilla que se está revisando en la vista previa, sea la que se acaba
  // de guardar o un borrador retomado desde el panel. Es un estado aparte
  // del trabajo en curso: entrar y salir de la vista previa no lo toca.
  const [previsualizando, setPrevisualizando] = useState(null);
  // De qué versión se heredaron las zonas, para pedir verificación visual.
  const [heredadoDe, setHeredadoDe] = useState(null);

  const camposDePaginaActual = useMemo(
    () => campos.filter((c) => c.pagina === paginaActual),
    [campos, paginaActual]
  );

  const metadatosCompletos = Object.values(metadatos).every((v) => v.trim());
  const puedeGuardar = metadatosCompletos && campos.length > 0 && pdf && !guardando;

  /** Reinicia lo que depende del PDF mostrado, sin tocar las zonas. */
  function reiniciarVistaPdf() {
    setPaginaActual(1);
    setNumPaginas(1);
    setDimensionesCanvas(SIN_PDF);
    setResultadoGuardado(null);
    setErrorGuardado(null);
  }

  function empezarDeCero() {
    reiniciarVistaPdf();
    setPdf(null);
    setCampos([]);
    setHeredadoDe(null);
    setMetadatos(METADATOS_VACIOS);
  }

  /**
   * Una versión nueva arranca con las zonas de la anterior ya cargadas: casi
   * nunca cambia todo el formato, y redibujar 30 zonas a mano es inviable.
   *
   * Como las zonas se anclan solo a coordenadas, se carga también el PDF de
   * origen para poder verlas encima y detectar si el layout se movió. Ese
   * control visual es obligatorio: queda un aviso hasta que se guarde.
   */
  async function manejarElegirNuevaVersion(origen) {
    const { templateIdOrigen, rutaPdfOrigen, versionOrigen, ...metadatosBase } = origen;

    reiniciarVistaPdf();
    setPdf(null);
    setMetadatos(metadatosBase);

    const camposOrigen = await window.api.templates.obtenerCampos(templateIdOrigen);
    setCampos(camposOrigen.map((campo, indice) => ({
      clave_campo: campo.clave_campo,
      etiqueta: campo.etiqueta,
      tipo_dato: campo.tipo_dato,
      obligatorio: campo.obligatorio === 1,
      pagina: campo.pagina,
      x: campo.x,
      y: campo.y,
      ancho: campo.ancho,
      alto: campo.alto,
      orden: indice + 1,
      idLocal: siguienteIdLocal(),
    })));
    setHeredadoDe(versionOrigen);

    // Si el PDF original sigue en su lugar se abre solo; si no, se pide.
    const pdfOrigen = await window.api.meta.leerPdf(rutaPdfOrigen);
    if (pdfOrigen) setPdf(pdfOrigen);
  }

  async function manejarElegirPdf() {
    const resultado = await window.api.meta.elegirPdf();
    if (!resultado) return;
    // Las zonas se conservan a propósito: cambiar el PDF es justamente lo que
    // se hace al versionar un formato, y redibujarlas sería empezar de cero.
    reiniciarVistaPdf();
    setPdf(resultado);
  }

  function manejarRenderizado(info) {
    if (info.numPaginas) setNumPaginas(info.numPaginas);
    if (info.ancho && info.alto) setDimensionesCanvas({ ancho: info.ancho, alto: info.alto });
  }

  function manejarZonaCompleta(rect) {
    setErrorPopover(null);
    setZonaPendiente({ ...rect, pagina: paginaActual });
  }

  function manejarConfirmarCampo(campo) {
    if (!campo.etiqueta) {
      setErrorPopover('La etiqueta es obligatoria.');
      return;
    }

    setCampos((prev) => [
      ...prev,
      {
        ...campo,
        clave_campo: claveUnica(campo.etiqueta, prev),
        idLocal: siguienteIdLocal(),
        orden: prev.length + 1,
      },
    ]);
    setZonaPendiente(null);
    setErrorPopover(null);
  }

  function manejarCancelarCampo() {
    setZonaPendiente(null);
    setErrorPopover(null);
  }

  function manejarEliminarCampo(idLocal) {
    setCampos((prev) => prev.filter((c) => c.idLocal !== idLocal));
  }

  async function manejarGuardarPlantilla() {
    setErrorGuardado(null);
    setGuardando(true);
    try {
      const templateId = await window.api.templates.crear({
        ...metadatos,
        ruta_pdf_origen: pdf.rutaArchivo,
      });

      for (const campo of campos) {
        await window.api.templates.agregarCampo(templateId, {
          clave_campo: campo.clave_campo,
          etiqueta: campo.etiqueta,
          tipo_dato: campo.tipo_dato,
          obligatorio: campo.obligatorio,
          pagina: campo.pagina,
          x: campo.x,
          y: campo.y,
          ancho: campo.ancho,
          alto: campo.alto,
          orden: campo.orden,
        });
      }

      setResultadoGuardado({ templateId, codigoPlantilla: metadatos.codigo_plantilla });
      setRecargarTemplates((n) => n + 1);
      setHeredadoDe(null);

      // Se entra directo a la vista previa: aprobar sin haber mirado cómo
      // caen las zonas sobre el formato es el error caro de esta app.
      setPrevisualizando({
        templateId,
        codigoPlantilla: metadatos.codigo_plantilla,
        pdfBytes: pdf.datos,
      });
    } catch (error) {
      setErrorGuardado(error.message || String(error));
    } finally {
      setGuardando(false);
    }
  }

  /**
   * Retoma un borrador que quedó sin aprobar. Sin esto un borrador es un
   * callejón sin salida: el panel lo muestra, pero no habría forma de
   * volver a él para pasarlo a producción.
   */
  async function manejarRevisarBorrador({ templateId, codigoPlantilla, rutaPdfOrigen }) {
    const pdfOrigen = await window.api.meta.leerPdf(rutaPdfOrigen);
    setPrevisualizando({
      templateId,
      codigoPlantilla,
      pdfBytes: pdfOrigen ? pdfOrigen.datos : null,
    });
  }

  // La vista previa se renderiza desde acá, no desde App: así este componente
  // no se desmonta y al volver siguen estando el PDF, las zonas y los metadatos.
  if (previsualizando) {
    return (
      <VistaPrevia
        templateId={previsualizando.templateId}
        codigoPlantilla={previsualizando.codigoPlantilla}
        pdfBytes={previsualizando.pdfBytes}
        onVolver={() => {
          setPrevisualizando(null);
          setRecargarTemplates((n) => n + 1);
        }}
      />
    );
  }

  return (
    <div className="editor-plantilla">
      <h1>Editor de plantillas</h1>

      <PanelPlantillasExistentes
        recargarToken={recargarTemplates}
        onElegirNuevaVersion={manejarElegirNuevaVersion}
        onRevisarBorrador={manejarRevisarBorrador}
      />

      <FormMetadatosPlantilla
        metadatos={metadatos}
        especialidades={especialidades}
        onChange={setMetadatos}
        deshabilitado={guardando}
      />

      {heredadoDe && (
        <p className="aviso-heredado">
          Las zonas vienen de la <strong>{heredadoDe}</strong>. Si el formato cambió de
          layout, revisá que cada zona siga cayendo donde corresponde antes de guardar
          {pdf ? '.' : ' — y cargá el PDF de esta versión para verlas.'}
        </p>
      )}

      <div className="panel-pdf">
        <button type="button" onClick={manejarElegirPdf} disabled={guardando}>
          {pdf ? 'Cambiar PDF' : 'Cargar PDF'}
        </button>

        {pdf && (
          <>
            <div className="navegacion-paginas">
              <button type="button" disabled={paginaActual <= 1} onClick={() => setPaginaActual((p) => p - 1)}>
                ← Anterior
              </button>
              <span>
                Página {paginaActual} de {numPaginas}
                {' · '}
                {camposDePaginaActual.length} zona{camposDePaginaActual.length === 1 ? '' : 's'} acá
              </span>
              <button
                type="button"
                disabled={paginaActual >= numPaginas}
                onClick={() => setPaginaActual((p) => p + 1)}
              >
                Siguiente →
              </button>
            </div>

            <div className="lienzo-container" style={{ width: dimensionesCanvas.ancho || undefined }}>
              <CanvasPdf datosPdf={pdf.datos} pagina={paginaActual} onRenderizado={manejarRenderizado} />
              {dimensionesCanvas.ancho > 0 && (
                <ZonaOverlay
                  ancho={dimensionesCanvas.ancho}
                  alto={dimensionesCanvas.alto}
                  camposDePagina={camposDePaginaActual}
                  onZonaCompleta={manejarZonaCompleta}
                />
              )}
            </div>
            <p className="leyenda">
              <span className="muestra-color zona-obligatoria" /> Obligatorio &nbsp;
              <span className="muestra-color zona-opcional" /> Opcional
            </p>
          </>
        )}
      </div>

      <h2>Zonas configuradas</h2>
      <TablaCampos campos={campos} onEliminar={manejarEliminarCampo} />

      <div className="panel-guardar">
        <button type="button" disabled={!puedeGuardar} onClick={manejarGuardarPlantilla}>
          {guardando ? 'Guardando…' : 'Guardar plantilla'}
        </button>
        {errorGuardado && <p className="mensaje-error">{errorGuardado}</p>}
        {resultadoGuardado && (
          <div className="mensaje-ok">
            <p>
              Plantilla <strong>{resultadoGuardado.codigoPlantilla}</strong> guardada.
              Si todavía no la aprobaste, queda como <strong>borrador</strong> y no
              aparece en obra — podés retomarla desde el panel de arriba.
            </p>
            <button
              type="button"
              onClick={() =>
                setPrevisualizando({
                  templateId: resultadoGuardado.templateId,
                  codigoPlantilla: resultadoGuardado.codigoPlantilla,
                  pdfBytes: pdf ? pdf.datos : null,
                })
              }
            >
              Revisar y aprobar
            </button>{' '}
            <button type="button" onClick={empezarDeCero}>Empezar otra plantilla</button>
          </div>
        )}
      </div>

      {zonaPendiente && (
        <PopoverCampo
          zona={zonaPendiente}
          tiposDato={tiposDato}
          tiposAutomaticos={tiposAutomaticos}
          onConfirmar={manejarConfirmarCampo}
          onCancelar={manejarCancelarCampo}
          error={errorPopover}
        />
      )}
    </div>
  );
}

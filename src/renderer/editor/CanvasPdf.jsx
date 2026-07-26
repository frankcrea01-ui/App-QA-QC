import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const ESCALA = 1.4;

/**
 * Renderiza una página de PDF a un <canvas>. No sabe nada de zonas —
 * ZonaOverlay se superpone usando las dimensiones que este componente
 * reporta por onRenderizado.
 */
export default function CanvasPdf({ datosPdf, pagina, onRenderizado }) {
  const canvasRef = useRef(null);
  const tareaRef = useRef(null);
  const [documento, setDocumento] = useState(null);

  // onRenderizado suele ser una función nueva en cada render del padre; se
  // guarda en una ref para no reejecutar el render del PDF por ese motivo.
  const avisarRef = useRef(onRenderizado);
  avisarRef.current = onRenderizado;

  useEffect(() => {
    if (!datosPdf) {
      setDocumento(null);
      return undefined;
    }

    let cancelado = false;
    let cargado = null;

    // pdf.js se queda con el buffer que recibe: se le pasa una copia para
    // poder volver a usar los mismos bytes (por ejemplo, en la vista previa).
    const tarea = pdfjsLib.getDocument({ data: datosPdf.slice() });
    tarea.promise.then(
      (doc) => {
        cargado = doc;
        if (cancelado) {
          doc.destroy();
          return;
        }
        setDocumento(doc);
        avisarRef.current({ numPaginas: doc.numPages });
      },
      () => {
        /* documento inválido: se ignora, el editor sigue usable */
      }
    );

    return () => {
      cancelado = true;
      if (cargado) cargado.destroy();
    };
  }, [datosPdf]);

  useEffect(() => {
    if (!documento) return undefined;

    let cancelado = false;

    // Cambiar de página rápido dispara renders solapados sobre el mismo
    // canvas, que pdf.js rechaza: se cancela el anterior antes de empezar.
    if (tareaRef.current) tareaRef.current.cancel();

    documento.getPage(pagina).then((paginaPdf) => {
      if (cancelado) return;

      const viewport = paginaPdf.getViewport({ scale: ESCALA });
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const tarea = paginaPdf.render({ canvasContext: canvas.getContext('2d'), viewport });
      tareaRef.current = tarea;

      tarea.promise.then(
        () => {
          if (!cancelado) avisarRef.current({ ancho: viewport.width, alto: viewport.height });
        },
        () => {
          /* render cancelado por un cambio de página: no es un error */
        }
      );
    });

    return () => {
      cancelado = true;
    };
  }, [documento, pagina]);

  return <canvas ref={canvasRef} className="canvas-pdf" />;
}

import React, { useRef, useState } from 'react';

/** Debajo de esto se asume clic accidental, no una zona real. */
const UMBRAL_MINIMO_PX = 6;

/**
 * Div transparente superpuesto al canvas del PDF. Captura el arrastre del
 * mouse y calcula el rectángulo en coordenadas relativas 0..1, igual que
 * template_fields.x/y/ancho/alto en el esquema.
 */
export default function ZonaOverlay({ ancho, alto, camposDePagina, onZonaCompleta }) {
  const overlayRef = useRef(null);
  const [inicio, setInicio] = useState(null);
  const [actual, setActual] = useState(null);

  function coordenadasRelativas(evento) {
    const rect = overlayRef.current.getBoundingClientRect();
    const x = (evento.clientX - rect.left) / rect.width;
    const y = (evento.clientY - rect.top) / rect.height;
    return { x: Math.min(Math.max(x, 0), 1), y: Math.min(Math.max(y, 0), 1) };
  }

  function cancelarArrastre() {
    setInicio(null);
    setActual(null);
  }

  function manejarMouseDown(evento) {
    // Sin esto el navegador inicia su propio drag del canvas y se pierde el mouseup.
    evento.preventDefault();
    const punto = coordenadasRelativas(evento);
    setInicio(punto);
    setActual(punto);
  }

  function manejarMouseMove(evento) {
    if (!inicio) return;
    setActual(coordenadasRelativas(evento));
  }

  function manejarMouseUp() {
    if (!inicio || !actual) return;

    const x = Math.min(inicio.x, actual.x);
    const y = Math.min(inicio.y, actual.y);
    const anchoRel = Math.abs(actual.x - inicio.x);
    const altoRel = Math.abs(actual.y - inicio.y);

    cancelarArrastre();

    if (anchoRel * ancho < UMBRAL_MINIMO_PX || altoRel * alto < UMBRAL_MINIMO_PX) return;

    onZonaCompleta({ x, y, ancho: anchoRel, alto: altoRel });
  }

  return (
    <div
      ref={overlayRef}
      className="zona-overlay"
      onMouseDown={manejarMouseDown}
      onMouseMove={manejarMouseMove}
      onMouseUp={manejarMouseUp}
      // Si el mouse sale del PDF, el mouseup nunca llegaría y el overlay
      // quedaría "dibujando" para siempre: se cancela el arrastre.
      onMouseLeave={cancelarArrastre}
    >
      {camposDePagina.map((campo) => (
        <div
          key={campo.idLocal}
          className={`zona-existente zona-${campo.obligatorio ? 'obligatoria' : 'opcional'}`}
          style={{
            left: `${campo.x * 100}%`,
            top: `${campo.y * 100}%`,
            width: `${campo.ancho * 100}%`,
            height: `${campo.alto * 100}%`,
          }}
          title={campo.etiqueta}
        />
      ))}

      {inicio && actual && (
        <div
          className="zona-en-curso"
          style={{
            left: `${Math.min(inicio.x, actual.x) * 100}%`,
            top: `${Math.min(inicio.y, actual.y) * 100}%`,
            width: `${Math.abs(actual.x - inicio.x) * 100}%`,
            height: `${Math.abs(actual.y - inicio.y) * 100}%`,
          }}
        />
      )}
    </div>
  );
}

import React from 'react';

/**
 * Overlay de solo lectura: pinta cada zona de la página actual con su
 * etiqueta, coloreada según sea obligatoria (verde) u opcional (ámbar).
 * Sirve para verificar que cada zona cayó donde corresponde en el formato.
 */
export default function ZonasRellenas({ camposDePagina }) {
  return (
    <div className="zonas-rellenas-overlay">
      {camposDePagina.map((campo) => (
        <div
          key={campo.id}
          className={`zona-rellena zona-${campo.obligatorio ? 'obligatoria' : 'opcional'}`}
          style={{
            left: `${campo.x * 100}%`,
            top: `${campo.y * 100}%`,
            width: `${campo.ancho * 100}%`,
            height: `${campo.alto * 100}%`,
          }}
          title={campo.etiqueta}
        >
          <span className="zona-rellena-texto">{campo.etiqueta}</span>
        </div>
      ))}
    </div>
  );
}

import React, { useEffect, useState } from 'react';

export default function TarjetasResumen({ recargarToken }) {
  const [resumen, setResumen] = useState([]);

  useEffect(() => {
    window.api.log.resumenPorEstado().then(setResumen);
  }, [recargarToken]);

  return (
    <div className="tarjetas-resumen">
      {resumen.map((r) => (
        <div key={r.estado} className={`tarjeta-estado tarjeta-${r.estado}`}>
          <span className="tarjeta-total">{r.total}</span>
          <span className="tarjeta-nombre">{r.estado.replace('_', ' ')}</span>
        </div>
      ))}
    </div>
  );
}

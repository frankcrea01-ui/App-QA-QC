import React, { useEffect, useState } from 'react';
import TarjetasResumen from './TarjetasResumen.jsx';
import TablaProtocolos from './TablaProtocolos.jsx';
import DetalleProtocolo from './DetalleProtocolo.jsx';
import { useConstantes } from '../useConstantes.js';
import './log.css';

export default function LogMaestro({ activo }) {
  const { especialidades, estados } = useConstantes();
  const [protocoloSeleccionado, setProtocoloSeleccionado] = useState(null);
  const [recargarToken, setRecargarToken] = useState(0);

  useEffect(() => {
    if (activo) {
      setRecargarToken((n) => n + 1);
    }
  }, [activo]);

  return (
    <div className="log-maestro">
      <h1>Log maestro</h1>

      {protocoloSeleccionado ? (
        <DetalleProtocolo
          protocoloId={protocoloSeleccionado}
          estados={estados}
          onCerrar={() => setProtocoloSeleccionado(null)}
          onCambio={() => setRecargarToken((n) => n + 1)}
        />
      ) : (
        <>
          <TarjetasResumen recargarToken={recargarToken} />
          <TablaProtocolos
            especialidades={especialidades}
            estados={estados}
            recargarToken={recargarToken}
            onSeleccionar={setProtocoloSeleccionado}
            onCambio={() => setRecargarToken((n) => n + 1)}
          />
        </>
      )}
    </div>
  );
}

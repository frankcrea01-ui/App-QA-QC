import React, { useEffect, useState } from 'react';
import { useConstantes } from '../constantes.js';

export default function PanelFotos({ protocoloId }) {
  const { maxFotos } = useConstantes();
  const [fotos, setFotos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    let vigente = true;
    window.api.fotos.listar(protocoloId).then((f) => {
      if (vigente) setFotos(f);
    });
    return () => {
      vigente = false;
    };
  }, [protocoloId]);

  async function manejarAgregar() {
    setMensaje(null);
    setCargando(true);
    try {
      const resultado = await window.api.fotos.elegirYAgregar(protocoloId);
      if (resultado.agregadas && resultado.agregadas.length > 0) {
        setFotos((prev) => [...prev, ...resultado.agregadas]);
      }
      // El main avisa tanto el tope alcanzado como los archivos ilegibles.
      if (resultado.mensaje) setMensaje(resultado.mensaje);
    } catch (error) {
      setMensaje(error.message || String(error));
    } finally {
      setCargando(false);
    }
  }

  const lleno = maxFotos > 0 && fotos.length >= maxFotos;

  return (
    <div className="panel-fotos">
      <h2>Fotos ({fotos.length}{maxFotos ? `/${maxFotos}` : ''})</h2>
      <ul>
        {fotos.map((foto) => (
          <li key={foto.id}>{foto.ruta_local.split(/[\\/]/).pop()} — {foto.tamano_kb} KB</li>
        ))}
      </ul>
      <button type="button" onClick={manejarAgregar} disabled={cargando || lleno}>
        {cargando ? 'Agregando…' : 'Agregar fotos'}
      </button>
      {mensaje && <p className="mensaje-error">{mensaje}</p>}
    </div>
  );
}

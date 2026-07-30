import React, { useState } from 'react';

/**
 * Genera el protocolo llenado y lo abre en el visor de PDF del sistema,
 * desde donde se imprime. Al generarlo, el protocolo pasa a "en firma".
 *
 * Si algún texto no entró en su espacio del formato, se avisa acá: es la
 * última oportunidad de corregirlo antes de imprimir y firmar.
 */
export default function BotonGenerarPdf({ protocoloId, onGenerado, etiqueta = 'Generar PDF para imprimir' }) {
  const [generando, setGenerando] = useState(false);
  const [advertencias, setAdvertencias] = useState([]);
  const [error, setError] = useState(null);
  const [listo, setListo] = useState(false);

  async function manejarGenerar() {
    setError(null);
    setAdvertencias([]);
    setListo(false);
    setGenerando(true);
    try {
      const resultado = await window.api.protocolos.generarPdf(protocoloId);
      if (!resultado.ok) {
        setError(resultado.mensaje);
        return;
      }
      setAdvertencias(resultado.advertencias || []);
      setListo(true);
      if (onGenerado) onGenerado();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="generar-pdf">
      <button type="button" onClick={manejarGenerar} disabled={generando}>
        {generando ? 'Generando…' : etiqueta}
      </button>

      {listo && advertencias.length === 0 && (
        <p className="mensaje-ok">Se abrió el PDF. Imprimilo, firmalo y después cargá el escaneado.</p>
      )}

      {advertencias.length > 0 && (
        <div className="aviso-heredado">
          <strong>Revisá antes de imprimir:</strong>
          <ul>
            {advertencias.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </div>
      )}

      {error && <p className="mensaje-error">{error}</p>}
    </div>
  );
}

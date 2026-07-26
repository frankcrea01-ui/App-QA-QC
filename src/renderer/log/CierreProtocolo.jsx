import React, { useState } from 'react';

const PASOS = {
  en_proceso: { indice: 1, texto: 'Llenado. Falta generar el PDF para imprimir.' },
  en_firma: { indice: 2, texto: 'Impreso y a la espera de la firma. Cuando vuelva firmado, cargá el escaneado.' },
  cerrado: { indice: 3, texto: 'Firmado y respaldado. El ciclo está completo.' },
  anulado: { indice: 0, texto: 'Anulado. Queda en el registro, no se borra.' },
};

/**
 * Cierre del ciclo: cargar el protocolo ya firmado y escaneado. Al cargarlo
 * el protocolo pasa a cerrado solo — no hay que cambiar el estado a mano.
 */
export default function CierreProtocolo({ protocolo, onCambio }) {
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [error, setError] = useState(null);

  const paso = PASOS[protocolo.estado] || { indice: 0, texto: protocolo.estado };
  const tieneEscaneado = Boolean(protocolo.pdf_escaneado_link);
  // Un anulado no se cierra cargando el firmado: primero hay que reactivarlo
  // a propósito, más abajo. Si ya tenía un escaneado, se puede seguir viendo.
  const puedeCargar = protocolo.estado !== 'anulado';

  async function manejarCargar() {
    setError(null);
    setMensaje(null);
    setTrabajando(true);
    try {
      const resultado = await window.api.log.adjuntarPdfEscaneado(protocolo.id);
      if (!resultado.ok) {
        if (resultado.mensaje) setError(resultado.mensaje);
        return; // sin mensaje = el usuario canceló el diálogo
      }
      setMensaje(
        resultado.reemplazado
          ? 'Escaneado reemplazado. El protocolo sigue cerrado.'
          : 'Escaneado cargado. El protocolo quedó cerrado.'
      );
      onCambio();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setTrabajando(false);
    }
  }

  async function manejarAbrir() {
    setError(null);
    const resultado = await window.api.log.abrirEscaneado(protocolo.id);
    if (!resultado.ok) setError(resultado.mensaje);
  }

  return (
    <div className="cierre-protocolo">
      <p className={`paso-ciclo paso-${protocolo.estado}`}>
        {paso.indice > 0 && <strong>Paso {paso.indice} de 3 · </strong>}
        {paso.texto}
      </p>

      <div className="acciones-cierre">
        {puedeCargar && (
          <button type="button" onClick={manejarCargar} disabled={trabajando}>
            {trabajando
              ? 'Cargando…'
              : tieneEscaneado ? 'Reemplazar escaneado firmado' : 'Cargar escaneado firmado'}
          </button>
        )}

        {tieneEscaneado && (
          <button type="button" onClick={manejarAbrir}>Ver documento firmado</button>
        )}
      </div>

      {tieneEscaneado && (
        <p className="ruta-escaneado">{protocolo.pdf_escaneado_link.split(/[\\/]/).pop()}</p>
      )}

      {mensaje && <p className="mensaje-ok">{mensaje}</p>}
      {error && <p className="mensaje-error">{error}</p>}
    </div>
  );
}

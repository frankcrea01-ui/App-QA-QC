import React, { useState } from 'react';

/**
 * Obra y responsable del turno. Se definen una vez y quedan fijos para todos
 * los protocolos que se llenen después — el registrador no vuelve a tipearlos.
 *
 * Los dos campos son listas que se retroalimentan: la primera vez se escribe
 * a mano, y desde ahí aparecen los valores ya usados, con el último arriba.
 */
export default function BarraSesion({ sesion, sugerencias, onGuardar, obligatorio }) {
  const [editando, setEditando] = useState(obligatorio);
  const [proyecto, setProyecto] = useState(sesion.proyecto || '');
  const [responsable, setResponsable] = useState(sesion.responsable || '');
  const [error, setError] = useState(null);

  async function manejarGuardar(evento) {
    evento.preventDefault();
    setError(null);
    try {
      await onGuardar({ proyecto, responsable });
      setEditando(false);
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  function manejarCancelar() {
    setProyecto(sesion.proyecto || '');
    setResponsable(sesion.responsable || '');
    setError(null);
    setEditando(false);
  }

  if (!editando) {
    return (
      <div className="barra-sesion">
        <span><strong>Obra:</strong> {sesion.proyecto}</span>
        <span><strong>Responsable:</strong> {sesion.responsable}</span>
        <button type="button" onClick={() => setEditando(true)}>Cambiar</button>
      </div>
    );
  }

  return (
    <form className="barra-sesion barra-sesion-edicion" onSubmit={manejarGuardar}>
      {obligatorio && (
        <p className="barra-sesion-aviso">
          Antes de empezar, indicá en qué obra estás y quién va a llenar los protocolos.
          Se pide una sola vez.
        </p>
      )}

      <div className="barra-sesion-campos">
        <label>
          Obra
          <input
            type="text"
            list="obras-usadas"
            value={proyecto}
            onChange={(e) => setProyecto(e.target.value)}
            placeholder="ej: PROY01"
            autoFocus
            required
          />
          <datalist id="obras-usadas">
            {sugerencias.proyectos.map((p) => <option key={p} value={p} />)}
          </datalist>
        </label>

        <label>
          Responsable
          <input
            type="text"
            list="responsables-usados"
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
            placeholder="ej: Juan Pérez"
            required
          />
          <datalist id="responsables-usados">
            {sugerencias.responsables.map((r) => <option key={r} value={r} />)}
          </datalist>
        </label>

        <button type="submit">Confirmar</button>
        {!obligatorio && <button type="button" onClick={manejarCancelar}>Cancelar</button>}
      </div>

      {error && <p className="mensaje-error">{error}</p>}
    </form>
  );
}

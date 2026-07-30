import React, { useState } from 'react';

/**
 * Obra y responsable del turno. Se definen una vez y quedan fijos para todos
 * los protocolos que se llenen después — el registrador no vuelve a tipearlos.
 *
 * Los dos campos son listas que se retroalimentan: la primera vez se escribe
 * a mano, y desde ahí aparecen los valores ya usados, con el último arriba.
 */
export default function BarraSesion({ sesion, oficina, onGuardar, obligatorio }) {
  const [editando, setEditando] = useState(obligatorio);
  const [proyecto, setProyecto] = useState(sesion.proyecto || '');
  const [responsable, setResponsable] = useState(sesion.responsable || '');
  const [error, setError] = useState(null);

  async function manejarGuardar(evento) {
    evento.preventDefault();
    setError(null);
    try {
      let cliente = '';
      if (oficina?.proyectos) {
        const pObj = oficina.proyectos.find(p => p.nombre === proyecto);
        if (pObj) cliente = pObj.cliente || '';
      }
      await onGuardar({ proyecto, responsable, cliente });
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

  const proyectosList = oficina?.proyectos || [];
  const registradores = oficina?.registradores?.map(r => r.nombre) || [];

  return (
    <form className="barra-sesion barra-sesion-edicion" onSubmit={manejarGuardar}>
      {obligatorio && (
        <p className="barra-sesion-aviso">
          Antes de empezar, indica quién va a llenar los protocolos.
          Se pide una sola vez por sesión.
        </p>
      )}

      <div className="barra-sesion-campos">
        <label>
          Obra
          {proyectosList.length > 0 ? (
            <select
              value={proyecto}
              onChange={(e) => setProyecto(e.target.value)}
              required
            >
              <option value="">Seleccionar Obra...</option>
              {proyectosList.map(p => <option key={p.nombre} value={p.nombre}>{p.nombre}</option>)}
            </select>
          ) : (
            <input
              type="text"
              value={proyecto}
              onChange={(e) => setProyecto(e.target.value)}
              placeholder="ej: PROY01"
              required
            />
          )}
        </label>

        <label>
          Responsable
          {registradores.length > 0 ? (
            <select
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
              required
            >
              <option value="">Seleccionar...</option>
              {registradores.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : (
            <input
              type="text"
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
              placeholder="Tu Nombre"
              required
            />
          )}
        </label>

        <button type="submit">Confirmar</button>
        {!obligatorio && <button type="button" onClick={manejarCancelar}>Cancelar</button>}
      </div>

      {error && <p className="mensaje-error">{error}</p>}
    </form>
  );
}

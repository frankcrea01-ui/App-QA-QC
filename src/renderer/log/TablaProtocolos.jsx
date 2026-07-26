import React, { useEffect, useState } from 'react';

export default function TablaProtocolos({ especialidades, estados, recargarToken, onSeleccionar }) {
  const [filtroEspecialidad, setFiltroEspecialidad] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [protocolos, setProtocolos] = useState([]);

  useEffect(() => {
    window.api.log
      .listarProtocolos({ especialidad: filtroEspecialidad || undefined, estado: filtroEstado || undefined })
      .then(setProtocolos);
  }, [filtroEspecialidad, filtroEstado, recargarToken]);

  return (
    <div className="tabla-protocolos-panel">
      <div className="filtros-log">
        <label>
          Especialidad
          <select value={filtroEspecialidad} onChange={(e) => setFiltroEspecialidad(e.target.value)}>
            <option value="">Todas</option>
            {especialidades.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            {estados.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </label>
      </div>

      <table className="tabla-campos">
        <thead>
          <tr>
            <th>Código</th>
            <th>Proyecto</th>
            <th>Especialidad</th>
            <th>Estado</th>
            <th>Creado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {protocolos.map((p) => (
            <tr key={p.id}>
              <td>{p.codigo_protocolo}</td>
              <td>{p.proyecto}</td>
              <td>{p.especialidad}</td>
              <td>{p.estado}</td>
              <td>{p.fecha_creacion}</td>
              <td>
                <button type="button" onClick={() => onSeleccionar(p.id)}>Ver detalle</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {protocolos.length === 0 && <p className="tabla-campos-vacia">No hay protocolos con estos filtros.</p>}
    </div>
  );
}

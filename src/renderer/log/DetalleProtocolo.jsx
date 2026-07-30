import React, { useCallback, useEffect, useState } from 'react';
import { useConstantes } from '../useConstantes.js';
import BotonGenerarPdf from '../shared/BotonGenerarPdf.jsx';
import CierreProtocolo from './CierreProtocolo.jsx';

export default function DetalleProtocolo({ protocoloId, estados, onCerrar, onCambio }) {
  const { staff } = useConstantes();
  const [detalle, setDetalle] = useState(null);
  const [estadoNuevo, setEstadoNuevo] = useState('');
  const [usuario, setUsuario] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const recargar = useCallback(
    () => window.api.log.obtenerDetalle(protocoloId).then((d) => {
      setDetalle(d);
      if (!usuario) setUsuario(d.protocolo.creado_por || '');
    }),
    [protocoloId]
  );

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function manejarCambiarEstado(evento) {
    evento.preventDefault();
    setMensaje(null);

    if (!estadoNuevo) {
      setMensaje('Elige a qué estado pasa el protocolo.');
      return;
    }

    setGuardando(true);
    try {
      // El registrador responde lo que dice el papel (incluso vacío);
      // aquí solo se muestra lo que responde.
      //
      // `reactivar` viaja solo desde este formulario, nunca desde el cierre
      // automático: sacar un protocolo de anulado es una decisión de alguien.
      const resultado = await window.api.log.cambiarEstado({
        protocoloId, estadoNuevo, usuario,
        reactivar: detalle.protocolo.estado === 'anulado',
      });
      if (!resultado.ok) {
        setMensaje(resultado.mensaje);
        return;
      }
      setEstadoNuevo('');
      await recargar();
      onCambio();
    } finally {
      setGuardando(false);
    }
  }

  if (!detalle) return <p>Cargando detalle…</p>;

  const { protocolo, valores, historial } = detalle;
  const estaAnulado = protocolo.estado === 'anulado';

  return (
    <div className="detalle-protocolo">
      <button type="button" onClick={onCerrar}>← Volver al listado</button>
      <h2>{protocolo.codigo_protocolo}</h2>
      <p>
        {protocolo.template_nombre} (v{protocolo.version_usada}) — {protocolo.proyecto}
        {protocolo.empresa ? ` — ${protocolo.empresa}` : ''}
      </p>
      <p>Estado actual: <strong>{protocolo.estado}</strong></p>

      <h3>Ciclo del protocolo</h3>
      {/* Se regenera cuando haga falta: el papel perdido se rehace con los
          datos y solo necesita volver a firmarse. */}
      <BotonGenerarPdf
        protocoloId={protocoloId}
        etiqueta={protocolo.estado === 'en_proceso' ? 'Generar PDF para imprimir' : 'Regenerar PDF'}
        onGenerado={() => { recargar(); onCambio(); }}
      />
      <CierreProtocolo
        protocolo={protocolo}
        onCambio={() => { recargar(); onCambio(); }}
      />

      <h3>Valores</h3>
      <table className="tabla-campos">
        <tbody>
          {valores.map((v) => (
            <tr key={v.clave_campo}>
              <td>{v.etiqueta}</td>
              <td>{v.valor}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Historial de estados</h3>
      <table className="tabla-campos">
        <thead>
          <tr><th>Fecha</th><th>De</th><th>A</th><th>Usuario</th></tr>
        </thead>
        <tbody>
          {historial.map((h) => (
            <tr key={h.id}>
              <td>{h.fecha}</td>
              <td>{h.estado_anterior || '—'}</td>
              <td>{h.estado_nuevo}</td>
              <td>{h.usuario}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>{estaAnulado ? 'Reactivar protocolo' : 'Opciones avanzadas (Anular)'}</h3>
      {estaAnulado && (
        <p className="aviso-anulado">
          Este protocolo está anulado y no se cierra solo, ni siquiera cargando el
          escaneado firmado. Para volver a usarlo, elige en qué estado queda y
          firma el cambio — la reactivación queda en el historial.
        </p>
      )}
      <form onSubmit={manejarCambiarEstado} className="form-cambiar-estado">
        <select value={estadoNuevo} onChange={(e) => setEstadoNuevo(e.target.value)}>
          <option value="">Elegir estado…</option>
          {estados.filter((e) => {
            if (e === protocolo.estado) return false;
            if (!estaAnulado && e !== 'anulado') return false; // Solo permitir anular si no lo está
            return true;
          }).map((e) => (
            <option key={e} value={e}>{e.replace('_', ' ')}</option>
          ))}
        </select>
        {staff && staff.length > 0 ? (
          <select value={usuario} onChange={(e) => setUsuario(e.target.value)}>
            <option value="">Tu nombre…</option>
            {staff.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <input
            type="text"
            placeholder="Tu nombre"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
          />
        )}
        <button type="submit" disabled={guardando}>
          {estaAnulado ? 'Reactivar protocolo' : 'Anular protocolo'}
        </button>
      </form>
      {mensaje && <p className="mensaje-error">{mensaje}</p>}
    </div>
  );
}

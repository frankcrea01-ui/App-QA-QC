import React, { useEffect, useState } from 'react';
import './edt.css';

/**
 * Árbol EDT visual: muestra la estructura completa del proyecto como un
 * diagrama vertical de carpetas. No navega a detalle de protocolo — es
 * solo un mapa de avance.
 */
export default function EdtProtocolos({ activo }) {
  const [protocolos, setProtocolos] = useState([]);

  useEffect(() => {
    if (activo) {
      window.api.log.listarProtocolos({}).then(setProtocolos);
    }
  }, [activo]);

  // Agrupar: Proyecto → Especialidad → lista de protocolos
  const arbol = {};
  for (const p of protocolos) {
    if (!arbol[p.proyecto]) arbol[p.proyecto] = {};
    if (!arbol[p.proyecto][p.especialidad]) arbol[p.proyecto][p.especialidad] = [];
    arbol[p.proyecto][p.especialidad].push(p);
  }

  const proyectos = Object.keys(arbol);

  if (proyectos.length === 0) {
    return (
      <div className="edt-contenedor">
        <h1>Estructura de Desglose (EDT)</h1>
        <p className="edt-vacio">No hay protocolos registrados aún.</p>
      </div>
    );
  }

  return (
    <div className="edt-contenedor">
      <h1>Estructura de Desglose (EDT)</h1>
      <p>Vista vertical del progreso por proyecto y especialidad.</p>

      {proyectos.map((proyecto) => {
        const especialidades = Object.keys(arbol[proyecto]);
        const totalProyecto = especialidades.reduce(
          (sum, esp) => sum + arbol[proyecto][esp].length, 0
        );
        const cerradosProyecto = especialidades.reduce(
          (sum, esp) => sum + arbol[proyecto][esp].filter(p => p.estado === 'cerrado').length, 0
        );
        const pctProyecto = totalProyecto > 0
          ? Math.round((cerradosProyecto / totalProyecto) * 100)
          : 0;

        return (
          <div key={proyecto} className="edt-diagrama">
            {/* Nodo raíz: Proyecto */}
            <div className="edt-nodo edt-nodo-proyecto">
              <span className="edt-nodo-icono">🏗️</span>
              <span className="edt-nodo-titulo">{proyecto}</span>
              <span className="edt-nodo-badge">{totalProyecto} protocolos · {pctProyecto}%</span>
              <div className="edt-barra-progreso">
                <div className="edt-barra-relleno" style={{ width: `${pctProyecto}%` }} />
              </div>
            </div>

            {/* Línea vertical hacia abajo */}
            <div className="edt-linea-vertical" />

            {/* Nivel especialidades */}
            <div className="edt-nivel-hijos">
              {especialidades.map((esp, i) => {
                const lista = arbol[proyecto][esp];
                const cerrados = lista.filter(p => p.estado === 'cerrado').length;
                const pct = lista.length > 0 ? Math.round((cerrados / lista.length) * 100) : 0;

                return (
                  <div key={esp} className="edt-rama">
                    {/* Conector horizontal */}
                    <div className="edt-conector-h" />

                    {/* Nodo especialidad */}
                    <div className="edt-nodo edt-nodo-especialidad">
                      <span className="edt-nodo-icono">📐</span>
                      <span className="edt-nodo-titulo">{esp}</span>
                      <span className="edt-nodo-badge">{lista.length} · {pct}%</span>
                      <div className="edt-barra-progreso">
                        <div className="edt-barra-relleno" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    {/* Hojas: protocolos */}
                    <div className="edt-linea-vertical edt-linea-corta" />
                    <div className="edt-hojas-vertical">
                      {lista.map((p) => (
                        <div key={p.id} className={`edt-hoja edt-hoja-${p.estado}`}>
                          <span className={`edt-estado-punto estado-${p.estado}`} />
                          <span className="edt-hoja-codigo">{p.codigo_protocolo}</span>
                          <span className="edt-hoja-estado">{p.estado.replace('_', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

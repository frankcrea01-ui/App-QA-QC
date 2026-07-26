import React, { useCallback, useEffect, useState } from 'react';
import BarraSesion from './BarraSesion.jsx';
import SelectorPlantilla from './SelectorPlantilla.jsx';
import FormularioCampo from './FormularioCampo.jsx';
import './campo.css';

const SIN_SUGERENCIAS = { proyectos: [], responsables: [] };

/**
 * Registro en obra: definir la sesión una vez, elegir el protocolo y llenarlo.
 * Sin login ni pasos previos — es la pantalla del personal de terreno, donde
 * cada clic de más es fricción.
 */
export default function ModoCampo() {
  const [sesion, setSesion] = useState(null); // null mientras carga
  const [sugerencias, setSugerencias] = useState(SIN_SUGERENCIAS);
  const [template, setTemplate] = useState(null);

  const cargarSugerencias = useCallback(
    () => window.api.protocolos.sugerencias().then(setSugerencias),
    []
  );

  useEffect(() => {
    let vigente = true;
    Promise.all([window.api.config.obtenerSesion(), window.api.protocolos.sugerencias()])
      .then(([sesionGuardada, listas]) => {
        if (!vigente) return;
        setSesion(sesionGuardada);
        setSugerencias(listas);
      });
    return () => {
      vigente = false;
    };
  }, []);

  async function manejarGuardarSesion(datos) {
    setSesion(await window.api.config.guardarSesion(datos));
  }

  if (!sesion) return <p>Cargando…</p>;

  const sesionIncompleta = !sesion.proyecto || !sesion.responsable;

  return (
    <div className="modo-campo">
      <BarraSesion
        sesion={sesion}
        sugerencias={sugerencias}
        onGuardar={manejarGuardarSesion}
        obligatorio={sesionIncompleta}
      />

      {!sesionIncompleta && (
        template ? (
          <FormularioCampo
            template={template}
            sesion={sesion}
            onVolver={() => {
              setTemplate(null);
              // Un protocolo nuevo puede haber estrenado obra o responsable.
              cargarSugerencias();
            }}
          />
        ) : (
          <SelectorPlantilla onSeleccionar={setTemplate} />
        )
      )}
    </div>
  );
}

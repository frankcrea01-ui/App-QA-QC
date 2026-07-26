import React, { useEffect, useState } from 'react';
import EditorPlantilla from './editor/EditorPlantilla.jsx';
import ModoCampo from './campo/ModoCampo.jsx';
import LogMaestro from './log/LogMaestro.jsx';
import OnboardingJefe from './onboarding/OnboardingJefe.jsx';
import './app.css';

/**
 * Dos modos, uno por rol real:
 *  - Oficina de calidad: el jefe diseña plantillas y supervisa el log maestro.
 *  - Registro en obra: el personal de terreno llena protocolos.
 */
const MODOS = [
  {
    id: 'oficina',
    etiqueta: 'Oficina de calidad',
    secciones: [
      { id: 'plantillas', etiqueta: 'Plantillas', Componente: EditorPlantilla },
      { id: 'log', etiqueta: 'Log maestro', Componente: LogMaestro },
    ],
  },
  {
    id: 'obra',
    etiqueta: 'Registro en obra',
    secciones: [{ id: 'registro', etiqueta: 'Registrar protocolo', Componente: ModoCampo }],
  },
];

/** Todas las secciones, de todos los modos, en una sola lista. */
const SECCIONES = MODOS.flatMap((modo) => modo.secciones);

export default function App() {
  const [modoId, setModoId] = useState('oficina');
  const [seccionId, setSeccionId] = useState('plantillas');
  const [mostrarOnboarding, setMostrarOnboarding] = useState(false);
  // Una sección visitada no se desmonta nunca más: se esconde. Si se
  // desmontara, ir al log a consultar algo borraría las zonas dibujadas en el
  // editor, y volver al selector de plantillas borraría un protocolo a medio
  // llenar. Se montan recién al entrar, para no pedir datos que nadie miró.
  const [visitadas, setVisitadas] = useState(() => new Set([seccionId]));

  useEffect(() => {
    window.api.config.obtenerOnboardingVisto().then((visto) => setMostrarOnboarding(!visto));
  }, []);

  function irASeccion(id) {
    setSeccionId(id);
    setVisitadas((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }

  function cambiarModo(modo) {
    setModoId(modo.id);
    irASeccion(modo.secciones[0].id);
  }

  function cerrarOnboarding() {
    setMostrarOnboarding(false);
    window.api.config.marcarOnboardingVisto();
  }

  const modo = MODOS.find((m) => m.id === modoId);
  const seccion = modo.secciones.find((s) => s.id === seccionId) || modo.secciones[0];

  return (
    <div>
      <nav className="nav-modos">
        {MODOS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={m.id === modoId ? 'activo' : ''}
            onClick={() => cambiarModo(m)}
          >
            {m.etiqueta}
          </button>
        ))}
        <button type="button" className="boton-ayuda" onClick={() => setMostrarOnboarding(true)}>
          ? Ayuda
        </button>
      </nav>

      {/* El submenú solo aparece cuando el modo tiene más de una sección. */}
      {modo.secciones.length > 1 && (
        <nav className="nav-secciones">
          {modo.secciones.map((s) => (
            <button
              key={s.id}
              type="button"
              className={s.id === seccion.id ? 'activo' : ''}
              onClick={() => irASeccion(s.id)}
            >
              {s.etiqueta}
            </button>
          ))}
        </nav>
      )}

      {SECCIONES.filter((s) => visitadas.has(s.id)).map(({ id, Componente }) => (
        <div key={id} style={{ display: id === seccion.id ? undefined : 'none' }}>
          <Componente />
        </div>
      ))}

      {mostrarOnboarding && <OnboardingJefe onCerrar={cerrarOnboarding} />}
    </div>
  );
}

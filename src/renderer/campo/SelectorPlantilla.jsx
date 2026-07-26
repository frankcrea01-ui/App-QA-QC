import React, { useEffect, useState } from 'react';

export default function SelectorPlantilla({ onSeleccionar }) {
  const [templates, setTemplates] = useState(null);

  useEffect(() => {
    window.api.templates.listarActivos().then(setTemplates);
  }, []);

  if (templates === null) return <p>Cargando plantillas…</p>;

  if (templates.length === 0) {
    return (
      <p>
        Todavía no hay plantillas en producción. Pedile al jefe de calidad que apruebe
        una desde el editor (vista previa → "Pasar a producción").
      </p>
    );
  }

  return (
    <div className="selector-plantilla">
      <h1>Elegí un protocolo para llenar</h1>
      <ul>
        {templates.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => onSeleccionar(t)}>
              {t.nombre} — {t.version} ({t.especialidad})
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

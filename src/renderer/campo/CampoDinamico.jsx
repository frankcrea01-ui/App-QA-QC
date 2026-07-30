import React from 'react';

/** Cómo se muestra cada tipo de zona en el formulario de obra. */
const TIPOS_HTML = { texto: 'text', fecha: 'date' };

/** Valor que se guarda cuando una zona de tipo check queda marcada. */
export const VALOR_CHECK_MARCADO = 'si';

/**
 * Un campo del formulario de registro. Es puramente presentacional: las
 * reglas de validación viven en /core y se consultan por IPC, para que no
 * exista una segunda copia que se desincronice.
 */
export default function CampoDinamico({ campo, valor, error, onChange, onBlur, staff = [] }) {
  if (campo.tipo_dato === 'check') {
    let opciones = {};
    try { opciones = JSON.parse(campo.opciones || '{}'); } catch (e) {}
    const filas = opciones.filas || 1;
    const columnas = opciones.columnas || 1;
    const encabezados = opciones.encabezados || ['Sí', 'No', 'N/A'];

    if (filas > 1 || columnas > 1) {
      let selecciones = Array(filas).fill(null);
      try { 
        if (valor) selecciones = JSON.parse(valor); 
      } catch (e) {}

      return (
        <div className="campo-dinamico campo-matriz">
          <label>
            {campo.etiqueta}
            {campo.obligatorio ? <span className="marca-obligatorio"> *</span> : null}
          </label>
          <table className="tabla-matriz">
            <thead>
              <tr>
                <th></th>
                {Array.from({ length: columnas }).map((_, c) => (
                  <th key={c}>{encabezados[c] || `Col ${c + 1}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: filas }).map((_, r) => (
                <tr key={r}>
                  <td>Fila {r + 1}</td>
                  {Array.from({ length: columnas }).map((_, c) => (
                    <td key={c}>
                      <input
                        type="radio"
                        name={`matriz-${campo.id}-fila-${r}`}
                        checked={selecciones[r] === c}
                        onChange={() => {
                          const nuevas = [...selecciones];
                          nuevas[r] = c;
                          onChange(JSON.stringify(nuevas));
                        }}
                        onBlur={onBlur}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {error && <span className="mensaje-error">{error}</span>}
        </div>
      );
    }

    return (
      <label className="campo-dinamico campo-check">
        <input
          type="checkbox"
          checked={valor === VALOR_CHECK_MARCADO}
          onChange={(e) => onChange(e.target.checked ? VALOR_CHECK_MARCADO : '')}
          onBlur={onBlur}
        />
        {campo.etiqueta}
        {campo.obligatorio ? <span className="marca-obligatorio"> *</span> : null}
        {error && <span className="mensaje-error">{error}</span>}
      </label>
    );
  }

  if (campo.tipo_dato === 'responsable') {
    return (
      <label className="campo-dinamico">
        {campo.etiqueta}
        {campo.obligatorio ? <span className="marca-obligatorio"> *</span> : null}
        <select value={valor || ''} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}>
          <option value="">Seleccionar responsable…</option>
          {staff.map((st, i) => (
            <option key={i} value={st}>{st}</option>
          ))}
        </select>
        {error && <span className="mensaje-error">{error}</span>}
      </label>
    );
  }

  return (
    <label className="campo-dinamico">
      {campo.etiqueta}
      {campo.obligatorio ? <span className="marca-obligatorio"> *</span> : null}
      <input
        type={TIPOS_HTML[campo.tipo_dato] || 'text'}
        value={valor || ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {error && <span className="mensaje-error">{error}</span>}
    </label>
  );
}

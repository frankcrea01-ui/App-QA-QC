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
export default function CampoDinamico({ campo, valor, error, onChange, onBlur }) {
  if (campo.tipo_dato === 'check') {
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

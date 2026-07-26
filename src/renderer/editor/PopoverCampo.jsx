import React, { useState } from 'react';

/** Qué llena cada tipo, explicado para el jefe de calidad. */
const AYUDA_TIPO = {
  texto: 'El registrador escribe.',
  fecha: 'El registrador elige en un calendario.',
  check: 'El registrador marca.',
  correlativo: 'Automático: 001, 002, 003…',
  proyecto: 'Automático: el nombre de la obra.',
  responsable: 'Automático: quien está llenando.',
};

/**
 * Configuración de una zona recién dibujada: qué va acá y si es obligatoria.
 * No persiste nada — arma el campo y lo devuelve al padre.
 *
 * La clave interna no se pide: se genera desde la etiqueta (ver EditorPlantilla).
 */
export default function PopoverCampo({ zona, tiposDato, tiposAutomaticos, onConfirmar, onCancelar, error }) {
  const [etiqueta, setEtiqueta] = useState('');
  const [tipoDato, setTipoDato] = useState('texto');
  const [obligatorio, setObligatorio] = useState(false);

  // Un tipo automático siempre se llena, así que "obligatorio" no aplica.
  const esAutomatico = tiposAutomaticos.includes(tipoDato);

  function manejarSubmit(evento) {
    evento.preventDefault();
    onConfirmar({
      ...zona,
      etiqueta: etiqueta.trim(),
      tipo_dato: tipoDato,
      obligatorio: esAutomatico ? false : obligatorio,
    });
  }

  return (
    <div className="popover-fondo">
      <form className="popover-campo" onSubmit={manejarSubmit}>
        <h3>Nueva zona (página {zona.pagina})</h3>

        <label>
          Etiqueta
          <input
            type="text"
            autoFocus
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            placeholder="ej: Proyecto"
            required
          />
        </label>

        <span className="titulo-tipo">¿Qué va acá?</span>
        <div className="botonera-tipo-dato">
          {tiposDato.map((tipo) => (
            <button
              type="button"
              key={tipo}
              className={tipo === tipoDato ? 'activo' : ''}
              onClick={() => setTipoDato(tipo)}
            >
              {tipo}
            </button>
          ))}
        </div>
        <small className="ayuda-tipo">{AYUDA_TIPO[tipoDato]}</small>

        {!esAutomatico && (
          <label className="linea-checkbox">
            <input
              type="checkbox"
              checked={obligatorio}
              onChange={(e) => setObligatorio(e.target.checked)}
            />
            Obligatorio
          </label>
        )}

        {error && <p className="mensaje-error">{error}</p>}

        <div className="botonera-popover">
          <button type="button" onClick={onCancelar}>Cancelar</button>
          <button type="submit">Agregar zona</button>
        </div>
      </form>
    </div>
  );
}

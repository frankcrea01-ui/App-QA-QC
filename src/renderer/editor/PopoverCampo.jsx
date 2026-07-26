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
  const [formatoCorrelativo, setFormatoCorrelativo] = useState('001');
  const [filasCheck, setFilasCheck] = useState(1);
  const [columnasCheck, setColumnasCheck] = useState(1);

  // Un tipo automático siempre se llena, así que "obligatorio" no aplica.
  const esAutomatico = tiposAutomaticos.includes(tipoDato);

  function manejarSubmit(evento) {
    evento.preventDefault();
    let opciones = null;
    if (tipoDato === 'correlativo') opciones = JSON.stringify({ formato: formatoCorrelativo });
    if (tipoDato === 'check') opciones = JSON.stringify({ filas: filasCheck, columnas: columnasCheck });

    onConfirmar({
      ...zona,
      etiqueta: etiqueta.trim(),
      tipo_dato: tipoDato,
      obligatorio: esAutomatico ? false : obligatorio,
      opciones,
    });
  }

  return (
    <div className="popover-fondo">
      <form className="popover-campo" onSubmit={manejarSubmit}>
        <h3>Nueva zona (página {zona.pagina})</h3>

        <span className="titulo-tipo">1. ¿Qué va acá?</span>
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

        <label>
          2. Etiqueta
          <input
            type="text"
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            placeholder="ej: Proyecto"
            required
          />
        </label>

        {tipoDato === 'correlativo' && (
          <label>
            Formato de números (ej: 01, 001, 0001)
            <input
              type="text"
              value={formatoCorrelativo}
              onChange={(e) => setFormatoCorrelativo(e.target.value)}
              placeholder="001"
              required
            />
          </label>
        )}

        {tipoDato === 'check' && (
          <div className="opciones-en-linea" style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
            <label>
              Filas
              <input
                type="number"
                min="1"
                value={filasCheck}
                onChange={(e) => setFilasCheck(parseInt(e.target.value, 10) || 1)}
                style={{ width: '4rem', marginLeft: '0.5rem' }}
              />
            </label>
            <label>
              Columnas
              <input
                type="number"
                min="1"
                value={columnasCheck}
                onChange={(e) => setColumnasCheck(parseInt(e.target.value, 10) || 1)}
                style={{ width: '4rem', marginLeft: '0.5rem' }}
              />
            </label>
          </div>
        )}

        {!esAutomatico && (
          <label className="linea-checkbox" style={{ marginTop: '1rem' }}>
            <input
              type="checkbox"
              checked={obligatorio}
              onChange={(e) => setObligatorio(e.target.checked)}
            />
            3. Es obligatorio
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

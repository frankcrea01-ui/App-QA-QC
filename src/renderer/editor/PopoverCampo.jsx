import React, { useState } from 'react';

/** Qué llena cada tipo, explicado para el jefe de calidad. */
const AYUDA_TIPO = {
  texto: 'El registrador escribe.',
  fecha: 'El registrador elige en un calendario.',
  check: 'El registrador marca.',
  correlativo: 'Automático: 001, 002, 003…',
  responsable: 'Manual: se selecciona del staff.',
  proyecto: 'Automático: el nombre de la obra.',
  cliente: 'Automático: el cliente asociado a la obra.',
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
  const [tipoGeneral, setTipoGeneral] = useState('proyecto'); // sub-opción para Dato General
  const [obligatorio, setObligatorio] = useState(false);
  const [formatoCorrelativo, setFormatoCorrelativo] = useState('001');
  const [filasCheck, setFilasCheck] = useState(1);
  const [columnasCheck, setColumnasCheck] = useState(3);
  const [encabezadosCheck, setEncabezadosCheck] = useState('Sí, No, N/A');

  // Un tipo automático siempre se llena, así que "obligatorio" no aplica.
  const tipoReal = tipoDato === 'dato_general' ? tipoGeneral : tipoDato;
  const esAutomatico = tiposAutomaticos.includes(tipoReal);
  const sinEtiqueta = tipoReal === 'proyecto' || tipoReal === 'cliente';

  function manejarSubmit(evento) {
    evento.preventDefault();
    let opciones = null;
    if (tipoReal === 'correlativo') opciones = JSON.stringify({ formato: formatoCorrelativo });
    if (tipoReal === 'check') {
      opciones = JSON.stringify({ 
        filas: filasCheck, 
        columnas: columnasCheck,
        encabezados: encabezadosCheck.split(',').map(s => s.trim())
      });
    }

    onConfirmar({
      ...zona,
      etiqueta: sinEtiqueta ? (tipoReal === 'proyecto' ? 'Proyecto' : 'Cliente') : etiqueta.trim(),
      tipo_dato: tipoReal,
      obligatorio: esAutomatico ? false : obligatorio,
      opciones,
    });
  }

  return (
    <div className="popover-fondo">
      <form className="popover-campo" onSubmit={manejarSubmit}>
        <h3>Nueva zona (página {zona.pagina})</h3>

        <span className="titulo-tipo">1. ¿Qué va aquí?</span>
        <div className="botonera-tipo-dato">
          {tiposDato.filter(t => t !== 'proyecto' && t !== 'cliente').map((tipo) => (
            <button
              type="button"
              key={tipo}
              className={tipo === tipoDato ? 'activo' : ''}
              onClick={() => setTipoDato(tipo)}
            >
              {tipo}
            </button>
          ))}
          <button
            type="button"
            className={tipoDato === 'dato_general' ? 'activo' : ''}
            onClick={() => setTipoDato('dato_general')}
          >
            dato general
          </button>
        </div>
        
        {tipoDato === 'dato_general' && (
          <div className="sub-opciones-tipo">
            <label>
              <input type="radio" checked={tipoGeneral === 'proyecto'} onChange={() => setTipoGeneral('proyecto')} />
              Proyecto
            </label>
            <label>
              <input type="radio" checked={tipoGeneral === 'cliente'} onChange={() => setTipoGeneral('cliente')} />
              Cliente
            </label>
          </div>
        )}
        <small className="ayuda-tipo">{AYUDA_TIPO[tipoReal]}</small>

        {!sinEtiqueta && (
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
        )}

        {tipoReal === 'correlativo' && (
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

        {tipoReal === 'check' && (
          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div className="opciones-en-linea" style={{ display: 'flex', gap: '1rem' }}>
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
            <label>
              Encabezados (separados por coma)
              <input
                type="text"
                value={encabezadosCheck}
                onChange={(e) => setEncabezadosCheck(e.target.value)}
                placeholder="Sí, No, N/A"
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

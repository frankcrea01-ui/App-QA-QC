import React from 'react';

/**
 * Resumen de las zonas ya configuradas, de todas las páginas. Sirve de
 * control anti-duplicidad antes de guardar la plantilla.
 *
 * No muestra la clave interna: se genera sola y al jefe de calidad no le
 * aporta nada (ver docs/decisiones-ui.md, D1).
 */
export default function TablaCampos({ campos, onEliminar }) {
  if (campos.length === 0) {
    return <p className="tabla-campos-vacia">Todavía no hay zonas configuradas.</p>;
  }

  const obligatorias = campos.filter((c) => c.obligatorio).length;

  return (
    <>
      <table className="tabla-campos">
        <thead>
          <tr>
            <th>Página</th>
            <th>Etiqueta</th>
            <th>Qué va</th>
            <th>Obligatorio</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {campos.map((campo) => (
            <tr key={campo.idLocal}>
              <td>{campo.pagina}</td>
              <td>{campo.etiqueta}</td>
              <td>{campo.tipo_dato}</td>
              <td>{campo.obligatorio ? 'Sí' : 'No'}</td>
              <td>
                <button type="button" onClick={() => onEliminar(campo.idLocal)}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="total-campos">
        {campos.length} {campos.length === 1 ? 'zona' : 'zonas'} en este formato
        {obligatorias > 0 && ` · ${obligatorias} obligatoria${obligatorias === 1 ? '' : 's'}`}
      </p>
    </>
  );
}

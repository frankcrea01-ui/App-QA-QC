import React from 'react';

export default function FormMetadatosPlantilla({ metadatos, especialidades, onChange, deshabilitado }) {
  const actualizar = (campo, valor) => onChange({ ...metadatos, [campo]: valor });

  return (
    <fieldset className="panel-metadatos" disabled={deshabilitado}>
      <legend>Datos de la plantilla</legend>

      <label>
        Código de plantilla
        <input
          type="text"
          value={metadatos.codigo_plantilla}
          onChange={(e) => actualizar('codigo_plantilla', e.target.value)}
          placeholder="ej: PROT-EST"
        />
      </label>

      <label>
        Nombre
        <input
          type="text"
          value={metadatos.nombre}
          onChange={(e) => actualizar('nombre', e.target.value)}
          placeholder="ej: Protocolo de Estructura"
        />
      </label>

      <label>
        Versión
        <input
          type="text"
          value={metadatos.version}
          onChange={(e) => actualizar('version', e.target.value)}
          placeholder="ej: v1"
        />
      </label>

      <label>
        Especialidad
        <input
          type="text"
          list="lista-especialidades"
          value={metadatos.especialidad}
          onChange={(e) => actualizar('especialidad', e.target.value)}
          placeholder="ej: estructura"
        />
        <datalist id="lista-especialidades">
          {especialidades.map((esp) => (
            <option key={esp} value={esp} />
          ))}
        </datalist>
      </label>
    </fieldset>
  );
}

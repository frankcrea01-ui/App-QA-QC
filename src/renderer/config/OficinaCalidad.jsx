import React, { useState, useEffect } from 'react';
import { invalidarConstantes } from '../useConstantes.js';
import './oficina.css';

export default function OficinaCalidad() {
  const [config, setConfig] = useState({
    proyectos: [],
    jefe: '',
    registradores: [],
    staff: [],
    especialidades: []
  });
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    window.api.config.obtenerOficina().then(setConfig);
  }, []);

  const handleChange = (e) => {
    setConfig({ ...config, [e.target.name]: e.target.value });
    setGuardado(false);
  };

  const handleListChange = (key, index, field, value) => {
    const list = [...config[key]];
    list[index][field] = value;
    setConfig({ ...config, [key]: list });
    setGuardado(false);
  };

  const handleAddList = (key, defaultObj) => {
    setConfig({ ...config, [key]: [...config[key], defaultObj] });
    setGuardado(false);
  };

  const handleRemoveList = (key, index) => {
    const list = [...config[key]];
    list.splice(index, 1);
    setConfig({ ...config, [key]: list });
    setGuardado(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await window.api.config.guardarOficina(config);
    invalidarConstantes(); // Para que las demás pestañas vuelvan a cargar las especialidades
    setGuardado(true);
    setTimeout(() => setGuardado(false), 3000);
  };

  return (
    <div className="oficina-calidad">
      <div className="oficina-header">
        <h1>Oficina de Calidad (Configuración SIG)</h1>
        <p>Configura los parámetros globales que alimentarán todos los protocolos y plantillas.</p>
      </div>

      <form onSubmit={handleSubmit} className="oficina-form">
        <section className="form-section">
          <h2>Proyectos (Obras)</h2>
          <p className="ayuda">Agrega los proyectos activos y su cliente. Esto aparecerá en el menú al registrar protocolos.</p>
          <div className="lista-dinamica">
            {config.proyectos.map((p, i) => (
              <div key={i} className="lista-item">
                <input 
                  type="text" 
                  name="nombre"
                  placeholder="Nombre del Proyecto (Ej: SERENA)" 
                  value={p.nombre} 
                  onChange={(e) => handleListChange('proyectos', i, 'nombre', e.target.value)} 
                  required 
                />
                <input 
                  type="text" 
                  name="cliente"
                  placeholder="Cliente (opcional)" 
                  value={p.cliente} 
                  onChange={(e) => handleListChange('proyectos', i, 'cliente', e.target.value)} 
                />
                <button type="button" className="btn-peligro" onClick={() => handleRemoveList('proyectos', i)}>x</button>
              </div>
            ))}
            <button type="button" className="btn-secundario" onClick={() => handleAddList('proyectos', { nombre: '', cliente: '' })}>
              + Agregar Proyecto
            </button>
          </div>
        </section>

        <section className="form-section">
          <h2>Datos Generales</h2>
          <label>
            Jefe de Calidad (Responsable Principal)
            <input name="jefe" value={config.jefe} onChange={handleChange} placeholder="Nombre y Apellido" required />
          </label>
        </section>

        <section className="form-section">
          <h2>Especialidades</h2>
          <p className="ayuda">Estructura, Arquitectura, Instalaciones, etc. Define su prefijo para el correlativo (Ej: EST).</p>
          <div className="lista-dinamica">
            {config.especialidades.map((esp, i) => (
              <div key={i} className="lista-item">
                <input 
                  type="text" 
                  placeholder="Especialidad (Ej: Estructura)" 
                  value={esp.nombre} 
                  onChange={(e) => handleListChange('especialidades', i, 'nombre', e.target.value)} 
                  required 
                />
                <input 
                  type="text" 
                  placeholder="Prefijo (Ej: EST)" 
                  maxLength={5}
                  value={esp.prefijo} 
                  onChange={(e) => handleListChange('especialidades', i, 'prefijo', e.target.value)} 
                  required 
                  className="input-corto"
                />
                <button type="button" className="btn-peligro" onClick={() => handleRemoveList('especialidades', i)}>x</button>
              </div>
            ))}
            <button type="button" className="btn-secundario" onClick={() => handleAddList('especialidades', { nombre: '', prefijo: '' })}>
              + Agregar Especialidad
            </button>
          </div>
        </section>

        <section className="form-section">
          <h2>Staff / Firmantes</h2>
          <p className="ayuda">Ingenieros, supervisores y capataces que pueden firmar como responsables de los protocolos.</p>
          <div className="lista-dinamica">
            {config.staff.map((st, i) => (
              <div key={i} className="lista-item">
                <input 
                  type="text" 
                  placeholder="Nombre y cargo (Ej: Ing. Juan - Supervisor)" 
                  value={st.nombre} 
                  onChange={(e) => handleListChange('staff', i, 'nombre', e.target.value)} 
                  required 
                />
                <button type="button" className="btn-peligro" onClick={() => handleRemoveList('staff', i)}>x</button>
              </div>
            ))}
            <button type="button" className="btn-secundario" onClick={() => handleAddList('staff', { nombre: '' })}>
              + Agregar Miembro del Staff
            </button>
          </div>
        </section>

        <section className="form-section">
          <h2>Registradores (Personal de Obra)</h2>
          <p className="ayuda">Quienes llenarán los protocolos en campo.</p>
          <div className="lista-dinamica">
            {config.registradores.map((reg, i) => (
              <div key={i} className="lista-item">
                <input 
                  type="text" 
                  placeholder="Nombre del registrador" 
                  value={reg.nombre} 
                  onChange={(e) => handleListChange('registradores', i, 'nombre', e.target.value)} 
                  required 
                />
                <button type="button" className="btn-peligro" onClick={() => handleRemoveList('registradores', i)}>x</button>
              </div>
            ))}
            <button type="button" className="btn-secundario" onClick={() => handleAddList('registradores', { nombre: '' })}>
              + Agregar Registrador
            </button>
          </div>
        </section>

        <div className="form-acciones">
          <button type="submit" className="btn-principal">Guardar Configuración</button>
          {guardado && <span className="mensaje-exito">¡Configuración guardada!</span>}
        </div>
      </form>
    </div>
  );
}

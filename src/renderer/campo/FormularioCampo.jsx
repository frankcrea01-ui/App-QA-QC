import React, { useEffect, useMemo, useState } from 'react';
import CampoDinamico from './CampoDinamico.jsx';
import PanelFotos from './PanelFotos.jsx';
import BotonGenerarPdf from './BotonGenerarPdf.jsx';
import { useConstantes } from '../constantes.js';

/** Qué muestra el bloque de solo lectura para cada zona automática. */
function valorAutomatico(tipo, sesion) {
  if (tipo === 'proyecto') return sesion.proyecto;
  if (tipo === 'responsable') return sesion.responsable;
  if (tipo === 'correlativo') return 'se asigna al guardar';
  return '';
}

export default function FormularioCampo({ template, sesion, onVolver }) {
  const { tiposAutomaticos } = useConstantes();
  const [campos, setCampos] = useState(null);
  const [valores, setValores] = useState({});
  const [erroresPorCampo, setErroresPorCampo] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [resultado, setResultado] = useState(null); // { protocoloId, codigoProtocolo }

  useEffect(() => {
    let vigente = true;
    window.api.templates.obtenerCampos(template.id).then((c) => {
      if (vigente) setCampos(c);
    });
    return () => {
      vigente = false;
    };
  }, [template.id]);

  // Las zonas automáticas se muestran, pero no se piden.
  const { automaticas, manuales } = useMemo(() => {
    const lista = campos || [];
    return {
      automaticas: lista.filter((c) => tiposAutomaticos.includes(c.tipo_dato)),
      manuales: lista.filter((c) => !tiposAutomaticos.includes(c.tipo_dato)),
    };
  }, [campos, tiposAutomaticos]);

  function manejarCambioValor(claveCampo, valor) {
    setValores((prev) => ({ ...prev, [claveCampo]: valor }));
  }

  /**
   * Valida contra /core (vía IPC) pero solo muestra el error del campo que se
   * acaba de dejar, para no llenar de rojo lo que todavía no se tocó.
   */
  async function manejarBlurValor(campo) {
    const { errores } = await window.api.protocolos.validar(template.id, valores);
    const suyo = errores.find((e) => e.clave_campo === campo.clave_campo);
    setErroresPorCampo((prev) => ({ ...prev, [campo.clave_campo]: suyo ? suyo.mensaje : null }));
  }

  async function manejarGuardar(evento) {
    evento.preventDefault();
    setErrorGeneral(null);
    setGuardando(true);
    try {
      const respuesta = await window.api.protocolos.crear({
        templateId: template.id,
        versionUsada: template.version,
        especialidad: template.especialidad,
        proyecto: sesion.proyecto,
        responsable: sesion.responsable,
        valoresPorClave: valores,
      });

      if (!respuesta.ok) {
        const errores = {};
        for (const err of respuesta.errores) errores[err.clave_campo] = err.mensaje;
        setErroresPorCampo(errores);
        setErrorGeneral('Hay campos con errores, revisalos antes de guardar.');
        return;
      }

      setResultado({
        protocoloId: respuesta.protocoloId,
        codigoProtocolo: respuesta.codigoProtocolo,
        correlativo: respuesta.correlativo,
      });
    } catch (e) {
      setErrorGeneral(e.message || String(e));
    } finally {
      setGuardando(false);
    }
  }

  if (!campos) return <p>Cargando formulario…</p>;

  if (resultado) {
    return (
      <div className="formulario-campo">
        <h1>Protocolo guardado</h1>
        <p className="mensaje-ok">
          Código: {resultado.codigoProtocolo}
          {resultado.correlativo && <> · N° {resultado.correlativo}</>}
        </p>

        <BotonGenerarPdf protocoloId={resultado.protocoloId} />

        <PanelFotos protocoloId={resultado.protocoloId} />
        <button type="button" onClick={onVolver}>Llenar otro protocolo</button>
      </div>
    );
  }

  return (
    <form className="formulario-campo" onSubmit={manejarGuardar}>
      <h1>{template.nombre} — {template.version}</h1>
      <button type="button" onClick={onVolver}>← Elegir otro protocolo</button>

      {automaticas.length > 0 && (
        <div className="bloque-automatico">
          <span className="titulo-automatico">Se llena solo</span>
          {automaticas.map((campo) => (
            <div key={campo.id} className="linea-automatica">
              <span>{campo.etiqueta}</span>
              <strong>{valorAutomatico(campo.tipo_dato, sesion)}</strong>
            </div>
          ))}
        </div>
      )}

      {manuales.map((campo) => (
        <CampoDinamico
          key={campo.id}
          campo={campo}
          valor={valores[campo.clave_campo]}
          error={erroresPorCampo[campo.clave_campo]}
          onChange={(valor) => manejarCambioValor(campo.clave_campo, valor)}
          onBlur={() => manejarBlurValor(campo)}
        />
      ))}

      {errorGeneral && <p className="mensaje-error">{errorGeneral}</p>}
      <button type="submit" disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar protocolo'}
      </button>
    </form>
  );
}

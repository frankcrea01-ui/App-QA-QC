import React from 'react';
import './onboarding.css';

const PASOS = [
  {
    titulo: 'Oficina de calidad → Plantillas',
    texto: 'Carga el PDF del protocolo y dibuja con el mouse las zonas que se van a llenar. A cada zona le defines tipo de dato, si es obligatoria y un ejemplo.',
  },
  {
    titulo: 'Revisa y pasa a producción',
    texto: 'Al guardar vas a la vista previa: el PDF con datos de ejemplo (verde = obligatorio, ámbar = opcional). Recién cuando presionas "Pasar a producción" la plantilla queda disponible en obra.',
  },
  {
    titulo: 'Registro en obra',
    texto: 'Es la pantalla del personal de terreno: elige el protocolo, lo llena y adjunta hasta 5 fotos. No pide usuario ni contraseña — cada registro queda identificado por el dispositivo.',
  },
  {
    titulo: 'Oficina de calidad → Log maestro',
    texto: 'Seguimiento de todos los protocolos: filtros por estado y especialidad, detalle completo, y el historial de quién cambió cada estado y cuándo.',
  },
];

export default function OnboardingJefe({ onCerrar }) {
  return (
    <div className="onboarding-fondo">
      <div className="onboarding-panel">
        <h1>Guía rápida</h1>
        <p>La app tiene dos modos, uno por cada rol:</p>
        {PASOS.map((paso) => (
          <div key={paso.titulo} className="onboarding-paso">
            <h3>{paso.titulo}</h3>
            <p>{paso.texto}</p>
          </div>
        ))}
        <p className="onboarding-nota">
          Recuerda: la firma física sigue siendo el cierre legal real. El estado
          "cerrado" aquí es un registro digital de respaldo, no una firma electrónica.
        </p>
        <button type="button" onClick={onCerrar}>Entendido, empezar</button>
      </div>
    </div>
  );
}

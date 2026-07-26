import { useEffect, useState } from 'react';

/**
 * Las constantes (estados, tipos de dato, especialidades, tope de fotos)
 * viven en /shared y llegan por IPC. La UI no mantiene copias propias, así
 * no se desincronizan de las reglas de negocio.
 */
const VACIAS = {
  especialidades: [],
  estados: [],
  tiposDato: [],
  tiposAutomaticos: [],
  maxFotos: 0,
};

let promesaCache = null;

function cargarConstantes() {
  if (!promesaCache) promesaCache = window.api.meta.constantes();
  return promesaCache;
}

export function useConstantes() {
  const [constantes, setConstantes] = useState(VACIAS);

  useEffect(() => {
    let vigente = true;
    cargarConstantes().then((c) => {
      if (vigente) setConstantes(c);
    });
    return () => {
      vigente = false;
    };
  }, []);

  return constantes;
}

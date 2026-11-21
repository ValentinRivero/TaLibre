import { useCallback, useEffect, useState } from 'react';
import { segundosRestantes } from '../utils/recuperacion.js';

/**
 * Cuenta regresiva en segundos (por ejemplo, la espera para reenviar un código). `iniciar(segundos)` la arranca o la
 * reinicia; `restantes` llega a 0 y ahí se detiene el temporizador.
 */
export default function useCuentaRegresiva() {
  const [hasta, setHasta] = useState(0);
  const [ahora, setAhora] = useState(0);
  const restantes = segundosRestantes(hasta, ahora);
  const activa = restantes > 0;

  useEffect(() => {
    if (!activa) return undefined;
    const temporizador = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(temporizador);
  }, [activa, hasta]);

  const iniciar = useCallback((segundos) => {
    const inicio = Date.now();
    setAhora(inicio);
    setHasta(inicio + segundos * 1000);
  }, []);

  return { restantes, iniciar };
}

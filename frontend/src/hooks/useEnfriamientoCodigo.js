import { useCallback, useEffect, useMemo, useState } from 'react';
import { borrarEnfriamiento, consultarEnfriamiento, iniciarEnfriamiento } from '../utils/enfriamientoCodigo.js';
import { segundosRestantes } from '../utils/recuperacion.js';

/**
 * Espera entre dos pedidos de código para un mismo correo. El instante de fin se guarda en `sessionStorage` bajo una
 * huella del correo (nunca el correo), así sobrevive a cambiar de pantalla y a recargar la pestaña, y rige solo para
 * ese correo: con otro, se puede pedir enseguida. `restantes` llega a 0 y ahí se detiene el temporizador.
 */
export default function useEnfriamientoCodigo(email) {
  const [version, setVersion] = useState(0);
  const [ahora, setAhora] = useState(() => Date.now());
  // Se relee al cambiar el correo o cuando esta pantalla inicia o borra un enfriamiento (`version`), junto con la hora
  // de esa lectura: así la cuenta es correcta apenas se escribe un correo con espera, aunque el reloj interno esté viejo.
  const lectura = useMemo(() => ({ ...consultarEnfriamiento(email), version }), [email, version]);
  const restantes = segundosRestantes(lectura.fin, Math.max(ahora, lectura.ahora));
  const activa = restantes > 0;

  useEffect(() => {
    if (!activa) return undefined;
    const temporizador = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(temporizador);
  }, [activa, lectura]);

  const iniciar = useCallback((correo) => {
    iniciarEnfriamiento(correo);
    setVersion((actual) => actual + 1);
  }, []);

  const limpiar = useCallback((correo) => {
    borrarEnfriamiento(correo);
    setVersion((actual) => actual + 1);
  }, []);

  return { restantes, iniciar, limpiar };
}

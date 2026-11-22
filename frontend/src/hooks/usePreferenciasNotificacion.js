import { useMemo, useState } from 'react';
import { t } from '../i18n/index.js';
import { guardarPreferenciasNotificacion, obtenerPreferenciasNotificacion } from '../services/preferenciaNotificacionService.js';
import { alternar, armarPayload, cambiosPendientes, construirEstado } from '../utils/preferenciasNotificacion.js';
import useConsulta from './useConsulta.js';
import useEnvio from './useEnvio.js';

/**
 * Matriz de preferencias de notificaciones por rol (superadmin): la consulta, las ediciones locales sin guardar y el
 * guardado de solo los pares modificados. Las ediciones pertenecen a la consulta que las originó: al llegar datos
 * nuevos (tras guardar o recargar) se descartan solas y vuelve a verse lo guardado.
 */
export default function usePreferenciasNotificacion() {
  const consulta = useConsulta((signal) => obtenerPreferenciasNotificacion(signal), []);
  const envio = useEnvio();
  const [aviso, setAviso] = useState(null);
  const [edicion, setEdicion] = useState({ fuente: null, valores: null });

  const guardado = useMemo(() => (consulta.datos ? construirEstado(consulta.datos) : null), [consulta.datos]);
  const valores = edicion.fuente === guardado ? edicion.valores : guardado;
  const cantidadCambios = cambiosPendientes(valores, guardado).length;

  const cambiar = (categoria, rol) => {
    envio.limpiar();
    setAviso(null);
    setEdicion({ fuente: guardado, valores: alternar(valores, categoria, rol) });
  };

  const descartar = () => {
    envio.limpiar();
    setEdicion({ fuente: null, valores: null });
  };

  const recargar = () => {
    descartar();
    consulta.recargar();
  };

  const guardar = async () => {
    const cuerpo = armarPayload(valores, guardado);
    if (cuerpo === null) return;
    setAviso(null);
    const resultado = await envio.enviar(() => guardarPreferenciasNotificacion(cuerpo));
    if (!resultado.ok) return;
    setAviso(t('preferenciasNotificacion.avisoGuardado'));
    consulta.recargar();
  };

  return {
    matriz: consulta.datos,
    valores,
    cargando: consulta.cargando && consulta.datos === null,
    error: consulta.error,
    recargarConsulta: consulta.recargar,
    // Mientras se recarga tras guardar no se admite otro guardado ni otra edición sobre datos por reemplazar.
    ocupado: envio.enviando || consulta.cargando,
    enviando: envio.enviando,
    cantidadCambios,
    hayCambios: cantidadCambios > 0,
    cambiar,
    descartar,
    guardar,
    recargar,
    errorGuardado: envio.error,
    descartarErrorGuardado: envio.limpiar,
    aviso,
    descartarAviso: () => setAviso(null),
  };
}

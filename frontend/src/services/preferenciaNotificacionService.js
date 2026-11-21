/**
 * Preferencias de notificaciones por rol base (solo superadmin). La respuesta de ambos métodos es la matriz completa:
 * `{ roles: [{ codigo, nombre }], categorias: [{ codigo, nombre, orden, roles_aplicables, habilitadas }] }`, donde
 * `habilitadas[rol]` es `true`, `false` o `null` si la categoría no aplica a ese rol.
 */
import { apiDjango } from './api.js';

const RUTA_PREFERENCIAS = '/api/sistema/notificaciones/preferencias/';

export const obtenerPreferenciasNotificacion = async (signal) => {
  const { data } = await apiDjango.get(RUTA_PREFERENCIAS, { signal });
  return data;
};

/** `cuerpo` es `{ preferencias: [{ tipo_notificacion, rol_base, habilitada }] }`, con una lista no vacía de pares válidos. */
export const guardarPreferenciasNotificacion = async (cuerpo) => {
  const { data } = await apiDjango.put(RUTA_PREFERENCIAS, cuerpo);
  return data;
};

/**
 * Estado editable de la matriz de preferencias de notificaciones. El estado es `{ [categoria]: { [rol]: boolean | null } }`
 * y `null` marca una combinación que no existe: nunca se alterna ni viaja al backend. Todas las funciones son puras.
 */

const esInterruptor = (valor) => typeof valor === 'boolean';

/** Estado inicial a partir de la matriz que devuelve el backend, con una entrada por categoría y por rol. */
export const construirEstado = (matriz) => Object.fromEntries(
  matriz.categorias.map((categoria) => [
    categoria.codigo,
    Object.fromEntries(matriz.roles.map(({ codigo }) => {
      const valor = categoria.habilitadas?.[codigo];
      return [codigo, esInterruptor(valor) ? valor : null];
    })),
  ]),
);

/** Copia del estado con la celda invertida. Una celda que no aplica o desconocida devuelve el mismo estado. */
export const alternar = (estado, categoria, rol) => {
  const valor = estado[categoria]?.[rol];
  if (!esInterruptor(valor)) return estado;
  return { ...estado, [categoria]: { ...estado[categoria], [rol]: !valor } };
};

/** Pares `{ tipo_notificacion, rol_base, habilitada }` de las celdas que difieren del último estado guardado. */
export const cambiosPendientes = (actual, guardado) => {
  if (!actual || !guardado) return [];
  return Object.entries(actual).flatMap(([categoria, roles]) => (
    Object.entries(roles)
      // Solo cuentan las celdas que existen en lo guardado: una combinación que no aplica nunca viaja al backend.
      .filter(([rol, valor]) => esInterruptor(valor) && esInterruptor(guardado[categoria]?.[rol]) && valor !== guardado[categoria][rol])
      .map(([rol, valor]) => ({ tipo_notificacion: categoria, rol_base: rol, habilitada: valor }))
  ));
};

export const hayCambios = (actual, guardado) => cambiosPendientes(actual, guardado).length > 0;

/** Cuerpo del `PUT` con solo los pares modificados, o `null` si no hay ninguno: el backend rechaza una lista vacía. */
export const armarPayload = (actual, guardado) => {
  const preferencias = cambiosPendientes(actual, guardado);
  return preferencias.length > 0 ? { preferencias } : null;
};

/**
 * Único enlace de la barra que corresponde a la ruta actual, o `null` si ninguno. La portada (`/`) coincide solo de
 * forma exacta; el resto, por ruta exacta o de subruta (`/panel/agenda` pertenece a `/panel`). Si varios coinciden
 * (`/panel` y `/panel/reportes` para `/panel/reportes`), gana el más específico: nunca hay dos activos a la vez.
 */
export const enlaceActivo = (pathname, rutas) => {
  const coincidencias = rutas.filter((ruta) => (
    ruta === '/' ? pathname === '/' : pathname === ruta || pathname.startsWith(`${ruta}/`)
  ));
  return coincidencias.reduce((mejor, ruta) => (mejor === null || ruta.length > mejor.length ? ruta : mejor), null);
};

const RUTA_PORTADA = '/';
const PREFIJOS_PANEL = ['/panel', '/sistema'];

/**
 * Ancho de la plantilla para una ruta: la portada arma sus propias secciones a todo el ancho (`completo`), los paneles
 * de administración usan el contenedor fluido (`panel`) y el resto, el contenedor estándar (`normal`).
 */
export const anchoDePlantilla = (pathname) => {
  if (pathname === RUTA_PORTADA) return 'completo';
  return PREFIJOS_PANEL.some((prefijo) => pathname === prefijo || pathname.startsWith(`${prefijo}/`)) ? 'panel' : 'normal';
};

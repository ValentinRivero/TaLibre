import { createContext, useContext, useEffect, useState, useTransition } from 'react';
import { useLocation } from 'react-router-dom';

/** Indica a las plantillas si hay otra pantalla en camino, para mostrar el velo de carga sobre la actual. */
export const NavegacionContext = createContext(false);

export const useNavegacionEnCurso = () => useContext(NavegacionContext);

/** Una navegación cambia de pantalla cuando cambia la ruta: los filtros y pestañas de la query no cuentan. */
export const cambiaDePantalla = (actual, mostrada) => actual.pathname !== mostrada.pathname;

/**
 * Ubicación que dibujan las rutas. Al cambiar de pantalla, la anterior queda visible mientras la nueva se prepara
 * (por ejemplo, mientras se descarga su código) y `navegando` permite mostrar el velo de carga encima. Sin esto, el
 * límite de carga desmontaría la pantalla anterior y el velo quedaría sobre un fondo vacío. Los cambios de la query
 * dentro de la misma pantalla se aplican al instante, para no demorar filtros ni búsquedas.
 */
export default function useUbicacionMostrada() {
  const actual = useLocation();
  const [mostrada, setMostrada] = useState(actual);
  const [pendiente, iniciarTransicion] = useTransition();
  const otraPantalla = cambiaDePantalla(actual, mostrada);

  useEffect(() => {
    if (otraPantalla) iniciarTransicion(() => setMostrada(actual));
  }, [actual, otraPantalla]);

  return { ubicacion: otraPantalla ? mostrada : actual, navegando: pendiente || otraPantalla };
}

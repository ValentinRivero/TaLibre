import { useEffect, useRef } from 'react';
import { useNavigationType } from 'react-router-dom';

/**
 * Lleva la página al tope al navegar a otra pantalla, como lo haría una carga completa. Solo reacciona al cambio de
 * ruta (`pathname`): los filtros y las pestañas que cambian la query no mueven el desplazamiento, y volver atrás
 * (`POP`) se deja al navegador. Recibe la ruta que se está mostrando, no la pedida: así el desplazamiento cambia
 * cuando la pantalla nueva ya está a la vista y no mientras la anterior sigue cubierta por el velo. No dibuja nada.
 */
export default function ScrollAlInicio({ pathname }) {
  const tipo = useNavigationType();
  const anterior = useRef(pathname);

  useEffect(() => {
    if (anterior.current === pathname) return;
    anterior.current = pathname;
    if (tipo !== 'POP') window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, tipo]);

  return null;
}

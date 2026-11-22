import pelotasAnimadas from '../assets/loader-pelotas.webp';
import pelotaQuieta from '../assets/loader-pelotas-quieta.png';
import { t } from '../i18n/index.js';

/**
 * Único lugar que conoce el aspecto de los indicadores de carga (este y la animación de abajo, más las reglas
 * `.cargando-*` de tema.css): ningún otro archivo depende de cómo se ven. El circular queda para botones y textos,
 * donde la animación no entra.
 */
function IndicadorChico() {
  return <span className="cargando-indicador cargando-indicador-chico" aria-hidden="true" />;
}

/**
 * Animación de las variantes grandes: una pelota que gira y se transforma en la siguiente (tenis, fútbol, básquet y
 * vóley). Si el sistema pide reducir el movimiento, el navegador elige la imagen quieta. Es decorativa: el estado lo
 * anuncia la leyenda.
 */
function AnimacionPelotas({ chica = false }) {
  return (
    <picture className={`cargando-pelotas${chica ? ' cargando-pelotas-chica' : ''}`} aria-hidden="true">
      <source media="(prefers-reduced-motion: reduce)" srcSet={pelotaQuieta} />
      <img src={pelotasAnimadas} alt="" width="144" height="144" decoding="async" />
    </picture>
  );
}

/**
 * Estado de carga de toda petición asíncrona.
 * - `superpuesto`: capa translúcida sobre el área de contenido (debajo de la barra superior) mientras carga una
 *   pantalla; aparece con una demora corta para que los cambios instantáneos no parpadeen. El contenedor debe tener
 *   `position: relative`.
 * - `pantalla`: ocupa el espacio de una página (carga de rutas).
 * - `seccion`: reemplaza el contenido de un bloque mientras llegan sus datos.
 * - `boton`: indicador chico dentro de un botón.
 * - `inline`: indicador chico junto a un texto.
 */
export default function Cargando({ variante = 'seccion', texto, className = '' }) {
  const leyenda = texto ?? t('comun.cargando');

  if (variante === 'boton' || variante === 'inline') {
    return (
      <span role="status" className={`d-inline-flex align-items-center gap-2 ${className}`.trim()}>
        <IndicadorChico />
        {variante === 'inline' ? <span>{leyenda}</span> : <span className="visually-hidden">{leyenda}</span>}
      </span>
    );
  }

  const contenedor = { superpuesto: 'cargando-superpuesto', pantalla: 'cargando-pantalla' }[variante] ?? 'cargando-seccion';
  const contenido = (
    <>
      <AnimacionPelotas chica={contenedor === 'cargando-seccion'} />
      <span className="cargando-leyenda">{leyenda}</span>
    </>
  );
  return (
    <div role="status" className={`${contenedor} ${className}`.trim()}>
      {/* Sobre una pantalla larga, la animación queda fija a la vista aunque la página esté desplazada. */}
      {variante === 'superpuesto' ? <div className="cargando-superpuesto-centro">{contenido}</div> : contenido}
    </div>
  );
}

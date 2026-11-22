import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import Cargando from './Cargando.jsx';

const html = (props) => renderToStaticMarkup(createElement(Cargando, props));

describe('Cargando: animación de pelotas en las variantes grandes', () => {
  it.each(['pantalla', 'superpuesto', 'seccion'])('la variante %s muestra la animación y la leyenda debajo', (variante) => {
    const salida = html({ variante, texto: 'Cargando datos' });

    expect(salida).toContain('role="status"');
    expect(salida).toMatch(/<picture[^>]*class="cargando-pelotas[^"]*"/);
    expect(salida).toMatch(/<img[^>]+alt=""/);
    // La leyenda va después de la animación, en una línea propia.
    expect(salida.indexOf('<picture')).toBeLessThan(salida.indexOf('Cargando datos'));
    expect(salida).toMatch(/<span class="cargando-leyenda">Cargando datos<\/span>/);
  });

  it('con "reducir movimiento" activado se muestra una pelota quieta', () => {
    const salida = html({ variante: 'pantalla' });

    expect(salida).toMatch(/<source media="\(prefers-reduced-motion: reduce\)" srcSet="[^"]+"/);
  });

  it('dentro de una sección la animación es más chica que en pantalla completa', () => {
    expect(html({ variante: 'seccion' })).toContain('cargando-pelotas-chica');
    expect(html({ variante: 'pantalla' })).not.toContain('cargando-pelotas-chica');
  });

  it('la variante superpuesta agrupa la animación y la leyenda para dejarlas fijas a la vista sobre el velo', () => {
    const salida = html({ variante: 'superpuesto' });

    expect(salida).toMatch(/^<div role="status" class="cargando-superpuesto"><div class="cargando-superpuesto-centro"><picture/);
    expect(html({ variante: 'pantalla' })).not.toContain('cargando-superpuesto-centro');
  });

  it('sin texto propio usa la leyenda común', () => {
    expect(html({ variante: 'superpuesto' })).toContain('Cargando...');
  });

  it.each(['boton', 'inline'])('la variante %s conserva el indicador chico y no carga la animación', (variante) => {
    const salida = html({ variante, texto: 'Guardando' });

    expect(salida).not.toContain('<picture');
    expect(salida).toContain('cargando-indicador cargando-indicador-chico');
  });
});

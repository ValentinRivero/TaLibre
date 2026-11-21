import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import ClimaCard from './ClimaCard.jsx';

const DATOS = {
  actual: { temperatura: 27, descripcion: 'Despejado', viento_kmh: 10 },
  pronostico: [{ fecha: '2026-11-21', temperatura_max: 30, temperatura_min: 18, descripcion: 'Despejado' }],
};

const portada = (props) => renderToStaticMarkup(createElement(ClimaCard, { variante: 'compacto', ...props }));

// Sin la clase `clima-reserva`, el aviso (posicionado en absoluto) toma como caja al hero entero y se sale de la tarjeta.
describe('ClimaCard compacta: el aviso queda dentro de su caja', () => {
  it('mientras carga, la caja que contiene al aviso conserva la clase clima-reserva', () => {
    const html = portada({ datos: null, cargando: true, error: null });

    expect(html).toMatch(/^<div class="clima-reserva" aria-busy="true">/);
    expect(html).toContain('clima-reserva-estado');
  });

  it('con error, la caja también conserva la clase clima-reserva', () => {
    const html = portada({ datos: null, cargando: false, error: new Error('sin red') });

    expect(html).toMatch(/^<div class="clima-reserva" role="status">/);
  });

  it('con datos, muestra la tarjeta sin la caja de reserva', () => {
    const html = portada({ datos: DATOS, cargando: false, error: null });

    expect(html).not.toContain('clima-reserva');
    expect(html).toContain('Despejado');
  });
});

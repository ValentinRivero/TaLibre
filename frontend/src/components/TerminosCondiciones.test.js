import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { PARAMETROS } from '../config/parametros.js';
import { t, tLista } from '../i18n/index.js';
import { enlaceCorreoContacto } from '../utils/contacto.js';
import PiePagina from './PiePagina.jsx';
import TarjetaAlias from './TarjetaAlias.jsx';
import TerminosCondiciones from './TerminosCondiciones.jsx';

const enlaceContacto = () => enlaceCorreoContacto(t('terminos.asuntoContacto'));

const html = (componente, props = {}) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(componente, props)));

const CLAVES_SECCIONES = [
  'objeto', 'demostracion', 'pagos', 'responsabilidad', 'cuentas', 'propiedad', 'datos', 'modificaciones', 'ley', 'contacto',
];

describe('Términos y condiciones de uso', () => {
  it('muestra el título, la versión compartida con la política y la advertencia de sitio de demostración', () => {
    const salida = html(TerminosCondiciones);

    expect(salida).toContain(t('terminos.titulo'));
    expect(salida).toContain(`Versión ${PARAMETROS.politica.version}`);
    expect(salida).toContain(t('terminos.advertenciaTitulo'));
    expect(salida).toContain('role="alert"');
  });

  it('presenta las diez secciones numeradas en orden', () => {
    const salida = html(TerminosCondiciones);
    const posiciones = CLAVES_SECCIONES.map((clave) => salida.indexOf(t(`terminos.secciones.${clave}.titulo`)));

    posiciones.forEach((posicion, indice) => {
      expect(posicion).toBeGreaterThan(-1);
      expect(t(`terminos.secciones.${CLAVES_SECCIONES[indice]}.titulo`)).toMatch(new RegExp(`^${indice + 1}\\. `));
    });
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
  });

  it('solo cita por número la ley de datos personales y nombra el resto de la normativa en términos generales', () => {
    const texto = CLAVES_SECCIONES.flatMap((clave) => tLista(`terminos.secciones.${clave}.parrafos`)).join(' ');

    expect(texto).toContain('Ley 25.326');
    expect(texto.match(/Ley \d/g)).toHaveLength(1);
    expect(texto).toContain('defensa del consumidor');
    expect(texto).toContain('leyes de la República Argentina');
  });

  it('enlaza a la política de privacidad y al correo de contacto con el asunto codificado', () => {
    const salida = html(TerminosCondiciones);

    expect(salida).toContain('href="/privacidad"');
    expect(enlaceContacto()).toBe(`mailto:${PARAMETROS.politica.contacto}?subject=Duda%20TaLibre`);
    expect(salida).toContain(enlaceContacto());
  });

  it('ningún texto de los términos usa punto y coma', () => {
    const textos = [
      t('terminos.titulo'),
      t('terminos.advertencia'),
      t('terminos.introduccion'),
      ...CLAVES_SECCIONES.flatMap((clave) => [
        t(`terminos.secciones.${clave}.titulo`),
        ...tLista(`terminos.secciones.${clave}.parrafos`),
      ]),
    ];

    textos.forEach((texto) => expect(texto).not.toContain(';'));
  });
});

describe('enlaces a los términos', () => {
  it('el diálogo de reaceptación no tapa la lectura de los términos ni de la política', () => {
    expect(PARAMETROS.politica.rutasSinAceptacion).toEqual(expect.arrayContaining(['/terminos', '/privacidad', '/perfil']));
  });

  it('el pie enlaza a los términos y a la política', () => {
    const salida = html(PiePagina);

    expect(salida).toContain('href="/terminos"');
    expect(salida).toContain('href="/privacidad"');
  });

  it('la tarjeta del alias advierte que los datos son de demostración y enlaza a los términos', () => {
    const salida = html(TarjetaAlias, { datos: { alias: 'cancha.demo.goya', cbu: null, titular: 'Complejo Demo' }, monto: '5000' });

    expect(salida).toContain(t('pagos.avisoDemostracion'));
    expect(salida).toContain('href="/terminos"');
  });

  it('la casilla del registro nombra los dos documentos', () => {
    expect(t('registro.aceptoTerminosLink')).toBe('Términos y condiciones');
    expect(t('registro.aceptoPoliticaLink')).toBe('Política de privacidad');
    expect(t('registro.debeAceptar')).toContain('Términos y condiciones');
  });
});

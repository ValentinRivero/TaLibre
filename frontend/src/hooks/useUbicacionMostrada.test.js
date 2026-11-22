import { describe, expect, test } from 'vitest';
import { cambiaDePantalla } from './useUbicacionMostrada.js';

const ubicacion = (pathname, search = '') => ({ pathname, search, key: `${pathname}${search}` });

describe('cambiaDePantalla', () => {
  test('ir a otra ruta es cambiar de pantalla: la anterior queda visible bajo el velo', () => {
    expect(cambiaDePantalla(ubicacion('/panel/agenda'), ubicacion('/'))).toBe(true);
  });

  test('cambiar solo la query (filtros, pestañas, búsqueda) no es cambiar de pantalla', () => {
    expect(cambiaDePantalla(ubicacion('/', '?deporte=2'), ubicacion('/'))).toBe(false);
  });

  test('volver a la misma ruta no muestra el velo', () => {
    expect(cambiaDePantalla(ubicacion('/perfil'), ubicacion('/perfil'))).toBe(false);
  });
});

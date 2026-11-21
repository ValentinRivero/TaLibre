import { afterEach, describe, expect, test, vi } from 'vitest';
import { PARAMETROS } from '../config/parametros.js';
import {
  almacenDeSesion,
  borrarEnfriamiento,
  consultarEnfriamiento,
  finDeEnfriamiento,
  huellaDeCorreo,
  iniciarEnfriamiento,
} from './enfriamientoCodigo.js';

const { claveEnfriamiento, enfriamientoSegundos } = PARAMETROS.recuperacion;
const CORREO = 'jugador@example.com';
const OTRO_CORREO = 'jugadora@example.com';
const T0 = 1_800_000_000_000;

/** `sessionStorage` simulado: permite volcar todo lo guardado para comprobar que no hay datos legibles. */
const crearAlmacen = () => {
  const datos = new Map();
  return {
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => datos.set(clave, String(valor)),
    removeItem: (clave) => datos.delete(clave),
    volcado: () => JSON.stringify([...datos.entries()]),
    claves: () => [...datos.keys()],
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  borrarEnfriamiento(CORREO, { almacen: almacenDeSesion(), ahora: 0 });
});

describe('huellaDeCorreo', () => {
  test('es la misma para el mismo correo, sin importar mayúsculas ni espacios en los extremos', () => {
    expect(huellaDeCorreo(' Jugador@Example.COM ')).toBe(huellaDeCorreo(CORREO));
  });

  test('cambia con cualquier otro correo', () => {
    expect(huellaDeCorreo(OTRO_CORREO)).not.toBe(huellaDeCorreo(CORREO));
    expect(huellaDeCorreo('jugador@example.org')).not.toBe(huellaDeCorreo(CORREO));
  });

  test('no contiene el correo ni sus partes', () => {
    const huella = huellaDeCorreo(CORREO);

    expect(huella).toMatch(/^[0-9a-z]+$/);
    expect(huella).not.toContain('jugador');
    expect(huella).not.toContain('example');
    expect(huella).not.toContain('@');
  });

  test('un correo vacío no tiene huella', () => {
    expect(huellaDeCorreo('')).toBeNull();
    expect(huellaDeCorreo('   ')).toBeNull();
    expect(huellaDeCorreo(null)).toBeNull();
  });
});

describe('enfriamiento de un correo', () => {
  test('al iniciarlo, dura lo que indica la configuración', () => {
    const almacen = crearAlmacen();

    const fin = iniciarEnfriamiento(CORREO, undefined, { almacen, ahora: T0 });

    expect(fin).toBe(T0 + enfriamientoSegundos * 1000);
    expect(finDeEnfriamiento(CORREO, { almacen, ahora: T0 })).toBe(fin);
  });

  test('persiste al desmontar y volver a montar la pantalla: otra lectura del mismo almacén lo encuentra', () => {
    const almacen = crearAlmacen();
    iniciarEnfriamiento(CORREO, undefined, { almacen, ahora: T0 });

    const alVolver = consultarEnfriamiento(CORREO, { almacen, ahora: T0 + 20_000 });

    expect(alVolver.fin).toBe(T0 + 60_000);
    expect(Math.ceil((alVolver.fin - alVolver.ahora) / 1000)).toBe(40);
  });

  test('se reconoce el mismo correo escrito de otra forma', () => {
    const almacen = crearAlmacen();
    iniciarEnfriamiento(CORREO, undefined, { almacen, ahora: T0 });

    expect(finDeEnfriamiento('  JUGADOR@example.com ', { almacen, ahora: T0 + 1000 })).toBe(T0 + 60_000);
  });

  test('otro correo no queda trabado', () => {
    const almacen = crearAlmacen();
    iniciarEnfriamiento(CORREO, undefined, { almacen, ahora: T0 });

    expect(finDeEnfriamiento(OTRO_CORREO, { almacen, ahora: T0 + 1000 })).toBe(0);
  });

  test('cada correo tiene su propio enfriamiento', () => {
    const almacen = crearAlmacen();
    iniciarEnfriamiento(CORREO, 60, { almacen, ahora: T0 });
    iniciarEnfriamiento(OTRO_CORREO, 30, { almacen, ahora: T0 + 10_000 });

    expect(finDeEnfriamiento(CORREO, { almacen, ahora: T0 + 11_000 })).toBe(T0 + 60_000);
    expect(finDeEnfriamiento(OTRO_CORREO, { almacen, ahora: T0 + 11_000 })).toBe(T0 + 40_000);
  });

  test('vencido, ya no rige', () => {
    const almacen = crearAlmacen();
    iniciarEnfriamiento(CORREO, undefined, { almacen, ahora: T0 });

    expect(finDeEnfriamiento(CORREO, { almacen, ahora: T0 + 60_000 })).toBe(0);
    expect(finDeEnfriamiento(CORREO, { almacen, ahora: T0 + 120_000 })).toBe(0);
  });

  test('un correo vacío no inicia nada', () => {
    const almacen = crearAlmacen();

    expect(iniciarEnfriamiento('', undefined, { almacen, ahora: T0 })).toBe(0);
    expect(almacen.claves()).toEqual([]);
  });

  test('al iniciar otro enfriamiento se descartan los vencidos', () => {
    const almacen = crearAlmacen();
    iniciarEnfriamiento(CORREO, 60, { almacen, ahora: T0 });

    iniciarEnfriamiento(OTRO_CORREO, 60, { almacen, ahora: T0 + 120_000 });

    expect(JSON.parse(almacen.getItem(claveEnfriamiento))).toEqual({ [huellaDeCorreo(OTRO_CORREO)]: T0 + 180_000 });
  });

  test('al borrarlo, el correo puede pedir enseguida y el resto se conserva', () => {
    const almacen = crearAlmacen();
    iniciarEnfriamiento(CORREO, 60, { almacen, ahora: T0 });
    iniciarEnfriamiento(OTRO_CORREO, 60, { almacen, ahora: T0 });

    borrarEnfriamiento(CORREO, { almacen, ahora: T0 + 1000 });

    expect(finDeEnfriamiento(CORREO, { almacen, ahora: T0 + 1000 })).toBe(0);
    expect(finDeEnfriamiento(OTRO_CORREO, { almacen, ahora: T0 + 1000 })).toBe(T0 + 60_000);
  });

  test('sin enfriamientos vigentes no queda ninguna clave guardada', () => {
    const almacen = crearAlmacen();
    iniciarEnfriamiento(CORREO, 60, { almacen, ahora: T0 });

    borrarEnfriamiento(CORREO, { almacen, ahora: T0 + 1000 });

    expect(almacen.claves()).toEqual([]);
  });
});

describe('privacidad del almacenamiento', () => {
  test('no se guarda el correo en texto plano, ni en la clave ni en el valor', () => {
    const almacen = crearAlmacen();
    iniciarEnfriamiento(CORREO, undefined, { almacen, ahora: T0 });
    iniciarEnfriamiento(OTRO_CORREO, undefined, { almacen, ahora: T0 });

    const volcado = almacen.volcado();

    expect(almacen.claves()).toEqual([claveEnfriamiento]);
    ['jugador', 'jugadora', 'example', '@', '.com'].forEach((fragmento) => expect(volcado).not.toContain(fragmento));
  });

  test('con `sessionStorage` disponible, es ahí donde se guarda', () => {
    const almacen = crearAlmacen();
    vi.stubGlobal('sessionStorage', almacen);

    iniciarEnfriamiento(CORREO);

    expect(almacen.claves()).toEqual([claveEnfriamiento]);
    expect(almacen.volcado()).not.toContain('example');
    expect(finDeEnfriamiento(CORREO)).toBeGreaterThan(Date.now());
  });
});

describe('sin sessionStorage', () => {
  test('sin el objeto, el enfriamiento se recuerda en memoria', () => {
    vi.stubGlobal('sessionStorage', undefined);

    iniciarEnfriamiento(CORREO);

    expect(finDeEnfriamiento(CORREO)).toBeGreaterThan(Date.now());
    expect(finDeEnfriamiento(OTRO_CORREO)).toBe(0);
  });

  test('si el navegador lo bloquea al escribir, también se usa la memoria', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('almacenamiento bloqueado');
      },
      removeItem: () => {},
    });

    expect(() => iniciarEnfriamiento(CORREO)).not.toThrow();
    expect(finDeEnfriamiento(CORREO)).toBeGreaterThan(Date.now());
  });

  test('un valor guardado corrupto se ignora', () => {
    const almacen = crearAlmacen();
    almacen.setItem(claveEnfriamiento, '{no es json');

    expect(finDeEnfriamiento(CORREO, { almacen, ahora: T0 })).toBe(0);
    expect(() => iniciarEnfriamiento(CORREO, undefined, { almacen, ahora: T0 })).not.toThrow();
    expect(finDeEnfriamiento(CORREO, { almacen, ahora: T0 })).toBe(T0 + 60_000);
  });

  test('valores guardados con otra forma se descartan', () => {
    const almacen = crearAlmacen();
    almacen.setItem(claveEnfriamiento, JSON.stringify({ [huellaDeCorreo(CORREO)]: 'mañana', otra: null }));

    expect(finDeEnfriamiento(CORREO, { almacen, ahora: T0 })).toBe(0);

    almacen.setItem(claveEnfriamiento, JSON.stringify([1, 2]));
    expect(finDeEnfriamiento(CORREO, { almacen, ahora: T0 })).toBe(0);
  });
});

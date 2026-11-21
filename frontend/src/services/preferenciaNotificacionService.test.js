import { beforeEach, describe, expect, test, vi } from 'vitest';

const apiDjango = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('./api.js', () => ({ apiDjango }));

const { guardarPreferenciasNotificacion, obtenerPreferenciasNotificacion } = await import('./preferenciaNotificacionService.js');

const RUTA = '/api/sistema/notificaciones/preferencias/';
const MATRIZ = {
  roles: [{ codigo: 'jugador', nombre: 'Jugador' }],
  categorias: [{ codigo: 'reservas', nombre: 'Reservas', orden: 1, roles_aplicables: ['jugador'], habilitadas: { jugador: true } }],
};

beforeEach(() => {
  Object.values(apiDjango).forEach((funcion) => funcion.mockReset());
});

describe('preferencias de notificaciones', () => {
  test('consulta la matriz con la señal de cancelación y devuelve el cuerpo', async () => {
    const senal = new AbortController().signal;
    apiDjango.get.mockResolvedValue({ data: MATRIZ });

    await expect(obtenerPreferenciasNotificacion(senal)).resolves.toEqual(MATRIZ);
    expect(apiDjango.get).toHaveBeenCalledWith(RUTA, { signal: senal });
  });

  test('guarda con PUT y el cuerpo tal cual, y devuelve la matriz actualizada', async () => {
    const cuerpo = { preferencias: [{ tipo_notificacion: 'reservas', rol_base: 'jugador', habilitada: false }] };
    apiDjango.put.mockResolvedValue({ data: MATRIZ });

    await expect(guardarPreferenciasNotificacion(cuerpo)).resolves.toEqual(MATRIZ);
    expect(apiDjango.put).toHaveBeenCalledWith(RUTA, cuerpo);
  });

  test.each([
    ['la consulta', () => apiDjango.get, () => obtenerPreferenciasNotificacion()],
    ['el guardado', () => apiDjango.put, () => guardarPreferenciasNotificacion({ preferencias: [] })],
  ])('un error de %s se propaga tal cual', async (_nombre, metodo, ejecutar) => {
    const error = Object.assign(new Error('409'), { status: 409 });
    metodo().mockRejectedValue(error);

    await expect(ejecutar()).rejects.toBe(error);
  });
});

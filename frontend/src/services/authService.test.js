import { beforeEach, describe, expect, test, vi } from 'vitest';

const apiDjango = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const registrarGestorDeSesion = vi.hoisted(() => vi.fn());
vi.mock('./api.js', () => ({ apiDjango, registrarGestorDeSesion, renovarAccess: vi.fn() }));

const { cambiarContrasena, cerrarSesionLocal, obtenerEstado, restablecerContrasena, solicitarCodigoRecuperacion } = await import('./authService.js');
const gestor = registrarGestorDeSesion.mock.calls[0][0];

beforeEach(() => {
  Object.values(apiDjango).forEach((funcion) => funcion.mockReset());
  cerrarSesionLocal();
});

describe('solicitarCodigoRecuperacion', () => {
  test('pide el código con solo el correo', async () => {
    apiDjango.post.mockResolvedValue({ data: { detail: 'Si el correo está registrado, enviamos un código.' } });

    await expect(solicitarCodigoRecuperacion('jugador@example.com')).resolves.toEqual({
      detail: 'Si el correo está registrado, enviamos un código.',
    });
    expect(apiDjango.post).toHaveBeenCalledWith('/api/auth/recuperar-contrasena/', { email: 'jugador@example.com' });
  });

  test('un 429 llega al que llama como error', async () => {
    const error = Object.assign(new Error('limite'), { status: 429 });
    apiDjango.post.mockRejectedValue(error);

    await expect(solicitarCodigoRecuperacion('jugador@example.com')).rejects.toBe(error);
  });
});

describe('restablecerContrasena', () => {
  test('envía correo, código y contraseña nueva, y nunca la confirmación', async () => {
    apiDjango.post.mockResolvedValue({ data: { detail: 'Contraseña actualizada.' } });

    await restablecerContrasena({
      email: 'jugador@example.com',
      codigo: '012345',
      nueva_contrasena: 'ClaveNueva#1',
      confirmar_contrasena: 'ClaveNueva#1',
    });

    expect(apiDjango.post).toHaveBeenCalledWith('/api/auth/restablecer-contrasena/', {
      email: 'jugador@example.com',
      codigo: '012345',
      nueva_contrasena: 'ClaveNueva#1',
    });
  });

  test('conserva el código como texto, con sus ceros a la izquierda', async () => {
    apiDjango.post.mockResolvedValue({ data: {} });

    await restablecerContrasena({ email: 'a@example.com', codigo: '000042', nueva_contrasena: 'ClaveNueva#1' });

    expect(apiDjango.post.mock.calls[0][1].codigo).toBe('000042');
  });

  test('no toca la sesión en memoria: eso lo decide la pantalla', async () => {
    gestor.guardarAccess('cabecera.carga.firma');
    apiDjango.post.mockResolvedValue({ data: {} });

    await restablecerContrasena({ email: 'a@example.com', codigo: '000042', nueva_contrasena: 'ClaveNueva#1' });

    expect(obtenerEstado().access).toBe('cabecera.carga.firma');
  });
});

describe('cambiarContrasena', () => {
  const datos = { contrasena_actual: 'ClaveVieja#1', nueva_contrasena: 'ClaveNueva#1', confirmar_contrasena: 'ClaveNueva#1' };

  test('envía la actual y la nueva, y nunca la confirmación', async () => {
    apiDjango.post.mockResolvedValue({ data: { detail: 'Contraseña actualizada.' } });

    await cambiarContrasena(datos);

    expect(apiDjango.post).toHaveBeenCalledWith('/api/auth/cambiar-contrasena/', {
      contrasena_actual: 'ClaveVieja#1',
      nueva_contrasena: 'ClaveNueva#1',
    });
  });

  test('al terminar limpia la sesión y deja el aviso con destino al login', async () => {
    gestor.guardarAccess('cabecera.carga.firma');
    apiDjango.post.mockResolvedValue({ data: {} });

    await cambiarContrasena(datos, { aviso: 'Contraseña actualizada.' });

    expect(obtenerEstado().access).toBeNull();
    expect(obtenerEstado().perfil).toBeNull();
    expect(obtenerEstado().cierre).toEqual({ aviso: 'Contraseña actualizada.', ruta: '/login' });
  });

  test('si el servidor lo rechaza, la sesión sigue abierta', async () => {
    gestor.guardarAccess('cabecera.carga.firma');
    const error = Object.assign(new Error('actual incorrecta'), { status: 400, campos: { contrasena_actual: 'Incorrecta.' } });
    apiDjango.post.mockRejectedValue(error);

    await expect(cambiarContrasena(datos)).rejects.toBe(error);

    expect(obtenerEstado().access).toBe('cabecera.carga.firma');
    expect(obtenerEstado().cierre).toBeNull();
  });
});

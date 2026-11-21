import { describe, expect, test, vi } from 'vitest';
import { t } from './index.js';

// Todo texto del flujo de recuperación y de cambio de contraseña vive en el diccionario: una clave sin texto
// devolvería la propia clave.
const CLAVES = [
  'comun.mostrarPassword',
  'comun.ocultarPassword',
  'login.olvidaste',
  'validacion.codigo',
  'validacion.passwordNoCoincide',
  'validacion.passwordIgualActual',
  'contrasena.actual',
  'contrasena.nueva',
  'contrasena.confirmar',
  'contrasena.requisitosTitulo',
  'contrasena.requisitoLargo',
  'contrasena.requisitoCaracteres',
  'contrasena.requisitoCoincide',
  'contrasena.requisitoCumplido',
  'contrasena.requisitoPendiente',
  'recuperar.titulo',
  'recuperar.descripcionPaso1',
  'recuperar.descripcionPaso2',
  'recuperar.email',
  'recuperar.enviarCodigo',
  'recuperar.enviando',
  'recuperar.yaTengoCodigo',
  'recuperar.volverLogin',
  'recuperar.volverPerfil',
  'recuperar.avisoNeutro',
  'recuperar.avisoCodigoExistente',
  'recuperar.cambiarCorreo',
  'recuperar.codigo',
  'recuperar.codigoAyuda',
  'recuperar.reenviar',
  'recuperar.reenviarEn',
  'recuperar.codigoRechazado',
  'recuperar.restablecer',
  'recuperar.restableciendo',
  'recuperar.exito',
  'perfil.seguridadTitulo',
  'perfil.seguridadDescripcion',
  'perfil.olvidoActual',
  'perfil.cambiarContrasena',
  'perfil.cambiandoContrasena',
  'perfil.contrasenaCambiada',
];

describe('textos de recuperación y cambio de contraseña', () => {
  test.each(CLAVES)('existe %s', (clave) => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const texto = t(clave);

    expect(texto).not.toBe(clave);
    expect(texto.trim()).not.toBe('');
    expect(aviso).not.toHaveBeenCalled();
    aviso.mockRestore();
  });

  test('el aviso neutro no distingue cuentas y lleva dígitos y minutos', () => {
    const texto = t('recuperar.avisoNeutro', { digitos: 6, minutos: 15 });

    expect(texto).toBe('Si el correo está registrado, enviamos un código de 6 dígitos válido por 15 minutos. Revisá también la carpeta de spam.');
  });

  test('el aviso de quien ya tiene un código no afirma que se haya enviado uno recién', () => {
    const texto = t('recuperar.avisoCodigoExistente', { digitos: 6, minutos: 15 });

    expect(texto).toContain('6 dígitos');
    expect(texto).toContain('15 minutos');
    expect(texto).toContain('si está registrado');
    expect(texto).not.toContain('enviamos un código de');
    expect(texto).not.toBe(t('recuperar.avisoNeutro', { digitos: 6, minutos: 15 }));
  });

  test('el aviso de éxito pide entrar con la contraseña nueva', () => {
    expect(t('recuperar.exito')).toBe('Contraseña actualizada. Iniciá sesión con tu nueva contraseña.');
    expect(t('perfil.contrasenaCambiada')).toBe(t('recuperar.exito'));
  });

  test('la cuenta regresiva muestra los segundos', () => {
    expect(t('recuperar.reenviarEn', { segundos: 42 })).toBe('Reenviar código en 42 s');
  });
});

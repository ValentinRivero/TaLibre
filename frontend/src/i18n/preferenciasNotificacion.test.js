import { describe, expect, test } from 'vitest';
import { t } from './index.js';

// Espejo del catálogo de notificaciones del backend: cada categoría necesita su descripción en la pantalla.
const CATEGORIAS = [
  'reservas',
  'recordatorios_turno',
  'senas_y_cobros',
  'excepciones_y_conflictos',
  'gestion_complejo',
  'contratos',
  'cuentas_usuarios',
  'alertas_sistema',
];

describe('textos de las preferencias de notificaciones', () => {
  test.each(CATEGORIAS)('la categoría %s tiene su descripción', (codigo) => {
    const clave = `preferenciasNotificacion.categorias.${codigo}`;

    expect(t(clave)).not.toBe(clave);
    expect(t(clave).trim().length).toBeGreaterThan(10);
  });

  test('la nota aclara que los correos de seguridad no se desactivan y que los cambios son globales', () => {
    expect(t('preferenciasNotificacion.notaAlcance')).toContain('siempre se envían');
    expect(t('preferenciasNotificacion.notaAlcance')).toContain('código de recuperación de contraseña');
    expect(t('preferenciasNotificacion.notaGlobal')).toContain('hereda la configuración de Operador');
  });

  test('la etiqueta accesible de cada celda nombra la categoría y el rol', () => {
    expect(t('preferenciasNotificacion.ariaCelda', { categoria: 'Reservas', rol: 'Jugador' })).toBe('Reservas para Jugador');
  });

  test('el resumen de cambios distingue uno de varios', () => {
    expect(t('preferenciasNotificacion.cambiosUno')).toBe('1 cambio sin guardar');
    expect(t('preferenciasNotificacion.cambiosVarios', { cantidad: 3 })).toBe('3 cambios sin guardar');
  });

  test('la navegación del sistema ofrece la sección de notificaciones', () => {
    expect(t('sistema.notificaciones')).toBe('Notificaciones');
  });
});

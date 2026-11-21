import { describe, expect, test } from 'vitest';
import {
  alternar,
  armarPayload,
  cambiosPendientes,
  construirEstado,
  hayCambios,
} from './preferenciasNotificacion.js';

const ROLES = [
  { codigo: 'jugador', nombre: 'Jugador' },
  { codigo: 'operador', nombre: 'Operador' },
  { codigo: 'dueno', nombre: 'Dueño de complejo' },
  { codigo: 'superadmin', nombre: 'Superadministrador' },
];

const MATRIZ = Object.freeze({
  roles: ROLES,
  categorias: [
    {
      codigo: 'reservas',
      nombre: 'Reservas',
      orden: 1,
      roles_aplicables: ['jugador', 'operador', 'dueno'],
      habilitadas: { jugador: true, operador: true, dueno: false, superadmin: null },
    },
    {
      codigo: 'alertas_sistema',
      nombre: 'Alertas',
      orden: 2,
      roles_aplicables: ['superadmin'],
      habilitadas: { jugador: null, operador: null, dueno: null, superadmin: true },
    },
  ],
});

describe('construirEstado', () => {
  test('arma una entrada por categoría y por rol conservando true, false y null', () => {
    expect(construirEstado(MATRIZ)).toEqual({
      reservas: { jugador: true, operador: true, dueno: false, superadmin: null },
      alertas_sistema: { jugador: null, operador: null, dueno: null, superadmin: true },
    });
  });

  test('un rol sin dato en la categoría queda como no aplicable', () => {
    const estado = construirEstado({ roles: ROLES, categorias: [{ codigo: 'contratos', habilitadas: { dueno: true } }] });

    expect(estado.contratos).toEqual({ jugador: null, operador: null, dueno: true, superadmin: null });
  });

  test('un valor que no es booleano se trata como no aplicable', () => {
    const estado = construirEstado({ roles: ROLES, categorias: [{ codigo: 'reservas', habilitadas: { jugador: 'si', operador: 1 } }] });

    expect(estado.reservas.jugador).toBeNull();
    expect(estado.reservas.operador).toBeNull();
  });

  test('una matriz sin categorías da un estado vacío', () => {
    expect(construirEstado({ roles: ROLES, categorias: [] })).toEqual({});
  });
});

describe('alternar', () => {
  test('invierte solo la celda indicada', () => {
    const estado = construirEstado(MATRIZ);

    const nuevo = alternar(estado, 'reservas', 'jugador');

    expect(nuevo.reservas.jugador).toBe(false);
    expect(nuevo.reservas.operador).toBe(true);
    expect(nuevo.alertas_sistema).toBe(estado.alertas_sistema);
  });

  test('invierte también de false a true', () => {
    expect(alternar(construirEstado(MATRIZ), 'reservas', 'dueno').reservas.dueno).toBe(true);
  });

  test('no muta el estado original', () => {
    const estado = construirEstado(MATRIZ);
    const copia = structuredClone(estado);

    const nuevo = alternar(estado, 'reservas', 'jugador');

    expect(estado).toEqual(copia);
    expect(nuevo).not.toBe(estado);
    expect(nuevo.reservas).not.toBe(estado.reservas);
  });

  test('una celda que no aplica se ignora y devuelve el mismo estado', () => {
    const estado = construirEstado(MATRIZ);

    expect(alternar(estado, 'reservas', 'superadmin')).toBe(estado);
    expect(estado.reservas.superadmin).toBeNull();
  });

  test('una categoría o un rol desconocidos se ignoran', () => {
    const estado = construirEstado(MATRIZ);

    expect(alternar(estado, 'inexistente', 'jugador')).toBe(estado);
    expect(alternar(estado, 'reservas', 'invitado')).toBe(estado);
  });

  test('alternar dos veces vuelve al valor original', () => {
    const estado = construirEstado(MATRIZ);

    expect(alternar(alternar(estado, 'reservas', 'jugador'), 'reservas', 'jugador')).toEqual(estado);
  });
});

describe('cambios pendientes', () => {
  test('sin ediciones no hay cambios', () => {
    const guardado = construirEstado(MATRIZ);

    expect(hayCambios(guardado, guardado)).toBe(false);
    expect(cambiosPendientes(guardado, guardado)).toEqual([]);
  });

  test('una celda editada es un cambio con su nuevo valor', () => {
    const guardado = construirEstado(MATRIZ);
    const actual = alternar(guardado, 'reservas', 'jugador');

    expect(hayCambios(actual, guardado)).toBe(true);
    expect(cambiosPendientes(actual, guardado)).toEqual([
      { tipo_notificacion: 'reservas', rol_base: 'jugador', habilitada: false },
    ]);
  });

  test('volver al valor guardado deja de ser un cambio', () => {
    const guardado = construirEstado(MATRIZ);
    const actual = alternar(alternar(guardado, 'reservas', 'operador'), 'reservas', 'operador');

    expect(hayCambios(actual, guardado)).toBe(false);
  });

  test('sin estado guardado o sin estado actual no hay cambios', () => {
    const estado = construirEstado(MATRIZ);

    expect(hayCambios(null, estado)).toBe(false);
    expect(hayCambios(estado, null)).toBe(false);
    expect(hayCambios(null, null)).toBe(false);
  });

  test('las celdas que no aplican nunca cuentan como cambio', () => {
    const guardado = construirEstado(MATRIZ);
    const actual = { ...guardado, reservas: { ...guardado.reservas, superadmin: true } };

    expect(hayCambios(actual, guardado)).toBe(false);
  });
});

describe('armarPayload', () => {
  test('envía solo los pares modificados, en el orden de la matriz', () => {
    const guardado = construirEstado(MATRIZ);
    const actual = alternar(alternar(alternar(guardado, 'alertas_sistema', 'superadmin'), 'reservas', 'dueno'), 'reservas', 'jugador');

    expect(armarPayload(actual, guardado)).toEqual({
      preferencias: [
        { tipo_notificacion: 'reservas', rol_base: 'jugador', habilitada: false },
        { tipo_notificacion: 'reservas', rol_base: 'dueno', habilitada: true },
        { tipo_notificacion: 'alertas_sistema', rol_base: 'superadmin', habilitada: false },
      ],
    });
  });

  test('sin cambios no arma nada: nunca hay una lista vacía para enviar', () => {
    const guardado = construirEstado(MATRIZ);

    expect(armarPayload(guardado, guardado)).toBeNull();
    expect(armarPayload(alternar(alternar(guardado, 'reservas', 'jugador'), 'reservas', 'jugador'), guardado)).toBeNull();
  });

  test('cada par lleva exactamente las tres claves del contrato', () => {
    const guardado = construirEstado(MATRIZ);
    const { preferencias } = armarPayload(alternar(guardado, 'reservas', 'operador'), guardado);

    expect(Object.keys(preferencias[0]).sort()).toEqual(['habilitada', 'rol_base', 'tipo_notificacion']);
  });

  test('tras guardar, el nuevo estado guardado ya no genera payload', () => {
    const guardado = construirEstado(MATRIZ);
    const editado = alternar(guardado, 'reservas', 'jugador');

    expect(armarPayload(editado, editado)).toBeNull();
  });
});

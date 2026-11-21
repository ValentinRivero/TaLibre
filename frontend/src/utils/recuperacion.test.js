import { describe, expect, test } from 'vitest';
import { ErrorApi } from './errores.js';
import { esCodigoRechazado, normalizarCodigo, segundosRestantes } from './recuperacion.js';

describe('normalizarCodigo', () => {
  test.each([
    ['123456', '123456'],
    ['123 456', '123456'],
    [' 123456 ', '123456'],
    ['123-456', '123456'],
    ['12 34\n56', '123456'],
    ['código: 123456', '123456'],
    ['1234567890', '123456'],
    ['12a3', '123'],
    ['abc', ''],
    ['', ''],
    ['０１２３４５', ''],
  ])('"%s" queda como "%s"', (entrada, esperado) => {
    expect(normalizarCodigo(entrada)).toBe(esperado);
  });

  test('conserva los ceros a la izquierda', () => {
    expect(normalizarCodigo('000042')).toBe('000042');
  });

  test('tolera valores que no son texto', () => {
    expect(normalizarCodigo(null)).toBe('');
    expect(normalizarCodigo(undefined)).toBe('');
    expect(normalizarCodigo(123456)).toBe('123456');
  });
});

describe('segundosRestantes', () => {
  test('redondea hacia arriba para no mostrar 0 con tiempo todavía por correr', () => {
    expect(segundosRestantes(60_000, 0)).toBe(60);
    expect(segundosRestantes(60_000, 59_001)).toBe(1);
    expect(segundosRestantes(60_000, 500)).toBe(60);
  });

  test('nunca es negativo', () => {
    expect(segundosRestantes(1000, 5000)).toBe(0);
    expect(segundosRestantes(1000, 1000)).toBe(0);
  });
});

describe('esCodigoRechazado', () => {
  const error = (status, campos = {}) => new ErrorApi({ status, mensaje: 'x', campos });

  test('un 400 sin errores por campo es un código inválido, vencido o bloqueado', () => {
    expect(esCodigoRechazado(error(400))).toBe(true);
  });

  test('un 400 con errores por campo (contraseña débil o formato) conserva el código', () => {
    expect(esCodigoRechazado(error(400, { nueva_contrasena: 'Es muy común.' }))).toBe(false);
  });

  test('otros estados o ausencia de error no cuentan', () => {
    expect(esCodigoRechazado(error(429))).toBe(false);
    expect(esCodigoRechazado(error(0))).toBe(false);
    expect(esCodigoRechazado(null)).toBe(false);
  });
});

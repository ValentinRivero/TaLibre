import { describe, expect, test } from 'vitest';
import { PARAMETROS } from '../config/parametros.js';
import { t, tLista } from './index.js';

const SECCIONES = [
  'responsable',
  'datos',
  'destinatarios',
  'proveedores',
  'correos',
  'seguridad',
  'plazos',
  'derechos',
  'cookies',
  'cambios',
  'aaip',
];

const PARAMETROS_PLAZOS = {
  meses: PARAMETROS.politica.retencionIpMeses,
  dias: PARAMETROS.politica.retencionContactoDias,
  minutos: PARAMETROS.recuperacion.vigenciaMinutos,
};

// Reúne todos los textos de la política para revisar su redacción de una sola vez.
const textosDeLaPolitica = () => [
  t('privacidad.titulo'),
  t('privacidad.introduccion'),
  ...SECCIONES.map((seccion) => t(`privacidad.${seccion}.titulo`)),
  ...['responsable', 'destinatarios', 'proveedores', 'correos', 'seguridad', 'derechos', 'cookies', 'cambios', 'aaip']
    .map((seccion) => t(`privacidad.${seccion}.texto`)),
  ...tLista('privacidad.datos.filas').flat(),
  ...tLista('privacidad.proveedores.items'),
  ...tLista('privacidad.plazos.items'),
  ...tLista('privacidad.derechos.items'),
];

describe('política de privacidad 1.1', () => {
  test('la versión publicada es la 1.1, espejo de POLITICA_PRIVACIDAD_VERSION de Django', () => {
    expect(PARAMETROS.politica.version).toBe('1.1');
    expect(PARAMETROS.politica.vigenteDesde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test.each(SECCIONES)('la sección %s tiene título en el diccionario', (seccion) => {
    expect(t(`privacidad.${seccion}.titulo`)).not.toBe(`privacidad.${seccion}.titulo`);
  });

  test('cada fila de la tabla de datos tiene dato, ubicación, finalidad y destinatario', () => {
    const columnas = tLista('privacidad.datos.columnas');
    for (const fila of tLista('privacidad.datos.filas')) {
      expect(fila).toHaveLength(columnas.length);
      fila.forEach((celda) => expect(celda.trim()).not.toBe(''));
    }
  });

  test('declara los datos de transferencias y de recuperación de contraseña', () => {
    const datos = tLista('privacidad.datos.filas').map((fila) => fila[0]).join(' ');

    expect(datos).toContain('CBU');
    expect(datos).toContain('número de operación');
    expect(datos).toContain('código de recuperación');
  });

  test.each(['Supabase', 'MongoDB Atlas', 'Microsoft Azure', 'Cloudflare', 'Resend', 'Esri', 'Open-Meteo'])(
    'declara a %s entre los proveedores',
    (proveedor) => {
      expect(tLista('privacidad.proveedores.items').some((item) => item.startsWith(proveedor))).toBe(true);
    },
  );

  test('los plazos se completan con los parámetros y no dejan marcadores sin reemplazar', () => {
    for (const plazo of tLista('privacidad.plazos.items')) {
      const texto = Object.entries(PARAMETROS_PLAZOS)
        .reduce((acumulado, [clave, valor]) => acumulado.replaceAll(`%${clave}%`, String(valor)), plazo);
      expect(texto).not.toMatch(/%\w+%/);
    }
    expect(tLista('privacidad.plazos.items').join(' ')).toContain('%minutos%');
  });

  test('ningún texto de la política usa punto y coma', () => {
    textosDeLaPolitica().forEach((texto) => expect(texto).not.toContain(';'));
  });
});

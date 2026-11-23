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

// Un ítem por proveedor, en el orden de la política. Sumar o quitar uno exige actualizar esta lista.
const PROVEEDORES = [
  'Supabase:', 'MongoDB Atlas:', 'Microsoft Azure:', 'Cloudflare:', 'Cloudflare Web Analytics:', 'Resend:', 'Redis:',
  'OpenStreetMap Foundation:', 'Open-Meteo:',
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

describe('política de privacidad 1.3', () => {
  test('la versión publicada es la 1.3, espejo de POLITICA_PRIVACIDAD_VERSION de Django', () => {
    expect(PARAMETROS.politica.version).toBe('1.3');
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

  test.each(PROVEEDORES)('declara a %s entre los proveedores', (proveedor) => {
    expect(tLista('privacidad.proveedores.items').some((item) => item.startsWith(proveedor))).toBe(true);
  });

  test('declara solo los proveedores en uso, uno por ítem', () => {
    expect(tLista('privacidad.proveedores.items')).toHaveLength(PROVEEDORES.length);
  });

  test('declara la medición de visitas de Cloudflare con su finalidad y sin cookies', () => {
    const fila = tLista('privacidad.datos.filas').find((celdas) => celdas[1].includes('Cloudflare'));

    expect(fila).toBeDefined();
    expect(fila[0]).toContain('dirección IP');
    expect(fila[2]).toContain('agregada');
    expect(t('privacidad.cookies.texto')).toContain('Cloudflare funciona sin cookies');
  });

  test('el proveedor del mapa es el mismo de las teselas configuradas y recibe la IP de quien lo abre', () => {
    const mapa = tLista('privacidad.proveedores.items').find((item) => item.startsWith('OpenStreetMap Foundation:'));

    expect(new URL(PARAMETROS.mapa.teselas.url.replace(/\{\w\}/g, '0')).hostname).toBe('tile.openstreetmap.org');
    expect(mapa).toContain('dirección IP');
  });

  test('los términos atribuyen la cartografía a OpenStreetMap con sus licencias', () => {
    const responsabilidad = tLista('terminos.secciones.responsabilidad.parrafos').join(' ');
    const propiedad = tLista('terminos.secciones.propiedad.parrafos').join(' ');

    expect(responsabilidad).toContain('la cartografía, de OpenStreetMap');
    expect(propiedad).toContain('los datos de OpenStreetMap bajo licencia ODbL');
    expect(propiedad).toContain('su cartografía bajo licencia CC BY-SA 2.0');
  });

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

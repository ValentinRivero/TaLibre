import request from 'supertest';

import app from '../../app.js';

const URL_ESPECIFICACION = '/api/docs-node/openapi.json';
const URL_INTERFAZ = '/api/docs-node/';

// Rutas públicas que monta app.js, con un pedido que llega a la ruta sin depender de otro servicio: un parámetro
// inválido corta en la validación (400) y una ruta privada sin token, en la autenticación (401).
const RUTAS_PUBLICADAS = [
  ['get', '/api/salud', '/api/salud'],
  ['post', '/api/actividad', '/api/actividad'],
  ['get', '/api/actividad', '/api/actividad'],
  ['get', '/api/actividad/notificaciones', '/api/actividad/notificaciones'],
  ['get', '/api/actividad/notificaciones/mias', '/api/actividad/notificaciones/mias'],
  ['patch', '/api/actividad/notificaciones/mias/leidas', '/api/actividad/notificaciones/mias/leidas'],
  ['patch', '/api/actividad/notificaciones/{id}', '/api/actividad/notificaciones/abc'],
  ['get', '/api/reportes-aux/visitas', '/api/reportes-aux/visitas'],
  ['get', '/api/externa/clima/{complejoId}', '/api/externa/clima/no-es-un-id'],
];

const conEntorno = async (variables, prueba) => {
  const anteriores = Object.fromEntries(Object.keys(variables).map((nombre) => [nombre, process.env[nombre]]));
  Object.assign(process.env, variables);
  try {
    await prueba();
  } finally {
    for (const [nombre, valor] of Object.entries(anteriores)) {
      if (valor === undefined) delete process.env[nombre];
      else process.env[nombre] = valor;
    }
  }
};

describe('Especificación OpenAPI de backend-node', () => {
  test('es pública y cumple OpenAPI 3', async () => {
    const respuesta = await request(app).get(URL_ESPECIFICACION);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.openapi).toMatch(/^3\.0\./);
    expect(respuesta.body.info.title).toBe('TaLibre API de actividad y notificaciones');
  });

  test('documenta exactamente las rutas públicas del servicio', async () => {
    const { body } = await request(app).get(URL_ESPECIFICACION);
    const documentadas = Object.entries(body.paths)
      .flatMap(([ruta, metodos]) => Object.keys(metodos).map((metodo) => `${metodo} ${ruta}`))
      .sort();

    expect(documentadas).toEqual(RUTAS_PUBLICADAS.map(([metodo, ruta]) => `${metodo} ${ruta}`).sort());
  });

  test.each(RUTAS_PUBLICADAS)('%s %s existe en la aplicación', async (metodo, _ruta, ejemplo) => {
    const respuesta = await request(app)[metodo](ejemplo).send({});

    expect(respuesta.status).not.toBe(404);
  });

  test('no publica las rutas internas entre servicios', async () => {
    const { body } = await request(app).get(URL_ESPECIFICACION);

    expect(Object.keys(body.paths).some((ruta) => ruta.startsWith('/api/interno'))).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/interno/i);
  });

  test('declara el access token como bearer JWT y lo exige en las rutas privadas', async () => {
    const { body } = await request(app).get(URL_ESPECIFICACION);

    expect(body.components.securitySchemes.bearerAuth).toEqual({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
    expect(body.paths['/api/actividad/notificaciones/mias'].get.security).toEqual([{ bearerAuth: [] }]);
    expect(body.paths['/api/salud'].get.security).toBeUndefined();
  });

  test('toma los códigos de los modelos y el rango de los parámetros vigentes', async () => {
    await conEntorno({ RANGO_MAXIMO_DIAS: '90' }, async () => {
      const { body } = await request(app).get(URL_ESPECIFICACION);

      expect(body.components.schemas.EventoNuevo.properties.tipo_evento.enum).toEqual([1, 2]);
      expect(body.components.schemas.CategoriaNotificacion.enum).toEqual([1, 2, 3, 4]);
      expect(body.info.description).toContain('90 días');
    });
  });

  test('cada referencia apunta a un esquema declarado', async () => {
    const { body } = await request(app).get(URL_ESPECIFICACION);
    const referencias = [...JSON.stringify(body).matchAll(/"\$ref":"#\/components\/schemas\/(\w+)"/g)]
      .map(([, nombre]) => nombre);

    expect(referencias.length).toBeGreaterThan(0);
    referencias.forEach((nombre) => expect(body.components.schemas).toHaveProperty(nombre));
  });
});

describe('Swagger UI de backend-node', () => {
  test('sirve la interfaz desde el propio servicio, sin scripts en línea', async () => {
    const respuesta = await request(app).get(URL_INTERFAZ);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['content-type']).toMatch(/text\/html/);
    expect(respuesta.text.match(/<script[^>]*>/g)).toEqual([
      '<script src="./swagger-ui-bundle.js">',
      '<script src="./swagger-ui-standalone-preset.js">',
      '<script src="./swagger-ui-init.js">',
    ]);
  });

  test('la interfaz carga la especificación del servicio y no usa un validador externo', async () => {
    const respuesta = await request(app).get('/api/docs-node/swagger-ui-init.js');

    expect(respuesta.status).toBe(200);
    expect(respuesta.text).toContain('"url": "./openapi.json"');
    expect(respuesta.text).toContain('"validatorUrl": null');
  });

  test('conserva las cabeceras de seguridad de Helmet', async () => {
    const respuesta = await request(app).get(URL_INTERFAZ);

    expect(respuesta.headers['content-security-policy']).toContain("script-src 'self'");
    expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
  });

  test.each([URL_ESPECIFICACION, URL_INTERFAZ])('apagada por entorno, %s responde 404', async (url) => {
    await conEntorno({ API_DOCS_HABILITADA: 'false' }, async () => {
      const respuesta = await request(app).get(url);

      expect(respuesta.status).toBe(404);
      expect(respuesta.body).toEqual({ error: true, mensaje: 'No se encontró el recurso solicitado.' });
    });
  });
});

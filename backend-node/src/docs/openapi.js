/**
 * Especificación OpenAPI 3 del contrato público de backend-node, la misma que describe docs/API.md. Las rutas internas
 * (/api/interno), que solo usa backend-django con su clave compartida, no se publican. Los códigos de los enumerados y
 * los límites salen de los modelos y de los parámetros, así la especificación no se desactualiza sola.
 */
import { LIMITES, obtenerParametros } from '../config/parametros.js';
import { TIPOS_EVENTO } from '../models/Evento.js';
import {
  CATEGORIAS_NOTIFICACION,
  ESTADOS_NOTIFICACION,
  PRIORIDADES_NOTIFICACION,
} from '../models/Notificacion.js';

const { tamanoDePagina, maximoPorPagina } = LIMITES.paginacion;
const ref = (nombre) => ({ $ref: `#/components/schemas/${nombre}` });
const respuesta = (descripcion, esquema) => ({
  description: descripcion,
  content: { 'application/json': { schema: esquema } },
});

const ERRORES = {
  400: respuesta('Datos inválidos, con el detalle por campo.', ref('ErrorValidacion')),
  401: respuesta('Sin token, o con un token inválido, vencido o que no es de acceso.', ref('Error')),
  403: respuesta('El rol no tiene acceso a esta ruta.', ref('Error')),
  404: respuesta('No existe, no está habilitado o no se administra.', ref('Error')),
  429: respuesta('Se superó el límite de solicitudes. El encabezado Retry-After indica cuándo reintentar.', ref('Error')),
  502: respuesta('La API principal o el proveedor del clima no respondió a tiempo.', ref('Error')),
};
const errores = (...codigos) => Object.fromEntries(codigos.map((codigo) => [codigo, ERRORES[codigo]]));

const parametro = (nombre, ubicacion, esquema, descripcion, requerido = false) => ({
  name: nombre, in: ubicacion, required: requerido, description: descripcion, schema: esquema,
});
const complejoObligatorio = parametro('complejo_id', 'query', { type: 'integer', minimum: 1 }, 'Complejo que se consulta.', true);
const paginacion = [
  parametro('page', 'query', { type: 'integer', minimum: 1, default: 1 }, 'Página.'),
  parametro('limit', 'query', { type: 'integer', minimum: 1, maximum: maximoPorPagina, default: tamanoDePagina }, 'Elementos por página.'),
];
const filtrosDeNotificaciones = [
  parametro('categoria', 'query', ref('CategoriaNotificacion'), '1 reservas, 2 cuentas, 3 operatoria, 4 sistema.'),
  parametro('prioridad', 'query', ref('PrioridadNotificacion'), '1 normal, 2 urgente.'),
  parametro('estado', 'query', { type: 'integer', enum: [ESTADOS_NOTIFICACION.NO_LEIDA, ESTADOS_NOTIFICACION.LEIDA] }, '1 no leída, 2 leída.'),
];
const conToken = [{ bearerAuth: [] }];

const pagina = (elemento) => ({
  type: 'object',
  required: ['count', 'next', 'previous', 'results'],
  properties: {
    count: { type: 'integer' },
    next: { type: 'string', nullable: true, description: 'Ruta relativa de la página siguiente.' },
    previous: { type: 'string', nullable: true, description: 'Ruta relativa de la página anterior.' },
    results: { type: 'array', items: ref(elemento) },
  },
});

const esquemas = {
  Error: {
    type: 'object',
    required: ['error', 'mensaje'],
    properties: { error: { type: 'boolean', example: true }, mensaje: { type: 'string' } },
  },
  ErrorValidacion: {
    allOf: [ref('Error'), {
      type: 'object',
      properties: {
        detalles: {
          type: 'array',
          items: { type: 'object', properties: { campo: { type: 'string' }, mensaje: { type: 'string' } } },
        },
      },
    }],
  },
  CategoriaNotificacion: { type: 'integer', enum: Object.values(CATEGORIAS_NOTIFICACION) },
  PrioridadNotificacion: { type: 'integer', enum: Object.values(PRIORIDADES_NOTIFICACION) },
  EventoNuevo: {
    type: 'object',
    required: ['tipo_evento', 'complejo_id'],
    properties: {
      tipo_evento: {
        type: 'integer',
        enum: [TIPOS_EVENTO.COMPLEJO_VISTO, TIPOS_EVENTO.GRILLA_CONSULTADA],
        description: '1 visita al complejo, 2 consulta de la grilla. La reserva realizada la registra la API principal.',
      },
      complejo_id: { type: 'integer', minimum: 1 },
      metadata: {
        type: 'object',
        additionalProperties: true,
        description: `Opcional, hasta ${LIMITES.maximoBytesMetadata} bytes, sin claves que empiecen con $ ni contengan un punto.`,
      },
    },
  },
  Evento: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      tipo_evento: { type: 'integer', enum: Object.values(TIPOS_EVENTO) },
      complejo_id: { type: 'integer' },
      metadata: { type: 'object', additionalProperties: true },
      fecha_creacion: { type: 'string', format: 'date-time' },
    },
  },
  Notificacion: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      complejo_id: { type: 'integer', nullable: true },
      categoria: ref('CategoriaNotificacion'),
      prioridad: ref('PrioridadNotificacion'),
      mensaje: { type: 'string', maxLength: LIMITES.maximoMensaje },
      estado: { type: 'integer', enum: [ESTADOS_NOTIFICACION.NO_LEIDA, ESTADOS_NOTIFICACION.LEIDA] },
      evento: {
        type: 'object',
        nullable: true,
        properties: {
          id: { type: 'string' },
          tipo_evento: { type: 'integer' },
          complejo_id: { type: 'integer' },
          fecha_creacion: { type: 'string', format: 'date-time' },
        },
      },
      fecha_creacion: { type: 'string', format: 'date-time' },
    },
  },
  PaginaEventos: pagina('Evento'),
  PaginaNotificaciones: pagina('Notificacion'),
  ConteoDia: {
    type: 'object',
    properties: {
      fecha: { type: 'string', format: 'date' },
      visitas: { type: 'integer' },
      consultas_grilla: { type: 'integer' },
    },
  },
  Visitas: {
    type: 'object',
    properties: {
      filtros: {
        type: 'object',
        properties: {
          complejo_id: { type: 'integer' },
          fecha_desde: { type: 'string', format: 'date' },
          fecha_hasta: { type: 'string', format: 'date' },
        },
      },
      totales: {
        type: 'object',
        properties: { visitas: { type: 'integer' }, consultas_grilla: { type: 'integer' } },
      },
      por_dia: { type: 'array', items: ref('ConteoDia') },
    },
  },
  Clima: {
    type: 'object',
    properties: {
      complejo: { type: 'object', properties: { id: { type: 'integer' }, nombre: { type: 'string' } } },
      actual: {
        type: 'object',
        properties: {
          fecha_hora: { type: 'string' },
          temperatura: { type: 'number' },
          codigo_clima: { type: 'integer' },
          descripcion: { type: 'string' },
          viento_kmh: { type: 'number' },
          precipitacion_mm: { type: 'number' },
          es_de_dia: { type: 'boolean' },
        },
      },
      pronostico: {
        type: 'array',
        maxItems: LIMITES.diasDePronostico,
        items: {
          type: 'object',
          properties: {
            fecha: { type: 'string', format: 'date' },
            codigo_clima: { type: 'integer' },
            descripcion: { type: 'string' },
            temperatura_max: { type: 'number' },
            temperatura_min: { type: 'number' },
            probabilidad_lluvia: { type: 'integer', nullable: true },
          },
        },
      },
      fuente: { type: 'string', example: 'Open-Meteo.com', description: 'Atribución obligatoria (CC BY 4.0).' },
    },
  },
};

const rutas = {
  '/api/salud': {
    get: {
      tags: ['Servicio'],
      summary: 'Estado del servicio',
      responses: { 200: respuesta('Servicio en línea.', { type: 'object', properties: { estado: { type: 'string', example: 'ok' } } }) },
    },
  },
  '/api/actividad': {
    post: {
      tags: ['Actividad'],
      summary: 'Registra una visita al complejo o una consulta de su grilla',
      description: 'Público, con sesión opcional: con un access token válido el evento queda asociado a esa cuenta.',
      security: [{}, { bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: ref('EventoNuevo') } } },
      responses: {
        201: respuesta('Evento registrado.', { type: 'object', properties: { id: { type: 'string' } } }),
        ...errores(400, 404, 429, 502),
      },
    },
    get: {
      tags: ['Panel del complejo'],
      summary: 'Actividad registrada del complejo',
      security: conToken,
      parameters: [complejoObligatorio, ...paginacion],
      responses: { 200: respuesta('Página de eventos, del más reciente al más antiguo.', ref('PaginaEventos')), ...errores(400, 401, 403, 404, 502) },
    },
  },
  '/api/actividad/notificaciones': {
    get: {
      tags: ['Panel del complejo'],
      summary: 'Registro de notificaciones del complejo',
      security: conToken,
      parameters: [complejoObligatorio, ...paginacion, ...filtrosDeNotificaciones],
      responses: { 200: respuesta('Página de notificaciones del complejo.', ref('PaginaNotificaciones')), ...errores(400, 401, 403, 404, 502) },
    },
  },
  '/api/actividad/notificaciones/mias': {
    get: {
      tags: ['Notificaciones'],
      summary: 'Bandeja propia',
      description: 'La cuenta sale siempre del token. complejo_id es opcional y acota la bandeja a un complejo.',
      security: conToken,
      parameters: [
        parametro('complejo_id', 'query', { type: 'integer', minimum: 1 }, 'Opcional: avisos de un solo complejo.'),
        ...paginacion,
        ...filtrosDeNotificaciones,
      ],
      responses: { 200: respuesta('Página de notificaciones de la cuenta.', ref('PaginaNotificaciones')), ...errores(400, 401) },
    },
  },
  '/api/actividad/notificaciones/mias/leidas': {
    patch: {
      tags: ['Notificaciones'],
      summary: 'Marca como leídas todas las notificaciones propias sin leer',
      security: conToken,
      responses: {
        200: respuesta('Cantidad de notificaciones actualizadas.', { type: 'object', properties: { actualizadas: { type: 'integer' } } }),
        ...errores(401),
      },
    },
  },
  '/api/actividad/notificaciones/{id}': {
    patch: {
      tags: ['Notificaciones'],
      summary: 'Marca una notificación como leída o no leída',
      security: conToken,
      parameters: [parametro('id', 'path', { type: 'string' }, 'Identificador de la notificación.', true)],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['estado'],
              properties: { estado: { type: 'integer', enum: [ESTADOS_NOTIFICACION.NO_LEIDA, ESTADOS_NOTIFICACION.LEIDA] } },
            },
          },
        },
      },
      responses: { 200: respuesta('Notificación actualizada.', ref('Notificacion')), ...errores(400, 401, 404) },
    },
  },
  '/api/reportes-aux/visitas': {
    get: {
      tags: ['Panel del complejo'],
      summary: 'Visitas y consultas de la grilla, en total y por día',
      security: conToken,
      parameters: [
        complejoObligatorio,
        parametro('fecha_desde', 'query', { type: 'string', format: 'date' }, 'Inicio del rango (AAAA-MM-DD).', true),
        parametro('fecha_hasta', 'query', { type: 'string', format: 'date' }, 'Fin del rango, incluido.', true),
      ],
      responses: { 200: respuesta('Conteos del rango, sin datos de quién visitó.', ref('Visitas')), ...errores(400, 401, 403, 404, 502) },
    },
  },
  '/api/externa/clima/{complejoId}': {
    get: {
      tags: ['Clima'],
      summary: 'Clima actual y pronóstico de tres días en la ubicación del complejo',
      parameters: [parametro('complejoId', 'path', { type: 'integer', minimum: 1 }, 'Complejo publicado.', true)],
      responses: { 200: respuesta('Clima del complejo.', ref('Clima')), ...errores(400, 404, 502) },
    },
  },
};

/** Especificación completa. Se arma al pedirla para reflejar los parámetros vigentes del entorno. */
export const crearEspecificacion = () => {
  const { rangoMaximoDias } = obtenerParametros();
  const especificacion = {
    openapi: '3.0.3',
    info: {
      title: 'TaLibre API de actividad y notificaciones',
      version: '1.0',
      description: 'Servicio complementario: registro de actividad, notificaciones y clima de los complejos. '
        + 'Las rutas privadas usan el access token que emite la API principal, en Authorization: Bearer. '
        + `Los rangos de fechas abarcan como máximo ${rangoMaximoDias} días.`,
    },
    tags: [
      { name: 'Servicio' }, { name: 'Actividad' }, { name: 'Notificaciones' },
      { name: 'Panel del complejo' }, { name: 'Clima' },
    ],
    paths: rutas,
    components: {
      schemas: esquemas,
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    },
  };
  return especificacion;
};

import copy

from .settings import *  # noqa: F401,F403
from .settings import LOGGING as LOGGING_BASE

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    },
}

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
    },
}

# Los parámetros operativos de las pruebas no dependen del .env local: se fijan en sus valores por defecto.
RESERVA_MESES_ANTICIPACION = 2
RANGO_MAXIMO_DIAS = 366
GRILLA_CACHE_SEGUNDOS = 60
NODE_TIMEOUT_SEGUNDOS = 3
CONTACTOS_BAJA_DIAS = 30
AUDITORIA_RETENCION_MESES = 12
RECORDATORIO_HORAS_ANTICIPACION = 24
RECORDATORIO_VERIFICACION_SEGUNDOS = 300
REPORTE_LATENCIA_BD_MAXIMA_MS = 500
ALERTA_LIMITE_VENTANA_SEGUNDOS = 900
CATALOGO_MARCADORES_MAXIMO = 500
RECUPERACION_CODIGO_MINUTOS = 15
RECUPERACION_INTENTOS_MAXIMOS = 5
RECUPERACION_ENFRIAMIENTO_SEGUNDOS = 60
# Nunca sale tráfico real: el proveedor de las pruebas es la consola y la entrega es en el mismo hilo.
EMAIL_PROVEEDOR = 'consola'
RESEND_API_KEY = ''
EMAIL_REMITENTE = 'TaLibre <no-reply@mail.example.com>'
EMAIL_LIMITE_DIARIO = 100
EMAIL_UMBRAL_ALERTA_PCT = 80
EMAIL_TIMEOUT_SEGUNDOS = 8
EMAIL_ENVIO_EN_SEGUNDO_PLANO = False
# Las pruebas hablan HTTP plano con el cliente de Django: la redirección a HTTPS es de producción.
SECURE_SSL_REDIRECT = False
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405
    'NUM_PROXIES': 0,
    'DEFAULT_THROTTLE_RATES': {
        **REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'],  # noqa: F405
        'login': '5/minute',
        'reservas': '20/hour',
        'transferencias': '10/hour',
        'cambiar_contrasena': '10/hour',
        'recuperar_contrasena': '5/hour',
        'restablecer_contrasena': '10/hour',
        'grilla': '300/minute',
    },
}

# MD5 solo acelera el hasheo en los tests; nunca se usa fuera de este módulo.
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

# Los tests no escriben en el security.log real; el logger seguridad se verifica capturando sus registros.
LOGGING = copy.deepcopy(LOGGING_BASE)
LOGGING['handlers']['archivo_seguridad'] = {'class': 'logging.NullHandler'}
LOGGING['handlers']['consola'] = {'class': 'logging.NullHandler'}

# Los tests nunca entregan avisos a un backend-node real, aunque el .env local lo tenga configurado.
NODE_API_URL = ''
INTERNAL_API_KEY = ''

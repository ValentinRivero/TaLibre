"""
Envío de correo transaccional desacoplado del proveedor. La lógica de negocio arma un `MensajeCorreo` y
`EmailService.enviar` lo entrega por el proveedor de `EMAIL_PROVEEDOR`; sumar uno nuevo (por ejemplo SMTP) es
registrar su función en `_PROVEEDORES` sin tocar los servicios que envían correos.

Resend se consume por su API HTTP con la biblioteca estándar: un único pedido con tiempo máximo y sin
redirecciones, porque una redirección llevaría la clave de la API a otro destino. Ningún error expone la clave, el
cuerpo del mensaje ni la dirección del destinatario.
"""
import json
import logging
import math
import urllib.error
import urllib.request
from dataclasses import dataclass
from html import escape

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger('core.correo')

PROVEEDOR_CONSOLA = 'consola'
PROVEEDOR_RESEND = 'resend'
PROVEEDORES_SOPORTADOS = (PROVEEDOR_CONSOLA, PROVEEDOR_RESEND)
# Solo los proveedores que cobran o limitan por correo llevan la cuenta diaria y la alerta de cuota.
PROVEEDORES_CON_CUOTA = frozenset({PROVEEDOR_RESEND})

URL_RESEND = 'https://api.resend.com/emails'
# Cloudflare, que protege la API de Resend, rechaza el agente por defecto de urllib.
AGENTE_HTTP = 'talibre-backend/1.0'
# El contador de un día se descarta solo; el margen cubre la diferencia entre el cambio de fecha local y el de la caché.
VIGENCIA_CONTADOR_SEGUNDOS = 2 * 86400

ASUNTO_CODIGO_RECUPERACION = 'Tu código de recuperación — TaLibre'


class _SinRedirecciones(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_abridor = urllib.request.build_opener(_SinRedirecciones)


@dataclass(frozen=True)
class MensajeCorreo:
    destinatario: str
    asunto: str
    texto: str
    html: str


@dataclass(frozen=True)
class CupoCorreo:
    """Resultado de reservar un envío del día: si se puede enviar y si con este se cruzó por primera vez el umbral."""

    permitido: bool
    consumo: int
    limite: int
    alerta_pendiente: bool


def _enviar_por_consola(mensaje):
    # El código de un correo de recuperación equivale a una credencial: solo se muestra en desarrollo.
    if not settings.DEBUG:
        logger.warning(
            'EMAIL_PROVEEDOR=consola fuera de DEBUG: el correo "%s" no se envió y su contenido no se registra.',
            mensaje.asunto,
        )
        return False
    logger.info('Correo de desarrollo\nPara: %s\nAsunto: %s\n\n%s', mensaje.destinatario, mensaje.asunto, mensaje.texto)
    return True


def _enviar_por_resend(mensaje):
    if not settings.RESEND_API_KEY:
        logger.error('Falta RESEND_API_KEY: el correo "%s" no se envió.', mensaje.asunto)
        return False
    pedido = urllib.request.Request(
        URL_RESEND,
        data=json.dumps({
            'from': settings.EMAIL_REMITENTE,
            'to': [mensaje.destinatario],
            'subject': mensaje.asunto,
            'text': mensaje.texto,
            'html': mensaje.html,
        }).encode('utf-8'),
        method='POST',
        headers={
            'Authorization': f'Bearer {settings.RESEND_API_KEY}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': AGENTE_HTTP,
        },
    )
    try:
        with _abridor.open(pedido, timeout=settings.EMAIL_TIMEOUT_SEGUNDOS) as respuesta:
            return 200 <= respuesta.status < 300
    except urllib.error.HTTPError as error:
        # La respuesta de error puede repetir la dirección del destinatario: solo se registra el código HTTP.
        logger.error('Resend rechazó el correo "%s": HTTP %s.', mensaje.asunto, error.code)
    except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
        logger.error('No se pudo contactar a Resend para el correo "%s" (%s).', mensaje.asunto, type(error).__name__)
    return False


_PROVEEDORES = {
    PROVEEDOR_CONSOLA: _enviar_por_consola,
    PROVEEDOR_RESEND: _enviar_por_resend,
}


class EmailService:
    @staticmethod
    def proveedor():
        """Proveedor efectivo: en desarrollo, Resend sin clave cae a la consola para no frenar el trabajo local."""
        nombre = settings.EMAIL_PROVEEDOR
        if nombre == PROVEEDOR_RESEND and not settings.RESEND_API_KEY and settings.DEBUG:
            return PROVEEDOR_CONSOLA
        return nombre

    @staticmethod
    def _claves_del_dia():
        fecha = timezone.localdate().isoformat()
        return f'correo:consumo:{fecha}', f'correo:alerta:{fecha}'

    @staticmethod
    def _umbral():
        return max(1, math.ceil(settings.EMAIL_LIMITE_DIARIO * settings.EMAIL_UMBRAL_ALERTA_PCT / 100))

    @staticmethod
    def consumo_del_dia():
        return cache.get(EmailService._claves_del_dia()[0], 0)

    @staticmethod
    def cupo_agotado():
        """Consulta sin consumir: permite no generar un código que no se podría entregar."""
        if EmailService.proveedor() not in PROVEEDORES_CON_CUOTA:
            return False
        return EmailService.consumo_del_dia() >= settings.EMAIL_LIMITE_DIARIO

    @staticmethod
    def reservar_cupo():
        """
        Cuenta un envío del día calendario (zona horaria del proyecto). `alerta_pendiente` es verdadero una sola vez
        por día, en el primer envío que alcanza el umbral, aunque el límite se supere después.
        """
        limite = settings.EMAIL_LIMITE_DIARIO
        if EmailService.proveedor() not in PROVEEDORES_CON_CUOTA:
            return CupoCorreo(True, 0, limite, False)

        clave_consumo, clave_alerta = EmailService._claves_del_dia()
        cache.add(clave_consumo, 0, timeout=VIGENCIA_CONTADOR_SEGUNDOS)
        consumo = cache.incr(clave_consumo)
        alerta = (
            consumo >= EmailService._umbral()
            and cache.add(clave_alerta, 1, timeout=VIGENCIA_CONTADOR_SEGUNDOS)
        )
        return CupoCorreo(consumo <= limite, consumo, limite, alerta)

    @staticmethod
    def enviar(mensaje):
        """Entrega el mensaje por el proveedor configurado. Devuelve si fue aceptado y nunca lanza una excepción de red."""
        return _PROVEEDORES[EmailService.proveedor()](mensaje)


def armar_codigo_recuperacion(destinatario, codigo, minutos_de_vigencia):
    """Correo con el código de verificación para restablecer la contraseña: HTML simple y versión en texto plano."""
    texto = (
        'Hola,\n\n'
        'Recibimos un pedido para restablecer la contraseña de tu cuenta de TaLibre.\n\n'
        f'Tu código de verificación es: {codigo}\n\n'
        f'Vence en {minutos_de_vigencia} minutos y solo se puede usar una vez.\n\n'
        'Si no lo pediste vos, ignorá este correo: tu contraseña no cambia y nadie puede usar este código sin '
        'acceso a tu casilla.\n\n'
        'TaLibre\n'
    )
    html = (
        '<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f4f4f5;'
        'font-family:Arial,Helvetica,sans-serif;color:#18181b;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">'
        '<table role="presentation" width="480" cellpadding="0" cellspacing="0" '
        'style="max-width:480px;background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;">'
        '<tr><td style="padding:32px;">'
        '<h1 style="margin:0 0 16px;font-size:20px;">Recuperá tu contraseña</h1>'
        '<p style="margin:0 0 16px;font-size:15px;line-height:1.5;">'
        'Recibimos un pedido para restablecer la contraseña de tu cuenta de TaLibre. '
        'Ingresá este código para continuar:</p>'
        '<p style="margin:0 0 16px;padding:16px;text-align:center;background:#f4f4f5;border-radius:6px;'
        f'font-size:32px;font-weight:bold;letter-spacing:8px;font-family:Consolas,monospace;">{escape(codigo)}</p>'
        f'<p style="margin:0 0 16px;font-size:14px;line-height:1.5;">Vence en {minutos_de_vigencia} minutos y '
        'solo se puede usar una vez.</p>'
        '<p style="margin:0;font-size:13px;line-height:1.5;color:#52525b;">'
        'Si no lo pediste vos, ignorá este correo: tu contraseña no cambia.</p>'
        '</td></tr></table></td></tr></table></body></html>'
    )
    return MensajeCorreo(destinatario, ASUNTO_CODIGO_RECUPERACION, texto, html)

"""Recuperación de contraseña con código numérico: generación, correo, anti-enumeración, tope de intentos y cuota."""
import hashlib
import hmac
import io
import json
import logging
import re
import urllib.error
from datetime import timedelta
from unittest import mock

import pytest
from django.conf import settings as ajustes
from django.test import override_settings
from rest_framework import status
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from conftest import PASSWORD_PRUEBA
from core import email_service
from core.email_service import EmailService, armar_codigo_recuperacion
from core.models import (
    CodigoRecuperacionContrasena,
    EstadoUsuario,
    LogAuditoria,
    TipoEventoAuditoria,
)
from core.services import (
    CATEGORIA_AVISO_SISTEMA,
    PRIORIDAD_AVISO_URGENTE,
    AvisoComplejoService,
    CorreoService,
    RecuperacionContrasenaService,
)

URL_RECUPERAR = '/api/auth/recuperar-contrasena/'
URL_RESTABLECER = '/api/auth/restablecer-contrasena/'
URL_LOGIN = '/api/token/'
URL_REFRESH = '/api/token/refresh/'

EMAIL = 'jugador@talibre.test'
NUEVA_CONTRASENA = 'NuevaClave#2027'
MENSAJE_NEUTRO = 'Si el correo está registrado, enviamos un código de verificación válido por 15 minutos.'
MENSAJE_INVALIDO = 'El código es inválido o expiró.'
CLAVE_API_FICTICIA = 're_clave_ficticia_de_prueba'
PATRON_CODIGO = re.compile(r'es: (\d{6})')


class RespuestaHttp:
    """Respuesta mínima del abridor de urllib: se usa como administrador de contexto."""

    def __init__(self, estado=200):
        self.status = estado

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


@pytest.fixture
def correos():
    """Reemplaza la entrega: junta los mensajes que se habrían enviado y devuelve el código de cada uno."""
    entregados = []

    def _entregar(mensaje):
        entregados.append(mensaje)
        return True

    with mock.patch.object(EmailService, 'enviar', side_effect=_entregar):
        yield entregados


@pytest.fixture
def log_correo(caplog):
    logger = logging.getLogger('core.correo')
    logger.addHandler(caplog.handler)
    caplog.set_level(logging.INFO, logger='core.correo')
    yield caplog
    logger.removeHandler(caplog.handler)


@pytest.fixture
def avisos():
    with mock.patch.object(AvisoComplejoService, 'entregar') as entregar:
        yield entregar


@pytest.fixture
def pedir(cliente, django_capture_on_commit_callbacks):
    def _pedir(email=EMAIL):
        with django_capture_on_commit_callbacks(execute=True):
            return cliente.post(URL_RECUPERAR, {'email': email}, format='json')

    return _pedir


@pytest.fixture
def restablecer(cliente):
    def _restablecer(codigo, nueva=NUEVA_CONTRASENA, email=EMAIL):
        return cliente.post(
            URL_RESTABLECER, {'email': email, 'codigo': codigo, 'nueva_contrasena': nueva}, format='json',
        )

    return _restablecer


def _codigo_de(mensaje):
    return PATRON_CODIGO.search(mensaje.texto).group(1)


def _firma(usuario_id, codigo):
    return hmac.new(ajustes.SECRET_KEY.encode(), f'{usuario_id}:{codigo}'.encode(), hashlib.sha256).hexdigest()


def _texto_de_auditoria():
    return ' '.join(f'{log.accion} {log.detalle}' for log in LogAuditoria.objects.all())


def _con_resend(**cambios):
    return override_settings(EMAIL_PROVEEDOR='resend', RESEND_API_KEY=CLAVE_API_FICTICIA, **cambios)


class TestGeneracionDelCodigo:
    def test_el_codigo_tiene_seis_digitos_con_ceros_a_la_izquierda(self, jugador, pedir, correos):
        with mock.patch('core.services.secrets.randbelow', return_value=42):
            respuesta = pedir()

        assert respuesta.status_code == status.HTTP_200_OK
        assert _codigo_de(correos[0]) == '000042'

    def test_se_guarda_solo_el_hmac_sha256_atado_al_usuario(self, jugador, pedir, correos):
        pedir()
        codigo = _codigo_de(correos[0])
        registro = CodigoRecuperacionContrasena.objects.get()

        assert registro.codigo_hash == _firma(jugador.pk, codigo)
        assert len(registro.codigo_hash) == 64
        assert registro.codigo_hash != hashlib.sha256(codigo.encode()).hexdigest()
        assert registro.codigo_hash != _firma(jugador.pk + 1, codigo)
        valores = [str(valor) for valor in CodigoRecuperacionContrasena.objects.values().get().values()]
        assert codigo not in ' '.join(valor for valor in valores if valor != registro.codigo_hash)

    def test_vence_a_los_quince_minutos_y_guarda_la_ip(self, reloj, jugador, pedir, correos):
        pedir()

        registro = CodigoRecuperacionContrasena.objects.get()
        assert registro.expira_en - registro.fecha_creacion == timedelta(minutes=15)
        assert registro.ip_solicitud == '127.0.0.1'
        assert registro.intentos_fallidos == 0
        assert registro.usado_en is None and registro.invalidado_en is None


class TestCorreo:
    def test_la_plantilla_lleva_el_codigo_la_vigencia_y_el_aviso_de_ignorarlo(self):
        mensaje = armar_codigo_recuperacion('jugador@talibre.test', '012345', 15)

        assert mensaje.asunto == 'Tu código de recuperación — TaLibre'
        for contenido in (mensaje.texto, mensaje.html):
            assert '012345' in contenido
            assert '15 minutos' in contenido
            assert 'ignorá este correo' in contenido
        assert mensaje.destinatario == 'jugador@talibre.test'

    @override_settings(DEBUG=True)
    def test_consola_en_desarrollo_muestra_el_codigo_sin_trafico_http(self, jugador, pedir, log_correo, sin_trafico_de_correo):
        with mock.patch('core.services.secrets.randbelow', return_value=7):
            pedir()

        assert '000007' in log_correo.text
        assert 'Para: jugador@talibre.test' in log_correo.text
        sin_trafico_de_correo.assert_not_called()

    def test_consola_fuera_de_desarrollo_no_registra_el_codigo(self, jugador, pedir, log_correo):
        with mock.patch('core.services.secrets.randbelow', return_value=7):
            pedir()

        assert '000007' not in log_correo.text
        assert 'jugador@talibre.test' not in log_correo.text
        assert 'no se envió' in log_correo.text

    @override_settings(DEBUG=True, EMAIL_PROVEEDOR='resend', RESEND_API_KEY='')
    def test_resend_sin_clave_en_desarrollo_cae_a_la_consola(self, jugador, pedir, log_correo, sin_trafico_de_correo):
        pedir()

        assert EmailService.proveedor() == 'consola'
        assert 'Correo de desarrollo' in log_correo.text
        sin_trafico_de_correo.assert_not_called()

    def test_resend_arma_el_pedido_con_la_api_y_un_tiempo_maximo(self, jugador, pedir):
        with _con_resend(), mock.patch.object(email_service._abridor, 'open', return_value=RespuestaHttp()) as abrir:
            with mock.patch('core.services.secrets.randbelow', return_value=123456):
                respuesta = pedir()

        assert respuesta.status_code == status.HTTP_200_OK
        pedido = abrir.call_args.args[0]
        cuerpo = json.loads(pedido.data)
        assert pedido.full_url == 'https://api.resend.com/emails'
        assert pedido.get_method() == 'POST'
        assert pedido.get_header('Authorization') == f'Bearer {CLAVE_API_FICTICIA}'
        assert pedido.get_header('Content-type') == 'application/json'
        assert abrir.call_args.kwargs['timeout'] == 8
        assert cuerpo['from'] == 'TaLibre <no-reply@mail.example.com>'
        assert cuerpo['to'] == ['jugador@talibre.test']
        assert cuerpo['subject'] == 'Tu código de recuperación — TaLibre'
        assert '123456' in cuerpo['text'] and '123456' in cuerpo['html']

    @pytest.mark.parametrize('falla', [
        urllib.error.HTTPError(
            'https://api.resend.com/emails', 422, 'Unprocessable', {}, io.BytesIO(b'{"message":"to jugador@talibre.test"}'),
        ),
        urllib.error.HTTPError('https://api.resend.com/emails', 401, 'Unauthorized', {}, io.BytesIO(b'{}')),
        urllib.error.URLError('sin red'),
        TimeoutError('tiempo agotado'),
    ])
    def test_una_falla_de_resend_no_rompe_la_respuesta_ni_expone_secretos(self, jugador, pedir, log_correo, falla):
        with _con_resend(), mock.patch.object(email_service._abridor, 'open', side_effect=falla):
            with mock.patch('core.services.secrets.randbelow', return_value=654321):
                respuesta = pedir()

        assert respuesta.status_code == status.HTTP_200_OK
        assert respuesta.json() == {'detail': MENSAJE_NEUTRO}
        assert 'Resend' in log_correo.text
        for secreto in (CLAVE_API_FICTICIA, '654321', 'jugador@talibre.test'):
            assert secreto not in log_correo.text

    def test_resend_que_responde_un_estado_distinto_de_2xx_no_cuenta_como_entregado(self):
        with _con_resend(), mock.patch.object(email_service._abridor, 'open', return_value=RespuestaHttp(500)):
            assert EmailService.enviar(armar_codigo_recuperacion('jugador@talibre.test', '111111', 15)) is False

    @override_settings(EMAIL_ENVIO_EN_SEGUNDO_PLANO=True)
    def test_la_entrega_sale_en_un_hilo_aparte_para_no_delatar_cuentas(self, jugador, pedir, correos):
        with mock.patch('core.services.threading.Thread') as hilo:
            respuesta = pedir()

        assert respuesta.status_code == status.HTTP_200_OK
        hilo.assert_called_once()
        assert hilo.call_args.kwargs['target'] is EmailService.enviar
        hilo.return_value.start.assert_called_once()
        assert correos == []


class TestAntiEnumeracion:
    def test_la_respuesta_es_identica_exista_o_no_la_cuenta(self, crear_usuario, jugador, pedir, correos):
        suspendido = crear_usuario('suspendido@talibre.test', estado=EstadoUsuario.SUSPENDIDO)
        baja = crear_usuario('baja@talibre.test', estado=EstadoUsuario.BAJA)

        respuestas = {
            'existente': pedir(EMAIL),
            'inexistente': pedir('nadie@talibre.test'),
            'suspendida': pedir(suspendido.email),
            'baja': pedir(baja.email),
        }

        assert {nombre: (r.status_code, r.json()) for nombre, r in respuestas.items()} == {
            nombre: (status.HTTP_200_OK, {'detail': MENSAJE_NEUTRO}) for nombre in respuestas
        }
        assert [mensaje.destinatario for mensaje in correos] == [EMAIL]
        assert CodigoRecuperacionContrasena.objects.count() == 1

    def test_las_cuentas_no_activas_no_dejan_codigo_ni_auditoria(self, crear_usuario, pedir, correos):
        crear_usuario('suspendido@talibre.test', estado=EstadoUsuario.SUSPENDIDO)
        pedir('suspendido@talibre.test')
        pedir('nadie@talibre.test')

        assert correos == []
        assert not CodigoRecuperacionContrasena.objects.exists()
        assert not LogAuditoria.objects.filter(tipo_evento=TipoEventoAuditoria.SOLICITUD_CODIGO_RECUPERACION).exists()

    def test_un_pedido_con_enfriamiento_activo_responde_lo_mismo(self, jugador, pedir, correos):
        primera = pedir()
        segunda = pedir()

        assert (segunda.status_code, segunda.json()) == (primera.status_code, primera.json())
        assert len(correos) == 1

    def test_el_correo_se_normaliza(self, jugador, pedir, correos):
        pedir('  JUGADOR@TaLibre.test ')

        assert [mensaje.destinatario for mensaje in correos] == [EMAIL]

    @pytest.mark.parametrize('cuerpo', [{}, {'email': ''}, {'email': 'sin-arroba'}, {'email': 'a@b'}, {'email': 'x' * 130 + '@talibre.test'}])
    def test_un_formato_invalido_responde_400(self, cliente, cuerpo):
        assert cliente.post(URL_RECUPERAR, cuerpo, format='json').status_code == status.HTTP_400_BAD_REQUEST

    def test_responde_400_con_el_mismo_mensaje_neutro_al_restablecer(self, restablecer, jugador, pedir, correos):
        pedir()
        codigo = _codigo_de(correos[0])
        distinto = '000000' if codigo != '000000' else '000001'

        inexistente = restablecer(codigo, email='nadie@talibre.test')
        incorrecto = restablecer(distinto)

        assert inexistente.status_code == incorrecto.status_code == status.HTTP_400_BAD_REQUEST
        assert inexistente.json() == incorrecto.json() == {'error': True, 'detail': MENSAJE_INVALIDO}

    def test_las_cuentas_no_activas_y_sin_codigo_reciben_el_mismo_400(self, crear_usuario, jugador, restablecer):
        baja = crear_usuario('baja@talibre.test', estado=EstadoUsuario.BAJA)

        for email in (baja.email, EMAIL, 'nadie@talibre.test'):
            respuesta = restablecer('123456', email=email)
            assert respuesta.status_code == status.HTTP_400_BAD_REQUEST
            assert respuesta.json() == {'error': True, 'detail': MENSAJE_INVALIDO}


class TestEnfriamiento:
    def test_antes_de_un_minuto_no_se_genera_otro_codigo(self, reloj, jugador, pedir, correos):
        pedir()
        reloj.return_value += timedelta(seconds=59)
        pedir()

        assert len(correos) == 1
        assert CodigoRecuperacionContrasena.objects.count() == 1

    def test_pasado_el_minuto_se_genera_otro_y_el_anterior_queda_invalidado(self, reloj, jugador, pedir, correos, restablecer):
        with mock.patch('core.services.secrets.randbelow', return_value=111111):
            pedir()
        primero = _codigo_de(correos[0])
        reloj.return_value += timedelta(seconds=61)
        with mock.patch('core.services.secrets.randbelow', return_value=222222):
            pedir()

        anterior, nuevo = CodigoRecuperacionContrasena.objects.order_by('id')
        assert anterior.invalidado_en is not None and nuevo.invalidado_en is None
        assert restablecer(primero).status_code == status.HTTP_400_BAD_REQUEST
        assert restablecer('222222').status_code == status.HTTP_200_OK

    def test_el_enfriamiento_es_por_cuenta(self, reloj, crear_usuario, jugador, pedir, correos):
        crear_usuario('otro.jugador@talibre.test')
        pedir(EMAIL)
        pedir('otro.jugador@talibre.test')

        assert len(correos) == 2


class TestRestablecimiento:
    def test_con_el_codigo_correcto_cambia_la_contrasena(self, cliente, jugador, pedir, correos, restablecer):
        pedir()
        respuesta = restablecer(_codigo_de(correos[0]))

        assert respuesta.status_code == status.HTTP_200_OK
        assert respuesta.json() == {'detail': 'Contraseña actualizada. Ya podés iniciar sesión con la nueva.'}
        assert cliente.post(URL_LOGIN, {'email': EMAIL, 'password': NUEVA_CONTRASENA}, format='json').status_code == 200
        assert cliente.post(URL_LOGIN, {'email': EMAIL, 'password': PASSWORD_PRUEBA}, format='json').status_code == 401

    def test_el_codigo_no_se_puede_reutilizar(self, jugador, pedir, correos, restablecer):
        pedir()
        codigo = _codigo_de(correos[0])
        assert restablecer(codigo).status_code == status.HTTP_200_OK

        repetido = restablecer(codigo, nueva='OtraClave#2028')

        assert repetido.status_code == status.HTTP_400_BAD_REQUEST
        assert repetido.json()['detail'] == MENSAJE_INVALIDO
        assert CodigoRecuperacionContrasena.objects.get().usado_en is not None

    def test_revoca_los_refresh_tokens_previos(self, cliente, jugador, pedir, correos, restablecer):
        cliente.post(URL_LOGIN, {'email': EMAIL, 'password': PASSWORD_PRUEBA}, format='json')
        assert cliente.post(URL_REFRESH).status_code == status.HTTP_200_OK
        pedir()
        assert OutstandingToken.objects.filter(user=jugador).exists()
        sesion_vieja = cliente.cookies['refresh'].value

        assert restablecer(_codigo_de(correos[0])).status_code == status.HTTP_200_OK

        assert BlacklistedToken.objects.filter(token__user=jugador).count() == OutstandingToken.objects.filter(user=jugador).count()
        cliente.cookies['refresh'] = sesion_vieja
        assert cliente.post(URL_REFRESH).status_code == status.HTTP_401_UNAUTHORIZED

    def test_descarta_la_cookie_de_sesion_del_navegador(self, cliente, jugador, pedir, correos, restablecer):
        pedir()
        cookie = restablecer(_codigo_de(correos[0])).cookies['refresh']

        assert cookie.value == ''
        assert cookie['path'] == '/api/token/'

    @pytest.mark.parametrize('contrasena', ['12345678', 'Ab1#', 'jugador@talibre.test'])
    def test_una_contrasena_debil_se_rechaza_sin_consumir_el_codigo(self, jugador, pedir, correos, restablecer, contrasena):
        pedir()
        codigo = _codigo_de(correos[0])

        rechazada = restablecer(codigo, nueva=contrasena)

        assert rechazada.status_code == status.HTTP_400_BAD_REQUEST
        assert 'nueva_contrasena' in rechazada.json()['detail']
        registro = CodigoRecuperacionContrasena.objects.get()
        assert registro.usado_en is None and registro.invalidado_en is None and registro.intentos_fallidos == 0
        assert restablecer(codigo).status_code == status.HTTP_200_OK

    @pytest.mark.parametrize('contrasena', ['Con espacio 123', 'ClaveÑandú#2026', 'x' * 129])
    def test_una_contrasena_con_formato_invalido_responde_400(self, jugador, pedir, correos, restablecer, contrasena):
        pedir()

        assert restablecer(_codigo_de(correos[0]), nueva=contrasena).status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.parametrize('codigo', ['12345', '1234567', '12a456', '', ' 12345', '１２３４５６'])
    def test_un_codigo_con_formato_invalido_responde_400_sin_contar_intentos(self, jugador, pedir, correos, restablecer, codigo):
        pedir()

        assert restablecer(codigo).status_code == status.HTTP_400_BAD_REQUEST
        assert CodigoRecuperacionContrasena.objects.get().intentos_fallidos == 0

    def test_un_codigo_vencido_se_rechaza_aunque_sea_el_correcto(self, reloj, jugador, pedir, correos, restablecer):
        pedir()
        codigo = _codigo_de(correos[0])
        reloj.return_value += timedelta(minutes=15, seconds=1)

        respuesta = restablecer(codigo)

        assert respuesta.status_code == status.HTTP_400_BAD_REQUEST
        assert respuesta.json()['detail'] == MENSAJE_INVALIDO

    def test_un_codigo_a_punto_de_vencer_todavia_sirve(self, reloj, jugador, pedir, correos, restablecer):
        pedir()
        reloj.return_value += timedelta(minutes=14, seconds=59)

        assert restablecer(_codigo_de(correos[0])).status_code == status.HTTP_200_OK

    def test_el_codigo_de_otra_cuenta_no_sirve(self, crear_usuario, jugador, pedir, correos, restablecer):
        otro = crear_usuario('otro.jugador@talibre.test')
        with mock.patch('core.services.secrets.randbelow', side_effect=[111111, 222222]):
            pedir(EMAIL)
            pedir(otro.email)

        assert restablecer('222222', email=EMAIL).status_code == status.HTTP_400_BAD_REQUEST
        assert restablecer('111111', email=EMAIL).status_code == status.HTTP_200_OK


class TestTopeDeIntentos:
    def _equivocado(self, codigo):
        return '000000' if codigo != '000000' else '000001'

    def test_cada_fallo_se_persiste(self, jugador, pedir, correos, restablecer):
        pedir()
        restablecer(self._equivocado(_codigo_de(correos[0])))

        assert CodigoRecuperacionContrasena.objects.get().intentos_fallidos == 1

    def test_al_quinto_fallo_invalida_el_codigo_y_rechaza_aunque_despues_llegue_el_correcto(
        self, jugador, pedir, correos, restablecer,
    ):
        pedir()
        codigo = _codigo_de(correos[0])

        for _ in range(4):
            respuesta = restablecer(self._equivocado(codigo))
            assert respuesta.json() == {'error': True, 'detail': MENSAJE_INVALIDO}
        assert CodigoRecuperacionContrasena.objects.get().invalidado_en is None
        assert not LogAuditoria.objects.filter(tipo_evento=TipoEventoAuditoria.CODIGO_RECUPERACION_BLOQUEADO).exists()

        quinta = restablecer(self._equivocado(codigo))

        assert quinta.status_code == status.HTTP_400_BAD_REQUEST
        assert quinta.json() == {'error': True, 'detail': MENSAJE_INVALIDO}
        registro = CodigoRecuperacionContrasena.objects.get()
        assert registro.invalidado_en is not None and registro.intentos_fallidos == 5
        assert LogAuditoria.objects.filter(tipo_evento=TipoEventoAuditoria.CODIGO_RECUPERACION_BLOQUEADO).count() == 1

        correcto = restablecer(codigo)

        assert correcto.status_code == status.HTTP_400_BAD_REQUEST
        assert correcto.json() == {'error': True, 'detail': MENSAJE_INVALIDO}
        jugador.refresh_from_db()
        assert jugador.check_password(PASSWORD_PRUEBA)

    def test_despues_del_bloqueo_se_puede_pedir_un_codigo_nuevo(self, reloj, jugador, pedir, correos, restablecer):
        pedir()
        for _ in range(5):
            restablecer(self._equivocado(_codigo_de(correos[0])))
        reloj.return_value += timedelta(seconds=61)

        pedir()

        assert len(correos) == 2
        nuevo = CodigoRecuperacionContrasena.objects.order_by('id').last()
        assert nuevo.intentos_fallidos == 0 and nuevo.invalidado_en is None
        assert restablecer(_codigo_de(correos[1])).status_code == status.HTTP_200_OK

    def test_un_codigo_correcto_no_suma_fallos(self, jugador, pedir, correos, restablecer):
        pedir()
        restablecer(self._equivocado(_codigo_de(correos[0])))
        restablecer(_codigo_de(correos[0]))

        assert CodigoRecuperacionContrasena.objects.get().intentos_fallidos == 1

    @override_settings(RECUPERACION_INTENTOS_MAXIMOS=2)
    def test_el_tope_es_configurable(self, jugador, pedir, correos, restablecer):
        pedir()
        for _ in range(2):
            restablecer(self._equivocado(_codigo_de(correos[0])))

        assert CodigoRecuperacionContrasena.objects.get().invalidado_en is not None


class TestLimitesDePeticiones:
    def test_pedir_codigo_se_limita_por_ip(self, cliente, jugador):
        for _ in range(5):
            assert cliente.post(URL_RECUPERAR, {'email': EMAIL}, format='json').status_code == status.HTTP_200_OK

        bloqueada = cliente.post(URL_RECUPERAR, {'email': EMAIL}, format='json')

        assert bloqueada.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert LogAuditoria.objects.filter(tipo_evento=TipoEventoAuditoria.LIMITE_PETICIONES).exists()

    def test_restablecer_se_limita_por_ip(self, db, restablecer):
        for _ in range(10):
            assert restablecer('123456', email='nadie@talibre.test').status_code == status.HTTP_400_BAD_REQUEST

        assert restablecer('123456', email='nadie@talibre.test').status_code == status.HTTP_429_TOO_MANY_REQUESTS

    def test_los_dos_limites_son_independientes(self, cliente, jugador, restablecer):
        for _ in range(5):
            cliente.post(URL_RECUPERAR, {'email': EMAIL}, format='json')

        assert restablecer('123456').status_code == status.HTTP_400_BAD_REQUEST

    def test_no_exige_sesion_ni_se_confunde_con_un_access_vencido(self, cliente, jugador):
        cliente.credentials(HTTP_AUTHORIZATION='Bearer vencido')

        assert cliente.post(URL_RECUPERAR, {'email': EMAIL}, format='json').status_code == status.HTTP_200_OK


class TestAuditoria:
    def test_los_tres_hitos_quedan_registrados_con_la_cuenta_y_la_ip(self, reloj, jugador, pedir, correos, restablecer):
        pedir()
        for _ in range(5):
            restablecer('000000' if _codigo_de(correos[0]) != '000000' else '000001')
        reloj.return_value += timedelta(seconds=61)
        pedir()
        restablecer(_codigo_de(correos[1]))

        assert list(LogAuditoria.objects.order_by('id').values_list('tipo_evento', flat=True)) == [
            TipoEventoAuditoria.SOLICITUD_CODIGO_RECUPERACION,
            TipoEventoAuditoria.CODIGO_RECUPERACION_BLOQUEADO,
            TipoEventoAuditoria.SOLICITUD_CODIGO_RECUPERACION,
            TipoEventoAuditoria.CONTRASENA_RESTABLECIDA,
        ]
        assert {log.usuario_id for log in LogAuditoria.objects.all()} == {jugador.pk}
        assert {log.ip_origen for log in LogAuditoria.objects.all()} == {'127.0.0.1'}

    def test_el_restablecimiento_exitoso_queda_registrado(self, jugador, pedir, correos, restablecer):
        pedir()
        restablecer(_codigo_de(correos[0]))

        log = LogAuditoria.objects.get(tipo_evento=TipoEventoAuditoria.CONTRASENA_RESTABLECIDA)
        assert log.usuario_id == jugador.pk
        assert log.ip_origen == '127.0.0.1'

    def test_los_numeros_de_evento_son_estables(self):
        assert TipoEventoAuditoria.SOLICITUD_CODIGO_RECUPERACION == 20
        assert TipoEventoAuditoria.CODIGO_RECUPERACION_BLOQUEADO == 21
        assert TipoEventoAuditoria.CONTRASENA_RESTABLECIDA == 22

    def test_la_auditoria_y_el_log_de_seguridad_no_guardan_correo_codigo_ni_contrasena(
        self, reloj, jugador, pedir, correos, restablecer, log_seguridad,
    ):
        with mock.patch('core.services.secrets.randbelow', side_effect=[482915, 739204]):
            pedir()
            for _ in range(5):
                restablecer('000000', nueva='ClaveSecreta#9999')
            reloj.return_value += timedelta(seconds=61)
            pedir()
        assert restablecer('739204', nueva='ClaveSecreta#9999').status_code == status.HTTP_200_OK

        assert LogAuditoria.objects.count() == 4
        persistido = _texto_de_auditoria() + ' ' + log_seguridad.text
        datos = (
            EMAIL, 'talibre.test', '482915', '739204', '000000', 'ClaveSecreta',
            _firma(jugador.pk, '482915'), _firma(jugador.pk, '739204'),
        )
        for dato in datos:
            assert dato not in persistido

    def test_el_superadmin_los_ve_filtrando_por_tipo(self, jugador, superadmin, cliente_de, pedir, correos, restablecer):
        pedir()
        restablecer(_codigo_de(correos[0]))

        respuesta = cliente_de(superadmin).get('/api/auditoria/?tipo_evento=22')

        assert respuesta.status_code == status.HTTP_200_OK
        resultados = respuesta.json()['results']
        assert [fila['tipo_evento'] for fila in resultados] == [22]
        assert resultados[0]['tipo_evento_nombre'] == 'Contraseña restablecida con código de recuperación'


class TestRetencionDeLaIp:
    def test_la_ip_de_la_solicitud_se_anonimiza_con_la_de_la_auditoria(self, reloj, jugador, pedir, correos):
        from core.services import AuditoriaService

        pedir()
        CodigoRecuperacionContrasena.objects.update(fecha_creacion=reloj.return_value - timedelta(days=13 * 31))

        AuditoriaService.anonimizar_ips_vencidas()

        assert CodigoRecuperacionContrasena.objects.get().ip_solicitud is None


class TestAlertaDeCuota:
    """Con Resend la cuenta del día cuenta; la consola no gasta cuota ni alerta."""

    def _usuarios(self, crear_usuario, cantidad, prefijo='jugador'):
        return [crear_usuario(f'{prefijo}{n}@talibre.test') for n in range(cantidad)]

    def _solicitar(self, usuarios, commit):
        for usuario in usuarios:
            # Un commit por pedido, como en producción: la cuenta del día se actualiza antes del pedido siguiente.
            with commit(execute=True):
                RecuperacionContrasenaService.solicitar_codigo(usuario.email, None)

    @_con_resend(EMAIL_LIMITE_DIARIO=10, EMAIL_UMBRAL_ALERTA_PCT=80)
    def test_avisa_una_sola_vez_al_alcanzar_el_umbral(
        self, crear_usuario, superadmin, avisos, django_capture_on_commit_callbacks,
    ):
        usuarios = self._usuarios(crear_usuario, 10)
        with mock.patch.object(email_service._abridor, 'open', return_value=RespuestaHttp()) as abrir:
            self._solicitar(usuarios[:7], django_capture_on_commit_callbacks)
            assert avisos.call_count == 0

            self._solicitar(usuarios[7:8], django_capture_on_commit_callbacks)
            assert avisos.call_count == 1

            self._solicitar(usuarios[8:], django_capture_on_commit_callbacks)

        assert abrir.call_count == 10
        assert avisos.call_count == 1
        aviso = avisos.call_args.args[0]
        assert aviso['usuarios_ids'] == [superadmin.pk]
        assert aviso['categoria'] == CATEGORIA_AVISO_SISTEMA
        assert aviso['prioridad'] == PRIORIDAD_AVISO_URGENTE
        assert re.fullmatch(r'cuota-correo-\d{4}-\d{2}-\d{2}', aviso['clave_unica'])
        assert '8 de 10' in aviso['mensaje'] and '80%' in aviso['mensaje']
        assert '@' not in aviso['mensaje']

    @_con_resend(EMAIL_LIMITE_DIARIO=4, EMAIL_UMBRAL_ALERTA_PCT=50)
    def test_al_dia_siguiente_la_cuenta_y_el_aviso_vuelven_a_empezar(
        self, reloj, crear_usuario, superadmin, avisos, django_capture_on_commit_callbacks,
    ):
        usuarios = self._usuarios(crear_usuario, 6)
        with mock.patch.object(email_service._abridor, 'open', return_value=RespuestaHttp()):
            self._solicitar(usuarios[:3], django_capture_on_commit_callbacks)
            assert avisos.call_count == 1
            primera_clave = avisos.call_args.args[0]['clave_unica']

            reloj.return_value += timedelta(days=1)
            self._solicitar(usuarios[3:], django_capture_on_commit_callbacks)

        assert avisos.call_count == 2
        assert avisos.call_args.args[0]['clave_unica'] != primera_clave
        assert EmailService.consumo_del_dia() == 3

    @_con_resend(EMAIL_LIMITE_DIARIO=3, EMAIL_UMBRAL_ALERTA_PCT=100)
    def test_al_llegar_al_limite_deja_de_enviar_sin_error_y_lo_registra(
        self, crear_usuario, superadmin, avisos, log_correo, django_capture_on_commit_callbacks,
    ):
        usuarios = self._usuarios(crear_usuario, 4)
        with mock.patch.object(email_service._abridor, 'open', return_value=RespuestaHttp()) as abrir:
            self._solicitar(usuarios, django_capture_on_commit_callbacks)

        assert abrir.call_count == 3
        assert CodigoRecuperacionContrasena.objects.count() == 3
        assert 'Límite diario de correos alcanzado' in log_correo.text
        assert avisos.call_count == 1

    @_con_resend(EMAIL_LIMITE_DIARIO=2, EMAIL_UMBRAL_ALERTA_PCT=100)
    def test_un_envio_que_supera_el_limite_se_descarta_sin_lanzar(self, avisos, log_correo, superadmin):
        mensaje = armar_codigo_recuperacion('jugador@talibre.test', '123456', 15)
        with mock.patch.object(email_service._abridor, 'open', return_value=RespuestaHttp()) as abrir:
            for _ in range(4):
                CorreoService._despachar(mensaje)

        assert abrir.call_count == 2
        assert log_correo.text.count('Se alcanzó el límite diario de correos') == 2
        assert 'jugador@talibre.test' not in log_correo.text

    @override_settings(EMAIL_LIMITE_DIARIO=1, EMAIL_UMBRAL_ALERTA_PCT=100)
    def test_la_consola_no_cuenta_ni_alerta(self, crear_usuario, superadmin, avisos, django_capture_on_commit_callbacks):
        self._solicitar(self._usuarios(crear_usuario, 3), django_capture_on_commit_callbacks)

        assert EmailService.consumo_del_dia() == 0
        assert avisos.call_count == 0

    @_con_resend(EMAIL_LIMITE_DIARIO=10, EMAIL_UMBRAL_ALERTA_PCT=80)
    def test_una_falla_al_avisar_no_impide_enviar(self, crear_usuario, superadmin, django_capture_on_commit_callbacks):
        from django.db import DatabaseError

        with mock.patch.object(AvisoComplejoService, 'a_superadmins', side_effect=DatabaseError('caída')):
            with mock.patch.object(email_service._abridor, 'open', return_value=RespuestaHttp()) as abrir:
                self._solicitar(self._usuarios(crear_usuario, 8), django_capture_on_commit_callbacks)

        assert abrir.call_count == 8

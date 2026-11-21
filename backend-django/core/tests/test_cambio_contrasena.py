"""Cambio de contraseña con la sesión abierta: validaciones, cierre de sesiones, códigos pendientes y auditoría."""
from datetime import timedelta
from unittest import mock

import pytest
from rest_framework import status
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from conftest import PASSWORD_PRUEBA
from core.models import CodigoRecuperacionContrasena, LogAuditoria, TipoEventoAuditoria

URL_CAMBIAR = '/api/auth/cambiar-contrasena/'
URL_LOGIN = '/api/token/'
URL_REFRESH = '/api/token/refresh/'
URL_RECUPERAR = '/api/auth/recuperar-contrasena/'
URL_RESTABLECER = '/api/auth/restablecer-contrasena/'

EMAIL = 'jugador@talibre.test'
NUEVA = 'NuevaClave#2027'


@pytest.fixture
def cambiar(jugador, cliente_de):
    def _cambiar(actual=PASSWORD_PRUEBA, nueva=NUEVA, usuario=None, cliente=None):
        api = cliente or cliente_de(usuario or jugador)
        return api.post(URL_CAMBIAR, {'contrasena_actual': actual, 'nueva_contrasena': nueva}, format='json')

    return _cambiar


def _login(cliente, password):
    return cliente.post(URL_LOGIN, {'email': EMAIL, 'password': password}, format='json')


class TestCambioExitoso:
    def test_responde_200_y_permite_entrar_solo_con_la_clave_nueva(self, cliente, jugador, cambiar):
        respuesta = cambiar()

        assert respuesta.status_code == status.HTTP_200_OK
        assert respuesta.json() == {'detail': 'Contraseña actualizada. Iniciá sesión de nuevo con la nueva.'}
        assert _login(cliente, NUEVA).status_code == status.HTTP_200_OK
        assert _login(cliente, PASSWORD_PRUEBA).status_code == status.HTTP_401_UNAUTHORIZED

    def test_borra_la_cookie_y_revoca_todos_los_refresh_tokens(self, cliente, jugador, cliente_de, cambiar):
        _login(cliente, PASSWORD_PRUEBA)
        assert cliente.post(URL_REFRESH).status_code == status.HTTP_200_OK
        sesion_vieja = cliente.cookies['refresh'].value
        _login(cliente_de(jugador), PASSWORD_PRUEBA)
        assert OutstandingToken.objects.filter(user=jugador).count() >= 2

        respuesta = cambiar()

        cookie = respuesta.cookies['refresh']
        assert cookie.value == '' and cookie['path'] == '/api/token/'
        assert BlacklistedToken.objects.filter(token__user=jugador).count() == OutstandingToken.objects.filter(user=jugador).count()
        cliente.cookies['refresh'] = sesion_vieja
        assert cliente.post(URL_REFRESH).status_code == status.HTTP_401_UNAUTHORIZED

    def test_invalida_los_codigos_de_recuperacion_pendientes(self, cliente, jugador, cambiar, django_capture_on_commit_callbacks):
        with django_capture_on_commit_callbacks(execute=True):
            cliente.post(URL_RECUPERAR, {'email': EMAIL}, format='json')
        pendiente = CodigoRecuperacionContrasena.objects.get()
        assert pendiente.invalidado_en is None

        cambiar()

        pendiente.refresh_from_db()
        assert pendiente.invalidado_en is not None and pendiente.usado_en is None

    def test_un_codigo_pendiente_ya_no_puede_pisar_la_clave_nueva(self, cliente, jugador, cambiar, django_capture_on_commit_callbacks):
        with mock.patch('core.services.secrets.randbelow', return_value=135790):
            with django_capture_on_commit_callbacks(execute=True):
                cliente.post(URL_RECUPERAR, {'email': EMAIL}, format='json')
        cambiar()

        intento = cliente.post(
            URL_RESTABLECER, {'email': EMAIL, 'codigo': '135790', 'nueva_contrasena': 'OtraClave#2028'}, format='json',
        )

        assert intento.status_code == status.HTTP_400_BAD_REQUEST
        assert _login(cliente, NUEVA).status_code == status.HTTP_200_OK

    def test_lo_pueden_usar_todos_los_roles(self, crear_usuario, cliente_de, cambiar):
        for rol, correo in (('DUENO_COMPLEJO', 'dueno@talibre.test'), ('SUPERADMIN', 'admin@talibre.test')):
            usuario = crear_usuario(correo, rol)
            assert cambiar(usuario=usuario).status_code == status.HTTP_200_OK


class TestRechazos:
    def test_con_la_contrasena_actual_incorrecta_responde_400_en_ese_campo(self, cliente, jugador, cambiar):
        respuesta = cambiar(actual='OtraEquivocada#1')

        assert respuesta.status_code == status.HTTP_400_BAD_REQUEST
        assert respuesta.json()['detail'] == {'contrasena_actual': ['La contraseña actual es incorrecta.']}
        assert _login(cliente, PASSWORD_PRUEBA).status_code == status.HTTP_200_OK

    def test_una_clave_actual_incorrecta_no_cierra_sesiones_ni_toca_los_codigos(
        self, cliente, jugador, cambiar, django_capture_on_commit_callbacks,
    ):
        with django_capture_on_commit_callbacks(execute=True):
            cliente.post(URL_RECUPERAR, {'email': EMAIL}, format='json')
        _login(cliente, PASSWORD_PRUEBA)

        cambiar(actual='OtraEquivocada#1')

        assert not BlacklistedToken.objects.exists()
        assert CodigoRecuperacionContrasena.objects.get().invalidado_en is None
        assert not LogAuditoria.objects.filter(tipo_evento=TipoEventoAuditoria.CAMBIO_CONTRASENA).exists()

    def test_la_nueva_igual_a_la_actual_responde_400(self, jugador, cambiar):
        respuesta = cambiar(nueva=PASSWORD_PRUEBA)

        assert respuesta.status_code == status.HTTP_400_BAD_REQUEST
        assert 'nueva_contrasena' in respuesta.json()['detail']

    @pytest.mark.parametrize('nueva', ['12345678', 'Ab1#', 'jugador@talibre.test'])
    def test_una_contrasena_debil_responde_400(self, cliente, jugador, cambiar, nueva):
        respuesta = cambiar(nueva=nueva)

        assert respuesta.status_code == status.HTTP_400_BAD_REQUEST
        assert 'nueva_contrasena' in respuesta.json()['detail']
        assert _login(cliente, PASSWORD_PRUEBA).status_code == status.HTTP_200_OK

    @pytest.mark.parametrize('nueva', ['Con espacio 123', 'ClaveÑandú#2026', 'x' * 129])
    def test_una_contrasena_con_formato_invalido_responde_400(self, jugador, cambiar, nueva):
        assert cambiar(nueva=nueva).status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.parametrize('cuerpo', [{}, {'contrasena_actual': PASSWORD_PRUEBA}, {'nueva_contrasena': NUEVA}])
    def test_faltan_campos(self, jugador, cliente_de, cuerpo):
        assert cliente_de(jugador).post(URL_CAMBIAR, cuerpo, format='json').status_code == status.HTTP_400_BAD_REQUEST

    def test_un_anonimo_recibe_401(self, cliente, jugador):
        respuesta = cliente.post(URL_CAMBIAR, {'contrasena_actual': PASSWORD_PRUEBA, 'nueva_contrasena': NUEVA}, format='json')

        assert respuesta.status_code == status.HTTP_401_UNAUTHORIZED

    def test_un_access_invalido_recibe_401(self, cliente, jugador):
        cliente.credentials(HTTP_AUTHORIZATION='Bearer invalido')

        assert cliente.post(URL_CAMBIAR, {}, format='json').status_code == status.HTTP_401_UNAUTHORIZED

    def test_solo_acepta_post(self, jugador, cliente_de):
        assert cliente_de(jugador).get(URL_CAMBIAR).status_code == status.HTTP_405_METHOD_NOT_ALLOWED


class TestLimite:
    def test_se_limita_por_cuenta(self, jugador, cambiar):
        for _ in range(10):
            assert cambiar(actual='Equivocada#1').status_code == status.HTTP_400_BAD_REQUEST

        bloqueada = cambiar(actual='Equivocada#1')

        assert bloqueada.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert LogAuditoria.objects.filter(tipo_evento=TipoEventoAuditoria.LIMITE_PETICIONES).exists()

    def test_el_limite_de_una_cuenta_no_alcanza_a_otra(self, crear_usuario, jugador, cambiar):
        for _ in range(10):
            cambiar(actual='Equivocada#1')
        otro = crear_usuario('otro.jugador@talibre.test')

        assert cambiar(usuario=otro).status_code == status.HTTP_200_OK


class TestAuditoria:
    def test_registra_el_evento_23_con_la_cuenta_y_la_ip(self, jugador, cambiar):
        cambiar()

        log = LogAuditoria.objects.get(tipo_evento=23)
        assert log.tipo_evento == TipoEventoAuditoria.CAMBIO_CONTRASENA
        assert log.usuario_id == jugador.pk
        assert log.ip_origen == '127.0.0.1'
        assert log.get_tipo_evento_display() == 'Cambio de contraseña desde la cuenta'

    def test_se_distingue_de_la_recuperacion_por_codigo(self):
        assert TipoEventoAuditoria.CAMBIO_CONTRASENA != TipoEventoAuditoria.CONTRASENA_RESTABLECIDA
        assert TipoEventoAuditoria.CAMBIO_CONTRASENA == 23

    def test_no_guarda_correo_ni_contrasenas(self, jugador, cambiar, log_seguridad):
        cambiar(nueva='ClaveSecreta#9999')

        persistido = ' '.join(f'{log.accion} {log.detalle}' for log in LogAuditoria.objects.all()) + ' ' + log_seguridad.text
        for dato in (EMAIL, 'talibre.test', 'ClaveSecreta', PASSWORD_PRUEBA):
            assert dato not in persistido

    def test_el_superadmin_lo_ve_filtrando_por_tipo(self, jugador, superadmin, cliente_de, cambiar):
        cambiar()

        respuesta = cliente_de(superadmin).get('/api/auditoria/?tipo_evento=23')

        assert respuesta.status_code == status.HTTP_200_OK
        assert [fila['tipo_evento'] for fila in respuesta.json()['results']] == [23]

    def test_el_registro_sale_por_el_mismo_listado_que_la_recuperacion(self, jugador, superadmin, cliente_de, cambiar):
        cambiar()
        LogAuditoria.objects.create(
            tipo_evento=TipoEventoAuditoria.CONTRASENA_RESTABLECIDA, accion='Contraseña restablecida con código',
            usuario=jugador,
        )

        respuesta = cliente_de(superadmin).get('/api/auditoria/?tipo_evento=22')

        assert [fila['tipo_evento'] for fila in respuesta.json()['results']] == [22]


class TestConvivenciaConLaRecuperacion:
    def test_despues_de_restablecer_con_codigo_se_puede_cambiar_con_la_clave_nueva(
        self, reloj, cliente, jugador, cambiar, django_capture_on_commit_callbacks,
    ):
        with mock.patch('core.services.secrets.randbelow', return_value=246802):
            with django_capture_on_commit_callbacks(execute=True):
                cliente.post(URL_RECUPERAR, {'email': EMAIL}, format='json')
        reloj.return_value += timedelta(minutes=1)
        cliente.post(URL_RESTABLECER, {'email': EMAIL, 'codigo': '246802', 'nueva_contrasena': NUEVA}, format='json')

        respuesta = cambiar(actual=NUEVA, nueva='TercerClave#2029')

        assert respuesta.status_code == status.HTTP_200_OK
        assert list(LogAuditoria.objects.order_by('id').values_list('tipo_evento', flat=True)) == [
            TipoEventoAuditoria.SOLICITUD_CODIGO_RECUPERACION,
            TipoEventoAuditoria.CONTRASENA_RESTABLECIDA,
            TipoEventoAuditoria.CAMBIO_CONTRASENA,
        ]

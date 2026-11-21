import ast
import inspect
import logging
from datetime import date, time
from unittest import mock

import pytest
from django.contrib import admin
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import RequestFactory, override_settings

from conftest import PASSWORD_PRUEBA
from core import services
from core.catalogo_notificaciones import (
    CATALOGO,
    ROLES_APLICABLES,
    RolBaseNotificacion,
    TipoNotificacion,
    combinaciones_validas,
    es_combinacion_valida,
)
from core.email_service import EmailService, armar_codigo_recuperacion
from core.models import EstadoRegistro, Permiso, PreferenciaNotificacionRol, Rol, RolPermiso, Usuario
from core.services import (
    CATEGORIA_AVISO_RESERVAS,
    CATEGORIA_AVISO_SISTEMA,
    PRIORIDAD_AVISO_NORMAL,
    AvisoComplejoService,
    CorreoService,
    RecordatorioService,
    ReservaService,
)
from core.services import PreferenciaNotificacionService as Servicio

CLAVE = Servicio.CLAVE_CACHE


def _guardar(rol_base, tipo, habilitada=True, **campos):
    return PreferenciaNotificacionRol.objects.create(
        rol_base=rol_base, tipo_notificacion=tipo, habilitada=habilitada, **campos,
    )


@pytest.mark.django_db
class TestModelo:
    def test_hereda_modelo_base_y_nace_activo_y_habilitada(self):
        preferencia = _guardar('jugador', 'reservas')
        assert preferencia.estado == EstadoRegistro.ACTIVO
        assert preferencia.habilitada is True
        assert preferencia.fecha_creacion is not None

    def test_la_combinacion_rol_tipo_es_unica(self):
        _guardar('jugador', 'reservas')
        with pytest.raises(IntegrityError), transaction.atomic():
            _guardar('jugador', 'reservas', habilitada=False)

    def test_la_misma_combinacion_unica_incluye_filas_dadas_de_baja(self):
        _guardar('jugador', 'reservas').desactivar()
        with pytest.raises(IntegrityError), transaction.atomic():
            _guardar('jugador', 'reservas')

    def test_el_mismo_tipo_admite_un_registro_por_rol(self):
        _guardar('jugador', 'reservas')
        _guardar('operador', 'reservas')
        assert PreferenciaNotificacionRol.objects.filter(tipo_notificacion='reservas').count() == 2

    def test_desactivar_aplica_baja_logica_sin_borrar_la_fila(self):
        preferencia = _guardar('jugador', 'reservas')
        preferencia.desactivar()
        preferencia.refresh_from_db()
        assert preferencia.estado == EstadoRegistro.BAJA

    def test_clean_rechaza_una_combinacion_inexistente(self):
        preferencia = PreferenciaNotificacionRol(rol_base='jugador', tipo_notificacion='alertas_sistema')
        with pytest.raises(ValidationError):
            preferencia.full_clean()

    def test_clean_acepta_una_combinacion_valida(self):
        PreferenciaNotificacionRol(rol_base='dueno', tipo_notificacion='contratos').full_clean()

    def test_rechaza_valores_fuera_de_las_opciones(self):
        with pytest.raises(ValidationError):
            PreferenciaNotificacionRol(rol_base='invitado', tipo_notificacion='reservas').full_clean()
        with pytest.raises(ValidationError):
            PreferenciaNotificacionRol(rol_base='jugador', tipo_notificacion='inexistente').full_clean()


class TestCatalogo:
    def test_tiene_entre_seis_y_ocho_categorias_con_orden_unico_y_consecutivo(self):
        assert 6 <= len(CATALOGO) <= 8
        assert [definicion.orden for definicion in CATALOGO] == list(range(1, len(CATALOGO) + 1))

    def test_cada_tipo_del_enum_esta_en_el_catalogo_una_sola_vez(self):
        codigos = [definicion.codigo for definicion in CATALOGO]
        assert sorted(codigos) == sorted(TipoNotificacion.values)
        assert len(codigos) == len(set(codigos))

    def test_todo_tipo_aplica_a_algun_rol_y_todo_rol_recibe_algun_tipo(self):
        assert all(definicion.roles_aplicables for definicion in CATALOGO)
        recibidos = set().union(*ROLES_APLICABLES.values())
        assert recibidos == set(RolBaseNotificacion)

    @pytest.mark.parametrize('rol_base, tipo', [
        ('jugador', 'reservas'),
        ('jugador', 'recordatorios_turno'),
        ('jugador', 'senas_y_cobros'),
        ('operador', 'excepciones_y_conflictos'),
        ('dueno', 'gestion_complejo'),
        ('dueno', 'contratos'),
        ('superadmin', 'contratos'),
        ('superadmin', 'cuentas_usuarios'),
        ('superadmin', 'alertas_sistema'),
    ])
    def test_combinaciones_validas(self, rol_base, tipo):
        assert es_combinacion_valida(rol_base, tipo)

    @pytest.mark.parametrize('rol_base, tipo', [
        ('jugador', 'alertas_sistema'),
        ('jugador', 'excepciones_y_conflictos'),
        ('jugador', 'gestion_complejo'),
        ('operador', 'recordatorios_turno'),
        ('operador', 'gestion_complejo'),
        ('dueno', 'recordatorios_turno'),
        ('dueno', 'alertas_sistema'),
        ('superadmin', 'reservas'),
        ('superadmin', 'recordatorios_turno'),
        ('superadmin', 'senas_y_cobros'),
        ('superadmin', 'excepciones_y_conflictos'),
        ('invitado', 'reservas'),
        ('jugador', 'inexistente'),
    ])
    def test_combinaciones_invalidas(self, rol_base, tipo):
        assert not es_combinacion_valida(rol_base, tipo)

    def test_combinaciones_validas_listan_exactamente_los_pares_aplicables(self):
        pares = combinaciones_validas()
        esperados = {(rol, tipo) for tipo, roles in ROLES_APLICABLES.items() for rol in roles}
        assert set(pares) == esperados
        assert len(pares) == len(set(pares))

    def test_el_nombre_sale_de_las_opciones_del_tipo(self):
        assert CATALOGO[0].nombre == TipoNotificacion.RESERVAS.label


@pytest.mark.django_db
class TestResolucionDeRolBase:
    @pytest.mark.parametrize('nombre_rol, esperado', [
        ('SUPERADMIN', 'superadmin'),
        ('DUENO_COMPLEJO', 'dueno'),
        ('OPERADOR_COMPLEJO', 'operador'),
        ('JUGADOR', 'jugador'),
        ('Encargado de Turno', 'operador'),
        ('RECEPCIONISTA', 'operador'),
    ])
    def test_por_nombre_de_rol(self, nombre_rol, esperado):
        assert Servicio.rol_base_de_nombre(nombre_rol) == esperado

    @pytest.mark.parametrize('nombre_rol', [None, ''])
    def test_sin_rol_no_hay_rol_base(self, nombre_rol):
        assert Servicio.rol_base_de_nombre(nombre_rol) is None

    def test_usuarios_de_los_cuatro_roles_base(self, jugador, dueno, operador, superadmin):
        assert Servicio.rol_base_de(jugador) == 'jugador'
        assert Servicio.rol_base_de(dueno) == 'dueno'
        assert Servicio.rol_base_de(operador) == 'operador'
        assert Servicio.rol_base_de(superadmin) == 'superadmin'

    def test_rol_personalizado_de_un_complejo_resuelve_a_operador(self, rbac, complejo):
        rol = Rol.objects.create(nombre='Encargado de Turno')
        usuario = Usuario.objects.create_user(
            email='encargado@talibre.test', password='CanchaLibre#2026', rol=rol,
            nombre_completo='Encargado Prueba', complejo_operado=complejo,
        )
        assert Servicio.rol_base_de(usuario) == 'operador'

    def test_rol_dado_de_baja_o_usuario_anonimo_no_tiene_rol_base(self, jugador):
        class Anonimo:
            is_authenticated = False

        assert Servicio.rol_base_de(Anonimo()) is None
        assert Servicio.rol_base_de(None) is None
        jugador.rol.desactivar()
        assert Servicio.rol_base_de(Usuario.objects.get(pk=jugador.pk)) is None


@pytest.mark.django_db
class TestMapaYCache:
    def test_con_la_tabla_vacia_todo_esta_habilitado(self):
        mapa = Servicio.mapa()
        assert set(mapa) == set(combinaciones_validas())
        assert all(mapa.values())

    def test_una_fila_deshabilitada_apaga_solo_su_combinacion(self):
        _guardar('jugador', 'recordatorios_turno', habilitada=False)
        mapa = Servicio.mapa()
        assert mapa[('jugador', 'recordatorios_turno')] is False
        assert mapa[('jugador', 'reservas')] is True
        assert sum(1 for habilitada in mapa.values() if not habilitada) == 1

    def test_una_fila_dada_de_baja_vuelve_al_valor_por_defecto(self):
        _guardar('jugador', 'recordatorios_turno', habilitada=False).desactivar()
        assert Servicio.mapa()[('jugador', 'recordatorios_turno')] is True

    def test_una_fila_inexistente_en_el_catalogo_no_se_cuela_en_el_mapa(self):
        _guardar('superadmin', 'reservas', habilitada=False)
        assert ('superadmin', 'reservas') not in Servicio.mapa()

    def test_esta_habilitada_por_defecto_y_con_fila(self):
        assert Servicio.esta_habilitada('dueno', 'contratos') is True
        _guardar('dueno', 'contratos', habilitada=False)
        Servicio.invalidar_cache()
        assert Servicio.esta_habilitada('dueno', 'contratos') is False

    def test_una_combinacion_sin_interruptor_se_entrega(self):
        assert Servicio.esta_habilitada('jugador', 'alertas_sistema') is True
        assert Servicio.esta_habilitada(None, 'reservas') is True

    def test_la_lectura_se_guarda_en_cache_y_no_vuelve_a_la_base(self, django_assert_num_queries):
        assert cache.get(CLAVE) is None
        Servicio.mapa()
        assert cache.get(CLAVE) is not None
        with django_assert_num_queries(0):
            Servicio.mapa()
            Servicio.esta_habilitada('jugador', 'reservas')

    def test_sin_invalidar_se_sigue_viendo_el_valor_cacheado(self):
        Servicio.mapa()
        _guardar('jugador', 'reservas', habilitada=False)
        assert Servicio.mapa()[('jugador', 'reservas')] is True

    def test_invalidar_fuerza_la_relectura_desde_la_base(self):
        Servicio.mapa()
        _guardar('jugador', 'reservas', habilitada=False)
        Servicio.invalidar_cache()
        assert cache.get(CLAVE) is None
        assert Servicio.mapa()[('jugador', 'reservas')] is False

    def test_invalidar_sin_nada_cacheado_no_falla(self):
        Servicio.invalidar_cache()
        Servicio.invalidar_cache()


@pytest.mark.django_db
class TestAdmin:
    def test_guardar_desde_el_admin_descarta_la_cache(self, superadmin):
        Servicio.mapa()
        assert cache.get(CLAVE) is not None
        modelo_admin = admin.site._registry[PreferenciaNotificacionRol]
        preferencia = PreferenciaNotificacionRol(rol_base='jugador', tipo_notificacion='reservas', habilitada=False)
        pedido = RequestFactory().post('/admin/')
        pedido.user = superadmin
        modelo_admin.save_model(pedido, preferencia, form=None, change=False)
        assert cache.get(CLAVE) is None
        assert Servicio.mapa()[('jugador', 'reservas')] is False

    def test_desactivar_desde_el_admin_descarta_la_cache(self, superadmin):
        _guardar('jugador', 'reservas', habilitada=False)
        assert Servicio.mapa()[('jugador', 'reservas')] is False
        modelo_admin = admin.site._registry[PreferenciaNotificacionRol]
        pedido = RequestFactory().post('/admin/')
        pedido.user = superadmin
        with mock.patch.object(modelo_admin, 'message_user'):
            modelo_admin.desactivar_seleccionados(pedido, PreferenciaNotificacionRol.objects.all())
        assert Servicio.mapa()[('jugador', 'reservas')] is True


def _apagar(rol_base, tipo):
    _guardar(rol_base, tipo, habilitada=False)
    Servicio.invalidar_cache()


@pytest.fixture
def node():
    """Cliente HTTP de backend-node reemplazado: nada sale a la red y se ven los pedidos que se habrían enviado."""
    with mock.patch.object(services.node_client, 'enviar_notificacion') as enviar:
        yield enviar


@pytest.fixture
def despachar(django_capture_on_commit_callbacks):
    def _despachar(accion):
        with django_capture_on_commit_callbacks(execute=True):
            accion()

    return _despachar


@pytest.fixture
def encargado(rbac, complejo):
    """Usuario con un rol personalizado de un complejo: debe heredar las preferencias de `operador`."""
    rol = Rol.objects.create(nombre='Encargado de Turno')
    RolPermiso.objects.create(rol=rol, permiso=Permiso.objects.get(codigo='ver_agenda'))
    return Usuario.objects.create_user(
        email='encargado@talibre.test', password=PASSWORD_PRUEBA, rol=rol, nombre_completo='Encargado Prueba',
        complejo_operado=complejo,
    )


def _enviados(node):
    return [llamada.args[0] for llamada in node.call_args_list]


def _a_varios(tipo, ids):
    AvisoComplejoService.programar(
        None, CATEGORIA_AVISO_RESERVAS, PRIORIDAD_AVISO_NORMAL, 'Aviso de prueba.', tipo=tipo, usuarios_ids=ids,
    )


@pytest.mark.django_db
class TestFiltroDeDespacho:
    def test_sin_preferencias_todos_los_roles_reciben(self, node, despachar, jugador, operador, dueno):
        despachar(lambda: _a_varios(TipoNotificacion.RESERVAS, [jugador.pk, operador.pk, dueno.pk]))

        assert _enviados(node)[0]['usuarios_ids'] == [jugador.pk, operador.pk, dueno.pk]

    def test_un_rol_apagado_no_recibe_y_los_demas_si(self, node, despachar, jugador, operador, dueno):
        _apagar('jugador', 'reservas')

        despachar(lambda: _a_varios(TipoNotificacion.RESERVAS, [jugador.pk, operador.pk, dueno.pk]))

        assert node.call_count == 1
        assert _enviados(node)[0]['usuarios_ids'] == [operador.pk, dueno.pk]

    def test_apagar_un_tipo_no_afecta_a_los_otros_tipos_del_mismo_rol(self, node, despachar, jugador):
        _apagar('jugador', 'recordatorios_turno')

        despachar(lambda: _a_varios(TipoNotificacion.RESERVAS, [jugador.pk]))

        assert _enviados(node)[0]['usuarios_ids'] == [jugador.pk]

    def test_un_aviso_a_un_usuario_apagado_no_se_envia(self, node, despachar, jugador):
        _apagar('jugador', 'reservas')

        despachar(lambda: AvisoComplejoService.al_usuario(
            jugador, CATEGORIA_AVISO_RESERVAS, PRIORIDAD_AVISO_NORMAL, 'Tu reserva id 1.', tipo=TipoNotificacion.RESERVAS,
        ))

        node.assert_not_called()

    def test_un_aviso_a_un_usuario_habilitado_se_envia(self, node, despachar, jugador):
        despachar(lambda: AvisoComplejoService.al_usuario(
            jugador, CATEGORIA_AVISO_RESERVAS, PRIORIDAD_AVISO_NORMAL, 'Tu reserva id 1.', tipo=TipoNotificacion.RESERVAS,
        ))

        assert _enviados(node)[0]['usuario_id'] == jugador.pk

    def test_un_rol_personalizado_hereda_el_apagado_de_operador(self, node, despachar, encargado, dueno):
        _apagar('operador', 'reservas')

        despachar(lambda: _a_varios(TipoNotificacion.RESERVAS, [encargado.pk, dueno.pk]))

        assert _enviados(node)[0]['usuarios_ids'] == [dueno.pk]

    def test_un_rol_personalizado_hereda_el_encendido_de_operador(self, node, despachar, encargado):
        despachar(lambda: _a_varios(TipoNotificacion.RESERVAS, [encargado.pk]))

        assert _enviados(node)[0]['usuarios_ids'] == [encargado.pk]

    def test_apagar_dueno_no_afecta_a_un_rol_personalizado(self, node, despachar, encargado, dueno):
        _apagar('dueno', 'reservas')

        despachar(lambda: _a_varios(TipoNotificacion.RESERVAS, [encargado.pk, dueno.pk]))

        assert _enviados(node)[0]['usuarios_ids'] == [encargado.pk]

    def test_si_todos_estan_filtrados_no_hay_llamada_a_node(self, node, despachar, jugador, operador, dueno):
        for rol in ('jugador', 'operador', 'dueno'):
            _apagar(rol, 'reservas')

        despachar(lambda: _a_varios(TipoNotificacion.RESERVAS, [jugador.pk, operador.pk, dueno.pk]))

        node.assert_not_called()

    def test_las_alertas_de_sistema_apagadas_no_llegan_a_ningun_superadmin(self, node, despachar, superadmin):
        _apagar('superadmin', 'alertas_sistema')

        despachar(lambda: AvisoComplejoService.a_superadmins(
            CATEGORIA_AVISO_SISTEMA, PRIORIDAD_AVISO_NORMAL, 'Alerta de prueba.', tipo=TipoNotificacion.ALERTAS_SISTEMA,
        ))

        node.assert_not_called()

    def test_al_volver_a_habilitar_e_invalidar_la_cache_el_despacho_se_reanuda(self, node, despachar, jugador):
        _apagar('jugador', 'reservas')
        despachar(lambda: _a_varios(TipoNotificacion.RESERVAS, [jugador.pk]))
        node.assert_not_called()

        PreferenciaNotificacionRol.objects.update(habilitada=True)
        Servicio.invalidar_cache()
        despachar(lambda: _a_varios(TipoNotificacion.RESERVAS, [jugador.pk]))

        assert node.call_count == 1
        assert _enviados(node)[0]['usuarios_ids'] == [jugador.pk]

    def test_sin_invalidar_la_cache_rige_la_preferencia_anterior(self, node, despachar, jugador):
        despachar(lambda: _a_varios(TipoNotificacion.RESERVAS, [jugador.pk]))
        _guardar('jugador', 'reservas', habilitada=False)

        despachar(lambda: _a_varios(TipoNotificacion.RESERVAS, [jugador.pk]))

        assert node.call_count == 2

    def test_un_usuario_desconocido_no_se_filtra(self, node, despachar):
        _apagar('jugador', 'reservas')

        despachar(lambda: _a_varios(TipoNotificacion.RESERVAS, [987654]))

        assert _enviados(node)[0]['usuarios_ids'] == [987654]

    def test_el_tipo_no_viaja_a_node(self, node, despachar, jugador):
        despachar(lambda: _a_varios(TipoNotificacion.RESERVAS, [jugador.pk]))

        assert 'tipo' not in _enviados(node)[0]

    def test_un_tipo_desconocido_es_un_error_de_programacion(self, jugador):
        with pytest.raises(ValueError):
            _a_varios('inexistente', [jugador.pk])

    def test_la_bandeja_general_de_un_complejo_no_se_filtra(self, node, despachar):
        for rol, tipo in combinaciones_validas():
            _guardar(rol, tipo, habilitada=False)
        Servicio.invalidar_cache()

        despachar(lambda: AvisoComplejoService.programar(
            4, CATEGORIA_AVISO_RESERVAS, PRIORIDAD_AVISO_NORMAL, 'Aviso general.', tipo=TipoNotificacion.RESERVAS,
        ))

        assert _enviados(node)[0]['complejo_id'] == 4


@pytest.mark.django_db
class TestFiltroConRegistroDelComplejo:
    def test_el_personal_apagado_no_recibe_pero_el_registro_del_complejo_sale(
        self, node, despachar, complejo, dueno, operador,
    ):
        _apagar('operador', 'reservas')

        despachar(lambda: AvisoComplejoService.al_personal(
            complejo, 'ver_agenda', CATEGORIA_AVISO_RESERVAS, PRIORIDAD_AVISO_NORMAL, 'nueva reserva id 1.',
            {'reserva': 1}, tipo=TipoNotificacion.RESERVAS,
        ))

        cuerpo = _enviados(node)[0]
        assert cuerpo['usuarios_ids'] == [dueno.pk]
        assert cuerpo['registro']['ambito'] == 1

    def test_con_todo_el_personal_apagado_solo_queda_el_registro(self, node, despachar, complejo, dueno, operador):
        _apagar('operador', 'reservas')
        _apagar('dueno', 'reservas')

        despachar(lambda: AvisoComplejoService.al_personal(
            complejo, 'ver_agenda', CATEGORIA_AVISO_RESERVAS, PRIORIDAD_AVISO_NORMAL, 'nueva reserva id 1.',
            {'reserva': 1}, tipo=TipoNotificacion.RESERVAS,
        ))

        assert node.call_count == 1
        cuerpo = _enviados(node)[0]
        assert 'usuarios_ids' not in cuerpo and 'usuario_id' not in cuerpo
        assert cuerpo['registro']['mensaje'].startswith(f'{complejo.nombre}: nueva reserva id 1.')

    def test_el_evento_de_la_reserva_realizada_se_conserva_aunque_nadie_reciba_el_aviso(
        self, node, despachar, complejo, dueno, operador,
    ):
        _apagar('operador', 'reservas')
        _apagar('dueno', 'reservas')
        evento = {'tipo_evento': 3, 'usuario_id': None, 'metadata': {'reserva_id': 1}}

        despachar(lambda: AvisoComplejoService.al_personal(
            complejo, 'ver_agenda', CATEGORIA_AVISO_RESERVAS, PRIORIDAD_AVISO_NORMAL, 'nueva reserva id 1.',
            tipo=TipoNotificacion.RESERVAS, evento=evento,
        ))

        assert _enviados(node)[0]['evento'] == evento

    def test_el_aviso_comercial_al_dueno_apagado_conserva_su_registro(self, node, despachar, complejo, dueno):
        _apagar('dueno', 'gestion_complejo')

        despachar(lambda: AvisoComplejoService.al_dueno(
            complejo, 'configurar_complejo', CATEGORIA_AVISO_RESERVAS, PRIORIDAD_AVISO_NORMAL, 'se modificó el precio.',
            tipo=TipoNotificacion.GESTION_COMPLEJO,
        ))

        cuerpo = _enviados(node)[0]
        assert 'usuarios_ids' not in cuerpo
        assert cuerpo['registro']['ambito'] == 2


@pytest.mark.django_db
class TestClasificacionDeLosDespachos:
    def test_la_sena_registrada_depende_de_senas_y_cobros_y_no_de_reservas(
        self, node, despachar, complejo, crear_cancha, crear_reserva, jugador,
    ):
        reserva = crear_reserva(crear_cancha(complejo), date(2026, 11, 20), time(18, 0), time(19, 0))
        _apagar('jugador', 'senas_y_cobros')

        despachar(lambda: ReservaService._avisar_reserva_senada(reserva))
        node.assert_not_called()

        despachar(lambda: ReservaService._avisar_reserva_confirmada(reserva))
        assert node.call_count == 1

    def test_la_confirmacion_depende_de_reservas_y_no_de_senas_y_cobros(
        self, node, despachar, complejo, crear_cancha, crear_reserva, jugador,
    ):
        reserva = crear_reserva(crear_cancha(complejo), date(2026, 11, 20), time(18, 0), time(19, 0))
        _apagar('jugador', 'reservas')

        despachar(lambda: ReservaService._avisar_reserva_confirmada(reserva))
        node.assert_not_called()

        despachar(lambda: ReservaService._avisar_reserva_senada(reserva))
        assert node.call_count == 1

    def test_un_titular_afectado_por_una_excepcion_depende_de_reservas(self, node, despachar, jugador):
        _apagar('jugador', 'reservas')

        despachar(lambda: services._avisar_titulares_afectados(
            [{'id': 7, 'usuario_id': jugador.pk}], lambda ids: 'Tu reserva fue afectada.', lambda ids: {'reservas': ids},
        ))

        node.assert_not_called()

    def test_el_recordatorio_depende_de_su_propio_tipo(self, node, jugador):
        reserva = mock.Mock(pk=5, usuario_id=jugador.pk)
        reserva.cancha.complejo.nombre = 'Complejo Prueba'
        reserva.cancha.nombre = 'Cancha 1'
        reserva.fecha_turno = date(2026, 11, 17)
        reserva.hora_inicio = time(18, 0)
        _apagar('jugador', 'recordatorios_turno')

        with mock.patch.object(RecordatorioService, '_pendientes', return_value=[reserva]):
            assert RecordatorioService.emitir_pendientes() == 0
            node.assert_not_called()

            PreferenciaNotificacionRol.objects.filter(tipo_notificacion='recordatorios_turno').update(habilitada=True)
            Servicio.invalidar_cache()
            assert RecordatorioService.emitir_pendientes() == 1

        assert _enviados(node)[0]['usuario_id'] == jugador.pk

    def test_todo_despacho_declara_su_tipo(self):
        """Ningún aviso nuevo puede salir sin clasificar: cada llamada al servicio de avisos pasa `tipo`."""
        arbol = ast.parse(inspect.getsource(services))
        metodos = {'a_superadmins', 'al_dueno', 'al_personal', 'al_usuario', 'programar', '_armar'}
        llamadas = [
            nodo for nodo in ast.walk(arbol)
            if isinstance(nodo, ast.Call) and isinstance(nodo.func, ast.Attribute)
            and isinstance(nodo.func.value, ast.Name) and nodo.func.value.id == 'AvisoComplejoService'
            and nodo.func.attr in metodos
        ]
        assert len(llamadas) >= 25
        sin_tipo = [nodo.lineno for nodo in llamadas if not any(k.arg == 'tipo' for k in nodo.keywords)]
        assert sin_tipo == []

    def test_todo_tipo_del_catalogo_tiene_al_menos_un_despacho(self):
        fuente = inspect.getsource(services)
        for tipo in TipoNotificacion:
            assert f'TipoNotificacion.{tipo.name}' in fuente, tipo


@pytest.mark.django_db
class TestFiltroEnLote:
    def test_un_lote_consulta_los_roles_una_sola_vez(self, crear_usuario, django_assert_num_queries):
        usuarios = [crear_usuario(f'lote{n}@talibre.test', 'JUGADOR') for n in range(8)]
        Servicio.mapa()
        avisos = [
            AvisoComplejoService._armar(
                None, CATEGORIA_AVISO_RESERVAS, PRIORIDAD_AVISO_NORMAL, 'Recordatorio.', None, usuario.pk, None, None,
                None, tipo=TipoNotificacion.RECORDATORIOS_TURNO,
            )
            for usuario in usuarios
        ]

        with django_assert_num_queries(1):
            assert len(AvisoComplejoService.filtrar_por_preferencias(avisos)) == 8

    def test_un_lote_sin_destinatarios_personales_no_consulta_nada(self, django_assert_num_queries):
        aviso = AvisoComplejoService._armar(
            4, CATEGORIA_AVISO_RESERVAS, PRIORIDAD_AVISO_NORMAL, 'General.', None, None, None, None, None,
            tipo=TipoNotificacion.RESERVAS,
        )
        with django_assert_num_queries(0):
            assert AvisoComplejoService.filtrar_por_preferencias([aviso]) == [aviso]

    def test_el_lote_descarta_solo_los_avisos_de_roles_apagados(self, jugador, operador):
        _apagar('jugador', 'reservas')
        avisos = [
            AvisoComplejoService._armar(
                None, CATEGORIA_AVISO_RESERVAS, PRIORIDAD_AVISO_NORMAL, 'Aviso.', None, destino.pk, None, None, None,
                tipo=TipoNotificacion.RESERVAS,
            )
            for destino in (jugador, operador)
        ]

        restantes = AvisoComplejoService.filtrar_por_preferencias(avisos)

        assert [aviso['usuario_id'] for aviso in restantes] == [operador.pk]


@pytest.mark.django_db
class TestCorreoIndependiente:
    @override_settings(DEBUG=True, EMAIL_PROVEEDOR='consola', EMAIL_ENVIO_EN_SEGUNDO_PLANO=False)
    def test_el_correo_de_recuperacion_sale_con_todas_las_preferencias_apagadas(
        self, node, django_capture_on_commit_callbacks, caplog,
    ):
        for rol, tipo in combinaciones_validas():
            _guardar(rol, tipo, habilitada=False)
        Servicio.invalidar_cache()
        logger = logging.getLogger('core.correo')
        logger.addHandler(caplog.handler)
        caplog.set_level(logging.INFO, logger='core.correo')
        try:
            mensaje = armar_codigo_recuperacion('jugador@talibre.test', '012345', 15)
            with django_capture_on_commit_callbacks(execute=True):
                CorreoService.programar(mensaje)
        finally:
            logger.removeHandler(caplog.handler)

        assert 'Para: jugador@talibre.test' in caplog.text
        assert '012345' in caplog.text
        node.assert_not_called()

    @override_settings(DEBUG=True, EMAIL_PROVEEDOR='consola')
    def test_el_proveedor_acepta_el_mensaje_con_todo_apagado(self):
        for rol, tipo in combinaciones_validas():
            _guardar(rol, tipo, habilitada=False)
        Servicio.invalidar_cache()

        assert EmailService.enviar(armar_codigo_recuperacion('jugador@talibre.test', '012345', 15)) is True

    def test_el_servicio_de_correo_no_consulta_las_preferencias(self):
        from core import email_service

        assert 'preferencia' not in inspect.getsource(email_service).lower()

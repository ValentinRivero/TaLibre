from unittest import mock

import pytest
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.contrib import admin
from django.test import RequestFactory

from core.catalogo_notificaciones import (
    CATALOGO,
    ROLES_APLICABLES,
    RolBaseNotificacion,
    TipoNotificacion,
    combinaciones_validas,
    es_combinacion_valida,
)
from core.models import EstadoRegistro, PreferenciaNotificacionRol, Rol, Usuario
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

    def test_una_combinacion_fuera_del_catalogo_no_se_despacha(self):
        assert Servicio.esta_habilitada('jugador', 'alertas_sistema') is False
        assert Servicio.esta_habilitada('invitado', 'reservas') is False

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

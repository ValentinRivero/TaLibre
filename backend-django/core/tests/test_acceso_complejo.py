import pytest
from rest_framework import status
from rest_framework.test import APIClient

from core.models import (
    Cancha,
    Cobertura,
    Deporte,
    EstadoContrato,
    Iluminacion,
    LogAuditoria,
    TipoEventoAuditoria,
    TipoSuperficie,
)


def _url(complejo_id):
    return f'/api/complejos/{complejo_id}/acceso/'


def _dar_de_baja_el_contrato(complejo):
    complejo.estado_contrato = EstadoContrato.BAJA
    complejo.save(update_fields=['estado_contrato'])


@pytest.mark.django_db
class TestAccesoAlComplejo:
    """Verificación que usa backend-node para saber si el usuario del token administra un complejo."""

    def test_el_dueno_administra_su_complejo(self, dueno, complejo, cliente_de):
        respuesta = cliente_de(dueno).get(_url(complejo.id))

        assert respuesta.status_code == status.HTTP_200_OK
        assert respuesta.json() == {'complejo': complejo.id}

    def test_el_operador_administra_el_complejo_asignado(self, operador, complejo, cliente_de):
        assert cliente_de(operador).get(_url(complejo.id)).status_code == status.HTTP_200_OK

    def test_el_superadmin_administra_cualquier_complejo(self, superadmin, complejo_ajeno, cliente_de):
        assert cliente_de(superadmin).get(_url(complejo_ajeno.id)).status_code == status.HTTP_200_OK

    @pytest.mark.parametrize('rol', ['dueno', 'operador'])
    def test_un_complejo_ajeno_responde_404_sin_confirmar_que_existe(self, request, rol, complejo_ajeno, cliente_de):
        usuario = request.getfixturevalue(rol)

        respuesta = cliente_de(usuario).get(_url(complejo_ajeno.id))

        assert respuesta.status_code == status.HTTP_404_NOT_FOUND
        assert respuesta.json()['detail'] == cliente_de(usuario).get(_url(999999)).json()['detail']

    def test_el_jugador_recibe_403_auditado(self, jugador, complejo, cliente_de):
        assert cliente_de(jugador).get(_url(complejo.id)).status_code == status.HTTP_403_FORBIDDEN
        assert LogAuditoria.objects.filter(
            usuario=jugador, tipo_evento=TipoEventoAuditoria.ACCESO_DENEGADO,
        ).exists()

    def test_sin_token_responde_401(self, complejo):
        assert APIClient().get(_url(complejo.id)).status_code == status.HTTP_401_UNAUTHORIZED

    def test_con_token_invalido_responde_401(self, complejo):
        cliente = APIClient()
        cliente.credentials(HTTP_AUTHORIZATION='Bearer no-es-un-jwt')

        assert cliente.get(_url(complejo.id)).status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.parametrize('estado_contrato', [EstadoContrato.PENDIENTE, EstadoContrato.SUSPENDIDO])
    def test_el_dueno_conserva_el_acceso_con_el_contrato_no_activo(
        self, dueno, complejo, cliente_de, estado_contrato,
    ):
        complejo.estado_contrato = estado_contrato
        complejo.save(update_fields=['estado_contrato'])

        assert cliente_de(dueno).get(_url(complejo.id)).status_code == status.HTTP_200_OK

    @pytest.mark.parametrize('rol', ['dueno', 'operador'])
    def test_con_el_contrato_de_baja_el_personal_recibe_404(self, request, rol, complejo, cliente_de):
        usuario = request.getfixturevalue(rol)
        _dar_de_baja_el_contrato(complejo)

        respuesta = cliente_de(usuario).get(_url(complejo.id))

        assert respuesta.status_code == status.HTTP_404_NOT_FOUND
        assert respuesta.json()['detail'] == cliente_de(usuario).get(_url(999999)).json()['detail']

    def test_el_superadmin_conserva_el_acceso_con_el_contrato_de_baja(self, superadmin, complejo, cliente_de):
        _dar_de_baja_el_contrato(complejo)

        assert cliente_de(superadmin).get(_url(complejo.id)).status_code == status.HTTP_200_OK

    def test_un_complejo_dado_de_baja_responde_404(self, superadmin, complejo, cliente_de):
        complejo.desactivar()

        assert cliente_de(superadmin).get(_url(complejo.id)).status_code == status.HTTP_404_NOT_FOUND

    def test_solo_admite_get(self, dueno, complejo, cliente_de):
        assert cliente_de(dueno).post(_url(complejo.id)).status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_resuelve_en_consultas_constantes(
        self, dueno, complejo, crear_complejo, cliente_de, django_assert_max_num_queries,
    ):
        for numero in range(5):
            crear_complejo(dueno, f'Otro {numero}')
        cliente = cliente_de(dueno)

        with django_assert_max_num_queries(6):
            cliente.get(_url(complejo.id))


@pytest.mark.django_db
class TestPanelConElContratoDeBaja:
    """Con el contrato dado de baja, ninguna sección del panel del dueño ni de sus operadores alcanza al complejo."""

    def test_el_dueno_no_ve_ni_edita_nada_del_complejo(self, dueno, complejo, crear_cancha, cliente_de):
        cancha = crear_cancha(complejo)
        horas_limite = complejo.horas_limite_cancelacion
        _dar_de_baja_el_contrato(complejo)
        cliente = cliente_de(dueno)
        reporte = {'complejo': complejo.id, 'fecha_desde': '2026-11-01', 'fecha_hasta': '2026-11-30'}

        respuestas = [
            cliente.patch(f'/api/complejos/{complejo.id}/', {'horas_limite_cancelacion': horas_limite + 1}, format='json'),
            cliente.get(f'/api/complejos/{complejo.id}/operadores/'),
            cliente.get('/api/canchas/', {'complejo': complejo.id}),
            cliente.patch(f'/api/canchas/{cancha.id}/', {'nombre': 'Renombrada'}, format='json'),
            cliente.get('/api/agenda/', {'complejo': complejo.id}),
            cliente.get('/api/reportes/dashboard/', reporte),
        ]

        assert [respuesta.status_code for respuesta in respuestas] == [status.HTTP_404_NOT_FOUND] * len(respuestas)
        assert cliente.get('/api/canchas/').json()['count'] == 0
        complejo.refresh_from_db()
        cancha.refresh_from_db()
        assert complejo.horas_limite_cancelacion == horas_limite
        assert cancha.nombre == 'Cancha 1'

    def test_el_dueno_no_puede_dar_de_alta_canchas(self, dueno, complejo, cliente_de):
        _dar_de_baja_el_contrato(complejo)

        respuesta = cliente_de(dueno).post('/api/canchas/', {
            'complejo': complejo.id,
            'deporte': Deporte.objects.get(nombre='Fútbol 5').id,
            'nombre': 'Cancha Nueva',
            'tipo_superficie': TipoSuperficie.CESPED_SINTETICO,
            'cobertura': Cobertura.TECHADA,
            'iluminacion': Iluminacion.LED,
            'duracion_turno_min': 90,
            'precio_base': '40000.00',
        }, format='json')

        assert respuesta.status_code == status.HTTP_403_FORBIDDEN
        assert not Cancha.objects.filter(complejo=complejo).exists()

    def test_el_operador_no_ve_la_agenda_ni_las_excepciones(self, operador, complejo, cliente_de):
        _dar_de_baja_el_contrato(complejo)
        cliente = cliente_de(operador)

        assert cliente.get('/api/agenda/', {'complejo': complejo.id}).status_code == status.HTTP_404_NOT_FOUND
        assert cliente.get('/api/excepciones/', {'complejo': complejo.id}).status_code == status.HTTP_404_NOT_FOUND
        assert cliente.get('/api/agenda/').json()['count'] == 0

import json

import pytest
from django.core.management import call_command
from django.test import override_settings
from rest_framework import status

URL_ESQUEMA = '/api/docs-django/openapi.json'
URL_DOCUMENTACION = '/api/docs-django/'

pytestmark = pytest.mark.django_db


@pytest.fixture
def esquema(cliente):
    respuesta = cliente.get(URL_ESQUEMA)
    assert respuesta.status_code == status.HTTP_200_OK
    return json.loads(respuesta.content)


class TestEsquemaOpenApi:
    def test_es_publico_y_cumple_openapi_3(self, cliente, esquema):
        assert cliente.get(URL_ESQUEMA)['Content-Type'].startswith('application/vnd.oai.openapi+json')
        assert esquema['openapi'].startswith('3.')
        assert esquema['info']['title'] == 'TaLibre API'

    def test_documenta_las_rutas_principales_del_contrato(self, esquema):
        rutas = esquema['paths']
        for ruta in (
            '/api/token/', '/api/perfil/', '/api/complejos/', '/api/complejos/{id}/grilla/',
            '/api/reservas/', '/api/agenda/', '/api/reportes/dashboard/', '/api/sistema/roles/',
        ):
            assert ruta in rutas, ruta

    def test_no_publica_rutas_entre_servicios_ni_la_administracion(self, esquema):
        for ruta in esquema['paths']:
            assert not ruta.startswith(('/api/interno', '/admin')), ruta
        assert not any(ruta.startswith('/api/docs-django') for ruta in esquema['paths'])

    def test_declara_el_access_token_como_bearer_jwt(self, esquema):
        jwt = esquema['components']['securitySchemes']['jwtAuth']
        assert (jwt['type'], jwt['scheme'], jwt['bearerFormat']) == ('http', 'bearer', 'JWT')

    def test_los_campos_calculados_tienen_su_tipo_y_no_texto_por_defecto(self, esquema):
        perfil = esquema['components']['schemas']['Perfil']['properties']
        assert perfil['debe_aceptar_politica']['type'] == 'boolean'
        reserva = esquema['components']['schemas']['ReservaPropia']['properties']
        assert '#/components/schemas/Referencia' in json.dumps(reserva['complejo'])
        assert reserva['cancelable_hasta']['format'] == 'date-time'

    def test_se_genera_sin_advertencias_y_valida_contra_la_especificacion(self, tmp_path):
        # --fail-on-warn corta con error ante cualquier tipo sin resolver, enum ambiguo o vista sin serializer.
        call_command('spectacular', '--validate', '--fail-on-warn', '--file', str(tmp_path / 'esquema.yaml'))

        assert (tmp_path / 'esquema.yaml').stat().st_size > 0


class TestDocumentacionInteractiva:
    def test_swagger_ui_es_publico(self, cliente):
        respuesta = cliente.get(URL_DOCUMENTACION)

        assert respuesta.status_code == status.HTTP_200_OK
        assert 'swagger-ui' in respuesta.content.decode()

    def test_sirve_su_javascript_aparte_y_los_recursos_desde_el_propio_servidor(self, cliente):
        html = cliente.get(URL_DOCUMENTACION).content.decode()
        script = cliente.get(f'{URL_DOCUMENTACION}?script=')

        assert script.status_code == status.HTTP_200_OK
        assert 'SwaggerUIBundle' in script.content.decode()
        assert '<script src="' in html and '<script>' not in html
        assert 'cdn.jsdelivr.net' not in html
        assert 'drf_spectacular_sidecar' in html

    def test_usa_el_mismo_diseno_que_node_con_modo_oscuro_y_sin_validador_externo(self, cliente):
        script = cliente.get(f'{URL_DOCUMENTACION}?script=').content.decode()

        assert 'layout: "StandaloneLayout"' in script
        assert 'SwaggerUIStandalonePreset' in script
        assert 'validatorUrl: null' in script

    @override_settings(API_DOCS_HABILITADA=False)
    @pytest.mark.parametrize('url', [URL_ESQUEMA, URL_DOCUMENTACION])
    def test_apagada_por_entorno_responde_404(self, cliente, url):
        assert cliente.get(url).status_code == status.HTTP_404_NOT_FOUND

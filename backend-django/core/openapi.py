"""
Ajustes del esquema OpenAPI que genera drf-spectacular. El esquema es público: documenta el mismo contrato que
docs/API.md y nunca las rutas entre servicios ni la administración de Django. Las formas de abajo describen los
objetos que arman los campos calculados y las vistas sin serializer, sin cambiar lo que la API responde.
"""
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import inline_serializer
from rest_framework import serializers

PREFIJOS_NO_PUBLICOS = ('/api/interno', '/admin')


def excluir_rutas_no_publicas(endpoints, **kwargs):
    """Hook de preprocesamiento: descarta las rutas que no forman parte del contrato público de la API."""
    return [
        (ruta, patron, metodo, vista)
        for ruta, patron, metodo, vista in endpoints
        if not ruta.startswith(PREFIJOS_NO_PUBLICOS)
    ]


class ReferenciaSerializer(serializers.Serializer):
    """Referencia corta a otro recurso: su id y su nombre."""

    id = serializers.IntegerField()
    nombre = serializers.CharField()


REFERENCIA = ReferenciaSerializer()
REFERENCIAS = ReferenciaSerializer(many=True)

CONTACTO = inline_serializer('Contacto', {
    'nombre': serializers.CharField(),
    'telefono': serializers.CharField(allow_blank=True, allow_null=True),
    'email': serializers.EmailField(allow_null=True),
})

DATOS_TRANSFERENCIA_COMPLEJO = inline_serializer('DatosTransferenciaComplejo', {
    'alias': serializers.CharField(),
    'titular': serializers.CharField(),
    'cbu': serializers.CharField(allow_blank=True, allow_null=True),
}, allow_null=True)

TRANSFERENCIA_INFORMADA = inline_serializer('TransferenciaInformada', {
    'titular': serializers.CharField(),
    'referencia': serializers.CharField(),
    'informada_en': serializers.DateTimeField(),
    'rechazo': inline_serializer('RechazoTransferencia', {
        'motivo': serializers.IntegerField(),
        'motivo_nombre': serializers.CharField(),
        'nota': serializers.CharField(allow_blank=True),
        'rechazada_en': serializers.DateTimeField(),
    }, allow_null=True),
}, allow_null=True)

FECHAS_EN_ESPERA = inline_serializer('FechaEnEspera', {
    'fecha': serializers.DateField(),
    'motivo': serializers.CharField(),
}, many=True)

MOTIVO_OPCIONAL = serializers.CharField(allow_null=True)
FECHA_HORA = OpenApiTypes.DATETIME
OBJETO = OpenApiTypes.OBJECT

TOKEN_ACCESO = inline_serializer('TokenAcceso', {'access': serializers.CharField()})
MENSAJE = inline_serializer('Mensaje', {'detail': serializers.CharField()})
ESTADO_SERVICIO = inline_serializer('EstadoServicio', {'estado': serializers.CharField()})

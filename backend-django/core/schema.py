import json

import graphene
from django.http import HttpRequest, QueryDict
from graphql import GraphQLError

from .services import ClimaComplejoService
from .views import ComplejoViewSet, ReservaViewSet


def ejecutar_como_en_rest(clase_vista, accion, info, metodo='get', parametros=None, datos=None, **ruta):
    """
    Ejecuta una acción de un ViewSet de la API REST a través de su propio `as_view`: misma autenticación, permisos
    RBAC, limitadores, validaciones, servicios, serializer y manejo de errores, incluida la auditoría de los 403.
    Las dos APIs no pueden divergir en qué permiten, a quién ni con qué efectos.
    """
    peticion = HttpRequest()
    peticion.method = metodo.upper()
    # La auditoría registra método y ruta: la ruta lleva el campo GraphQL que originó el pedido.
    peticion.path = peticion.path_info = f'{info.context.path}{info.field_name}'
    peticion.GET = QueryDict(mutable=True)
    for clave, valor in (parametros or {}).items():
        if valor is not None:
            peticion.GET.setlist(clave, [str(item) for item in valor] if isinstance(valor, list) else [str(valor)])
    # Solo los encabezados del pedido original: el token sale de Authorization, nunca de una cookie de sesión,
    # y la IP de origen llega a la auditoría.
    peticion.META = dict(info.context.META)
    if datos is not None:
        cuerpo = json.dumps(datos).encode()
        peticion.META.update({'CONTENT_TYPE': 'application/json', 'CONTENT_LENGTH': str(len(cuerpo))})
        peticion._body, peticion._read_started = cuerpo, True

    # `ruta` son los parámetros de la URL de REST, por ejemplo el `pk` de un detalle.
    respuesta = clase_vista.as_view({metodo: accion})(peticion, **ruta)
    if respuesta.status_code >= 400:
        detalle = respuesta.data['detail']
        raise GraphQLError(
            detalle if isinstance(detalle, str) else 'Datos inválidos.',
            extensions={'codigo': respuesta.status_code, 'detalle': detalle},
        )
    return respuesta.data


def listar_como_en_rest(clase_vista, accion, info, argumentos):
    datos = ejecutar_como_en_rest(clase_vista, accion, info, parametros=argumentos)
    return {'count': datos['count'], 'results': datos['results']}


class ReferenciaType(graphene.ObjectType):
    id = graphene.Int(required=True)
    nombre = graphene.String(required=True)


class ComplejoCatalogoType(graphene.ObjectType):
    id = graphene.Int(required=True)
    nombre = graphene.String(required=True)
    direccion = graphene.String()
    latitud = graphene.Decimal()
    longitud = graphene.Decimal()
    telefono_contacto = graphene.String()
    horas_limite_cancelacion = graphene.Int()
    info_sena = graphene.String()
    porcentaje_sena = graphene.Int()
    precio_desde = graphene.Decimal()
    servicios = graphene.List(graphene.NonNull(ReferenciaType), required=True)
    deportes = graphene.List(graphene.NonNull(ReferenciaType), required=True)


class CanchaPublicaType(graphene.ObjectType):
    id = graphene.Int(required=True)
    nombre = graphene.String(required=True)
    deporte = graphene.Field(ReferenciaType, required=True)
    tipo_superficie = graphene.Int(required=True)
    tipo_superficie_nombre = graphene.String(required=True)
    cobertura = graphene.Int(required=True)
    cobertura_nombre = graphene.String(required=True)
    iluminacion = graphene.Int(required=True)
    iluminacion_nombre = graphene.String(required=True)
    duracion_turno_min = graphene.Int(required=True)
    precio_base = graphene.Decimal(required=True)


class ClimaActualType(graphene.ObjectType):
    fecha_hora = graphene.String(required=True, description='Hora de Argentina, AAAA-MM-DDTHH:MM')
    temperatura = graphene.Float(required=True, description='°C')
    codigo_clima = graphene.Int(required=True)
    descripcion = graphene.String(required=True)
    viento_kmh = graphene.Float(required=True)
    precipitacion_mm = graphene.Float(required=True)
    es_de_dia = graphene.Boolean(required=True)


class PronosticoDiaType(graphene.ObjectType):
    fecha = graphene.String(required=True, description='AAAA-MM-DD')
    codigo_clima = graphene.Int(required=True)
    descripcion = graphene.String(required=True)
    temperatura_max = graphene.Float(required=True)
    temperatura_min = graphene.Float(required=True)
    probabilidad_lluvia = graphene.Int(description='%, nulo si el proveedor no la informa')


class ClimaType(graphene.ObjectType):
    actual = graphene.Field(ClimaActualType, required=True)
    pronostico = graphene.List(graphene.NonNull(PronosticoDiaType), required=True)
    fuente = graphene.String(required=True, description='Atribución obligatoria del proveedor (CC BY 4.0)')


class DetalleComplejoType(ComplejoCatalogoType):
    canchas = graphene.List(graphene.NonNull(CanchaPublicaType), required=True)
    clima = graphene.Field(
        ClimaType,
        description='Clima actual y pronóstico desde backend-node. Nulo si ese servicio no responde a tiempo: '
                    'el resto de la ficha llega igual.',
    )

    @staticmethod
    def resolve_clima(complejo, info):
        # Se resuelve solo si la consulta pide el campo: una ficha sin clima no llama a backend-node.
        return ClimaComplejoService.consultar(complejo['id'])


class PaginaCatalogoType(graphene.ObjectType):
    count = graphene.Int(required=True)
    results = graphene.List(graphene.NonNull(ComplejoCatalogoType), required=True)


class DatosTransferenciaType(graphene.ObjectType):
    alias = graphene.String(required=True)
    titular = graphene.String(required=True)
    cbu = graphene.String(required=True, description='CBU o CVU opcional; vacío si el complejo no lo informó')


class RechazoTransferenciaType(graphene.ObjectType):
    motivo = graphene.Int(required=True)
    motivo_nombre = graphene.String(required=True)
    nota = graphene.String(required=True)
    rechazada_en = graphene.String(required=True, description='Fecha y hora ISO 8601 con zona horaria')


class TransferenciaInformadaType(graphene.ObjectType):
    titular = graphene.String(required=True)
    referencia = graphene.String(required=True)
    informada_en = graphene.String(required=True, description='Fecha y hora ISO 8601 con zona horaria')
    rechazo = graphene.Field(RechazoTransferenciaType, description='Si el complejo la rechazó y pidió informarla de nuevo')


class ReservaPropiaType(graphene.ObjectType):
    id = graphene.Int(required=True)
    complejo = graphene.Field(ReferenciaType, required=True)
    cancha = graphene.Field(ReferenciaType, required=True)
    deporte = graphene.String(required=True)
    fecha_turno = graphene.String(required=True, description='AAAA-MM-DD')
    hora_inicio = graphene.String(required=True, description='HH:MM:SS')
    hora_fin = graphene.String(required=True, description='HH:MM:SS')
    precio_acordado = graphene.Decimal(required=True)
    monto_sena = graphene.Decimal(required=True)
    monto_pagado = graphene.Decimal(required=True)
    saldo_restante = graphene.Decimal(required=True)
    estado_pago = graphene.Int(required=True)
    estado_pago_nombre = graphene.String(required=True)
    transferencia_informada = graphene.Boolean(required=True)
    transferencia_rechazada = graphene.Boolean(required=True)
    transferencia = graphene.Field(
        TransferenciaInformadaType, description='Lo que el propio titular informó al transferir la seña',
    )
    datos_transferencia = graphene.Field(
        DatosTransferenciaType, description='Solo mientras la seña está pendiente de pago',
    )
    tipo_ocupacion = graphene.Int(required=True)
    tipo_ocupacion_nombre = graphene.String(required=True)
    estado = graphene.Int(required=True)
    estado_nombre = graphene.String(required=True)
    cancelable_hasta = graphene.String(description='Fecha y hora ISO 8601 con zona horaria')
    fecha_creacion = graphene.String(required=True, description='Fecha y hora ISO 8601 con zona horaria')


class PaginaReservasType(graphene.ObjectType):
    count = graphene.Int(required=True)
    results = graphene.List(graphene.NonNull(ReservaPropiaType), required=True)


class CrearReserva(graphene.Mutation):
    """Alta de una reserva web del jugador, con las mismas validaciones, bloqueos y límites que la API REST."""

    class Arguments:
        cancha = graphene.Int(required=True)
        fecha_turno = graphene.String(required=True, description='AAAA-MM-DD')
        hora_inicio = graphene.String(required=True, description='HH:MM, inicio de un turno de la grilla')

    reserva = graphene.Field(ReservaPropiaType, required=True)

    @staticmethod
    def mutate(root, info, **datos):
        return CrearReserva(reserva=ejecutar_como_en_rest(ReservaViewSet, 'create', info, metodo='post', datos=datos))


class Mutation(graphene.ObjectType):
    crear_reserva = CrearReserva.Field()


class Query(graphene.ObjectType):
    catalogo_complejos = graphene.Field(
        PaginaCatalogoType,
        deporte=graphene.Int(),
        cobertura=graphene.Int(),
        servicio=graphene.List(graphene.Int),
        search=graphene.String(),
        ordering=graphene.String(),
        page=graphene.Int(),
        description='Complejos habilitados del catálogo público, con los filtros y la paginación de la API REST.',
    )

    detalle_complejo = graphene.Field(
        DetalleComplejoType,
        id=graphene.Int(required=True),
        description='Ficha pública de un complejo habilitado (datos y canchas de PostgreSQL, como la API REST) con '
                    'el clima que calcula backend-node, en una sola consulta.',
    )

    mis_reservas = graphene.Field(
        PaginaReservasType,
        estado=graphene.Int(),
        vigencia=graphene.String(),
        fecha_desde=graphene.String(),
        fecha_hasta=graphene.String(),
        ordering=graphene.String(),
        page=graphene.Int(),
        description='Reservas de la cuenta autenticada, con los filtros y la paginación de la API REST.',
    )

    @staticmethod
    def resolve_catalogo_complejos(root, info, **argumentos):
        return listar_como_en_rest(ComplejoViewSet, 'list', info, argumentos)

    @staticmethod
    def resolve_detalle_complejo(root, info, id):
        return ejecutar_como_en_rest(ComplejoViewSet, 'retrieve', info, pk=id)

    @staticmethod
    def resolve_mis_reservas(root, info, **argumentos):
        return listar_como_en_rest(ReservaViewSet, 'mias', info, argumentos)


schema = graphene.Schema(query=Query, mutation=Mutation)

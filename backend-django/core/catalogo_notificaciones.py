"""
Catálogo canónico de los tipos de notificación y de los roles a los que aplica cada uno. Es la única fuente de la
matriz de preferencias: el modelo toma de acá sus `choices`, el servicio valida combinaciones contra
`ROLES_APLICABLES` y, al filtrar el despacho, cada aviso declara su tipo con estos códigos. No importa nada del
resto de `core` para poder usarse desde `models.py` sin ciclos.
"""
from dataclasses import dataclass

from django.db import models


class RolBaseNotificacion(models.TextChoices):
    JUGADOR = 'jugador', 'Jugador'
    OPERADOR = 'operador', 'Operador'
    DUENO = 'dueno', 'Dueño de complejo'
    SUPERADMIN = 'superadmin', 'Superadministrador'


class TipoNotificacion(models.TextChoices):
    RESERVAS = 'reservas', 'Reservas'
    RECORDATORIOS_TURNO = 'recordatorios_turno', 'Recordatorios de turno'
    SENAS_Y_COBROS = 'senas_y_cobros', 'Señas, pagos y transferencias'
    EXCEPCIONES_Y_CONFLICTOS = 'excepciones_y_conflictos', 'Excepciones horarias y conflictos de agenda'
    GESTION_COMPLEJO = 'gestion_complejo', 'Configuración, precios y operadores del complejo'
    CONTRATOS = 'contratos', 'Contratos de complejos'
    CUENTAS_USUARIOS = 'cuentas_usuarios', 'Cuentas de usuarios'
    ALERTAS_SISTEMA = 'alertas_sistema', 'Alertas de seguridad, correo y estado del sistema'


@dataclass(frozen=True)
class DefinicionNotificacion:
    codigo: str
    orden: int
    roles_aplicables: frozenset

    @property
    def nombre(self):
        return TipoNotificacion(self.codigo).label


_JUGADOR = RolBaseNotificacion.JUGADOR
_OPERADOR = RolBaseNotificacion.OPERADOR
_DUENO = RolBaseNotificacion.DUENO
_SUPERADMIN = RolBaseNotificacion.SUPERADMIN

# El orden es el de presentación. `roles_aplicables` refleja a quién se le despacha hoy cada tipo: un jugador no
# recibe alertas de cuota de correo ni un superadministrador los turnos de un complejo.
CATALOGO = (
    DefinicionNotificacion(TipoNotificacion.RESERVAS, 1, frozenset({_JUGADOR, _OPERADOR, _DUENO})),
    DefinicionNotificacion(TipoNotificacion.RECORDATORIOS_TURNO, 2, frozenset({_JUGADOR})),
    DefinicionNotificacion(TipoNotificacion.SENAS_Y_COBROS, 3, frozenset({_JUGADOR, _OPERADOR, _DUENO})),
    DefinicionNotificacion(TipoNotificacion.EXCEPCIONES_Y_CONFLICTOS, 4, frozenset({_OPERADOR, _DUENO})),
    DefinicionNotificacion(TipoNotificacion.GESTION_COMPLEJO, 5, frozenset({_DUENO})),
    DefinicionNotificacion(TipoNotificacion.CONTRATOS, 6, frozenset({_DUENO, _SUPERADMIN})),
    DefinicionNotificacion(TipoNotificacion.CUENTAS_USUARIOS, 7, frozenset({_SUPERADMIN})),
    DefinicionNotificacion(TipoNotificacion.ALERTAS_SISTEMA, 8, frozenset({_SUPERADMIN})),
)

ROLES_APLICABLES = {definicion.codigo: definicion.roles_aplicables for definicion in CATALOGO}


def es_combinacion_valida(rol_base, tipo_notificacion):
    return rol_base in ROLES_APLICABLES.get(tipo_notificacion, frozenset())


def combinaciones_validas():
    """Pares (rol_base, tipo) en el orden del catálogo y, dentro de cada tipo, el de `RolBaseNotificacion`."""
    return [
        (rol.value, definicion.codigo)
        for definicion in CATALOGO
        for rol in RolBaseNotificacion
        if rol in definicion.roles_aplicables
    ]

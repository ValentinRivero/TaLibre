"""
Prueba de humo de punta a punta contra el stack levantado con docker-compose.local.yml.

Recorre lo mismo que un jugador desde el navegador, siempre a traves de nginx: el frontend compilado, la salud y el
catalogo de Django, la ficha por GraphQL con el clima de backend-node, la documentacion de ambas APIs, el cierre de las
rutas internas, el rechazo sin sesion en los dos backends, el inicio de sesion con la cookie de refresh, una reserva con
su aviso en tiempo real por WebSocket y su cancelacion.

Uso: SEED_PASSWORD_DEMO=<clave del compose local> python prueba_humo.py [--url http://localhost:8080]
Solo usa la biblioteca estandar. Sale con codigo 1 y el nombre del paso ante la primera falla.
"""
import argparse
import base64
import hashlib
import http.cookiejar
import json
import os
import socket
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

JUGADOR_SEED = 'fabricio.medina@demo.talibre.test'
# Argentina no tiene horario de verano: la fecha de los turnos se calcula con el huso del servidor y no con el del runner.
HUSO_ARGENTINA = timezone(timedelta(hours=-3))
# Dos dias de anticipacion superan el margen de cancelacion de cualquier complejo del seed, a cualquier hora del dia.
DIAS_ANTICIPACION = 2
ESPERA_SEGUNDOS = 15
GUID_WEBSOCKET = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'


class FallaPrueba(Exception):
    pass


def exigir(condicion, mensaje):
    if not condicion:
        raise FallaPrueba(mensaje)


class Cliente:
    def __init__(self, base):
        self.base = base.rstrip('/')
        self.cookies = http.cookiejar.CookieJar()
        self.abridor = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))
        self.access = None

    def pedir(self, metodo, ruta, cuerpo=None, autenticado=False):
        encabezados = {'Accept': 'application/json'}
        datos = None
        if cuerpo is not None:
            datos = json.dumps(cuerpo).encode()
            encabezados['Content-Type'] = 'application/json'
        if autenticado:
            encabezados['Authorization'] = f'Bearer {self.access}'
        pedido = urllib.request.Request(self.base + ruta, data=datos, method=metodo, headers=encabezados)
        try:
            with self.abridor.open(pedido, timeout=ESPERA_SEGUNDOS) as respuesta:
                return respuesta.status, respuesta.read().decode()
        except urllib.error.HTTPError as error:
            return error.code, error.read().decode(errors='replace')

    def json(self, metodo, ruta, esperado, cuerpo=None, autenticado=False):
        codigo, texto = self.pedir(metodo, ruta, cuerpo, autenticado)
        exigir(codigo == esperado, f'{metodo} {ruta} respondio {codigo} y se esperaba {esperado}: {texto[:300]}')
        try:
            return json.loads(texto) if texto else None
        except json.JSONDecodeError as error:
            raise FallaPrueba(f'{metodo} {ruta} no devolvio JSON: {texto[:200]}') from error

    def tiene_cookie(self, nombre):
        return any(cookie.name == nombre for cookie in self.cookies)


class WebSocketLectura:
    """Cliente minimo de WebSocket (RFC 6455) para escuchar el canal publico de la grilla sin dependencias."""

    def __init__(self, base, ruta):
        partes = urllib.parse.urlsplit(base)
        self.conexion = socket.create_connection((partes.hostname, partes.port or 80), timeout=ESPERA_SEGUNDOS)
        clave = base64.b64encode(os.urandom(16)).decode()
        apertura = (
            f'GET {ruta} HTTP/1.1\r\nHost: {partes.netloc}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
            f'Sec-WebSocket-Key: {clave}\r\nSec-WebSocket-Version: 13\r\nOrigin: {partes.scheme}://{partes.netloc}\r\n\r\n'
        )
        self.conexion.sendall(apertura.encode())
        self.pendiente = b''
        while b'\r\n\r\n' not in self.pendiente:
            self.pendiente += self._recibir()
        cabecera, _, self.pendiente = self.pendiente.partition(b'\r\n\r\n')
        lineas = cabecera.decode(errors='replace').split('\r\n')
        exigir(' 101 ' in f'{lineas[0]} ', f'el WebSocket respondio "{lineas[0]}" en lugar de 101')
        esperada = base64.b64encode(hashlib.sha1((clave + GUID_WEBSOCKET).encode()).digest()).decode()
        recibida = next((l.split(':', 1)[1].strip() for l in lineas if l.lower().startswith('sec-websocket-accept:')), '')
        exigir(recibida == esperada, 'el WebSocket devolvio un Sec-WebSocket-Accept invalido')

    def _recibir(self):
        trozo = self.conexion.recv(4096)
        exigir(trozo, 'el servidor cerro la conexion del WebSocket')
        return trozo

    def _leer(self, cantidad):
        while len(self.pendiente) < cantidad:
            self.pendiente += self._recibir()
        datos, self.pendiente = self.pendiente[:cantidad], self.pendiente[cantidad:]
        return datos

    def siguiente_mensaje(self):
        while True:
            primero, segundo = self._leer(2)
            codigo = primero & 0x0F
            largo = segundo & 0x7F
            if largo == 126:
                largo = struct.unpack('!H', self._leer(2))[0]
            elif largo == 127:
                largo = struct.unpack('!Q', self._leer(8))[0]
            mascara = self._leer(4) if segundo & 0x80 else None
            carga = self._leer(largo)
            if mascara:
                carga = bytes(b ^ mascara[i % 4] for i, b in enumerate(carga))
            if codigo == 0x1:
                return json.loads(carga.decode())
            exigir(codigo != 0x8, f'el servidor cerro el WebSocket (carga {carga!r})')
            # Ping, pong o continuacion: el canal solo publica mensajes de texto completos.

    def esperar_evento(self, cancha_id, fecha, limite):
        while time.monotonic() < limite:
            self.conexion.settimeout(max(0.1, limite - time.monotonic()))
            try:
                evento = self.siguiente_mensaje()
            except socket.timeout:
                break
            if evento.get('event') != 'grilla_actualizada':
                continue
            cancha = evento.get('cancha_id')
            desde, hasta = evento.get('fecha_desde'), evento.get('fecha_hasta')
            if cancha in (None, cancha_id) and (desde is None or desde <= fecha) and (hasta is None or fecha <= hasta):
                return evento
        raise FallaPrueba(f'no llego el evento grilla_actualizada de la cancha {cancha_id} en {ESPERA_SEGUNDOS} s')

    def cerrar(self):
        try:
            # Marco de cierre enmascarado, como exige el protocolo a los clientes.
            self.conexion.sendall(bytes([0x88, 0x80]) + os.urandom(4))
        except OSError:
            pass
        self.conexion.close()


def buscar_turno_libre(cliente, complejos, fecha):
    for complejo in complejos:
        grilla = cliente.json('GET', f'/api/complejos/{complejo["id"]}/grilla/?fecha={fecha}', 200)
        for cancha in grilla['canchas']:
            for bloque in cancha['bloques']:
                if bloque['estado'] == 'LIBRE':
                    return complejo['id'], cancha['id'], bloque['hora_inicio']
    raise FallaPrueba(f'ningun complejo del catalogo tiene un turno libre el {fecha}')


def estado_del_bloque(cliente, complejo_id, cancha_id, fecha, hora_inicio):
    grilla = cliente.json('GET', f'/api/complejos/{complejo_id}/grilla/?fecha={fecha}', 200)
    cancha = next(c for c in grilla['canchas'] if c['id'] == cancha_id)
    return next(b['estado'] for b in cancha['bloques'] if b['hora_inicio'] == hora_inicio)


def ejecutar(base, password):
    cliente = Cliente(base)
    contexto = {}
    fecha = (datetime.now(HUSO_ARGENTINA).date() + timedelta(days=DIAS_ANTICIPACION)).isoformat()

    def frontend():
        codigo, texto = cliente.pedir('GET', '/')
        exigir(codigo == 200 and 'id="raiz"' in texto, f'/ respondio {codigo} sin la aplicacion de React')
        return 'index.html servido por nginx'

    def salud_django():
        cliente.json('GET', '/api/health/', 200)
        return '200'

    def catalogo():
        pagina = cliente.json('GET', '/api/complejos/', 200)
        exigir(pagina['count'] >= 1, 'el catalogo publico esta vacio: el seed no cargo complejos habilitados')
        contexto['complejos'] = pagina['results']
        return f'{pagina["count"]} complejos habilitados'

    def turno_libre():
        complejo_id, cancha_id, hora = buscar_turno_libre(cliente, contexto['complejos'], fecha)
        contexto.update(complejo_id=complejo_id, cancha_id=cancha_id, hora_inicio=hora)
        return f'complejo {complejo_id}, cancha {cancha_id}, {fecha} {hora[:5]}'

    def detalle_graphql():
        consulta = (
            f'{{ detalleComplejo(id: {contexto["complejo_id"]}) {{ id nombre canchas {{ id }} clima {{ fuente }} }} }}'
        )
        respuesta = cliente.json('POST', '/graphql/', 200, cuerpo={'query': consulta})
        exigir(not respuesta.get('errors'), f'GraphQL devolvio errores: {respuesta.get("errors")}')
        detalle = respuesta['data']['detalleComplejo']
        exigir(any(str(c['id']) == str(contexto['cancha_id']) for c in detalle['canchas']),
               'la ficha de GraphQL no incluye la cancha que muestra la grilla REST')
        return f'"{detalle["nombre"]}", clima {"incluido" if detalle["clima"] else "nulo (proveedor externo no disponible)"}'

    def clima_node():
        codigo, texto = cliente.pedir('GET', f'/api/externa/clima/{contexto["complejo_id"]}')
        # 502 es la respuesta prevista cuando el proveedor externo del clima no responde: Node igual atendio.
        exigir(codigo in (200, 502), f'el clima respondio {codigo}: {texto[:200]}')
        return f'{codigo} desde backend-node'

    def documentacion():
        for ruta in ('/api/docs-django/openapi.json', '/api/docs-node/openapi.json'):
            especificacion = cliente.json('GET', ruta, 200)
            exigir(str(especificacion.get('openapi', '')).startswith('3.'), f'{ruta} no es OpenAPI 3')
            exigir(not any(r.startswith('/api/interno') for r in especificacion.get('paths', {})),
                   f'{ruta} publica rutas internas')
        return 'OpenAPI 3 de Django y de Node, sin rutas internas'

    def rutas_internas():
        codigo, _ = cliente.pedir('GET', '/api/interno/estado')
        exigir(codigo == 404, f'/api/interno respondio {codigo} desde afuera y nginx debia cerrarla con 404')
        return '404 en nginx'

    def sin_sesion():
        cliente.json('GET', '/api/reservas/mias/', 401)
        cliente.json('GET', '/api/actividad/notificaciones/mias', 401)
        return '401 en Django y en Node'

    def login():
        sesion = cliente.json('POST', '/api/token/', 200, cuerpo={'email': JUGADOR_SEED, 'password': password})
        exigir(sesion.get('access'), 'el inicio de sesion no devolvio un access token')
        exigir(cliente.tiene_cookie('refresh'), 'el inicio de sesion no dejo la cookie de refresh')
        cliente.access = sesion['access']
        return 'access token y cookie HttpOnly de refresh'

    def refresh():
        renovado = cliente.json('POST', '/api/token/refresh/', 200)
        exigir(renovado.get('access'), 'el refresh no devolvio un access token nuevo')
        cliente.access = renovado['access']
        return 'access renovado con la cookie'

    def websocket():
        contexto['ws'] = WebSocketLectura(base, f'/ws/complejos/{contexto["complejo_id"]}/disponibilidad/')
        return 'conectado (101)'

    def reservar():
        reserva = cliente.json('POST', '/api/reservas/', 201, autenticado=True, cuerpo={
            'cancha': contexto['cancha_id'], 'fecha_turno': fecha, 'hora_inicio': contexto['hora_inicio'][:5],
        })
        exigir(reserva['estado'] == 1, f'la reserva nacio con estado {reserva["estado"]} y se esperaba 1')
        contexto['reserva_id'] = reserva['id']
        return f'reserva {reserva["id"]} pendiente de sena'

    def evento_tiempo_real():
        evento = contexto['ws'].esperar_evento(contexto['cancha_id'], fecha, time.monotonic() + ESPERA_SEGUNDOS)
        return f'grilla_actualizada de la cancha {evento.get("cancha_id")}'

    def grilla_ocupada():
        estado = estado_del_bloque(cliente, contexto['complejo_id'], contexto['cancha_id'], fecha,
                                   contexto['hora_inicio'])
        exigir(estado == 'OCUPADO', f'el turno reservado figura {estado} en la grilla publica')
        return 'el turno figura OCUPADO'

    def mis_reservas():
        pagina = cliente.json('GET', f'/api/reservas/mias/?fecha_desde={fecha}&fecha_hasta={fecha}', 200,
                              autenticado=True)
        exigir(any(r['id'] == contexto['reserva_id'] for r in pagina['results']),
               'la reserva nueva no aparece en mis reservas')
        return 'la reserva figura en el listado propio'

    def cancelar():
        reserva = cliente.json('POST', f'/api/reservas/{contexto["reserva_id"]}/cancelar/', 200, autenticado=True)
        exigir(reserva['estado'] == 4, f'la cancelacion dejo el estado {reserva["estado"]} y se esperaba 4')
        estado = estado_del_bloque(cliente, contexto['complejo_id'], contexto['cancha_id'], fecha,
                                   contexto['hora_inicio'])
        exigir(estado == 'LIBRE', f'el turno cancelado figura {estado} en la grilla publica')
        return 'cancelada y el turno vuelve a LIBRE'

    pasos = [
        ('Frontend', frontend),
        ('Salud de Django', salud_django),
        ('Catalogo publico', catalogo),
        ('Turno libre en la grilla', turno_libre),
        ('Detalle por GraphQL', detalle_graphql),
        ('Clima de backend-node', clima_node),
        ('Documentacion OpenAPI', documentacion),
        ('Rutas internas cerradas', rutas_internas),
        ('Rechazo sin sesion', sin_sesion),
        ('Inicio de sesion', login),
        ('Renovacion del access', refresh),
        ('WebSocket de la grilla', websocket),
        ('Reserva', reservar),
        ('Aviso en tiempo real', evento_tiempo_real),
        ('Grilla actualizada', grilla_ocupada),
        ('Mis reservas', mis_reservas),
        ('Cancelacion', cancelar),
    ]
    try:
        for nombre, paso in pasos:
            try:
                detalle = paso()
            except FallaPrueba as error:
                print(f'[FALLA] {nombre}: {error}')
                return 1
            except Exception as error:
                print(f'[FALLA] {nombre}: {type(error).__name__}: {error}')
                return 1
            print(f'[ok] {nombre}: {detalle}')
    finally:
        if 'ws' in contexto:
            contexto['ws'].cerrar()
    print(f'Prueba de humo completa: {len(pasos)} pasos en verde.')
    return 0


def main():
    argumentos = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    argumentos.add_argument('--url', default='http://localhost:8080', help='direccion de nginx del stack local')
    opciones = argumentos.parse_args()
    password = os.environ.get('SEED_PASSWORD_DEMO', '')
    if not password:
        print('Falta SEED_PASSWORD_DEMO: es la clave de las cuentas de demostracion del compose local.')
        return 1
    return ejecutar(opciones.url, password)


if __name__ == '__main__':
    sys.exit(main())

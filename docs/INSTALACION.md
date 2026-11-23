# Guía de instalación y puesta en marcha

Esta guía explica cómo levantar TaLibre en una computadora propia, cómo correr sus pruebas y cómo se versiona y se despliega. Hay dos caminos:

- **Opción A, un solo comando:** Docker levanta las bases de datos, los dos backends y el frontend ya compilado. Es el camino recomendado para probar el sistema completo.
- **Opción B, servicio por servicio:** cada parte corre en la máquina, sin Docker. Es el camino para desarrollar y depurar.

Todos los valores de esta guía son ficticios y descartables. No dan acceso a ningún entorno real. El sistema publicado usa otros valores, que nunca se versionan.

## Índice

1. [Requisitos](#1-requisitos)
2. [Clonar el repositorio](#2-clonar-el-repositorio)
3. [Opción A: un solo comando con Docker](#3-opción-a-un-solo-comando-con-docker)
4. [Opción B: servicio por servicio](#4-opción-b-servicio-por-servicio)
5. [Qué funciona si falta una pieza](#5-qué-funciona-si-falta-una-pieza)
6. [Pruebas y análisis estático](#6-pruebas-y-análisis-estático)
7. [Despliegue, versiones y rollback](#7-despliegue-versiones-y-rollback)
8. [Problemas frecuentes](#8-problemas-frecuentes)

## 1. Requisitos

| Herramienta | Versión | Opción A | Opción B | Para qué |
|---|---|---|---|---|
| Git | cualquiera reciente | Sí | Sí | Clonar el repositorio |
| Docker con Compose v2 | Docker Engine 24 o Docker Desktop | Sí | No | Levantar todo con un comando |
| Python | 3.14 | No | Sí | `backend-django` |
| Node.js | 24 (con npm 11) | No | Sí | `backend-node` y `frontend` |
| PostgreSQL | 16 o superior | No | Opcional | Base principal. Sin ella, Django usa SQLite |
| MongoDB | 7 o un clúster de MongoDB Atlas | No | Sí, si se levanta `backend-node` | Eventos y notificaciones |
| Redis | 7 | No | Opcional | Canales del WebSocket y caché compartida. Sin él, todo queda en memoria del proceso |

Los puertos que se usan son `8080` (Opción A), y `8000`, `3000` y `5173` (Opción B). Tienen que estar libres.

## 2. Clonar el repositorio

```bash
git clone https://github.com/ValentinRivero/TaLibre.git
cd TaLibre
```

El repositorio es un monorepo:

| Carpeta | Contenido |
|---|---|
| `backend-django/` | API principal: REST, GraphQL y WebSocket. Núcleo transaccional sobre PostgreSQL |
| `backend-node/` | Servicio complementario: actividad, notificaciones y clima, sobre MongoDB |
| `frontend/` | Cliente web en React, instalable como PWA |
| `nginx/` | Configuración del servidor web que publica el frontend y reparte las rutas entre los backends |
| `docker-compose.yml` | Stack de producción (sus variables viven fuera del repositorio) |
| `docker-compose.local.yml` | Stack local completo de la Opción A |
| `.github/` | Integración continua, despliegue y prueba de humo |

## 3. Opción A: un solo comando con Docker

### 3.1. Levantar

Desde la raíz del clon:

```bash
docker compose -f docker-compose.local.yml up --build
```

La primera vez construye las tres imágenes y descarga las de las bases, lo que tarda algunos minutos. Para dejarlo en segundo plano y esperar a que todo quede sano antes de devolver la terminal:

```bash
docker compose -f docker-compose.local.yml up -d --build --wait
```

### 3.2. Qué levanta

| Servicio | Imagen | Función |
|---|---|---|
| `db` | `postgres:16-alpine` | Base principal, con su volumen `datos_postgres` |
| `mongo` | `mongo:7` | Base de `backend-node`, con su volumen `datos_mongo` |
| `redis` | `redis:7-alpine` | Capa de canales del WebSocket y caché compartida, sin persistencia |
| `web` | `backend-django/Dockerfile` | Aplica las migraciones, carga los datos de demostración y arranca Daphne |
| `node` | `backend-node/Dockerfile` | API de actividad, notificaciones y clima |
| `nginx` | `frontend/Dockerfile` | Sirve el frontend compilado y reparte `/api`, `/graphql` y `/ws` entre los backends |

Todos los servicios comparten la red privada `interna`. Solo `nginx` publica un puerto. Cada servicio tiene su chequeo de salud y arranca recién cuando los que necesita están sanos: `web` espera a `db` y `redis`, `node` espera a `mongo` y `web`, y `nginx` espera a los dos backends.

### 3.3. Direcciones

| Dirección | Qué es |
|---|---|
| `http://localhost:8080` | La aplicación |
| `http://localhost:8080/api/docs-django/` | Documentación interactiva de la API de Django (Swagger UI) |
| `http://localhost:8080/api/docs-node/` | Documentación interactiva de la API de Node (Swagger UI) |
| `http://localhost:8080/graphql/` | Endpoint de GraphQL |
| `http://localhost:8080/api/health/` | Salud de Django |

### 3.4. Usuarios de demostración

El comando `seed_inicial` crea cuatro complejos de Goya con sus canchas, horarios, servicios, contratos, una agenda de muestra calculada respecto del día de hoy y un usuario por rol. En este entorno, todas las cuentas usan la contraseña ficticia **`DemoLocal2026`**, definida en `docker-compose.local.yml`.

| Rol | Email |
|---|---|
| Superadministrador | `superadmin@demo.talibre.test` |
| Dueño de complejo | `aurelio.quintana@demo.talibre.test` (Complejo El Yacaré) |
| Dueño de complejo | `brenda.saucedo@demo.talibre.test` (Pádel Ñandubay) |
| Operador de complejo | `elias.mendieta@demo.talibre.test` (Complejo El Yacaré) |
| Jugador | `fabricio.medina@demo.talibre.test` |
| Jugador | `gisela.barrios@demo.talibre.test` |

Los nombres, teléfonos y complejos son inventados. Los emails usan un dominio reservado que no recibe correo.

> Esta contraseña es pública. Ningún entorno accesible desde internet puede usarla: allí `SEED_PASSWORD_DEMO` lleva un valor propio que no se versiona.

### 3.5. Correos

En este entorno `DJANGO_DEBUG` vale `True` y el proveedor de correo es la consola. Los códigos de recuperación de contraseña y los demás correos no se envían: aparecen en los registros del servicio `web`.

```bash
docker compose -f docker-compose.local.yml logs -f web
```

### 3.6. Bajar y borrar

```bash
docker compose -f docker-compose.local.yml down       # baja los contenedores y conserva las bases
docker compose -f docker-compose.local.yml down -v    # baja todo y borra los volúmenes (bases y bitácora)
```

Al volver a levantar, `seed_inicial` no duplica nada: es idempotente.

### 3.7. Diferencias con producción

El stack local usa las mismas imágenes que producción, con estos cambios:

- nginx atiende por HTTP en el puerto 8080, sin certificados ni el filtro de orígenes del proxy de producción.
- Django corre con `DJANGO_DEBUG=True` y sin redirección a HTTPS.
- Las bases corren en contenedores en lugar de los servicios administrados que usa producción.
- Las claves de firma y la clave interna entre servicios son valores ficticios escritos en el propio archivo.

El CI levanta exactamente este stack en cada pull request y le corre la prueba de humo de la sección 6.4.

## 4. Opción B: servicio por servicio

El orden importa: primero las bases, después `backend-django`, después `backend-node` (que consulta a Django) y por último el frontend. Cada backend lee su archivo `.env` de su propia carpeta. El repositorio no trae plantillas de `.env`: las variables mínimas están en las tablas de esta sección y el catálogo completo, con rangos y valores por defecto, se valida al arrancar. Un valor inválido corta el arranque nombrando la variable.

### 4.1. Bases de datos

- **PostgreSQL (opcional):** creá una base vacía, por ejemplo `talibre`. Si no definís `DATABASE_URL`, Django usa un archivo SQLite (`backend-django/db.sqlite3`), suficiente para desarrollar.
- **MongoDB (necesario para `backend-node`):** un servidor local en `mongodb://localhost:27017` o un clúster gratuito de MongoDB Atlas.
- **Redis (opcional):** un servidor en `redis://localhost:6379`. Si no definís `REDIS_URL`, el WebSocket y la caché funcionan en memoria del proceso.

Nunca apuntes un entorno de desarrollo a la base de un sistema publicado: `migrate` y `seed_inicial` escriben en ella.

### 4.2. backend-django

```bash
cd backend-django
python -m venv .venv
```

Activá el entorno virtual con `source .venv/bin/activate` (Linux y macOS) o con `.venv\Scripts\activate` (Windows) e instalá las dependencias:

```bash
pip install -r requirements.txt
```

Creá `backend-django/.env` con estas variables (valores de ejemplo, reemplazalos por los tuyos):

| Variable | Ejemplo | Obligatoria | Para qué |
|---|---|---|---|
| `DJANGO_SECRET_KEY` | `desarrollo-django-clave-ficticia-0123456789abcdef` | Sí | Clave de Django |
| `JWT_SIGNING_KEY` | `desarrollo-jwt-clave-ficticia-0123456789abcdef0123` | Sí | Firma de los tokens. Tiene que ser la misma en `backend-node` |
| `DJANGO_DEBUG` | `True` | No (por defecto `False`) | Modo desarrollo: muestra los correos en la consola y no redirige a HTTPS |
| `SEED_PASSWORD_DEMO` | `DemoLocal2026` | Solo para `seed_inicial` | Contraseña de las cuentas de demostración |
| `DATABASE_URL` | `postgres://talibre:clave@localhost:5432/talibre?sslmode=disable` | No | Sin ella, SQLite. Por defecto la conexión exige TLS, por eso un PostgreSQL local sin cifrado necesita `sslmode=disable` |
| `REDIS_URL` | `redis://localhost:6379/0` | No | Canales y caché en Redis |
| `NODE_API_URL` | `http://localhost:3000` | No | Entrega de avisos a `backend-node`. Sin ella, los avisos quedan en el log |
| `INTERNAL_API_KEY` | `desarrollo-interna-clave-ficticia-0123456789` | Con `NODE_API_URL` | Clave compartida entre los dos backends, de al menos 32 caracteres |

Los valores por defecto del resto ya contemplan el desarrollo local: CORS admite el frontend de `http://localhost:5173` y los hosts permitidos son `localhost` y `127.0.0.1`.

Creá las tablas, cargá los datos de demostración y arrancá el servidor:

```bash
python manage.py migrate
python manage.py seed_inicial
python manage.py runserver
```

`runserver` usa Daphne, el servidor ASGI del proyecto, así que en `http://localhost:8000` atienden la API REST, GraphQL (`/graphql/`), la documentación (`/api/docs-django/`) y el WebSocket (`/ws/`). Comprobalo con `http://localhost:8000/api/health/`.

Comandos útiles del seed:

```bash
python manage.py seed_inicial --reset              # da de baja la agenda de muestra y la regenera
python manage.py seed_inicial --actualizar-claves  # aplica SEED_PASSWORD_DEMO a las cuentas de demostración existentes
```

### 4.3. backend-node

En otra terminal:

```bash
cd backend-node
npm ci
```

Creá `backend-node/.env`:

| Variable | Ejemplo | Obligatoria | Para qué |
|---|---|---|---|
| `MONGO_URI` | `mongodb://localhost:27017/talibre` | Sí | Sin conexión a MongoDB el servicio no arranca |
| `JWT_SIGNING_KEY` | la misma que en Django | Sí | Valida los tokens que emite Django |
| `DJANGO_API_URL` | `http://localhost:8000` | Sí | API de Django, con o sin `/api` al final |
| `INTERNAL_API_KEY` | la misma que en Django | Para recibir avisos | Sin ella, las rutas internas rechazan todo |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Para usar el frontend | Orígenes del frontend, separados por coma |
| `NODE_ENV` | `development` | No | Formato del log |
| `PORT` | `3000` | No (por defecto `3000`) | Puerto |

```bash
npm run dev
```

`npm run dev` reinicia el servicio con cada cambio (nodemon). `npm start` lo arranca sin recarga. Comprobalo con `http://localhost:3000/api/salud` y la documentación en `http://localhost:3000/api/docs-node/`.

### 4.4. frontend

En otra terminal:

```bash
cd frontend
npm ci
npm run dev
```

La aplicación queda en `http://localhost:5173`. No hace falta `.env`: sin definir, las variables apuntan a los backends locales.

| Variable | Valor por defecto | Para qué |
|---|---|---|
| `VITE_API_DJANGO_URL` | `http://localhost:8000` | API de Django |
| `VITE_API_NODE_URL` | `http://localhost:3000` | API de Node |
| `VITE_WS_URL` | `ws://localhost:8000` | WebSocket. Vacía, usa el mismo origen de la página |

Estas variables llegan al navegador, así que nunca llevan secretos. Se fijan al compilar: `npm run build` genera `frontend/dist/` y `npm run preview` lo sirve para revisarlo.

La aplicación instalable (PWA) y su service worker solo se registran sobre HTTPS o en `localhost`.

## 5. Qué funciona si falta una pieza

| Falta | Qué pasa |
|---|---|
| PostgreSQL | Django usa SQLite. Todo funciona para una persona desarrollando, pero SQLite no bloquea filas: la protección contra reservas simultáneas del mismo turno solo se garantiza sobre PostgreSQL |
| Redis | Los canales del WebSocket y la caché quedan en memoria del proceso. Funciona con un solo proceso de Django, que es el caso de `runserver` |
| `backend-node` | Django, el catálogo, la grilla, las reservas y los paneles funcionan. El bloque del clima muestra un aviso con "Reintentar", las notificaciones y las métricas de visitas no cargan, y la ficha por GraphQL devuelve el clima vacío sin fallar. Los avisos que Django programa quedan en su log |
| MongoDB | `backend-node` no arranca y se aplica la fila anterior |
| Acceso a internet | No se cargan las teselas del mapa ni el pronóstico del clima (Open-Meteo). El resto funciona |
| Proveedor de correo | Con `DJANGO_DEBUG=True` los correos se ven en la consola de Django. Fuera de ese modo, sin un proveedor configurado no se envían |

## 6. Pruebas y análisis estático

Las pruebas no necesitan bases reales, servicios externos ni secretos: Django usa SQLite en memoria y Node simula MongoDB, Django y Open-Meteo.

### 6.1. backend-django

Desde `backend-django/`, con el entorno virtual activo:

```bash
pytest --cov=core
python manage.py makemigrations --check --dry-run --settings=config.settings_test
pip install ruff==0.17.6
ruff check .
```

Las pruebas usan `config.settings_test`, que fija sus propios valores y no lee la base de `DATABASE_URL`. Solo `DJANGO_SECRET_KEY` y `JWT_SIGNING_KEY` tienen que estar definidas, en el `.env` o en el entorno.

Las pruebas de concurrencia del motor de reservas necesitan un PostgreSQL descartable, porque SQLite no bloquea filas. Sin él se omiten. Para correrlas:

```bash
TEST_POSTGRES_URL=postgres://usuario:clave@localhost:5432/postgres?sslmode=disable \
  pytest core/tests/test_concurrencia.py --ds=config.settings_concurrencia -v
```

pytest crea y destruye su propia base de pruebas en ese servidor.

### 6.2. backend-node

Desde `backend-node/`:

```bash
npm run lint
npm test
npm run test:cobertura
```

`test:cobertura` falla si la cobertura baja del 95 % en sentencias, ramas, funciones o líneas.

### 6.3. frontend

Desde `frontend/`:

```bash
npm run lint
npm test
npm run build
```

### 6.4. Prueba de humo de punta a punta

Con el stack de la Opción A levantado, desde la raíz del clon:

```bash
SEED_PASSWORD_DEMO=DemoLocal2026 python .github/scripts/prueba_humo.py --url http://localhost:8080
```

Recorre 17 pasos a través de nginx, como lo haría un jugador: el frontend, la salud y el catálogo, la ficha por GraphQL con el clima, la documentación de las dos APIs, el cierre de las rutas internas, el rechazo sin sesión en los dos backends, el inicio de sesión con su renovación, una reserva con su aviso en tiempo real por WebSocket y su cancelación. Solo usa la biblioteca estándar de Python y termina con código 1 en el primer paso que falla.

### 6.5. Integración continua

`.github/workflows/ci.yml` corre en cada pull request y en cada push a `main`:

| Job | Qué hace |
|---|---|
| `django` | Instala dependencias, analiza con ruff, verifica que no falten migraciones y corre las pruebas con cobertura |
| `django-concurrencia` | Corre las pruebas de concurrencia sobre un PostgreSQL descartable |
| `node` | Instala, audita las dependencias de producción, verifica la sintaxis, analiza con eslint y corre las pruebas con su umbral de cobertura |
| `frontend` | Instala, audita las dependencias de producción, analiza con eslint, corre las pruebas y compila |
| `stack` | Después de los anteriores, construye las imágenes, levanta `docker-compose.local.yml` con `--wait`, corre la prueba de humo y baja todo |

`main` está protegida: solo recibe cambios por pull request con el CI en verde.

## 7. Despliegue, versiones y rollback

### 7.1. Despliegue continuo

Producción corre en un servidor propio con `docker-compose.yml`, detrás de HTTPS. PostgreSQL y MongoDB son servicios administrados y las variables de entorno se guardan como secreto del repositorio, nunca en archivos versionados.

`.github/workflows/deploy.yml` despliega solo cuando el CI de un push a `main` termina en verde, y despliega exactamente el commit que el CI aprobó. Los pull requests y las demás ramas nunca despliegan. En el servidor:

1. Actualiza las variables de entorno desde el secreto.
2. Se posiciona en el commit aprobado.
3. Reconstruye solo las capas que cambiaron con `docker compose up -d --build --wait`, esperando a que cada contenedor quede sano.
4. Aplica las migraciones y ejecuta `seed_inicial`, que es idempotente.
5. Limpia las imágenes viejas.

Un despliegue por vez: si llegan dos seguidos, el segundo espera al primero.

### 7.2. Versiones

La versión de la aplicación sigue el plan de trabajo con la forma `0.<fase>.<ítem>`. Se ve en el pie de la página como `v-x.y.z` y vive en `PARAMETROS.app.version` (`frontend/src/config/parametros.js`). Cada versión desplegada se marca con una etiqueta de Git:

```bash
git tag v0.7.9
git push origin v0.7.9
```

### 7.3. Rollback

Para volver a una versión anterior:

1. En GitHub, abrí **Actions**, elegí el workflow **Deploy** y tocá **Run workflow**.
2. Dejá **`main`** como rama de origen. Así corre el `deploy.yml` vigente y no el de la versión a la que se vuelve.
3. En **referencia**, escribí la etiqueta de la versión anterior (por ejemplo `v0.7.8`) o el hash de un commit. No uses nombres de ramas: el servidor se posiciona en la referencia tal cual y una rama local podría no coincidir con la del repositorio.
4. Confirmá con **Run workflow**. Al terminar, el pie de la página muestra la versión restaurada.

La referencia se valida contra un patrón antes de llegar al servidor. Si se deja vacía, se despliega lo último de `main`, que es también la forma de volver a la versión vigente después de una prueba.

El despliegue solo aplica migraciones hacia adelante. Si la versión de destino es anterior a una migración ya aplicada, primero hay que revertirla con `python manage.py migrate core <migración>` y recién después desplegar la etiqueta.

El procedimiento se probó volviendo de la versión vigente a la anterior y regresando, con ambas etiquetas publicadas.

## 8. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| Django no arranca y nombra `DJANGO_SECRET_KEY` o `JWT_SIGNING_KEY` | Faltan en `backend-django/.env`. Son las dos únicas obligatorias |
| Error de SSL al conectar a un PostgreSQL local | La conexión exige TLS por defecto. Agregá `?sslmode=disable` a `DATABASE_URL` |
| `seed_inicial` pide `SEED_PASSWORD_DEMO` | Definila en el `.env` antes de cargar los datos de demostración |
| `backend-node` termina al arrancar con "No se pudo conectar a MongoDB" | `MONGO_URI` falta o el servidor no responde |
| El frontend no puede hablar con Node (error de CORS en la consola) | Falta `CORS_ALLOWED_ORIGINS=http://localhost:5173` en `backend-node/.env` |
| `401` en todas las rutas privadas de Node | `JWT_SIGNING_KEY` no es la misma en los dos backends |
| El inicio de sesión responde `429` | Se superó el límite de intentos por minuto. Esperá un minuto |
| El puerto `8080`, `8000`, `3000` o `5173` está ocupado | Cerrá el proceso que lo usa. El frontend de desarrollo no cambia de puerto solo |
| Después de actualizar, el navegador muestra una versión vieja | El service worker guardó la anterior. Recargá con Ctrl+F5 o borrá los datos del sitio |

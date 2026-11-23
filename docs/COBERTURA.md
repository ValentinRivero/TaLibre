# Pruebas y cobertura

Reporte de las pruebas automatizadas de los tres proyectos y de la prueba de punta a punta del stack completo. Los números corresponden a la versión 0.7.9. Cómo correr cada suite está en [INSTALACION.md](INSTALACION.md#6-pruebas-y-análisis-estático).

## 1. Resumen

| Suite | Herramienta | Pruebas | Resultado | Cobertura |
|---|---|---|---|---|
| backend-django | pytest, pytest-django y pytest-cov | 2705 en 49 archivos | 2700 pasadas y 5 de concurrencia que corren en su propio job | 99 % de sentencias en `core` (98,97 % sin contar los archivos de prueba) |
| backend-django, concurrencia | pytest sobre PostgreSQL | 5 | Pasan en el job `django-concurrencia` | Complementa la suite general |
| backend-node | Jest y Supertest | 559 en 23 archivos | Todas pasan | 99,85 % de sentencias, 99,39 % de ramas, 100 % de funciones y 99,82 % de líneas |
| frontend | Vitest | 1202 en 55 archivos | Todas pasan | Funciones puras, sin medición de cobertura |
| Stack completo | Prueba de humo en Python | 17 pasos | Pasa en el job `stack` | Recorrido de punta a punta |

Análisis estático sin hallazgos: ruff en Django, eslint en Node y en el frontend. La compilación de producción del frontend y `makemigrations --check` también corren en cada pull request.

## 2. Cómo se mide

```bash
# backend-django
pytest --cov=core
TEST_POSTGRES_URL=postgres://... pytest core/tests/test_concurrencia.py --ds=config.settings_concurrencia

# backend-node
npm run test:cobertura

# frontend
npm test
npm run build

# stack completo, con docker-compose.local.yml levantado
SEED_PASSWORD_DEMO=DemoLocal2026 python .github/scripts/prueba_humo.py --url http://localhost:8080
```

- **Django:** la suite usa SQLite en memoria (`config.settings_test`) y nunca la base de `DATABASE_URL`. Fija sus propios parámetros para no depender del entorno local, no envía correos ni avisos reales y entrega los avisos a Node contra un servidor HTTP local de prueba.
- **Concurrencia:** `select_for_update` no bloquea en SQLite, así que las carreras del motor de reservas se prueban aparte sobre un PostgreSQL descartable, el servicio `postgres:17` del CI. Sin `TEST_POSTGRES_URL` esas 5 pruebas se omiten en la suite general.
- **Node:** MongoDB, Django y Open-Meteo se simulan. Las pruebas corren en orden aleatorio para detectar dependencias entre ellas, y `test:cobertura` falla si cualquier métrica baja del 95 %.
- **Frontend:** Vitest cubre las funciones puras (formatos de fecha y moneda, textos y sus parámetros, ventana del paginador, filtros, tiempo real, tema, validaciones, política de privacidad). Las pantallas se verifican con la compilación, el análisis estático, la prueba de humo y el recorrido manual por rol.

## 3. Cobertura de la lógica de negocio

### 3.1. backend-django

| Módulo | Sentencias | Sin cubrir | Cobertura | Qué contiene |
|---|---|---|---|---|
| `core/services.py` | 2252 | 15 | 99 % | Reglas de negocio: disponibilidad, motor de reservas, conflictos, baja de cuenta, reportes, avisos y difusión |
| `core/repositories.py` | 655 | 2 | 99 % | Consultas al ORM y agregaciones de reportes |
| `core/serializers.py` | 632 | 1 | 99 % | Validación y sanitización de entradas |
| `core/serializers_auth.py` | 105 | 0 | 100 % | Registro, sesión y contraseñas |
| `core/views.py` | 621 | 1 | 99 % | Vistas de la API |
| `core/models.py` | 464 | 25 | 95 % | Tablas, estados, índices y restricciones |
| `core/schema.py` y `core/graphql_views.py` | 228 | 0 | 100 % | GraphQL |
| `core/consumers.py`, `core/ws_auth.py` y `core/routing.py` | 55 | 0 | 100 % | WebSocket |
| `core/permissions.py` y `core/throttles.py` | 62 | 1 | 98 % | Permisos y limitadores |
| `core/node_client.py` y `core/email_service.py` | 138 | 3 | 98 % | Integración con Node y correo |
| `core/management/commands/` | 201 | 5 | 98 % | Seed y tareas programadas |
| **Total sin archivos de prueba** | **5754** | **59** | **98,97 %** | |

### 3.2. backend-node

| Capa | Sentencias | Ramas | Funciones | Líneas |
|---|---|---|---|---|
| `controllers/` | 100 % | 100 % | 100 % | 100 % |
| `services/` | 100 % | 100 % | 100 % | 100 % |
| `middlewares/` | 100 % | 100 % | 100 % | 100 % |
| `routes/` | 100 % | 100 % | 100 % | 100 % |
| `utils/` | 100 % | 100 % | 100 % | 100 % |
| `models/` | 98,5 % | 97,67 % | 100 % | 98,36 % |
| `config/` y `docs/` | 100 % | 100 % | 100 % | 100 % |
| **Total** | **99,85 %** | **99,39 %** | **100 %** | **99,82 %** |

## 4. Qué tipo de prueba es cada una

| Tipo | Dónde | Ejemplos |
|---|---|---|
| Unitarias | Funciones de servicios y utilidades aisladas | Cálculo de la grilla, montos de seña con redondeo, comparación de versiones de la política, validación del CBU, formatos de fecha del frontend, paginación y caché de Node |
| De integración | La API completa con el cliente de pruebas de DRF o Supertest, con base y permisos reales | Registro y login con su cookie, `429` al sexto intento, `403` y `404` por rol, `409` ante solapamiento, sanitización con `nh3`, GraphQL con las mismas reglas que REST, WebSocket con Channels, rechazos `401`, `403`, `400` y `502` en Node |
| De concurrencia | Hilos con conexión propia que arrancan juntos sobre PostgreSQL | Altas simultáneas del mismo turno por servicio y por la API (una se confirma y el resto recibe `409`), reserva y turno fijo simultáneos, dos turnos fijos del mismo horario y canchas distintas que no se esperan entre sí |
| De cantidad de consultas | `django_assert_num_queries` | Grilla, catálogo, marcadores del mapa, agenda, reportes y filtro de avisos con cantidad de consultas fija |
| De datos personales | Respuestas, logs, auditoría y eventos | Ninguna respuesta pública ni evento del WebSocket lleva datos personales, la auditoría no guarda emails ni textos libres y la baja anonimiza |
| De configuración | Settings y entorno | Un valor inválido corta el arranque, las pruebas no usan la base real y `check --deploy` queda sin pendientes |
| De punta a punta | Prueba de humo sobre el stack con Docker | A través de nginx: portada, salud, catálogo, ficha por GraphQL con clima, documentación sin rutas internas, rutas internas cerradas, `401` sin sesión, login con renovación, reserva con su evento en tiempo real y cancelación |

## 5. Qué no se cubre

- **Componentes de React:** no tienen pruebas de renderizado. La interfaz se valida con la compilación, el análisis estático, la prueba de humo y el recorrido manual por rol sobre el despliegue.
- **Sentencias sin cubrir de Django (59):** casi la mitad son las representaciones de texto de los modelos (`__str__`), que solo usa el panel de administración. El resto son ramas defensivas que la validación previa ya impide alcanzar (un `404` repetido dentro de un servicio, un nombre de rol duplicado que el serializer rechaza antes), algunos caminos del manejador de errores y del correo, y la falta de `SEED_PASSWORD_DEMO` en el seed.
- **Líneas sin cubrir de Node:** la rama del formato de registro de producción en `app.js` y una rama defensiva del filtro de la bandeja en `models/Notificacion.js`.
- **Proveedores externos reales:** Open-Meteo, Resend y el proveedor de teselas se simulan en las pruebas. La prueba de humo acepta un `502` del clima si el proveedor no responde, porque es un servicio de terceros.
- **Carga y rendimiento:** no hay pruebas de carga. El rendimiento se protege fijando la cantidad de consultas de cada operación crítica (ver [ARQUITECTURA.md](ARQUITECTURA.md#11-rendimiento-y-optimización-de-consultas)).

## 6. Integración continua

Las suites corren en cada pull request y en cada push a `main` (`.github/workflows/ci.yml`), y `main` solo acepta cambios con todos los jobs en verde:

| Job | Pasos |
|---|---|
| `django` | Dependencias, ruff, verificación de migraciones y `pytest --cov=core` |
| `django-concurrencia` | Pruebas de concurrencia sobre `postgres:17` |
| `node` | Dependencias, auditoría de dependencias de producción, sintaxis, eslint y pruebas con umbral del 95 % |
| `frontend` | Dependencias, auditoría, eslint, pruebas y compilación |
| `stack` | Construcción de las tres imágenes, stack local con `--wait`, prueba de humo y baja con sus volúmenes |

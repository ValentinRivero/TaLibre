from django.contrib import admin
from django.urls import include, path
from django.views.decorators.csrf import csrf_exempt

from core.graphql_views import JWTGraphQLView
from core.views import DocumentacionApiView, EsquemaApiView

from .schema import schema

urlpatterns = [
    path('admin/', admin.site.urls),
    # Mismos nombres que backend-node (/api/docs-node/): la interfaz y, al lado, su especificación en JSON.
    path('api/docs-django/openapi.json', EsquemaApiView.as_view(), name='esquema-api'),
    path('api/docs-django/', DocumentacionApiView.as_view(url_name='esquema-api'), name='documentacion-api'),
    path('api/', include('core.urls')),
    # Sin CSRF: la autenticación viaja en el encabezado Authorization, nunca en una cookie de sesión.
    path('graphql/', csrf_exempt(JWTGraphQLView.as_view(schema=schema, graphiql=True))),
]

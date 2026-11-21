import { t } from '../i18n/index.js';
import AlertaReintento from './AlertaReintento.jsx';
import Cargando from './Cargando.jsx';
import EstadoVacio from './EstadoVacio.jsx';
import FilaPreferenciaNotificacion from './FilaPreferenciaNotificacion.jsx';
import TablaApilable from './TablaApilable.jsx';

/**
 * Matriz de categorías por rol con sus estados de carga, error y vacío. `preferencias` es lo que devuelve
 * `usePreferenciasNotificacion`. En pantallas chicas cada categoría pasa a un bloque con un interruptor por rol.
 */
export default function TablaPreferenciasNotificacion({ preferencias }) {
  const { matriz, valores, cargando, error, ocupado, cambiar, recargarConsulta } = preferencias;

  if (cargando) return <Cargando variante="seccion" />;
  if (error && !matriz) {
    return (
      <AlertaReintento
        titulo={t('preferenciasNotificacion.errorCargaTitulo')}
        mensaje={error.mensaje}
        onReintentar={recargarConsulta}
      />
    );
  }
  if (!matriz || matriz.categorias.length === 0) {
    return (
      <EstadoVacio
        titulo={t('preferenciasNotificacion.vacioTitulo')}
        descripcion={t('preferenciasNotificacion.vacioDescripcion')}
      />
    );
  }

  const columnas = [
    { clave: 'categoria', etiqueta: t('preferenciasNotificacion.columnaCategoria') },
    ...matriz.roles.map((rol) => ({ clave: rol.codigo, etiqueta: rol.nombre, className: 'text-lg-center' })),
  ];

  return (
    <TablaApilable columnas={columnas} etiqueta={t('preferenciasNotificacion.etiquetaTabla')}>
      {matriz.categorias.map((categoria) => (
        <FilaPreferenciaNotificacion
          key={categoria.codigo}
          categoria={categoria}
          roles={matriz.roles}
          valores={valores?.[categoria.codigo]}
          onCambiar={cambiar}
          deshabilitado={ocupado}
        />
      ))}
    </TablaApilable>
  );
}

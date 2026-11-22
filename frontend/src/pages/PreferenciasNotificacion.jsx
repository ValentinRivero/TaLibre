import Alerta from '../components/Alerta.jsx';
import BarraGuardadoPreferencias from '../components/BarraGuardadoPreferencias.jsx';
import EncabezadoPantalla from '../components/EncabezadoPantalla.jsx';
import ErrorGuardadoPreferencias from '../components/ErrorGuardadoPreferencias.jsx';
import TablaPreferenciasNotificacion from '../components/TablaPreferenciasNotificacion.jsx';
import usePreferenciasNotificacion from '../hooks/usePreferenciasNotificacion.js';
import { t } from '../i18n/index.js';

/**
 * Notificaciones por rol (superadmin): matriz de categorías de aviso por rol base. Los cambios se editan en pantalla y
 * se guardan juntos, enviando solo los pares modificados; los correos de seguridad no dependen de esta configuración.
 */
export default function PreferenciasNotificacion() {
  const preferencias = usePreferenciasNotificacion();

  return (
    <div>
      <EncabezadoPantalla titulo={t('preferenciasNotificacion.titulo')} descripcion={t('preferenciasNotificacion.descripcion')} />
      <Alerta variante="info">
        <ul className="mb-0 ps-3">
          <li>{t('preferenciasNotificacion.notaAlcance')}</li>
          <li>{t('preferenciasNotificacion.notaGlobal')}</li>
          <li>{t('preferenciasNotificacion.notaRegistro')}</li>
        </ul>
      </Alerta>
      {preferencias.aviso && <Alerta variante="success" onCerrar={preferencias.descartarAviso}>{preferencias.aviso}</Alerta>}
      {preferencias.errorGuardado && (
        <ErrorGuardadoPreferencias
          error={preferencias.errorGuardado}
          onRecargar={preferencias.recargar}
          onCerrar={preferencias.descartarErrorGuardado}
        />
      )}
      <TablaPreferenciasNotificacion preferencias={preferencias} />
      {preferencias.matriz && (
        <BarraGuardadoPreferencias
          cantidadCambios={preferencias.cantidadCambios}
          enviando={preferencias.enviando}
          ocupado={preferencias.ocupado}
          onGuardar={preferencias.guardar}
          onDescartar={preferencias.descartar}
        />
      )}
    </div>
  );
}

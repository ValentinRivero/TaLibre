import Button from 'react-bootstrap/Button';
import { t } from '../i18n/index.js';
import BotonAccion from './BotonAccion.jsx';

/**
 * Acciones de la matriz de preferencias: cantidad de cambios sin guardar, "Descartar cambios" (solo si los hay) y
 * "Guardar cambios", que se habilita únicamente con cambios pendientes y mientras no se está guardando.
 */
export default function BarraGuardadoPreferencias({ cantidadCambios, enviando, ocupado, onGuardar, onDescartar }) {
  const hayCambios = cantidadCambios > 0;
  const resumen = cantidadCambios === 1
    ? t('preferenciasNotificacion.cambiosUno')
    : t('preferenciasNotificacion.cambiosVarios', { cantidad: cantidadCambios });

  return (
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3">
      <p className="small text-secondary mb-0" role="status">
        {hayCambios ? resumen : t('preferenciasNotificacion.sinCambios')}
      </p>
      <div className="d-flex flex-wrap gap-2">
        {hayCambios && (
          <Button variant="outline-secondary" disabled={ocupado} onClick={onDescartar}>
            {t('preferenciasNotificacion.descartar')}
          </Button>
        )}
        <BotonAccion
          cargando={enviando}
          disabled={!hayCambios || ocupado}
          textoCargando={t('preferenciasNotificacion.guardando')}
          onClick={onGuardar}
        >
          {t('preferenciasNotificacion.guardar')}
        </BotonAccion>
      </div>
    </div>
  );
}

import Button from 'react-bootstrap/Button';
import { t } from '../i18n/index.js';
import Alerta from './Alerta.jsx';

/**
 * Error al guardar las preferencias. Ante un 409 (otra persona las modificó a la vez) explica el conflicto y ofrece
 * recargar descartando lo editado; el resto de las fallas (datos inválidos, sin permiso, sin conexión) muestra el
 * mensaje del backend tal cual.
 */
export default function ErrorGuardadoPreferencias({ error, onRecargar, onCerrar }) {
  if (error.status === 409) {
    return (
      <Alerta titulo={t('preferenciasNotificacion.conflictoTitulo')} onCerrar={onCerrar}>
        <p className="mb-2">{t('preferenciasNotificacion.conflictoTexto')}</p>
        <Button variant="outline-secondary" onClick={onRecargar}>{t('preferenciasNotificacion.recargar')}</Button>
      </Alerta>
    );
  }
  return (
    <Alerta titulo={t('preferenciasNotificacion.errorGuardadoTitulo')} onCerrar={onCerrar}>{error.mensaje}</Alerta>
  );
}

import Form from 'react-bootstrap/Form';
import { t } from '../i18n/index.js';
import { CeldaTabla } from './TablaApilable.jsx';

/**
 * Fila de una categoría de notificación: su nombre y qué avisos agrupa, y una celda por rol. Donde la categoría no
 * aplica al rol hay un guion con su texto accesible, nunca un interruptor deshabilitado. `valores` es `{ [rol]: boolean | null }`.
 */
export default function FilaPreferenciaNotificacion({ categoria, roles, valores, onCambiar, deshabilitado }) {
  return (
    <tr>
      <CeldaTabla etiqueta="" className="celda-titulo">
        <div className="fw-semibold">{categoria.nombre}</div>
        <div className="small text-secondary">{t(`preferenciasNotificacion.categorias.${categoria.codigo}`)}</div>
      </CeldaTabla>
      {roles.map((rol) => (
        <CeldaTabla key={rol.codigo} etiqueta={rol.nombre} className="text-lg-center">
          {typeof valores?.[rol.codigo] === 'boolean' ? (
            <Form.Check
              type="switch"
              id={`preferencia-${categoria.codigo}-${rol.codigo}`}
              className="mb-0"
              checked={valores[rol.codigo]}
              disabled={deshabilitado}
              aria-label={t('preferenciasNotificacion.ariaCelda', { categoria: categoria.nombre, rol: rol.nombre })}
              onChange={() => onCambiar(categoria.codigo, rol.codigo)}
            />
          ) : (
            <span className="text-secondary">
              <span aria-hidden="true">—</span>
              <span className="visually-hidden">{t('preferenciasNotificacion.noAplica')}</span>
            </span>
          )}
        </CeldaTabla>
      ))}
    </tr>
  );
}

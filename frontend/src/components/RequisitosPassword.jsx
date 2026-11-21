import { t } from '../i18n/index.js';
import Icono from './Icono.jsx';

/**
 * Lista de requisitos de la contraseña nueva (`utils/validacionesCuenta.js#requisitosPassword`). Cada uno se distingue
 * por ícono y texto además del color, y los lectores de pantalla oyen si está cumplido o pendiente.
 */
export default function RequisitosPassword({ requisitos }) {
  return (
    <div className="mb-3">
      <p className="small text-secondary mb-1">{t('contrasena.requisitosTitulo')}</p>
      <ul className="list-unstyled small mb-0">
        {requisitos.map(({ clave, cumple, texto }) => (
          <li key={clave} className={`d-flex align-items-start gap-2 ${cumple ? 'requisito-cumplido' : 'text-secondary'}`}>
            <Icono nombre={cumple ? 'check' : 'informacion'} tamano={16} className="flex-shrink-0 mt-1" />
            <span>
              {texto}
              <span className="visually-hidden"> ({cumple ? t('contrasena.requisitoCumplido') : t('contrasena.requisitoPendiente')})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

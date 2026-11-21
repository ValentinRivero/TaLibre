import { PARAMETROS } from '../config/parametros.js';
import { t } from '../i18n/index.js';
import { requisitosPassword } from '../utils/validacionesCuenta.js';
import CampoPassword from './CampoPassword.jsx';
import RequisitosPassword from './RequisitosPassword.jsx';

const { limitesCampos } = PARAMETROS;

/**
 * Par "nueva contraseña" y "confirmación" con la lista de requisitos, compartido por el restablecimiento con código y
 * el cambio desde el perfil. `valores` trae `nueva_contrasena` y `confirmar_contrasena`; `errores`, un texto por campo.
 * La confirmación solo se compara en pantalla: nunca se envía.
 */
export default function CamposNuevaContrasena({ idBase, valores, errores = {}, onCambiar, className = 'mb-3' }) {
  return (
    <>
      <CampoPassword
        id={`${idBase}-nueva`}
        etiqueta={t('contrasena.nueva')}
        autoComplete="new-password"
        required
        maxLength={limitesCampos.password}
        valor={valores.nueva_contrasena}
        onCambiar={(valor) => onCambiar('nueva_contrasena', valor)}
        error={errores.nueva_contrasena}
      />
      <CampoPassword
        id={`${idBase}-confirmar`}
        etiqueta={t('contrasena.confirmar')}
        autoComplete="new-password"
        required
        maxLength={limitesCampos.password}
        valor={valores.confirmar_contrasena}
        onCambiar={(valor) => onCambiar('confirmar_contrasena', valor)}
        error={errores.confirmar_contrasena}
        className="mb-2"
      />
      <div className={className}>
        <RequisitosPassword requisitos={requisitosPassword(valores.nueva_contrasena, valores.confirmar_contrasena)} />
      </div>
    </>
  );
}

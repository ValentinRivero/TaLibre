import Form from 'react-bootstrap/Form';
import { Link } from 'react-router-dom';
import { PARAMETROS } from '../config/parametros.js';
import { t } from '../i18n/index.js';
import Alerta from './Alerta.jsx';
import BotonAccion from './BotonAccion.jsx';
import CamposNuevaContrasena from './CamposNuevaContrasena.jsx';
import CampoPassword from './CampoPassword.jsx';

/**
 * Cambio de contraseña con la sesión abierta (presentación): contraseña actual, nueva y confirmación. El estado y el
 * envío los maneja `hooks/useCambiarContrasena.js`. Debajo de la actual, el atajo a la recuperación por código para
 * quien no la recuerda: llega con el correo de la cuenta ya cargado.
 */
export default function SeccionCambiarContrasena({ email, valores, errores = {}, error, onCambiar, onEnviar, enviando }) {
  const campos = { ...(error?.campos ?? {}), ...errores };

  return (
    <section className="superficie p-3 mt-4" aria-labelledby="perfil-seguridad-titulo">
      <h2 id="perfil-seguridad-titulo" className="h5">{t('perfil.seguridadTitulo')}</h2>
      <p className="text-secondary">{t('perfil.seguridadDescripcion')}</p>
      <Form onSubmit={onEnviar} noValidate>
        {error && <Alerta variante="danger">{error.mensaje}</Alerta>}
        <CampoPassword
          id="perfil-contrasena-actual"
          etiqueta={t('contrasena.actual')}
          autoComplete="current-password"
          required
          maxLength={PARAMETROS.limitesCampos.password}
          valor={valores.contrasena_actual}
          onCambiar={(valor) => onCambiar('contrasena_actual', valor)}
          error={campos.contrasena_actual}
        >
          <div className="mt-1">
            <Link to="/recuperar-contrasena" state={{ email }}>{t('perfil.olvidoActual')}</Link>
          </div>
        </CampoPassword>
        <CamposNuevaContrasena idBase="perfil" valores={valores} errores={campos} onCambiar={onCambiar} className="mb-3" />
        <BotonAccion type="submit" cargando={enviando} textoCargando={t('perfil.cambiandoContrasena')}>
          {t('perfil.cambiarContrasena')}
        </BotonAccion>
      </Form>
    </section>
  );
}

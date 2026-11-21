import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import { PARAMETROS } from '../config/parametros.js';
import { t } from '../i18n/index.js';
import Alerta from './Alerta.jsx';
import BotonAccion from './BotonAccion.jsx';
import CampoFormulario from './CampoFormulario.jsx';

/**
 * Paso 1 de la recuperación (presentación): el correo al que se envía el código. El estado y el envío los maneja
 * `hooks/useRecuperacionContrasena.js`. `error` es el `ErrorApi` del último pedido y `errores`, los avisos de
 * validación del propio formulario.
 */
export default function FormularioSolicitarCodigo({ email, errores = {}, error, onCambiar, onEnviar, enviando, onYaTengoCodigo }) {
  const campos = { ...(error?.campos ?? {}), ...errores };

  return (
    <Card body>
      <Form
        onSubmit={(evento) => {
          evento.preventDefault();
          onEnviar();
        }}
        noValidate
      >
        {error && <Alerta variante="danger">{error.mensaje}</Alerta>}
        <CampoFormulario
          id="recuperar-email"
          etiqueta={t('recuperar.email')}
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="email"
          required
          maxLength={PARAMETROS.limitesCampos.email}
          className="mb-4"
          valor={email}
          onCambiar={(valor) => onCambiar('email', valor)}
          error={campos.email}
        />
        <BotonAccion type="submit" className="w-100" cargando={enviando} textoCargando={t('recuperar.enviando')}>
          {t('recuperar.enviarCodigo')}
        </BotonAccion>
        <div className="text-center mt-3">
          <Button variant="link" className="p-0" onClick={onYaTengoCodigo}>{t('recuperar.yaTengoCodigo')}</Button>
        </div>
      </Form>
    </Card>
  );
}

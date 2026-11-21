import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import { PARAMETROS } from '../config/parametros.js';
import { t } from '../i18n/index.js';
import { esCodigoRechazado } from '../utils/recuperacion.js';
import Alerta from './Alerta.jsx';
import BotonAccion from './BotonAccion.jsx';
import CampoFormulario from './CampoFormulario.jsx';
import CamposNuevaContrasena from './CamposNuevaContrasena.jsx';

const { limitesCampos, recuperacion } = PARAMETROS;

/**
 * Paso 2 de la recuperación (presentación): código, contraseña nueva y su confirmación. El estado y el envío los maneja
 * `hooks/useRecuperacionContrasena.js`. `error` es el `ErrorApi` del último envío (o del último reenvío del código),
 * `errores` los avisos de validación del propio formulario y `segundosDeEspera` lo que falta para poder reenviar.
 * `codigoPedido` indica si se llegó pidiendo un código (aviso neutro de envío) o con «Ya tengo un código» (recordatorio
 * de qué ingresar, sin afirmar que se envió algo).
 */
export default function FormularioRestablecerContrasena({
  codigoPedido,
  valores,
  errores = {},
  error,
  onCambiar,
  onEnviar,
  enviando,
  onReenviar,
  reenviando,
  segundosDeEspera,
  onCambiarCorreo,
}) {
  const campos = { ...(error?.campos ?? {}), ...errores };

  return (
    <Card body>
      <Alerta variante="info">
        {t(codigoPedido ? 'recuperar.avisoNeutro' : 'recuperar.avisoCodigoExistente', {
          digitos: recuperacion.codigoDigitos,
          minutos: recuperacion.vigenciaMinutos,
        })}
      </Alerta>
      <Form
        onSubmit={(evento) => {
          evento.preventDefault();
          onEnviar();
        }}
        noValidate
      >
        {error && (
          <Alerta variante="danger">
            {error.mensaje}
            {esCodigoRechazado(error) && ` ${t('recuperar.codigoRechazado')}`}
          </Alerta>
        )}
        <CampoFormulario
          id="recuperar-restablecer-email"
          etiqueta={t('recuperar.email')}
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="email"
          required
          maxLength={limitesCampos.email}
          className="mb-1"
          valor={valores.email}
          onCambiar={(valor) => onCambiar('email', valor)}
          error={campos.email}
        />
        <div className="mb-3">
          <Button variant="link" className="p-0" onClick={onCambiarCorreo}>{t('recuperar.cambiarCorreo')}</Button>
        </div>
        <CampoFormulario
          id="recuperar-codigo"
          etiqueta={t('recuperar.codigo')}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={recuperacion.codigoDigitos}
          className="mb-1 num"
          ayuda={t('recuperar.codigoAyuda', { digitos: recuperacion.codigoDigitos })}
          valor={valores.codigo}
          onCambiar={(valor) => onCambiar('codigo', valor)}
          onPaste={(evento) => {
            evento.preventDefault();
            onCambiar('codigo', evento.clipboardData.getData('text'));
          }}
          error={campos.codigo}
        />
        <div className="mb-3">
          <BotonAccion
            variant="link"
            className="p-0"
            cargando={reenviando}
            disabled={segundosDeEspera > 0}
            textoCargando={t('recuperar.enviando')}
            onClick={onReenviar}
          >
            {segundosDeEspera > 0 ? t('recuperar.reenviarEn', { segundos: segundosDeEspera }) : t('recuperar.reenviar')}
          </BotonAccion>
        </div>
        <CamposNuevaContrasena idBase="recuperar" valores={valores} errores={campos} onCambiar={onCambiar} className="mb-4" />
        <BotonAccion type="submit" className="w-100" cargando={enviando} textoCargando={t('recuperar.restableciendo')}>
          {t('recuperar.restablecer')}
        </BotonAccion>
      </Form>
    </Card>
  );
}

import { useLocation } from 'react-router-dom';
import BotonVolver from '../components/BotonVolver.jsx';
import Cargando from '../components/Cargando.jsx';
import EncabezadoPantalla from '../components/EncabezadoPantalla.jsx';
import FormularioRestablecerContrasena from '../components/FormularioRestablecerContrasena.jsx';
import FormularioSolicitarCodigo from '../components/FormularioSolicitarCodigo.jsx';
import { PARAMETROS } from '../config/parametros.js';
import useRecuperacionContrasena, { PASO } from '../hooks/useRecuperacionContrasena.js';
import useSesion from '../hooks/useSesion.js';
import { t } from '../i18n/index.js';

/**
 * Recuperación de la contraseña con un código enviado por correo, en dos pasos dentro de la misma pantalla. Es pública
 * y también se abre con la sesión iniciada (quien olvidó su contraseña actual): ahí arranca con el correo de su cuenta,
 * que puede editar. Quien llega del login trae el correo que ya escribió.
 */
export default function RecuperarContrasena() {
  const { usuario, autenticado, cargandoSesion } = useSesion();
  const ubicacion = useLocation();
  const flujo = useRecuperacionContrasena({
    emailInicial: ubicacion.state?.email ?? usuario?.email ?? '',
    autenticado,
  });

  if (cargandoSesion) return <Cargando variante="pantalla" />;

  const enPasoDos = flujo.paso === PASO.RESTABLECER;

  return (
    <div className="mx-auto" style={{ maxWidth: '32rem' }}>
      <EncabezadoPantalla
        titulo={t('recuperar.titulo')}
        descripcion={enPasoDos
          ? t('recuperar.descripcionPaso2')
          : t('recuperar.descripcionPaso1', { digitos: PARAMETROS.recuperacion.codigoDigitos })}
      />
      {enPasoDos ? (
        <FormularioRestablecerContrasena
          codigoPedido={flujo.codigoPedido}
          valores={flujo.valores}
          errores={flujo.errores}
          error={flujo.restablecimiento.error ?? flujo.solicitud.error}
          onCambiar={flujo.cambiar}
          onEnviar={flujo.restablecer}
          enviando={flujo.restablecimiento.enviando}
          onReenviar={flujo.pedirCodigo}
          reenviando={flujo.solicitud.enviando}
          segundosDeEspera={flujo.segundosDeEspera}
          onCambiarCorreo={flujo.cambiarCorreo}
        />
      ) : (
        <FormularioSolicitarCodigo
          email={flujo.valores.email}
          errores={flujo.errores}
          error={flujo.solicitud.error}
          onCambiar={flujo.cambiar}
          onEnviar={flujo.pedirCodigo}
          enviando={flujo.solicitud.enviando}
          onYaTengoCodigo={flujo.yaTengoCodigo}
        />
      )}
      <div className="mt-3">
        <BotonVolver destino={autenticado ? '/perfil' : '/login'}>
          {autenticado ? t('recuperar.volverPerfil') : t('recuperar.volverLogin')}
        </BotonVolver>
      </div>
    </div>
  );
}

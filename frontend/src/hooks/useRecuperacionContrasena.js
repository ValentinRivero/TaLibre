import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PARAMETROS } from '../config/parametros.js';
import { t } from '../i18n/index.js';
import { cerrarSesionLocal, restablecerContrasena, solicitarCodigoRecuperacion } from '../services/authService.js';
import { esCodigoRechazado, normalizarCodigo } from '../utils/recuperacion.js';
import { validarRecuperar, validarRestablecer } from '../utils/validacionesCuenta.js';
import useCuentaRegresiva from './useCuentaRegresiva.js';
import useEnvio from './useEnvio.js';

export const PASO = Object.freeze({ SOLICITAR: 1, RESTABLECER: 2 });

const VACIO = Object.freeze({ codigo: '', nueva_contrasena: '', confirmar_contrasena: '' });

/**
 * Recuperación de la contraseña en dos pasos (pedir el código y usarlo). `emailInicial` es el correo con el que arranca
 * el formulario (el de la sesión abierta o el que se escribió en el login); mientras la persona no lo edite, sigue a
 * ese valor. Al terminar bien, si había sesión se limpia en el cliente (el servidor ya revocó los refresh tokens) y se
 * va al login con el aviso.
 */
export default function useRecuperacionContrasena({ emailInicial, autenticado }) {
  const navegar = useNavigate();
  const [paso, setPaso] = useState(PASO.SOLICITAR);
  // Cómo se llegó al paso 2: pidiendo un código (se avisa que se envió) o con «Ya tengo un código» (no se afirma nada).
  const [codigoPedido, setCodigoPedido] = useState(false);
  const [emailEscrito, setEmailEscrito] = useState(null);
  const [resto, setResto] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const solicitud = useEnvio();
  const restablecimiento = useEnvio();
  const espera = useCuentaRegresiva();

  const valores = { email: emailEscrito ?? emailInicial, ...resto };

  const cambiar = (campo, valor) => {
    if (campo === 'email') setEmailEscrito(valor);
    else setResto((actuales) => ({ ...actuales, [campo]: campo === 'codigo' ? normalizarCodigo(valor) : valor }));
    setErrores(({ [campo]: _corregido, ...otros }) => otros);
    restablecimiento.limpiar();
  };

  const pedirCodigo = async () => {
    const invalidos = validarRecuperar(valores);
    setErrores(invalidos);
    if (Object.keys(invalidos).length > 0) return;
    restablecimiento.limpiar();
    const { ok } = await solicitud.enviar(() => solicitarCodigoRecuperacion(valores.email.trim()));
    if (!ok) return;
    setResto((actuales) => ({ ...actuales, codigo: '' }));
    espera.iniciar(PARAMETROS.recuperacion.enfriamientoSegundos);
    setCodigoPedido(true);
    setPaso(PASO.RESTABLECER);
  };

  const restablecer = async () => {
    const invalidos = validarRestablecer(valores);
    setErrores(invalidos);
    if (Object.keys(invalidos).length > 0) return;
    solicitud.limpiar();
    const { ok, error } = await restablecimiento.enviar(() => restablecerContrasena({
      email: valores.email.trim(),
      codigo: valores.codigo,
      nueva_contrasena: valores.nueva_contrasena,
    }));
    if (ok) {
      if (autenticado) cerrarSesionLocal();
      navegar('/login', { replace: true, state: { aviso: t('recuperar.exito') } });
    } else if (esCodigoRechazado(error)) {
      // Un código inválido o vencido ya no sirve: se vacía el campo. Una contraseña débil, en cambio, lo conserva.
      setResto((actuales) => ({ ...actuales, codigo: '' }));
    }
  };

  const irAPaso = (nuevoPaso) => {
    solicitud.limpiar();
    restablecimiento.limpiar();
    setErrores({});
    setPaso(nuevoPaso);
  };

  return {
    paso,
    codigoPedido,
    valores,
    errores,
    cambiar,
    pedirCodigo,
    restablecer,
    yaTengoCodigo: () => {
      setCodigoPedido(false);
      irAPaso(PASO.RESTABLECER);
    },
    cambiarCorreo: () => irAPaso(PASO.SOLICITAR),
    solicitud,
    restablecimiento,
    segundosDeEspera: espera.restantes,
  };
}

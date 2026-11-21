import { useState } from 'react';
import { t } from '../i18n/index.js';
import { cambiarContrasena } from '../services/authService.js';
import { validarCambioContrasena } from '../utils/validacionesCuenta.js';
import useEnvio from './useEnvio.js';

const VACIO = Object.freeze({ contrasena_actual: '', nueva_contrasena: '', confirmar_contrasena: '' });

/**
 * Cambio de contraseña desde el perfil. El servidor cierra todas las sesiones, así que al terminar bien `alExito`
 * lleva al login (el estado local de la sesión ya quedó limpio). Los errores del servidor por campo (contraseña actual
 * incorrecta, contraseña débil) conservan lo escrito.
 */
export default function useCambiarContrasena({ alExito }) {
  const [valores, setValores] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const envio = useEnvio();

  const cambiar = (campo, valor) => {
    setValores((actuales) => ({ ...actuales, [campo]: valor }));
    setErrores(({ [campo]: _corregido, ...resto }) => resto);
    envio.limpiar();
  };

  const enviar = async (evento) => {
    evento.preventDefault();
    const invalidos = validarCambioContrasena(valores);
    setErrores(invalidos);
    if (Object.keys(invalidos).length > 0) return;
    const { ok } = await envio.enviar(() => cambiarContrasena(
      { contrasena_actual: valores.contrasena_actual, nueva_contrasena: valores.nueva_contrasena },
      { aviso: t('perfil.contrasenaCambiada') },
    ));
    if (ok) alExito();
  };

  return { valores, errores, error: envio.error, enviando: envio.enviando, cambiar, enviar };
}

import { PARAMETROS } from '../config/parametros.js';

const { codigoDigitos } = PARAMETROS.recuperacion;

/**
 * Deja solo los dígitos del código y recorta a su largo: al pegar el código como llegó por correo ("123 456", con
 * espacios o saltos de línea) el campo lo acepta limpio.
 */
export const normalizarCodigo = (valor) => String(valor ?? '').replace(/\D/g, '').slice(0, codigoDigitos);

/** Segundos que faltan para `hasta` (marca de tiempo en ms), redondeados hacia arriba y nunca negativos. */
export const segundosRestantes = (hasta, ahora) => Math.max(0, Math.ceil((hasta - ahora) / 1000));

/**
 * Si el servidor rechazó el código (inválido, vencido, usado o bloqueado): un 400 sin errores por campo. Con errores
 * por campo (contraseña débil, formato) el código sigue siendo válido y no hay que pedir otro.
 */
export const esCodigoRechazado = (error) => error?.status === 400 && Object.keys(error.campos ?? {}).length === 0;

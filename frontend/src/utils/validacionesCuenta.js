import { PARAMETROS } from '../config/parametros.js';
import { t } from '../i18n/index.js';

const { limitesCampos, cuenta, password: reglasPassword, recuperacion } = PARAMETROS;

// Espejo de las reglas de Django (core/serializers.py y core/serializers_auth.py): el backend es quien las hace cumplir
// y este módulo solo da el aviso inmediato en el formulario.
const escapar = (texto) => texto.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');

const PATRON_NOMBRE = /^[\p{L} '’.-]+$/u;
const ATOMO_EMAIL = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+";
const ETIQUETA_DOMINIO = '[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?';
const PATRON_EMAIL = new RegExp(`^${ATOMO_EMAIL}(?:\\.${ATOMO_EMAIL})*@${ETIQUETA_DOMINIO}(?:\\.${ETIQUETA_DOMINIO})+$`);
const PATRON_PASSWORD = new RegExp(`^[A-Za-z0-9${escapar(cuenta.passwordSimbolos)}]+$`);
const PATRON_TELEFONO = new RegExp(`^\\+?[0-9\\s()-]{6,${limitesCampos.telefono}}$`);

const obligatorio = () => t('validacion.obligatorio');

/** Nombre de persona: solo letras de cualquier idioma, espacios, apóstrofes, guiones y puntos; empieza con una letra. */
export const validarNombre = (valor) => {
  const nombre = valor.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (nombre === '') return obligatorio();
  const letras = [...nombre].filter((caracter) => /\p{L}/u.test(caracter)).length;
  const valido = letras >= cuenta.nombreLargoMinimo
    && nombre.length <= limitesCampos.nombre
    && /^\p{L}/u.test(nombre)
    && PATRON_NOMBRE.test(nombre);
  return valido ? null : t('validacion.nombre', { minimo: cuenta.nombreLargoMinimo, maximo: limitesCampos.nombre });
};

/** Correo con formato válido (sin emojis ni espacios), dominio con punto y largo entre el mínimo y el máximo. */
export const validarEmail = (valor) => {
  const email = valor.trim();
  if (email === '') return obligatorio();
  const valido = email.length >= cuenta.emailLargoMinimo && email.length <= limitesCampos.email && PATRON_EMAIL.test(email);
  return valido ? null : t('validacion.email');
};

/** Teléfono opcional: vacío es válido; si se completa, solo números, espacios, guiones, paréntesis y un + inicial. */
export const validarTelefono = (valor) => {
  const telefono = valor.trim();
  return telefono === '' || PATRON_TELEFONO.test(telefono) ? null : t('validacion.telefono');
};

/** Contraseña nueva: letras ASCII, números y los símbolos permitidos, entre el largo mínimo y el máximo. */
export const validarPassword = (valor) => {
  if (valor === '') return obligatorio();
  if (!PATRON_PASSWORD.test(valor)) return t('validacion.passwordCaracteres', { simbolos: cuenta.passwordSimbolos });
  if (valor.length < reglasPassword.largoMinimo || valor.length > limitesCampos.password) {
    return t('validacion.passwordLargo', { minimo: reglasPassword.largoMinimo, maximo: limitesCampos.password });
  }
  return null;
};

const sinValidos = (errores) => Object.fromEntries(Object.entries(errores).filter(([, mensaje]) => mensaje !== null));

/** Errores por campo del formulario de registro (`{}` si todo es válido). */
export const validarRegistro = (valores) => sinValidos({
  nombre_completo: validarNombre(valores.nombre_completo),
  email: validarEmail(valores.email),
  telefono: validarTelefono(valores.telefono),
  password: validarPassword(valores.password),
});

/**
 * Errores por campo del inicio de sesión. La contraseña solo se controla vacía o demasiado larga: las reglas de
 * caracteres rigen al elegirla y no deben dejar afuera a una cuenta creada antes.
 */
export const validarLogin = (valores) => {
  let password = null;
  if (valores.password === '') password = obligatorio();
  else if (valores.password.length > limitesCampos.password) {
    password = t('validacion.passwordLargo', { minimo: reglasPassword.largoMinimo, maximo: limitesCampos.password });
  }
  return sinValidos({ email: validarEmail(valores.email), password });
};

/** Código de verificación: exactamente los dígitos que define `PARAMETROS.recuperacion` (ya sin espacios ni letras). */
export const validarCodigo = (valor) => {
  if (valor === '') return obligatorio();
  return new RegExp(`^[0-9]{${recuperacion.codigoDigitos}}$`).test(valor)
    ? null
    : t('validacion.codigo', { digitos: recuperacion.codigoDigitos });
};

/** La confirmación tiene que repetir exactamente la contraseña nueva. Solo se valida acá: nunca viaja al servidor. */
export const validarConfirmacion = (nueva, confirmar) => {
  if (confirmar === '') return obligatorio();
  return nueva === confirmar ? null : t('validacion.passwordNoCoincide');
};

/**
 * Contraseña nueva: las reglas de `validarPassword` y, si se conoce la actual, que sea distinta. La fortaleza de fondo
 * (claves comunes o parecidas a los datos de la cuenta) la valida el servidor y su mensaje se muestra tal cual.
 */
export const validarNuevaContrasena = (nueva, actual = null) => {
  const error = validarPassword(nueva);
  if (error) return error;
  return actual !== null && nueva === actual ? t('validacion.passwordIgualActual') : null;
};

/** Qué cumple hoy la contraseña nueva, para la lista de requisitos que se ve mientras se escribe. */
export const requisitosPassword = (nueva, confirmar) => {
  const largoValido = nueva.length >= reglasPassword.largoMinimo && nueva.length <= limitesCampos.password;
  return [
    {
      clave: 'largo',
      cumple: largoValido,
      texto: t('contrasena.requisitoLargo', { minimo: reglasPassword.largoMinimo, maximo: limitesCampos.password }),
    },
    {
      clave: 'caracteres',
      cumple: nueva !== '' && PATRON_PASSWORD.test(nueva),
      texto: t('contrasena.requisitoCaracteres', { simbolos: cuenta.passwordSimbolos }),
    },
    { clave: 'coincide', cumple: nueva !== '' && nueva === confirmar, texto: t('contrasena.requisitoCoincide') },
  ];
};

/** Errores por campo del pedido de código (`{}` si todo es válido). */
export const validarRecuperar = (valores) => sinValidos({ email: validarEmail(valores.email) });

/** Errores por campo del restablecimiento con código. */
export const validarRestablecer = (valores) => sinValidos({
  email: validarEmail(valores.email),
  codigo: validarCodigo(valores.codigo),
  nueva_contrasena: validarNuevaContrasena(valores.nueva_contrasena),
  confirmar_contrasena: validarConfirmacion(valores.nueva_contrasena, valores.confirmar_contrasena),
});

/**
 * Errores por campo del cambio de contraseña con sesión. La actual solo se controla vacía o demasiado larga, como en el
 * inicio de sesión: quien la tiene fue creada con reglas anteriores.
 */
export const validarCambioContrasena = (valores) => {
  let contrasena_actual = null;
  if (valores.contrasena_actual === '') contrasena_actual = obligatorio();
  else if (valores.contrasena_actual.length > limitesCampos.password) {
    contrasena_actual = t('validacion.passwordLargo', { minimo: reglasPassword.largoMinimo, maximo: limitesCampos.password });
  }
  return sinValidos({
    contrasena_actual,
    nueva_contrasena: validarNuevaContrasena(valores.nueva_contrasena, valores.contrasena_actual),
    confirmar_contrasena: validarConfirmacion(valores.nueva_contrasena, valores.confirmar_contrasena),
  });
};

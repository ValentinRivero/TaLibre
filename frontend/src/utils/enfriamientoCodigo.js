import { PARAMETROS } from '../config/parametros.js';

const { claveEnfriamiento } = PARAMETROS.recuperacion;

const SAL = 'talibre:enfriamiento:';
const CLAVE_DE_PRUEBA = `${claveEnfriamiento}.prueba`;

// Respaldo cuando el navegador no ofrece `sessionStorage` (o lo bloquea): el enfriamiento dura lo que dura la página.
const memoria = new Map();
const almacenEnMemoria = {
  getItem: (clave) => memoria.get(clave) ?? null,
  setItem: (clave, valor) => memoria.set(clave, String(valor)),
  removeItem: (clave) => memoria.delete(clave),
};

/** `sessionStorage` si funciona (existe y deja escribir); si no, un almacén en memoria con la misma interfaz. */
export const almacenDeSesion = () => {
  try {
    const almacen = globalThis.sessionStorage;
    almacen.setItem(CLAVE_DE_PRUEBA, '1');
    almacen.removeItem(CLAVE_DE_PRUEBA);
    return almacen;
  } catch {
    return almacenEnMemoria;
  }
};

/**
 * Huella del correo normalizado (minúsculas y sin espacios en los extremos), o `null` si está vacío. Es un hash
 * síncrono de 53 bits (cyrb53) con una sal propia: no es criptográfico, pero evita dejar el correo legible en el
 * navegador, que es lo que se busca. Dos correos distintos dan huellas distintas con probabilidad prácticamente total.
 */
export const huellaDeCorreo = (email) => {
  const texto = String(email ?? '').trim().toLowerCase();
  if (texto === '') return null;
  const entrada = `${SAL}${texto}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let indice = 0; indice < entrada.length; indice += 1) {
    const codigo = entrada.charCodeAt(indice);
    h1 = Math.imul(h1 ^ codigo, 2654435761);
    h2 = Math.imul(h2 ^ codigo, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

// Mapa `huella -> instante de fin (ms)` con solo las entradas que todavía no vencieron: lo vencido o corrupto se descarta.
const leerVigentes = (almacen, ahora) => {
  try {
    const guardado = JSON.parse(almacen.getItem(claveEnfriamiento) ?? '{}');
    if (guardado === null || typeof guardado !== 'object' || Array.isArray(guardado)) return {};
    return Object.fromEntries(Object.entries(guardado).filter(([, fin]) => Number.isFinite(fin) && fin > ahora));
  } catch {
    return {};
  }
};

const escribir = (almacen, vigentes) => {
  try {
    if (Object.keys(vigentes).length === 0) almacen.removeItem(claveEnfriamiento);
    else almacen.setItem(claveEnfriamiento, JSON.stringify(vigentes));
  } catch {
    // Sin dónde guardar, el enfriamiento solo rige mientras la pantalla siga abierta.
  }
};

/** Estado del enfriamiento del correo: `fin` (instante en ms, o `0` si no tiene uno vigente) y `ahora`, la hora de la lectura. */
export const consultarEnfriamiento = (email, { almacen = almacenDeSesion(), ahora = Date.now() } = {}) => {
  const huella = huellaDeCorreo(email);
  return { fin: huella ? (leerVigentes(almacen, ahora)[huella] ?? 0) : 0, ahora };
};

/** Instante (ms) en que vence el enfriamiento del correo, o `0` si no tiene uno vigente. */
export const finDeEnfriamiento = (email, opciones) => consultarEnfriamiento(email, opciones).fin;

/** Registra que se pidió un código para el correo: no se puede pedir otro hasta pasados `segundos`. */
export const iniciarEnfriamiento = (
  email,
  segundos = PARAMETROS.recuperacion.enfriamientoSegundos,
  { almacen = almacenDeSesion(), ahora = Date.now() } = {},
) => {
  const huella = huellaDeCorreo(email);
  if (!huella) return 0;
  const fin = ahora + segundos * 1000;
  escribir(almacen, { ...leerVigentes(almacen, ahora), [huella]: fin });
  return fin;
};

/** Quita el enfriamiento del correo (por ejemplo, al restablecer la contraseña) y limpia de paso lo vencido. */
export const borrarEnfriamiento = (email, { almacen = almacenDeSesion(), ahora = Date.now() } = {}) => {
  const { [huellaDeCorreo(email)]: _borrado, ...restantes } = leerVigentes(almacen, ahora);
  escribir(almacen, restantes);
};

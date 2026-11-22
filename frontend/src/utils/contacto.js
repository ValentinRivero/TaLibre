import { PARAMETROS } from '../config/parametros.js';

/** Enlace `mailto:` al correo de contacto de TaLibre, con el asunto codificado para que la consulta llegue identificada. */
export const enlaceCorreoContacto = (asunto) =>
  `mailto:${PARAMETROS.politica.contacto}?subject=${encodeURIComponent(asunto)}`;

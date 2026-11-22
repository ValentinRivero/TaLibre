import { obtenerParametros } from '../config/parametros.js';
import { crearEspecificacion } from '../docs/openapi.js';
import { rutaNoEncontrada } from '../middlewares/errores.middleware.js';

/** La documentación se puede apagar por entorno (API_DOCS_HABILITADA): apagada, sus rutas responden 404. */
export const exigirDocumentacionHabilitada = (req, res, next) => {
  if (!obtenerParametros().docsHabilitada) return rutaNoEncontrada(req, res);
  return next();
};

export const obtenerEspecificacion = (req, res) => {
  res.json(crearEspecificacion());
};

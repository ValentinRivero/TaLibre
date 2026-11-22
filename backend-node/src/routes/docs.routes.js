import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import { exigirDocumentacionHabilitada, obtenerEspecificacion } from '../controllers/docs.controller.js';

// La interfaz pide la especificación a la ruta de al lado: no queda embebida en el HTML ni en el JavaScript, así
// siempre refleja los parámetros vigentes. Los archivos de Swagger UI se sirven desde este servicio, sin CDN.
const OPCIONES_UI = {
  customSiteTitle: 'TaLibre API de actividad y notificaciones',
  // Sin validador externo: Swagger UI no le envía la dirección del esquema a un servicio de terceros.
  swaggerOptions: { url: './openapi.json', validatorUrl: null },
};

const router = Router();

router.use(exigirDocumentacionHabilitada);
router.get('/openapi.json', obtenerEspecificacion);
router.use('/', swaggerUi.serveFiles(null, OPCIONES_UI));
router.get('/', swaggerUi.setup(null, OPCIONES_UI));

export default router;

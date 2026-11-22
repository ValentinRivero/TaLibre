import { Link } from 'react-router-dom';
import { PARAMETROS } from '../config/parametros.js';
import { t, tLista } from '../i18n/index.js';
import { enlaceCorreoContacto } from '../utils/contacto.js';
import { formatearFechaLarga } from '../utils/formatos.js';
import Alerta from './Alerta.jsx';
import SeccionPolitica from './SeccionPolitica.jsx';

const { contacto, version, vigenteDesde } = PARAMETROS.politica;

// Orden de las secciones numeradas: el texto de cada una vive en `terminos.secciones.<clave>` del diccionario.
const SECCIONES = [
  'objeto', 'demostracion', 'pagos', 'responsabilidad', 'cuentas', 'propiedad', 'datos', 'modificaciones', 'ley', 'contacto',
];

function Complemento({ seccion }) {
  if (seccion === 'datos') {
    return <p><Link to="/privacidad">{t('terminos.leerPrivacidad')}</Link></p>;
  }
  if (seccion === 'contacto') {
    return <p><a href={enlaceCorreoContacto(t('terminos.asuntoContacto'))}>{contacto}</a></p>;
  }
  return null;
}

/**
 * Términos y condiciones de uso: naturaleza de demostración del sitio, limitación de responsabilidad, conducta del
 * usuario y marco normativo. Comparten versión con la política de privacidad y se aceptan juntos.
 */
export default function TerminosCondiciones() {
  return (
    <article className="mx-auto" style={{ maxWidth: '52rem' }}>
      <h1 className="h2">{t('terminos.titulo')}</h1>
      <p className="text-secondary">
        {t('terminos.version', { version, fecha: formatearFechaLarga(vigenteDesde) })}
      </p>
      <Alerta variante="warning" titulo={t('terminos.advertenciaTitulo')}>
        <p className="mb-0">{t('terminos.advertencia')}</p>
      </Alerta>
      <p>{t('terminos.introduccion')}</p>

      {SECCIONES.map((seccion) => (
        <SeccionPolitica key={seccion} titulo={t(`terminos.secciones.${seccion}.titulo`)}>
          {tLista(`terminos.secciones.${seccion}.parrafos`).map((parrafo) => <p key={parrafo}>{parrafo}</p>)}
          <Complemento seccion={seccion} />
        </SeccionPolitica>
      ))}
    </article>
  );
}

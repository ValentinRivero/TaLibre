import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PARAMETROS } from '../config/parametros.js';
import useSesion from '../hooks/useSesion.js';
import { t } from '../i18n/index.js';
import { actualizarPerfil, logout } from '../services/authService.js';
import Alerta from './Alerta.jsx';
import BotonAccion from './BotonAccion.jsx';

const { rutasSinAceptacion } = PARAMETROS.politica;

/**
 * Diálogo bloqueante para el usuario autenticado que debe aceptar una versión nueva de la política de privacidad.
 * Puede leerla, aceptarla (`PATCH /api/perfil/`), cerrar la sesión o ir a solicitar la baja de la cuenta.
 */
export default function AceptarPolitica() {
  const { autenticado, debeAceptarPolitica } = useSesion();
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const [error, setError] = useState(null);

  if (!autenticado || !debeAceptarPolitica || rutasSinAceptacion.includes(pathname)) return null;

  const aceptar = async () => {
    setError(null);
    try {
      await actualizarPerfil({ acepta_politica_privacidad: true });
    } catch (falla) {
      setError(falla.mensaje);
    }
  };

  const cerrarSesion = async () => {
    await logout();
    navegar('/', { replace: true });
  };

  return (
    <Modal show centered backdrop="static" keyboard={false}>
      <Modal.Header>
        <Modal.Title as="h2" className="h4">{t('politica.titulo')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>{t('politica.descripcion', { version: PARAMETROS.politica.version })}</p>
        <ul className="list-unstyled mb-2">
          <li className="mb-1"><Link to="/terminos">{t('politica.leerTerminos')}</Link></li>
          <li><Link to="/privacidad">{t('politica.leer')}</Link></li>
        </ul>
        <p className="small text-secondary mb-0">
          {t('politica.baja')} <Link to="/perfil">{t('politica.solicitarBaja')}</Link>
        </p>
        {error && <Alerta variante="danger" className="mt-3 mb-0">{error}</Alerta>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={cerrarSesion}>{t('politica.cerrarSesion')}</Button>
        <BotonAccion onClick={aceptar} textoCargando={t('politica.aceptando')}>{t('politica.aceptar')}</BotonAccion>
      </Modal.Footer>
    </Modal>
  );
}

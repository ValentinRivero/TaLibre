import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import { t } from '../i18n/index.js';
import Icono from './Icono.jsx';

/**
 * Campo de contraseña con botón para verla u ocultarla. Misma interfaz que `CampoFormulario` (`onCambiar` recibe el
 * valor; el resto de las propiedades pasan al control). `children` se muestra debajo del campo, por ejemplo el enlace
 * para recuperar la contraseña.
 */
export default function CampoPassword({ id, etiqueta, valor, onCambiar, error, ayuda, className = 'mb-3', children, ...control }) {
  const [visible, setVisible] = useState(false);
  const accion = visible ? t('comun.ocultarPassword') : t('comun.mostrarPassword');

  return (
    <Form.Group className={className} controlId={id}>
      <Form.Label>{etiqueta}</Form.Label>
      <InputGroup hasValidation>
        <Form.Control
          type={visible ? 'text' : 'password'}
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby={ayuda ? `${id}-ayuda` : undefined}
          value={valor}
          onChange={(evento) => onCambiar(evento.target.value)}
          isInvalid={Boolean(error)}
          {...control}
        />
        <Button
          variant="outline-secondary"
          className="boton-ver-password"
          aria-label={accion}
          aria-pressed={visible}
          title={accion}
          onClick={() => setVisible((actual) => !actual)}
        >
          <Icono nombre={visible ? 'ojoTachado' : 'ojo'} tamano={18} />
        </Button>
        <Form.Control.Feedback type="invalid">{error}</Form.Control.Feedback>
      </InputGroup>
      {ayuda && <Form.Text id={`${id}-ayuda`} muted>{ayuda}</Form.Text>}
      {children}
    </Form.Group>
  );
}

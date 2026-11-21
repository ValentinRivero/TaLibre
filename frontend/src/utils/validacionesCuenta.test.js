import { describe, expect, test } from 'vitest';
import { PARAMETROS } from '../config/parametros.js';
import {
  requisitosPassword,
  validarCambioContrasena,
  validarCodigo,
  validarConfirmacion,
  validarEmail,
  validarLogin,
  validarNombre,
  validarNuevaContrasena,
  validarPassword,
  validarRecuperar,
  validarRegistro,
  validarRestablecer,
  validarTelefono,
} from './validacionesCuenta.js';

const { limitesCampos, cuenta } = PARAMETROS;

describe('validarNombre', () => {
  test.each([
    'María José Pérez', "Nicolás O'Brien", 'Ana-Lucía Gómez', 'Juan Pérez Jr.', 'Ñandú Ríos', 'Zoë Müller', '  Li   Wei ',
  ])('acepta %s', (nombre) => {
    expect(validarNombre(nombre)).toBeNull();
  });

  test('acepta un acento compuesto (letra más marca)', () => {
    expect(validarNombre('María José')).toBeNull();
  });

  test.each([
    ['con números', 'Fabricio 2'],
    ['con un emoji', 'Fabri\u{1F4A5}cio'],
    ['con una sola letra', 'A'],
    ['que empieza con un símbolo', '-Fabricio'],
    ['con guion bajo', 'Fabricio_Medina'],
    ['con &', 'Pérez & Hijos'],
    ['con arroba', 'fabricio@medina'],
    ['con paréntesis', 'Fabricio (Fabri)'],
  ])('rechaza un nombre %s', (_motivo, nombre) => {
    expect(validarNombre(nombre)).toContain('letras');
  });

  test('vacío o de solo espacios pide completar el campo', () => {
    expect(validarNombre('')).toBe('Completá este campo.');
    expect(validarNombre('   ')).toBe('Completá este campo.');
  });

  test('el largo máximo es el de la base', () => {
    expect(validarNombre('a'.repeat(limitesCampos.nombre))).toBeNull();
    expect(validarNombre('a'.repeat(limitesCampos.nombre + 1))).not.toBeNull();
  });
});

describe('validarEmail', () => {
  test.each(['a@b.co', 'fabricio.medina+reservas@talibre.test', 'FABRICIO@Talibre.Test', "o'brien@talibre.test"])(
    'acepta %s',
    (email) => {
      expect(validarEmail(email)).toBeNull();
    },
  );

  test.each([
    ['sin dominio completo', 'a@b'],
    ['demasiado corto', 'a@b.c'],
    ['sin arroba', 'fabricio.talibre.test'],
    ['sin usuario', '@talibre.test'],
    ['con espacios', 'fabricio medina@talibre.test'],
    ['con un emoji', 'fabricio\u{1F600}@talibre.test'],
    ['con puntos seguidos', 'fabricio..medina@talibre.test'],
    ['con punto al inicio', '.fabricio@talibre.test'],
    ['con dominio de puntos seguidos', 'fabricio@talibre..test'],
  ])('rechaza un correo %s', (_motivo, email) => {
    expect(validarEmail(email)).toContain('correo');
  });

  test('el largo máximo es el de la base', () => {
    const sufijo = '@talibre.test';
    expect(validarEmail('a'.repeat(limitesCampos.email - sufijo.length) + sufijo)).toBeNull();
    expect(validarEmail('a'.repeat(limitesCampos.email - sufijo.length + 1) + sufijo)).not.toBeNull();
  });

  test('el mínimo es el del espejo de Django', () => {
    expect(cuenta.emailLargoMinimo).toBe(6);
    expect(validarEmail('')).toBe('Completá este campo.');
  });
});

describe('validarTelefono', () => {
  test.each(['', '   ', '3777 000206', '+54 (3777) 00-0206'])('acepta %j', (telefono) => {
    expect(validarTelefono(telefono)).toBeNull();
  });

  test.each(['12345', 'abcdefgh', '3777 00020\u{1F600}', '37770002+06', '3777 000206'.padEnd(limitesCampos.telefono + 1, '1')])(
    'rechaza %j',
    (telefono) => {
      expect(validarTelefono(telefono)).toContain('teléfono');
    },
  );
});

describe('validarPassword', () => {
  test('acepta letras, números y todos los símbolos permitidos', () => {
    expect(validarPassword(`Pelota${cuenta.passwordSimbolos}9`)).toBeNull();
  });

  test.each([
    ['espacios', 'Pelota Arco 2026'],
    ['ñ', 'Contraseña2026'],
    ['tildes', 'Clavé-Segura1'],
    ['un emoji', 'ClaveSegura\u{1F600}'],
    ['barra vertical', 'Pelota|Arco2026'],
    ['comillas', 'Pelota"Arco2026'],
    ['una tabulación', 'Pelota\tArco2026'],
  ])('rechaza una contraseña con %s e indica los símbolos permitidos', (_motivo, password) => {
    const mensaje = validarPassword(password);
    expect(mensaje).toContain(cuenta.passwordSimbolos);
    expect(mensaje).toContain('sin espacios');
  });

  test('exige el largo mínimo y respeta el máximo', () => {
    expect(validarPassword('Ab1!')).toContain('entre 8 y 128');
    expect(validarPassword('Ab1!'.repeat(33))).toContain('entre 8 y 128');
    expect(validarPassword('Ab1!'.repeat(32))).toBeNull();
  });

  test('vacía pide completar el campo', () => {
    expect(validarPassword('')).toBe('Completá este campo.');
  });
});

describe('validarRegistro', () => {
  const valido = { nombre_completo: 'Fabricio Medina', email: 'fabricio@talibre.test', telefono: '', password: 'Pelota&Arco#2026' };

  test('sin errores devuelve un objeto vacío', () => {
    expect(validarRegistro(valido)).toEqual({});
  });

  test('indica cada campo inválido por separado', () => {
    const errores = validarRegistro({ nombre_completo: 'Fab 1', email: 'x', telefono: 'abc', password: 'corta' });

    expect(Object.keys(errores).sort()).toEqual(['email', 'nombre_completo', 'password', 'telefono']);
  });
});

describe('validarLogin', () => {
  test('una contraseña anterior a las reglas de caracteres sigue siendo válida para ingresar', () => {
    expect(validarLogin({ email: 'jugador@talibre.test', password: 'Contraseña con espacios 1' })).toEqual({});
  });

  test('pide correo y contraseña vacíos y rechaza un correo mal formado', () => {
    expect(validarLogin({ email: '', password: '' })).toEqual({
      email: 'Completá este campo.',
      password: 'Completá este campo.',
    });
    expect(Object.keys(validarLogin({ email: 'jugador', password: 'x' }))).toEqual(['email']);
  });

  test('rechaza una contraseña de más del largo máximo', () => {
    const errores = validarLogin({ email: 'jugador@talibre.test', password: 'a'.repeat(limitesCampos.password + 1) });

    expect(Object.keys(errores)).toEqual(['password']);
  });
});

describe('validarCodigo', () => {
  test('acepta exactamente seis dígitos, también con ceros a la izquierda', () => {
    expect(validarCodigo('123456')).toBeNull();
    expect(validarCodigo('000042')).toBeNull();
  });

  test.each(['12345', '1234567', '12345a', '12 345', '１２３４５６'])('rechaza "%s"', (codigo) => {
    expect(validarCodigo(codigo)).toBe('Ingresá el código de 6 dígitos que te enviamos por correo.');
  });

  test('vacío pide completar el campo', () => {
    expect(validarCodigo('')).toBe('Completá este campo.');
  });
});

describe('validarConfirmacion', () => {
  test('coincide solo si es idéntica, sin recortar espacios', () => {
    expect(validarConfirmacion('ClaveNueva#1', 'ClaveNueva#1')).toBeNull();
    expect(validarConfirmacion('ClaveNueva#1', 'clavenueva#1')).toBe('Las contraseñas no coinciden.');
    expect(validarConfirmacion('ClaveNueva#1', 'ClaveNueva#1 ')).toBe('Las contraseñas no coinciden.');
  });

  test('vacía pide completar el campo', () => {
    expect(validarConfirmacion('ClaveNueva#1', '')).toBe('Completá este campo.');
  });
});

describe('validarNuevaContrasena', () => {
  test('aplica las reglas de la contraseña', () => {
    expect(validarNuevaContrasena('ClaveNueva#1')).toBeNull();
    expect(validarNuevaContrasena('corta1')).toContain('entre 8 y 128');
    expect(validarNuevaContrasena('Con espacio 1')).toContain('letras sin tildes');
  });

  test('con la actual conocida, rechaza repetirla', () => {
    expect(validarNuevaContrasena('ClaveNueva#1', 'ClaveNueva#1')).toBe('La nueva contraseña tiene que ser distinta de la actual.');
    expect(validarNuevaContrasena('ClaveNueva#2', 'ClaveNueva#1')).toBeNull();
  });

  test('sin la actual (restablecimiento con código) no compara', () => {
    expect(validarNuevaContrasena('ClaveNueva#1', null)).toBeNull();
  });
});

describe('requisitosPassword', () => {
  const cumplidos = (nueva, confirmar) => Object.fromEntries(requisitosPassword(nueva, confirmar).map((r) => [r.clave, r.cumple]));

  test('todos pendientes con los campos vacíos', () => {
    expect(cumplidos('', '')).toEqual({ largo: false, caracteres: false, coincide: false });
  });

  test('cada requisito se evalúa por separado', () => {
    expect(cumplidos('Corta1', '')).toEqual({ largo: false, caracteres: true, coincide: false });
    expect(cumplidos('Con espacio 1', 'Con espacio 1')).toEqual({ largo: true, caracteres: false, coincide: true });
    expect(cumplidos('ClaveNueva#1', 'ClaveNueva#2')).toEqual({ largo: true, caracteres: true, coincide: false });
    expect(cumplidos('ClaveNueva#1', 'ClaveNueva#1')).toEqual({ largo: true, caracteres: true, coincide: true });
  });

  test('cada requisito trae su texto y el largo respeta el máximo', () => {
    expect(requisitosPassword('', '').every((r) => r.texto.length > 0)).toBe(true);
    expect(cumplidos('a'.repeat(limitesCampos.password + 1), '').largo).toBe(false);
    expect(cumplidos('a'.repeat(limitesCampos.password), '').largo).toBe(true);
  });
});

describe('validarRecuperar', () => {
  test('exige un correo válido', () => {
    expect(validarRecuperar({ email: 'jugador@example.com' })).toEqual({});
    expect(validarRecuperar({ email: '' })).toEqual({ email: 'Completá este campo.' });
    expect(Object.keys(validarRecuperar({ email: 'sin-arroba' }))).toEqual(['email']);
  });
});

describe('validarRestablecer', () => {
  const validos = {
    email: 'jugador@example.com', codigo: '123456', nueva_contrasena: 'ClaveNueva#1', confirmar_contrasena: 'ClaveNueva#1',
  };

  test('sin errores cuando todo es válido', () => {
    expect(validarRestablecer(validos)).toEqual({});
  });

  test('marca cada campo inválido', () => {
    const errores = validarRestablecer({ email: '', codigo: '12', nueva_contrasena: 'corta', confirmar_contrasena: 'otra' });

    expect(Object.keys(errores).sort()).toEqual(['codigo', 'confirmar_contrasena', 'email', 'nueva_contrasena']);
  });

  test('la confirmación distinta es el único error', () => {
    expect(Object.keys(validarRestablecer({ ...validos, confirmar_contrasena: 'ClaveNueva#2' }))).toEqual(['confirmar_contrasena']);
  });
});

describe('validarCambioContrasena', () => {
  const validos = { contrasena_actual: 'ClaveVieja#1', nueva_contrasena: 'ClaveNueva#1', confirmar_contrasena: 'ClaveNueva#1' };

  test('sin errores cuando todo es válido', () => {
    expect(validarCambioContrasena(validos)).toEqual({});
  });

  test('la contraseña actual solo se controla vacía o demasiado larga', () => {
    expect(validarCambioContrasena({ ...validos, contrasena_actual: '' })).toEqual({ contrasena_actual: 'Completá este campo.' });
    expect(validarCambioContrasena({ ...validos, contrasena_actual: 'con espacio é' })).toEqual({});
    expect(Object.keys(validarCambioContrasena({ ...validos, contrasena_actual: 'x'.repeat(limitesCampos.password + 1) }))).toEqual(['contrasena_actual']);
  });

  test('la nueva igual a la actual se rechaza', () => {
    const errores = validarCambioContrasena({ contrasena_actual: 'ClaveVieja#1', nueva_contrasena: 'ClaveVieja#1', confirmar_contrasena: 'ClaveVieja#1' });

    expect(errores).toEqual({ nueva_contrasena: 'La nueva contraseña tiene que ser distinta de la actual.' });
  });

  test('la confirmación distinta se rechaza', () => {
    expect(Object.keys(validarCambioContrasena({ ...validos, confirmar_contrasena: 'x' }))).toEqual(['confirmar_contrasena']);
  });
});

/**
 * newsletter-integration.test.js
 * Suite de verificación para la integración oficial de MailerLite y el sistema de boletín.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const MAILERLITE_TARGET_URL = 'https://landing.mailerlite.com/webforms/landing/v8m8p9';

test('1. Validación de URL oficial de suscripción MailerLite', () => {
  const url = new URL(MAILERLITE_TARGET_URL);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'landing.mailerlite.com');
  assert.equal(url.pathname, '/webforms/landing/v8m8p9');
});

test('2. Validación de expresiones de correo electrónico para suscripción rápida', () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  // Válidos
  assert.ok(emailRegex.test('aprendizajes.med@udea.edu.co'));
  assert.ok(emailRegex.test('medico.residente@hospital.org'));
  assert.ok(emailRegex.test('usuario@gmail.com'));
  assert.ok(emailRegex.test('estudiante.med@alumnos.udea.edu.co'));

  // Inválidos
  assert.ok(!emailRegex.test(''));
  assert.ok(!emailRegex.test('correo-sin-arroba.com'));
  assert.ok(!emailRegex.test('correo@sin-dominio'));
  assert.ok(!emailRegex.test('@udea.edu.co'));
  assert.ok(!emailRegex.test('correo con espacios@udea.edu.co'));
});

test('3. Verificación de elementos en index.html', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');

  // Enlace en el encabezado de navegación
  assert.ok(html.includes('id="nav-boletin"'), 'Falta el enlace #nav-boletin en el header');
  assert.ok(html.includes('href="#boletin"'), 'El enlace de navegación debe apuntar a #boletin');

  // Botón CTA en el Hero
  assert.ok(html.includes('id="hero-btn-boletin"'), 'Falta el botón CTA #hero-btn-boletin en el hero');
  assert.ok(html.includes('class="btn-hero-newsletter"'), 'Falta la clase btn-hero-newsletter');

  // Sección del Boletín
  assert.ok(html.includes('id="boletin"'), 'Falta la sección #boletin');
  assert.ok(html.includes('class="newsletter-section"'), 'Falta la clase newsletter-section');
  assert.ok(html.includes('id="form-newsletter-quick"'), 'Falta el formulario #form-newsletter-quick');
  assert.ok(html.includes('id="newsletter-quick-email"'), 'Falta el input de correo #newsletter-quick-email');
  assert.ok(html.includes('id="btn-open-newsletter-modal"'), 'Falta el botón para abrir el modal');
  assert.ok(html.includes('id="link-newsletter-external"'), 'Falta el enlace externo de MailerLite');

  // Modal y Iframe de MailerLite
  assert.ok(html.includes('id="modal-newsletter-backdrop"'), 'Falta el modal #modal-newsletter-backdrop');
  assert.ok(html.includes('id="newsletter-mailerlite-iframe"'), 'Falta el iframe #newsletter-mailerlite-iframe');
  assert.ok(html.includes(MAILERLITE_TARGET_URL), 'El iframe o enlace debe contener la URL oficial de MailerLite');
  assert.ok(html.includes('id="btn-close-modal-newsletter"'), 'Falta el botón de cerrar modal');

  // Footer
  assert.ok(html.includes('id="footer-link-boletin"'), 'Falta el enlace del boletín en el footer');
});

test('4. Verificación de estilos en src/styles/main.css', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles', 'main.css'), 'utf-8');

  assert.ok(css.includes('.btn-hero-newsletter'), 'Falta la clase .btn-hero-newsletter en CSS');
  assert.ok(css.includes('.newsletter-section'), 'Falta la clase .newsletter-section en CSS');
  assert.ok(css.includes('.newsletter-card'), 'Falta la clase .newsletter-card en CSS');
  assert.ok(css.includes('.newsletter-dialog'), 'Falta la clase .newsletter-dialog en CSS');
  assert.ok(css.includes('.newsletter-iframe'), 'Falta la clase .newsletter-iframe en CSS');
  assert.ok(css.includes('.newsletter-iframe-loader'), 'Falta la clase .newsletter-iframe-loader en CSS');
});

test('5. Verificación de lógica en src/main.js', () => {
  const js = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf-8');

  assert.ok(js.includes('setupNewsletterSystem()'), 'Falta la invocación de setupNewsletterSystem()');
  assert.ok(js.includes('function setupNewsletterSystem()'), 'Falta la definición de setupNewsletterSystem()');
  assert.ok(js.includes('modal-newsletter-backdrop'), 'Falta la referencia a modal-newsletter-backdrop');
  assert.ok(js.includes('newsletter-mailerlite-iframe'), 'Falta la referencia al iframe en JS');
  assert.ok(js.includes('isValidDate'), 'isValidDate debe estar importado en src/main.js');
});


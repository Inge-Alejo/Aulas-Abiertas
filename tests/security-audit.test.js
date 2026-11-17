import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, sanitizeUrl } from '../src/utils/security.js';
import { isSafeScrapeUrl } from '../api/scrape-mailerlite.js';

test('1. Sanitización XSS: escapeHtml neutraliza caracteres peligrosos', () => {
  const dirty = '<script>alert("XSS")</script>&foo=\'bar\'';
  const clean = escapeHtml(dirty);

  assert.strictEqual(clean.includes('<script>'), false);
  assert.strictEqual(clean.includes('</script>'), false);
  assert.strictEqual(clean.includes('&lt;script&gt;'), true);
  assert.strictEqual(clean.includes('&amp;foo='), true);
  assert.strictEqual(clean.includes('&#039;bar&#039;'), true);
  assert.strictEqual(clean.includes('&quot;XSS&quot;'), true);

  // Valores null / undefined seguros
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
});

test('2. Sanitización de enlaces: sanitizeUrl bloquea esquemas maliciosos', () => {
  // URLs maliciosas o con JavaScript embebido
  assert.strictEqual(sanitizeUrl('javascript:alert(document.cookie)'), '');
  assert.strictEqual(sanitizeUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.strictEqual(sanitizeUrl('vbscript:msgbox(1)'), '');
  assert.strictEqual(sanitizeUrl('file:///etc/passwd'), '');

  // URLs legítimas web HTTP/HTTPS
  assert.strictEqual(sanitizeUrl('https://teams.microsoft.com/l/meetup-join/123'), 'https://teams.microsoft.com/l/meetup-join/123');
  assert.strictEqual(sanitizeUrl('https://zoom.us/j/987654321'), 'https://zoom.us/j/987654321');
  assert.strictEqual(sanitizeUrl('http://meet.google.com/abc-defg-hij'), 'http://meet.google.com/abc-defg-hij');
});

test('3. Prevención SSRF: isSafeScrapeUrl bloquea IPs locales y metadatos de nube', () => {
  // Metadatos de proveedores cloud (AWS / GCP / Azure: 169.254.169.254)
  assert.strictEqual(isSafeScrapeUrl('http://169.254.169.254/latest/meta-data/'), false);
  assert.strictEqual(isSafeScrapeUrl('https://169.254.169.254/'), false);

  // Loopbacks y localhost
  assert.strictEqual(isSafeScrapeUrl('http://localhost:3000/internal-admin'), false);
  assert.strictEqual(isSafeScrapeUrl('http://127.0.0.1:8080/'), false);
  assert.strictEqual(isSafeScrapeUrl('http://0.0.0.0:80/'), false);
  assert.strictEqual(isSafeScrapeUrl('http://[::1]:80/'), false);

  // Redes privadas RFC 1918
  assert.strictEqual(isSafeScrapeUrl('http://10.0.0.5/api/'), false);
  assert.strictEqual(isSafeScrapeUrl('http://192.168.1.1/router'), false);
  assert.strictEqual(isSafeScrapeUrl('http://172.16.0.1/'), false);

  // Protocolos no permitidos
  assert.strictEqual(isSafeScrapeUrl('ftp://example.com/file'), false);
  assert.strictEqual(isSafeScrapeUrl('file:///etc/passwd'), false);

  // Enlaces públicos válidos de MailerLite
  assert.strictEqual(isSafeScrapeUrl('https://preview.mailerlite.com/k8w4m4m5a6'), true);
  assert.strictEqual(isSafeScrapeUrl('https://mailerlite.com/newsletter/123'), true);
  assert.strictEqual(isSafeScrapeUrl('https://medicina.udea.edu.co/boletin'), true);
});

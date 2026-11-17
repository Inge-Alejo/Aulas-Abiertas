/**
 * Utilidades de seguridad para prevención de XSS y saneamiento de URLs
 */

/**
 * Escapa caracteres especiales HTML para mitigar vulnerabilidades XSS (Cross-Site Scripting).
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitiza una URL permitiendo únicamente protocolos web seguros (http y https).
 * Neutraliza vectores javascript:, data:, vbscript:.
 * @param {string} url
 * @returns {string}
 */
export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return escapeHtml(trimmed);
  }
  return '';
}

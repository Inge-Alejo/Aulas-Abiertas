/**
 * Serverless API para Vercel: Autenticación Administrativa Directa
 * Permite iniciar sesión, verificar sesión activa y cerrar sesión para el equipo de Teleducación UdeA,
 * validando contra las variables de entorno de Vercel.
 */

import crypto from 'node:crypto';

// Clave secreta para firmar tokens de sesión
const getSessionSecret = () => {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET;
  return secret
    ? String(secret).trim().replace(/^["']|["']$/g, '')
    : 'udea-teleducacion-aulas-abiertas-jwt-token-2026-secret-key';
};

// Obtiene y sanitiza la contraseña administrativa configurada en Vercel
const getAdminPassword = () => {
  const raw = process.env.ADMIN_PASSWORD;
  return raw ? String(raw).trim().replace(/^["']|["']$/g, '') : '';
};

// Obtiene y sanitiza el correo administrativo configurado en Vercel (opcional)
const getConfiguredAdminEmail = () => {
  const raw = process.env.ADMIN_EMAIL;
  return raw ? String(raw).trim().toLowerCase().replace(/^["']|["']$/g, '') : '';
};

/**
 * Codifica una cadena o buffer a Base64URL
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Decodifica una cadena Base64URL
 */
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Genera un token HMAC-SHA256 firmado
 */
function signToken(payload) {
  const payloadStr = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(payloadStr);
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

/**
 * Verifica y decodifica un token firmado
 */
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encodedPayload)
    .digest('base64url');

  // Comparación de tiempo constante para prevenir timing attacks
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expirado
    }
    return payload;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // Configuración de cabeceras CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parsear body de forma resiliente (objeto o JSON string)
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const action = req.query?.action || body?.action || (req.method === 'GET' ? 'verify' : 'login');

  // 1. VERIFICAR SESIÓN
  if (action === 'verify' || req.method === 'GET') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : body?.token || req.query?.token;

    if (!token) {
      return res.status(401).json({ valid: false, error: 'No se suministró token de sesión.' });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ valid: false, error: 'Token inválido o sesión expirada.' });
    }

    return res.status(200).json({
      valid: true,
      user: {
        email: payload.email,
        role: payload.role || 'admin',
        displayName: payload.displayName || 'Administrador Teleducación'
      },
      expiresAt: payload.exp
    });
  }

  // 2. INICIAR SESIÓN (LOGIN)
  if (action === 'login' && req.method === 'POST') {
    const rawEmail = body.email || req.query?.email || '';
    const rawPassword = body.password || req.query?.password || '';

    const cleanEmail = String(rawEmail).trim().toLowerCase();
    const cleanPass = String(rawPassword).trim();

    if (!cleanEmail || !cleanPass) {
      return res.status(400).json({
        error: 'Por favor ingresa correo electrónico y contraseña de acceso.'
      });
    }

    const adminPassword = getAdminPassword();
    const configuredAdminEmail = getConfiguredAdminEmail();

    // 1. Comprobar si ADMIN_PASSWORD está configurada en Vercel
    if (!adminPassword) {
      console.error('[Auth] La variable de entorno ADMIN_PASSWORD no está configurada.');
      return res.status(500).json({
        error: 'La variable ADMIN_PASSWORD no está disponible en Vercel. Asegúrate de guardarla en Settings > Environment Variables y hacer Redeploy.'
      });
    }

    // 2. Comprobar contraseña
    if (cleanPass !== adminPassword) {
      return res.status(401).json({
        error: 'Contraseña incorrecta. Verifica la contraseña definida en Vercel.'
      });
    }

    // 3. Comprobar correo si se especificó ADMIN_EMAIL en Vercel
    if (configuredAdminEmail) {
      const isEmailAllowed =
        cleanEmail === configuredAdminEmail ||
        cleanEmail.endsWith('@udea.edu.co') ||
        cleanEmail.includes('teleducacion') ||
        cleanEmail.includes('aprendizajes');

      if (!isEmailAllowed) {
        return res.status(401).json({
          error: `Correo no autorizado. Debe coincidir con ${configuredAdminEmail} o pertenecer al dominio @udea.edu.co.`
        });
      }
    }

    // Token con vigencia de 7 días
    const expTime = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const displayName = cleanEmail.split('@')[0] || 'Administrador';

    const token = signToken({
      email: cleanEmail,
      role: 'admin',
      displayName,
      iat: Date.now(),
      exp: expTime
    });

    return res.status(200).json({
      success: true,
      token,
      user: {
        email: cleanEmail,
        role: 'admin',
        displayName
      },
      expiresAt: expTime,
      authProvider: 'vercel'
    });
  }

  // 3. CERRAR SESIÓN
  if (action === 'logout') {
    return res.status(200).json({
      success: true,
      message: 'Sesión administrativa cerrada exitosamente.'
    });
  }

  return res.status(400).json({ error: `Acción no reconocida: ${action}` });
}

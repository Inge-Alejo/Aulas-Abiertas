/**
 * authService.js
 * Servicio de Autenticación Administrativa Directa mediante Vercel Serverless API.
 * 
 * Reemplaza la dependencia directa de Firebase Authentication en el cliente,
 * delegando la verificación de credenciales a la infraestructura segura de Vercel.
 */

const TOKEN_KEY = 'aulas_admin_token';
const USER_KEY = 'aulas_admin_user';

let currentAdminUser = null;
let currentAdminToken = null;
const authSubscribers = [];

// Inicializar sesión desde almacenamiento local si existe
try {
  const savedToken = localStorage.getItem(TOKEN_KEY);
  const savedUser = localStorage.getItem(USER_KEY);
  if (savedToken && savedUser) {
    currentAdminToken = savedToken;
    currentAdminUser = JSON.parse(savedUser);
  }
} catch {
  // Ignorar errores de parseo
}

function notifySubscribers(user) {
  authSubscribers.forEach((cb) => {
    try {
      cb(user);
    } catch (err) {
      console.error('[AuthService] Error en callback de suscriptor:', err);
    }
  });
}

/**
 * Inicia sesión administrativa validando directamente contra Vercel Serverless (/api/auth)
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ success: boolean, user: object, token: string }>}
 */
export async function loginAdmin(email, password) {
  const cleanEmail = (email || '').trim();
  const cleanPassword = (password || '').trim();

  if (!cleanEmail || !cleanPassword) {
    throw new Error('Por favor ingresa tu correo institucional y contraseña de acceso.');
  }

  try {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'login',
        email: cleanEmail,
        password: cleanPassword
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Credenciales administrativas no autorizadas.');
    }

    currentAdminToken = data.token;
    currentAdminUser = data.user;

    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));

    notifySubscribers(currentAdminUser);

    return {
      success: true,
      user: currentAdminUser,
      token: currentAdminToken
    };
  } catch (error) {
    console.warn('[AuthService] Error de autenticación en Vercel:', error.message);
    throw error;
  }
}

/**
 * Verifica la validez del token actual con Vercel Serverless
 * @returns {Promise<boolean>}
 */
export async function verifyAdminSession() {
  if (!currentAdminToken) {
    currentAdminUser = null;
    notifySubscribers(null);
    return false;
  }

  try {
    const response = await fetch('/api/auth?action=verify', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${currentAdminToken}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      currentAdminUser = data.user;
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      notifySubscribers(currentAdminUser);
      return true;
    } else {
      // Token inválido o expirado
      await logoutAdmin();
      return false;
    }
  } catch (err) {
    // Si la red falla temporalmente pero tenemos usuario guardado, mantenerlo activo
    if (currentAdminUser) {
      notifySubscribers(currentAdminUser);
      return true;
    }
    return false;
  }
}

/**
 * Cierra la sesión administrativa activa
 */
export async function logoutAdmin() {
  if (currentAdminToken) {
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentAdminToken}`
        },
        body: JSON.stringify({ action: 'logout' })
      }).catch(() => {});
    } catch {
      // Ignorar errores en llamada de salida
    }
  }

  currentAdminToken = null;
  currentAdminUser = null;

  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // Ignorar
  }

  notifySubscribers(null);
}

/**
 * Retorna el usuario administrador activo
 */
export function getAdminUser() {
  return currentAdminUser;
}

/**
 * Retorna el token JWT actual para llamadas a endpoints protegidos
 */
export function getAdminToken() {
  return currentAdminToken;
}

/**
 * Indica si el administrador está autenticado
 */
export function isAdminAuthenticated() {
  return Boolean(currentAdminUser && currentAdminToken);
}

/**
 * Escucha cambios en el estado de autenticación administrativa
 * @param {Function} callback
 * @returns {Function} Función para cancelar suscripción
 */
export function onAdminAuthChange(callback) {
  authSubscribers.push(callback);
  // Notificar estado actual de inmediato
  try {
    callback(currentAdminUser);
  } catch (err) {
    console.error(err);
  }

  return () => {
    const idx = authSubscribers.indexOf(callback);
    if (idx !== -1) authSubscribers.splice(idx, 1);
  };
}

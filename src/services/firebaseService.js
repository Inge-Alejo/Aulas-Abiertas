/**
 * Servicio de integración con Firebase (Auth y Firestore) para Aulas Abiertas
 * - Firebase Authentication: Registro e inicio de sesión con Correo y Contraseña.
 * - Cloud Firestore: Guardar favoritos y enviar preguntas para ponentes.
 * - Respaldo Local: Si las variables no están presentes, opera de manera transparente en LocalStorage.
 */

import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';

// Configuración desde variables de entorno
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let app = null;
let auth = null;
let db = null;
let isFirebaseReady = false;

try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
    isFirebaseReady = true;
    console.info('[Firebase] Conectado exitosamente con Auth y Firestore:', firebaseConfig.projectId);
  } else {
    console.info('[Firebase] Operando con simulación local (LocalStorage).');
  }
} catch (error) {
  console.warn('[Firebase] Inicialización fallida, usando respaldo local:', error.message);
  isFirebaseReady = false;
}

const LOCAL_FAVORITES_KEY = 'aulas_abiertas_favoritos';
const LOCAL_USER_KEY = 'aulas_abiertas_usuario_activo';

/* ==========================================================================
   FIREBASE AUTHENTICATION (CORREO Y CONTRASEÑA)
   ========================================================================== */

/**
 * Inicia sesión con correo y contraseña.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user: object }>}
 */
export async function loginWithEmail(email, password) {
  if (isFirebaseReady && auth) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return { user: userCredential.user };
    } catch (error) {
      throw translateAuthError(error);
    }
  }

  // Respaldo de demostración local
  if (!email || !password || password.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres.');
  }

  const mockUser = {
    uid: `local_${btoa(email).replace(/=/g, '')}`,
    email,
    displayName: email.split('@')[0],
    isLocal: true
  };
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(mockUser));
  notifyAuthSubscribers(mockUser);
  return { user: mockUser };
}

/**
 * Registra un nuevo usuario con correo, contraseña y nombre opcional.
 * @param {string} email
 * @param {string} password
 * @param {string} displayName
 * @returns {Promise<{ user: object }>}
 */
export async function registerWithEmail(email, password, displayName = '') {
  if (isFirebaseReady && auth) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(userCredential.user, { displayName });
      }
      return { user: userCredential.user };
    } catch (error) {
      throw translateAuthError(error);
    }
  }

  // Respaldo local
  if (!email || !password || password.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres.');
  }

  const mockUser = {
    uid: `local_${btoa(email).replace(/=/g, '')}`,
    email,
    displayName: displayName || email.split('@')[0],
    isLocal: true
  };
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(mockUser));
  notifyAuthSubscribers(mockUser);
  return { user: mockUser };
}

/**
 * Cierra la sesión activa.
 */
export async function logoutUser() {
  if (isFirebaseReady && auth) {
    await signOut(auth);
    return;
  }
  localStorage.removeItem(LOCAL_USER_KEY);
  notifyAuthSubscribers(null);
}

/**
 * Retorna el usuario actualmente autenticado (sincrónico si hay sesión local).
 */
export function getCurrentUser() {
  if (isFirebaseReady && auth) {
    return auth.currentUser;
  }
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// Suscripción a cambios de estado de autenticación
const authSubscribers = [];

function notifyAuthSubscribers(user) {
  authSubscribers.forEach((cb) => {
    try {
      cb(user);
    } catch (e) {
      console.error(e);
    }
  });
}

/**
 * Escucha cambios en el estado de autenticación.
 * @param {Function} callback
 * @returns {Function} Función para cancelar suscripción
 */
export function onAuthChange(callback) {
  authSubscribers.push(callback);

  if (isFirebaseReady && auth) {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      callback(user);
    });
    return unsubscribe;
  }

  // Notificar estado actual en modo local
  const current = getCurrentUser();
  callback(current);

  return () => {
    const idx = authSubscribers.indexOf(callback);
    if (idx !== -1) authSubscribers.splice(idx, 1);
  };
}

/**
 * Traduce códigos de error comunes de Firebase a español amigable
 */
function translateAuthError(error) {
  const code = error.code || '';
  let msg = 'Ocurrió un error al autenticar.';

  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    msg = 'Correo electrónico o contraseña incorrectos.';
  } else if (code === 'auth/email-already-in-use') {
    msg = 'Este correo electrónico ya está registrado. Por favor inicia sesión.';
  } else if (code === 'auth/weak-password') {
    msg = 'La contraseña debe tener al menos 6 caracteres.';
  } else if (code === 'auth/invalid-email') {
    msg = 'El formato del correo electrónico no es válido.';
  } else if (code === 'auth/network-request-failed') {
    msg = 'Error de conexión. Verifica tu conexión a internet.';
  } else if (error.message) {
    msg = error.message;
  }

  const err = new Error(msg);
  err.code = code;
  return err;
}

/* ==========================================================================
   FIRESTORE (FAVORITOS Y PREGUNTAS A PONENTES)
   ========================================================================== */

/**
 * Obtiene la lista de IDs de actividades favoritas del usuario.
 * @returns {Promise<string[]>}
 */
export async function getFavoriteActivityIds() {
  if (isFirebaseReady && db) {
    try {
      const snap = await getDocs(collection(db, 'favoritos_usuario'));
      const ids = [];
      snap.forEach((doc) => ids.push(doc.id));
      return ids;
    } catch (err) {
      console.warn('[Firebase] Error al leer favoritos en Firestore, usando local:', err);
    }
  }

  try {
    const raw = localStorage.getItem(LOCAL_FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Alterna el estado de favorito de una actividad.
 */
export async function toggleFavoriteActivity(activityId, activityData = {}) {
  const currentFavorites = await getFavoriteActivityIds();
  const isFav = currentFavorites.includes(activityId);

  if (isFav) {
    if (isFirebaseReady && db) {
      try {
        await deleteDoc(doc(db, 'favoritos_usuario', activityId));
      } catch (err) {
        console.warn('[Firebase] Fallo al borrar favorito en Firestore:', err);
      }
    }
    const updated = currentFavorites.filter((id) => id !== activityId);
    localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(updated));
    return false;
  } else {
    if (isFirebaseReady && db) {
      try {
        await setDoc(doc(db, 'favoritos_usuario', activityId), {
          ...activityData,
          savedAt: serverTimestamp()
        });
      } catch (err) {
        console.warn('[Firebase] Fallo al guardar favorito en Firestore:', err);
      }
    }
    const updated = [...currentFavorites, activityId];
    localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(updated));
    return true;
  }
}

/**
 * Envía una pregunta o comentario para el ponente/equipo de Teleducación.
 */
export async function submitActivityQuestion(questionData) {
  if (isFirebaseReady && db) {
    try {
      const docRef = await addDoc(collection(db, 'preguntas_actividades'), {
        ...questionData,
        createdAt: serverTimestamp(),
        source: 'web_aulas_abiertas'
      });
      return { success: true, id: docRef.id };
    } catch (err) {
      console.error('[Firebase] Error al registrar pregunta en Firestore:', err);
      throw err;
    }
  }

  const pendingQuestions = JSON.parse(localStorage.getItem('aulas_preguntas_pendientes') || '[]');
  const localRecord = {
    ...questionData,
    localId: `loc_${Date.now()}`,
    createdAt: new Date().toISOString()
  };
  pendingQuestions.push(localRecord);
  localStorage.setItem('aulas_preguntas_pendientes', JSON.stringify(pendingQuestions));

  return { success: true, id: localRecord.localId, isLocal: true };
}

/**
 * Consulta el estado de conexión de Firebase
 */
export function getFirebaseStatus() {
  return {
    isReady: isFirebaseReady,
    projectId: firebaseConfig.projectId || null
  };
}

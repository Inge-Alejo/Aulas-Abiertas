/**
 * Servicio de integración con Firebase (Firestore) para Aulas Abiertas
 * Permite guardar actividades favoritas, sincronizar notas y enviar preguntas para ponentes.
 * Si las credenciales no están configuradas, utiliza respaldo transparente en LocalStorage.
 */

import { initializeApp, getApps } from 'firebase/app';
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
let db = null;
let isFirebaseReady = false;

// Inicialización condicional
try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getFirestore(app);
    isFirebaseReady = true;
    console.info('[Firebase] Conectado exitosamente a Firestore:', firebaseConfig.projectId);
  } else {
    console.info('[Firebase] Variables no detectadas. Operando con almacenamiento local (LocalStorage).');
  }
} catch (error) {
  console.warn('[Firebase] Error al inicializar Firebase, usando respaldo local:', error.message);
  isFirebaseReady = false;
}

const LOCAL_FAVORITES_KEY = 'aulas_abiertas_favoritos';

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

  // Respaldo en LocalStorage
  try {
    const raw = localStorage.getItem(LOCAL_FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Alterna el estado de favorito de una actividad.
 * @param {string} activityId ID de la actividad
 * @param {object} activityData Datos básicos de la actividad
 * @returns {Promise<boolean>} true si ahora es favorito, false si se quitó
 */
export async function toggleFavoriteActivity(activityId, activityData = {}) {
  const currentFavorites = await getFavoriteActivityIds();
  const isFav = currentFavorites.includes(activityId);

  if (isFav) {
    // Quitar
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
    // Agregar
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
 * @param {object} questionData { activityId, activityTitle, userName, userEmail, questionText }
 * @returns {Promise<{ success: boolean, id?: string }>}
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

  // Si Firebase no está configurado, guardar temporalmente en LocalStorage para no perderla
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

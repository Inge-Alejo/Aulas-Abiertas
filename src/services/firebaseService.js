/**
 * firebaseService.js
 * Servicio de sincronización de datos en tiempo real con Firebase Firestore.
 * 
 * - Almacenamiento en la nube de la programación académica en tiempo real (agenda/programacion_activa).
 * - Difusión instantánea mediante onSnapshot para que cualquier dispositivo reciba cambios sin recargar.
 * - Registro de favoritos y preguntas directas a ponentes en Firestore.
 * - Respaldo transparente en Vercel Serverless API (/api/schedule) y caché local.
 */

import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';

import { getAdminToken } from './authService.js';

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

try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getFirestore(app);
    isFirebaseReady = true;
    console.info('[Firebase Firestore] Conectado exitosamente en tiempo real:', firebaseConfig.projectId);
  } else {
    console.info('[Firebase Firestore] Sin credenciales cliente en .env, operando con sincronización Vercel / Local.');
  }
} catch (error) {
  console.warn('[Firebase Firestore] Error de inicialización:', error.message);
  isFirebaseReady = false;
}

const LOCAL_FAVORITES_KEY = 'aulas_abiertas_favoritos';
const LOCAL_SCHEDULE_KEY = 'aulas_cached_live_schedule';

/* ==========================================================================
   SINCRONIZACIÓN DE PROGRAMACIÓN EN TIEMPO REAL (FIRESTORE + VERCEL API)
   ========================================================================== */

/**
 * Guarda la programación académica en Firebase Firestore y en la API de Vercel.
 * Se propaga en tiempo real a todos los dispositivos conectados.
 * 
 * @param {Array} activities
 * @param {Object} metadata
 * @returns {Promise<{ success: boolean, count: number }>}
 */
export async function saveLiveScheduleToFirebase(activities, metadata = {}) {
  if (!Array.isArray(activities) || activities.length === 0) {
    throw new Error('No hay actividades válidas para guardar.');
  }

  const nowIso = new Date().toISOString();
  const payload = {
    activities,
    count: activities.length,
    updatedAt: nowIso,
    updatedBy: metadata.user || 'Teleducación UdeA',
    source: metadata.source || 'Boletín MailerLite / Scraper Gemini IA',
    version: Date.now()
  };

  let firestoreSaved = false;

  // 1. Guardar en Firebase Firestore (Sincronización en tiempo real global)
  if (isFirebaseReady && db) {
    try {
      const scheduleDocRef = doc(db, 'agenda', 'programacion_activa');
      await setDoc(scheduleDocRef, {
        ...payload,
        firestoreTimestamp: serverTimestamp()
      });
      firestoreSaved = true;
      console.info('[Firebase] Programación guardada en Firestore (agenda/programacion_activa)');
    } catch (err) {
      console.warn('[Firebase] Fallo al guardar en Firestore:', err.message);
    }
  }

  // 2. Guardar en la API Serverless de Vercel (/api/schedule) como respaldo en la nube
  try {
    const adminToken = getAdminToken();
    const headers = { 'Content-Type': 'application/json' };
    if (adminToken) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    }

    await fetch('/api/schedule', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        activities,
        source: payload.source,
        updatedBy: payload.updatedBy
      })
    });
  } catch (err) {
    console.warn('[Vercel API] Notificación de persistencia en Vercel:', err.message);
  }

  // 3. Caché local en este dispositivo
  try {
    localStorage.setItem(LOCAL_SCHEDULE_KEY, JSON.stringify(payload));
  } catch {
    // Ignorar errores de almacenamiento local
  }

  return {
    success: true,
    count: activities.length,
    firestoreSaved,
    updatedAt: nowIso
  };
}

/**
 * Consulta la programación activa guardada en Firebase Firestore o Vercel API.
 * Permite que cualquier dispositivo obtenga la programación más reciente.
 * 
 * @returns {Promise<{ activities: Array, source: string, updatedAt: string, isLive: boolean } | null>}
 */
export async function getLiveScheduleFromFirebase() {
  // 1. Intentar consultar desde Firebase Firestore
  if (isFirebaseReady && db) {
    try {
      const scheduleDocRef = doc(db, 'agenda', 'programacion_activa');
      const docSnap = await getDoc(scheduleDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.activities) && data.activities.length > 0) {
          return {
            activities: data.activities,
            source: 'Firebase Firestore (En tiempo real)',
            updatedAt: data.updatedAt || new Date().toLocaleTimeString('es-CO'),
            updatedBy: data.updatedBy || '',
            isLive: true,
            count: data.activities.length
          };
        }
      }
    } catch (err) {
      console.warn('[Firebase] No se pudo leer agenda de Firestore:', err.message);
    }
  }

  // 2. Intentar consultar desde la API de Vercel (/api/schedule)
  try {
    const res = await fetch('/api/schedule');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.activities) && data.activities.length > 0) {
        return {
          activities: data.activities,
          source: 'Vercel Cloud (Sincronizado)',
          updatedAt: data.updatedAt || new Date().toLocaleTimeString('es-CO'),
          updatedBy: data.updatedBy || '',
          isLive: true,
          count: data.activities.length
        };
      }
    }
  } catch {
    // Continuar al siguiente respaldo
  }

  // 3. Intentar consultar desde la caché local del dispositivo
  try {
    const raw = localStorage.getItem(LOCAL_SCHEDULE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.activities) && parsed.activities.length > 0) {
        return {
          activities: parsed.activities,
          source: 'Caché de agenda local',
          updatedAt: parsed.updatedAt || '',
          isLive: true,
          count: parsed.activities.length
        };
      }
    }
  } catch {
    // Ignorar
  }

  return null;
}

/**
 * Se suscribe en tiempo real a los cambios de la programación en Firestore.
 * Cuando un administrador actualiza la agenda desde cualquier equipo,
 * todos los dispositivos conectados se actualizan al instante sin recargar la página.
 * 
 * @param {Function} callback Callback invocado con { activities, source, updatedAt, isLive }
 * @returns {Function} Función para cancelar la suscripción
 */
export function subscribeToLiveSchedule(callback) {
  let isUnsubscribed = false;

  // 1. Suscripción nativa Firestore onSnapshot (WebSocket en tiempo real)
  if (isFirebaseReady && db) {
    try {
      const scheduleDocRef = doc(db, 'agenda', 'programacion_activa');
      const unsubscribeFirestore = onSnapshot(
        scheduleDocRef,
        (docSnap) => {
          if (isUnsubscribed) return;
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (Array.isArray(data.activities) && data.activities.length > 0) {
              console.info(`[Firebase Realtime] Nueva versión de agenda recibida (${data.activities.length} actividades)`);
              callback({
                activities: data.activities,
                source: 'Firebase Firestore (En tiempo real)',
                updatedAt: data.updatedAt || new Date().toLocaleTimeString('es-CO'),
                updatedBy: data.updatedBy,
                count: data.activities.length,
                isLive: true,
                fromRealtime: true
              });
            }
          }
        },
        (err) => {
          console.warn('[Firebase onSnapshot] Advertencia de conexión:', err.message);
        }
      );

      return () => {
        isUnsubscribed = true;
        unsubscribeFirestore();
      };
    } catch (e) {
      console.warn('[Firebase] Fallo al establecer suscripción Firestore:', e);
    }
  }

  // 2. Respaldo de sondeo ligero (Polling cada 30 segundos) si Firestore no está activo
  let lastKnownUpdated = '';
  const intervalId = setInterval(async () => {
    if (isUnsubscribed) return;
    try {
      const res = await fetch('/api/schedule');
      if (res.ok) {
        const data = await res.json();
        if (data.activities && data.updatedAt && data.updatedAt !== lastKnownUpdated) {
          lastKnownUpdated = data.updatedAt;
          callback({
            activities: data.activities,
            source: 'Vercel Cloud (Sincronizado)',
            updatedAt: data.updatedAt,
            isLive: true,
            fromRealtime: true
          });
        }
      }
    } catch {
      // Ignorar fallas transitorias de red
    }
  }, 30000);

  return () => {
    isUnsubscribed = true;
    clearInterval(intervalId);
  };
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
      console.warn('[Firebase] Error al leer favoritos en Firestore, usando local:', err.message);
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
        console.warn('[Firebase] Fallo al borrar favorito en Firestore:', err.message);
      }
    }
    const updated = currentFavorites.filter((id) => id !== activityId);
    try {
      localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(updated));
    } catch {}
    return false;
  } else {
    if (isFirebaseReady && db) {
      try {
        await setDoc(doc(db, 'favoritos_usuario', activityId), {
          ...activityData,
          savedAt: serverTimestamp()
        });
      } catch (err) {
        console.warn('[Firebase] Fallo al guardar favorito en Firestore:', err.message);
      }
    }
    const updated = [...currentFavorites, activityId];
    try {
      localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(updated));
    } catch {}
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
  try {
    localStorage.setItem('aulas_preguntas_pendientes', JSON.stringify(pendingQuestions));
  } catch {}

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

/**
 * firebaseService.js
 * Servicio de sincronización de datos en tiempo real con Firebase Firestore y Vercel Cloud API.
 * 
 * - Almacenamiento en la nube de la programación académica en tiempo real (agenda/programacion_activa).
 * - Difusión instantánea mediante onSnapshot y sondeo inteligente para sincronizar cualquier dispositivo.
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

// Configuración inicial desde variables de entorno de Vite
let currentFirebaseConfig = {
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
let lastFirestoreError = null;

/**
 * Inicializa Firebase Firestore con las credenciales dadas.
 */
function initFirebaseWithConfig(config) {
  if (!config || !config.apiKey || !config.projectId) {
    return false;
  }

  try {
    app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
    db = getFirestore(app);
    isFirebaseReady = true;
    currentFirebaseConfig = { ...config };
    lastFirestoreError = null;
    console.info('[Firebase Firestore] Conectado exitosamente en tiempo real:', config.projectId);
    return true;
  } catch (error) {
    console.warn('[Firebase Firestore] Error de inicialización:', error.message);
    lastFirestoreError = error.message;
    isFirebaseReady = false;
    return false;
  }
}

// Intento inicial síncrono si Vite tiene las variables
if (currentFirebaseConfig.apiKey && currentFirebaseConfig.projectId) {
  initFirebaseWithConfig(currentFirebaseConfig);
}

/**
 * Asegura que Firebase esté inicializado, consultando la API de Vercel
 * si las variables no vinieron en el bundle estático de Vite.
 */
export async function ensureFirebaseInitialized() {
  if (isFirebaseReady && db) return true;

  try {
    const res = await fetch('/api/schedule?info=config');
    if (res.ok) {
      const data = await res.json();
      if (data?.firebase?.apiKey && data?.firebase?.projectId) {
        return initFirebaseWithConfig(data.firebase);
      }
    }
  } catch {
    // Modo offline o sin API serverless activa
  }

  return isFirebaseReady;
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
 * @returns {Promise<{ success: boolean, count: number, firestoreSaved: boolean, vercelSaved: boolean, storageProvider: string, updatedAt: string }>}
 */
export async function saveLiveScheduleToFirebase(activities, metadata = {}) {
  if (!Array.isArray(activities) || activities.length === 0) {
    throw new Error('No hay actividades válidas para guardar.');
  }

  // Intentar inicializar Firebase dinámicamente si aún no está conectado
  await ensureFirebaseInitialized();

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
  let firestoreError = null;
  let vercelSaved = false;
  let vercelStorageProvider = 'local';

  // 1. Guardar en Firebase Firestore (Sincronización en tiempo real global)
  if (isFirebaseReady && db) {
    try {
      const scheduleDocRef = doc(db, 'agenda', 'programacion_activa');
      await setDoc(scheduleDocRef, {
        ...payload,
        firestoreTimestamp: serverTimestamp()
      });
      firestoreSaved = true;
      lastFirestoreError = null;
      console.info('[Firebase] Programación guardada en Firestore (agenda/programacion_activa)');
    } catch (err) {
      console.error('[Firebase] Fallo al guardar en Firestore:', err);
      firestoreError = err.message || 'Permiso denegado o error de conexión en Firestore';
      lastFirestoreError = firestoreError;
    }
  } else {
    firestoreError = 'Firebase no está configurado en las variables de entorno de Vercel.';
  }

  // 2. Guardar en la API Serverless de Vercel (/api/schedule) como respaldo en la nube
  try {
    const adminToken = getAdminToken();
    const headers = { 'Content-Type': 'application/json' };
    if (adminToken) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    }

    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        activities,
        source: payload.source,
        updatedBy: payload.updatedBy
      })
    });

    if (res.ok) {
      const vData = await res.json();
      vercelSaved = true;
      vercelStorageProvider = vData.storageProvider || 'vercel_cloud';
    }
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
    success: firestoreSaved || vercelSaved,
    count: activities.length,
    firestoreSaved,
    firestoreError,
    vercelSaved,
    vercelStorageProvider,
    updatedAt: nowIso
  };
}

/**
 * Consulta la programación activa guardada en Firebase Firestore o Vercel API.
 * Permite que cualquier dispositivo obtenga la programación más reciente.
 * 
 * @returns {Promise<{ activities: Array, source: string, updatedAt: string, isLive: boolean, count: number } | null>}
 */
export async function getLiveScheduleFromFirebase() {
  await ensureFirebaseInitialized();

  // 1. Intentar consultar desde Firebase Firestore
  if (isFirebaseReady && db) {
    try {
      const scheduleDocRef = doc(db, 'agenda', 'programacion_activa');
      const docSnap = await getDoc(scheduleDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        let acts = data.activities;
        if (!acts && data.activitiesJson) {
          try {
            acts = JSON.parse(data.activitiesJson);
          } catch {
            acts = null;
          }
        }
        if (Array.isArray(acts) && acts.length > 0) {
          return {
            activities: acts,
            source: 'Firebase Firestore (En tiempo real)',
            updatedAt: data.updatedAt || new Date().toLocaleTimeString('es-CO'),
            updatedBy: data.updatedBy || '',
            isLive: true,
            count: acts.length,
            version: data.version || 0
          };
        }
      }
    } catch (err) {
      console.warn('[Firebase] No se pudo leer agenda de Firestore:', err.message);
      lastFirestoreError = err.message;
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
          source: `Vercel Cloud (${data.storageProvider || 'Sincronizado'})`,
          updatedAt: data.updatedAt || new Date().toLocaleTimeString('es-CO'),
          updatedBy: data.updatedBy || '',
          isLive: true,
          count: data.activities.length,
          version: data.version || 0
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
          count: parsed.activities.length,
          version: parsed.version || 0
        };
      }
    }
  } catch {
    // Ignorar
  }

  return null;
}

/**
 * Se suscribe en tiempo real a los cambios de la programación en Firestore y Vercel.
 * Cuando un administrador actualiza la agenda desde cualquier equipo,
 * todos los dispositivos conectados se actualizan al instante sin recargar la página.
 * 
 * @param {Function} callback Callback invocado con { activities, source, updatedAt, isLive, fromRealtime }
 * @returns {Function} Función para cancelar la suscripción
 */
export function subscribeToLiveSchedule(callback) {
  let isUnsubscribed = false;
  let unsubscribeFirestore = null;
  let lastKnownVersion = null;

  // 1. Suscripción nativa Firestore onSnapshot (WebSocket en tiempo real)
  const setupFirestoreListener = () => {
    if (!isFirebaseReady || !db || isUnsubscribed) return;

    try {
      const scheduleDocRef = doc(db, 'agenda', 'programacion_activa');
      unsubscribeFirestore = onSnapshot(
        scheduleDocRef,
        (docSnap) => {
          if (isUnsubscribed) return;
          if (docSnap.exists()) {
            const data = docSnap.data();
            let acts = data.activities;
            if (!acts && data.activitiesJson) {
              try {
                acts = JSON.parse(data.activitiesJson);
              } catch {
                acts = null;
              }
            }

            if (Array.isArray(acts) && acts.length > 0) {
              const currentVersion = data.version || data.updatedAt;
              if (lastKnownVersion === currentVersion) return;
              lastKnownVersion = currentVersion;

              console.info(`[Firebase Realtime] Nueva versión de agenda recibida (${acts.length} actividades)`);
              callback({
                activities: acts,
                source: 'Firebase Firestore (En tiempo real)',
                updatedAt: data.updatedAt || new Date().toLocaleTimeString('es-CO'),
                updatedBy: data.updatedBy,
                count: acts.length,
                isLive: true,
                fromRealtime: true,
                version: data.version || 0
              });
            }
          }
        },
        (err) => {
          console.warn('[Firebase onSnapshot] Advertencia de conexión:', err.message);
          lastFirestoreError = err.message;
        }
      );
    } catch (e) {
      console.warn('[Firebase] Fallo al establecer suscripción Firestore:', e);
    }
  };

  setupFirestoreListener();

  // Si Firebase aún no estaba listo, intentar inicializarlo en segundo plano
  if (!isFirebaseReady) {
    ensureFirebaseInitialized().then((ready) => {
      if (ready && !isUnsubscribed) {
        setupFirestoreListener();
      }
    });
  }

  // 2. Respaldo de sondeo periódico activo (Polling cada 20 segundos)
  // Garantiza que cualquier dispositivo reciba cambios incluso con WebSockets desconectados o proxies de red
  const checkRemoteUpdates = async () => {
    if (isUnsubscribed) return;
    try {
      const remote = await getLiveScheduleFromFirebase();
      if (remote && Array.isArray(remote.activities) && remote.activities.length > 0) {
        const currentVersion = remote.version || remote.updatedAt;
        if (currentVersion && currentVersion !== lastKnownVersion) {
          lastKnownVersion = currentVersion;
          callback({
            ...remote,
            fromRealtime: true
          });
        }
      }
    } catch {
      // Ignorar fallas transitorias de red
    }
  };

  const intervalId = setInterval(checkRemoteUpdates, 20000);

  // 3. Reactivación instantánea al volver a la pestaña o desbloquear el celular
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      checkRemoteUpdates();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    isUnsubscribed = true;
    clearInterval(intervalId);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (unsubscribeFirestore) {
      try {
        unsubscribeFirestore();
      } catch {
        // Ignorar
      }
    }
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
  await ensureFirebaseInitialized();

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
  await ensureFirebaseInitialized();

  const currentFavorites = await getFavoriteActivityIds();
  const isFav = currentFavorites.includes(activityId);

  if (isFav) {
    if (isFirebaseReady && db) {
      try {
        await deleteDoc(doc(db, 'favoritos_usuario', activityId));
      } catch (err) {
        console.warn('[Firebase] Fallo al remover favorito de Firestore:', err.message);
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
  await ensureFirebaseInitialized();

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
 * Consulta el estado de conexión de Firebase y de sincronización en la nube.
 */
export function getFirebaseStatus() {
  return {
    isReady: isFirebaseReady,
    projectId: currentFirebaseConfig.projectId || null,
    lastError: lastFirestoreError
  };
}

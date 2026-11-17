/**
 * Serverless API para Vercel: Persistencia y Consulta de Programación Académica
 * Permite almacenar y servir la agenda académica activa global para cualquier dispositivo,
 * integrando múltiples capas de persistencia en la nube:
 * 1. Vercel Blob Storage (@vercel/blob via BLOB_READ_WRITE_TOKEN) - Persistencia global en CDN
 * 2. Google Cloud Firestore REST API (si se configuran variables de Firebase en Vercel)
 * 3. Vercel KV / Upstash Redis (si se configuran KV_REST_API_*)
 * 4. Almacenamiento en caché serverless (/tmp)
 * 5. Memoria caliente de la instancia
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { put, list } from '@vercel/blob';
import { verifyToken } from './auth.js';

// Memoria en caliente para la instancia de ejecución serverless
let inMemorySchedule = null;
let lastRemoteFetchTime = 0;
const REMOTE_CACHE_TTL_MS = 10000; // 10 segundos

// Ruta de archivo en caché temporal serverless
const TMP_CACHE_FILE = path.join(os.tmpdir(), 'aulas_schedule_cache.json');

/**
 * Obtiene la configuración de Firebase desde las variables de entorno de Vercel.
 */
function getFirebaseServerConfig() {
  const projectId = (
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GCP_PROJECT_ID ||
    ''
  ).trim();

  const apiKey = (
    process.env.VITE_FIREBASE_API_KEY ||
    process.env.FIREBASE_API_KEY ||
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    ''
  ).trim();

  const authDomain = (
    process.env.VITE_FIREBASE_AUTH_DOMAIN ||
    process.env.FIREBASE_AUTH_DOMAIN ||
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    (projectId ? `${projectId}.firebaseapp.com` : '')
  ).trim();

  const storageBucket = (
    process.env.VITE_FIREBASE_STORAGE_BUCKET ||
    process.env.FIREBASE_STORAGE_BUCKET ||
    (projectId ? `${projectId}.appspot.com` : '')
  ).trim();

  const messagingSenderId = (
    process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    process.env.FIREBASE_MESSAGING_SENDER_ID ||
    ''
  ).trim();

  const appId = (
    process.env.VITE_FIREBASE_APP_ID ||
    process.env.FIREBASE_APP_ID ||
    ''
  ).trim();

  return {
    isConfigured: Boolean(projectId && apiKey),
    projectId,
    apiKey,
    authDomain,
    storageBucket,
    messagingSenderId,
    appId
  };
}

/**
 * Guarda la programación en Vercel Blob Storage para persistencia global en CDN.
 */
async function saveToVercelBlob(payload) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;

  try {
    const blob = await put('aulas_schedule_live.json', JSON.stringify(payload), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json'
    });
    return { success: true, url: blob.url, downloadUrl: blob.downloadUrl };
  } catch (err) {
    console.warn('[Vercel Blob] Error al guardar en blob:', err.message);
    return null;
  }
}

/**
 * Obtiene la programación activa desde Vercel Blob Storage.
 */
async function getFromVercelBlob() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;

  try {
    const { blobs } = await list({ prefix: 'aulas_schedule_live.json', limit: 1 });
    if (blobs && blobs.length > 0) {
      const targetBlob = blobs[0];
      const res = await fetch(`${targetBlob.downloadUrl}?t=${Date.now()}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.activities) && data.activities.length > 0) {
          return {
            ...data,
            storageProvider: 'vercel_blob',
            blobUrl: targetBlob.downloadUrl
          };
        }
      }
    }
  } catch (err) {
    console.warn('[Vercel Blob] Error al consultar blob:', err.message);
  }
  return null;
}

/**
 * Guarda la programación en Google Cloud Firestore mediante su API REST pública.
 */
async function saveToFirestoreRest(payload) {
  const config = getFirebaseServerConfig();
  if (!config.isConfigured) return false;

  try {
    const queryParams = new URLSearchParams();
    if (config.apiKey) queryParams.set('key', config.apiKey);
    queryParams.append('updateMask.fieldPaths', 'activitiesJson');
    queryParams.append('updateMask.fieldPaths', 'updatedAt');
    queryParams.append('updateMask.fieldPaths', 'updatedBy');
    queryParams.append('updateMask.fieldPaths', 'source');
    queryParams.append('updateMask.fieldPaths', 'count');
    queryParams.append('updateMask.fieldPaths', 'version');

    const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/agenda/programacion_activa?${queryParams.toString()}`;

    const body = {
      fields: {
        activitiesJson: { stringValue: JSON.stringify(payload.activities) },
        updatedAt: { stringValue: payload.updatedAt },
        updatedBy: { stringValue: payload.updatedBy || '' },
        source: { stringValue: payload.source || '' },
        count: { integerValue: String(payload.count || payload.activities.length) },
        version: { integerValue: String(payload.version || Date.now()) }
      }
    };

    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      return true;
    } else {
      const errText = await res.text();
      console.warn('[Firestore REST API] Advertencia al persistir en Firestore:', res.status, errText);
      return false;
    }
  } catch (err) {
    console.warn('[Firestore REST API] Error de conexión:', err.message);
    return false;
  }
}

/**
 * Obtiene la programación activa desde Firestore REST API.
 */
async function getFromFirestoreRest() {
  const config = getFirebaseServerConfig();
  if (!config.projectId) return null;

  try {
    const keyParam = config.apiKey ? `?key=${config.apiKey}` : '';
    const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/agenda/programacion_activa${keyParam}`;

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });

    if (res.ok) {
      const doc = await res.json();
      const fields = doc?.fields;
      if (fields) {
        let activities = null;
        if (fields.activitiesJson?.stringValue) {
          try {
            activities = JSON.parse(fields.activitiesJson.stringValue);
          } catch {
            activities = null;
          }
        }
        if (Array.isArray(activities) && activities.length > 0) {
          return {
            activities,
            source: fields.source?.stringValue || 'Google Cloud Firestore',
            updatedAt: fields.updatedAt?.stringValue || new Date().toISOString(),
            updatedBy: fields.updatedBy?.stringValue || '',
            count: activities.length,
            version: Number(fields.version?.integerValue || 0),
            storageProvider: 'firestore_rest'
          };
        }
      }
    }
  } catch (err) {
    console.warn('[Firestore REST API] Error al consultar Firestore:', err.message);
  }
  return null;
}

/**
 * Guarda en Vercel KV / Upstash Redis si las variables de entorno están presentes.
 */
async function saveToVercelKv(payload) {
  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!kvUrl || !kvToken) return false;

  try {
    const res = await fetch(`${kvUrl}/set/aulas_abiertas_active_schedule`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kvToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Obtiene desde Vercel KV / Upstash Redis.
 */
async function getFromVercelKv() {
  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!kvUrl || !kvToken) return null;

  try {
    const res = await fetch(`${kvUrl}/get/aulas_abiertas_active_schedule`, {
      headers: {
        Authorization: `Bearer ${kvToken}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      const result = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
      if (result && Array.isArray(result.activities) && result.activities.length > 0) {
        return {
          ...result,
          storageProvider: 'vercel_kv'
        };
      }
    }
  } catch {
    // Ignorar
  }
  return null;
}

/**
 * Guarda en caché de archivo local de la instancia serverless.
 */
function saveToTmpFile(payload) {
  try {
    fs.writeFileSync(TMP_CACHE_FILE, JSON.stringify(payload), 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Lee desde caché de archivo local de la instancia serverless.
 */
function getFromTmpFile() {
  try {
    if (fs.existsSync(TMP_CACHE_FILE)) {
      const content = fs.readFileSync(TMP_CACHE_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.activities) && parsed.activities.length > 0) {
        return {
          ...parsed,
          storageProvider: 'tmp_cache'
        };
      }
    }
  } catch {
    // Ignorar
  }
  return null;
}

export default async function handler(req, res) {
  // Encabezados CORS compatibles con dispositivos móviles y navegadores estrictos
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  if (origin !== '*') {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. ENDPOINT DE CONFIGURACIÓN Y ESTADO DE LA NUBE
  if (req.method === 'GET' && (req.query?.info === 'config' || req.query?.info === 'status')) {
    const fbConfig = getFirebaseServerConfig();
    const hasBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    const hasKv = Boolean(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
    const isSharedCloudActive = Boolean(hasBlob || fbConfig.isConfigured || hasKv);

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      isSharedCloudActive,
      activeProvider: hasBlob ? 'Vercel Blob' : (fbConfig.isConfigured ? 'Firebase Firestore' : (hasKv ? 'Vercel KV' : null)),
      cloudStorage: {
        vercelBlob: hasBlob,
        firestoreRest: fbConfig.isConfigured,
        vercelKv: hasKv,
        serverlessTmp: true
      },
      diagnostics: isSharedCloudActive
        ? 'Almacenamiento persistente activo en la nube'
        : 'Modo local sin persistencia global compartida',
      firebase: fbConfig.isConfigured
        ? {
            apiKey: fbConfig.apiKey,
            projectId: fbConfig.projectId,
            authDomain: fbConfig.authDomain,
            storageBucket: fbConfig.storageBucket,
            messagingSenderId: fbConfig.messagingSenderId,
            appId: fbConfig.appId
          }
        : null
    });
  }

  // 2. OBTENER LA PROGRAMACIÓN ACTIVA GLOBAL (Cualquier dispositivo)
  if (req.method === 'GET') {
    const now = Date.now();

    // Capa A: Si tenemos en memoria una versión fresca (< 10 segundos), responderla para óptima latencia
    if (
      inMemorySchedule &&
      Array.isArray(inMemorySchedule.activities) &&
      inMemorySchedule.activities.length > 0 &&
      (now - lastRemoteFetchTime < REMOTE_CACHE_TTL_MS)
    ) {
      return res.status(200).json({
        success: true,
        ...inMemorySchedule
      });
    }

    // Capa B: Vercel Blob Storage (Persistencia global en CDN de Vercel)
    const blobData = await getFromVercelBlob();
    if (blobData) {
      inMemorySchedule = blobData;
      lastRemoteFetchTime = now;
      saveToTmpFile(blobData);
      return res.status(200).json({
        success: true,
        ...blobData
      });
    }

    // Capa C: Firestore REST API
    const firestoreData = await getFromFirestoreRest();
    if (firestoreData) {
      inMemorySchedule = firestoreData;
      lastRemoteFetchTime = now;
      saveToTmpFile(firestoreData);
      return res.status(200).json({
        success: true,
        ...firestoreData
      });
    }

    // Capa D: Vercel KV / Upstash Redis
    const kvData = await getFromVercelKv();
    if (kvData) {
      inMemorySchedule = kvData;
      lastRemoteFetchTime = now;
      saveToTmpFile(kvData);
      return res.status(200).json({
        success: true,
        ...kvData
      });
    }

    // Capa E: Memoria en caliente residual (si los remotos no respondieron)
    if (inMemorySchedule && Array.isArray(inMemorySchedule.activities) && inMemorySchedule.activities.length > 0) {
      return res.status(200).json({
        success: true,
        source: inMemorySchedule.source || 'Vercel Cloud Cache',
        updatedAt: inMemorySchedule.updatedAt,
        updatedBy: inMemorySchedule.updatedBy,
        activities: inMemorySchedule.activities,
        count: inMemorySchedule.activities.length,
        version: inMemorySchedule.version,
        storageProvider: inMemorySchedule.storageProvider || 'in_memory'
      });
    }

    // Capa F: Archivo en /tmp
    const tmpData = getFromTmpFile();
    if (tmpData) {
      inMemorySchedule = tmpData;
      return res.status(200).json({
        success: true,
        ...tmpData
      });
    }

    return res.status(200).json({
      success: true,
      activities: null,
      message: 'No hay agenda personalizada guardada aún en la nube. Usar fuente CSV oficial o Firestore.'
    });
  }

  // 3. GUARDAR PROGRAMACIÓN GLOBAL (Solo administradores autenticados por Vercel)
  if (req.method === 'POST') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : req.body?.token;

    const session = verifyToken(token);
    if (!session) {
      return res.status(401).json({
        error: 'No autorizado. Se requiere token de sesión administrativo válido de Vercel.'
      });
    }

    const { activities, source = 'Boletín MailerLite / Scraper Gemini IA', updatedBy } = req.body || {};

    if (!Array.isArray(activities) || activities.length === 0) {
      return res.status(400).json({
        error: 'El cuerpo debe incluir un arreglo "activities" con al menos una conferencia válida.'
      });
    }

    const nowIso = new Date().toISOString();
    const version = Date.now();

    const payload = {
      activities,
      source,
      updatedBy: updatedBy || session.email,
      updatedAt: nowIso,
      count: activities.length,
      version
    };

    // Actualizar memoria y caché de archivo local
    inMemorySchedule = { ...payload, storageProvider: 'in_memory' };
    lastRemoteFetchTime = Date.now();
    saveToTmpFile(inMemorySchedule);

    // Intentar persistir en todos los proveedores de nube persistente disponibles en paralelo
    const [blobRes, firestoreOk, kvOk] = await Promise.all([
      saveToVercelBlob(payload),
      saveToFirestoreRest(payload),
      saveToVercelKv(payload)
    ]);

    let remotePersisted = false;
    let storageProvider = 'local_ephemeral_tmp';
    const activeProviders = [];

    if (blobRes) {
      remotePersisted = true;
      storageProvider = 'vercel_blob';
      activeProviders.push('Vercel Blob');
    }
    if (firestoreOk) {
      remotePersisted = true;
      if (!blobRes) storageProvider = 'firestore_rest';
      activeProviders.push('Firebase Firestore');
    }
    if (kvOk) {
      remotePersisted = true;
      if (!blobRes && !firestoreOk) storageProvider = 'vercel_kv';
      activeProviders.push('Vercel KV');
    }

    inMemorySchedule.storageProvider = storageProvider;

    return res.status(200).json({
      success: true,
      persisted: remotePersisted,
      storageProvider,
      activeProviders,
      message: remotePersisted
        ? `¡Programación de ${activities.length} actividades guardada exitosamente en la nube (${activeProviders.join(' + ')})!`
        : `Programación guardada únicamente en la memoria local de esta instancia. Para sincronizar incógnito y otros dispositivos, activa Vercel Blob (1 clic en Vercel Dashboard) o Firebase Firestore.`,
      warning: remotePersisted
        ? null
        : 'No se detectó un almacenamiento en la nube persistente (Vercel Blob, Firebase Firestore o Vercel KV). Los datos solo se guardaron temporalmente en esta sesión de servidor.',
      howToFix: remotePersisted
        ? null
        : {
            recommended: 'Activa Vercel Blob en 1 clic: En Vercel Dashboard > Storage > Create Database > Blob > Connect.',
            alternative: 'O agrega las variables de Firebase Firestore (VITE_FIREBASE_PROJECT_ID y VITE_FIREBASE_API_KEY) en Vercel Dashboard > Settings > Environment Variables.'
          },
      updatedAt: nowIso,
      updatedBy: session.email,
      count: activities.length,
      version
    });
  }

  return res.status(405).json({ error: 'Método no permitido. Utiliza GET o POST.' });
}

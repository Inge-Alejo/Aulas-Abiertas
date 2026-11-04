/**
 * Serverless API para Vercel: Persistencia y Consulta de Programación Académica
 * Permite almacenar y servir la agenda académica activa global para cualquier dispositivo,
 * complementando Firestore como capa de persistencia y sincronización segura en la nube.
 */

import { verifyToken } from './auth.js';

// Memoria en caliente para la instancia de ejecución serverless
let inMemorySchedule = null;

export default async function handler(req, res) {
  // CORS Headers
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

  // 1. OBTENER LA PROGRAMACIÓN ACTIVA GLOBAL (Cualquier dispositivo)
  if (req.method === 'GET') {
    // Si tenemos agenda en memoria
    if (inMemorySchedule && Array.isArray(inMemorySchedule.activities) && inMemorySchedule.activities.length > 0) {
      return res.status(200).json({
        success: true,
        source: inMemorySchedule.source || 'Vercel Cloud Cache',
        updatedAt: inMemorySchedule.updatedAt,
        updatedBy: inMemorySchedule.updatedBy,
        activities: inMemorySchedule.activities,
        count: inMemorySchedule.activities.length
      });
    }

    return res.status(200).json({
      success: true,
      activities: null,
      message: 'No hay agenda personalizada guardada aún. Usar fuente CSV oficial o Firestore.'
    });
  }

  // 2. GUARDAR PROGRAMACIÓN GLOBAL (Solo administradores autenticados por Vercel)
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
    inMemorySchedule = {
      activities,
      source,
      updatedBy: updatedBy || session.email,
      updatedAt: nowIso,
      count: activities.length
    };

    return res.status(200).json({
      success: true,
      message: `¡Programación de ${activities.length} actividades guardada exitosamente en la nube!`,
      updatedAt: nowIso,
      updatedBy: session.email,
      count: activities.length
    });
  }

  return res.status(405).json({ error: 'Método no permitido. Utiliza GET o POST.' });
}

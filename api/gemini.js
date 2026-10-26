/**
 * API Serverless para Vercel: Asistente Académico con Gemini API
 * Soporta alternancia/fallback de modelos:
 * Prioridad 1: gemini-3.5-flash-lite
 * Prioridad 2: gemini-3.1-flash-lite
 * Fallback resiliente: gemini-2.5-flash-lite -> gemini-2.0-flash -> gemini-1.5-flash
 */

const CANDIDATE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
];

export default async function handler(req, res) {
  // Configuración de cabeceras CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Utiliza POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'La variable de entorno GEMINI_API_KEY no está configurada en el servidor/Vercel.',
      setupHelp: 'Configura GEMINI_API_KEY en el panel de Vercel en Settings > Environment Variables.'
    });
  }

  try {
    const { prompt, history = [], scheduleContext = '' } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Se requiere un prompt de texto válido.' });
    }

    const systemInstruction = `Eres el Asistente Académico Oficial de Aulas Abiertas, iniciativa de la Facultad de Medicina de la Universidad de Antioquia (UdeA) y el equipo de Teleducación.
Tu misión es orientar con rigor, calidez y precisión a estudiantes de medicina, docentes, médicos especialistas y público general sobre la programación académica de conferencias, temas en salud, ponentes, especialidades y modalidades de conexión.

INFORMACIÓN INSTITUCIONAL VERIFICADA:
- Institución: Facultad de Medicina, Universidad de Antioquia (UdeA). Sede: Cra 51D #62-29, Medellín.
- Contacto Teleducación: WhatsApp +57 302 306 1888 | Correo aprendizajes.med@udea.edu.co.
- Canal oficial de YouTube: @teleducacionmedicinaudea.
- Zona horaria de todas las actividades: America/Bogota (UTC-5).

CONTEXTO DE LA PROGRAMACIÓN ACADÉMICA ACTUAL:
${scheduleContext ? scheduleContext : 'No se suministró contexto de actividades para esta consulta.'}

DIRECTRICES DE RESPUESTA:
1. Responde siempre en español, con tono académico, cercano y profesional.
2. Si te preguntan por fechas, horarios o enlaces, consulta ÚNICAMENTE las actividades del contexto anterior. Nunca inventes ponentes, horas o enlaces ficticios.
3. Si el usuario pregunta por una especialidad o tema que no está programado esta semana, indícalo con amabilidad e invítalo a revisar las listas temáticas en YouTube o a proponer el tema mediante el contacto oficial.
4. Mantén las respuestas concisas y bien formateadas con viñetas o negritas legibles.`;

    // Preparar el historial de chat para la API de Gemini
    const contents = [];
    
    // Si hay historial previo
    if (Array.isArray(history)) {
      history.forEach((msg) => {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        });
      });
    }

    // Agregar el mensaje actual del usuario
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    let lastError = null;
    let successfulResponse = null;
    let usedModel = null;

    // Iterar en orden de prioridad para alternancia/fallback
    for (const model of CANDIDATE_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: systemInstruction }]
            },
            contents: contents,
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1000
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) {
            successfulResponse = candidateText;
            usedModel = model;
            break; // Éxito con este modelo
          }
        } else {
          const errData = await response.json().catch(() => ({}));
          lastError = { model, status: response.status, details: errData };
          // Si el modelo no existe (404) o da error de disponibilidad, continúa al siguiente
          console.warn(`[Gemini API] Fallo con modelo ${model} (${response.status}), probando alternativa...`);
        }
      } catch (err) {
        lastError = { model, error: err.message };
        console.warn(`[Gemini API] Excepción con modelo ${model}:`, err.message);
      }
    }

    if (successfulResponse) {
      return res.status(200).json({
        response: successfulResponse,
        modelUsed: usedModel,
        timestamp: new Date().toISOString()
      });
    }

    return res.status(502).json({
      error: 'No fue posible obtener respuesta con ninguno de los modelos de Gemini candidatos.',
      lastError
    });
  } catch (error) {
    console.error('[Gemini Serverless Error]:', error);
    return res.status(500).json({
      error: 'Error interno al procesar la solicitud con Gemini API.',
      details: error.message
    });
  }
}

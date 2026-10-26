/**
 * Serverless API para Vercel: Scraper Inteligente de Boletines MailerLite con Gemini IA
 * Permite ingresar una URL de MailerLite (ej: https://preview.mailerlite.com/k8w4m4m5a6)
 * y extraer todas las actividades estructuradas en JSON y CSV para Google Sheets.
 */

const CANDIDATE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Utiliza POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'La variable de entorno GEMINI_API_KEY no está configurada.',
      setupHelp: 'Configura GEMINI_API_KEY en Vercel o en tu archivo .env local.'
    });
  }

  try {
    const { url, rawContent } = req.body || {};
    let contentToAnalyze = rawContent || '';

    // Si se proporciona una URL de MailerLite, obtener el contenido HTML
    if (url && typeof url === 'string' && url.startsWith('http')) {
      try {
        const fetchRes = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });

        if (!fetchRes.ok) {
          throw new Error(`Error HTTP ${fetchRes.status} al consultar la URL de MailerLite.`);
        }

        const html = await fetchRes.text();
        
        // Limpieza profunda de scripts, estilos y atributos CSS redundantes para preservar todo el contenido textual y enlaces
        contentToAnalyze = html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
          .replace(/\s*(?:style|class|id|cellpadding|cellspacing|border|width|height|bgcolor|align|valign|target|role|data-[a-z-]+|aria-[a-z-]+)="[^"]*"/gi, '')
          .replace(/\s*(?:style|class|id|cellpadding|cellspacing|border|width|height|bgcolor|align|valign|target|role|data-[a-z-]+|aria-[a-z-]+)='[^']*'/gi, '')
          .replace(/<(?:\/)?(?:tbody|thead|tfoot)>/gi, '')
          .replace(/\s{2,}/g, ' ');
      } catch (err) {
        return res.status(400).json({
          error: `No fue posible descargar el contenido del enlace: ${err.message}`
        });
      }
    }

    if (!contentToAnalyze) {
      return res.status(400).json({ error: 'Debes proporcionar una URL válida de MailerLite o el contenido del boletín.' });
    }

    const systemInstruction = `Eres un extractor experto de datos estructurados para la Facultad de Medicina de la Universidad de Antioquia (UdeA) y Aulas Abiertas.
Tu tarea es analizar minuciosamente TODO el boletín semanal de MailerLite y extraer CADA UNA de las conferencias o actividades académicas programadas para todos los días de la semana (Lunes, Martes, Miércoles, Jueves, Viernes, Sábado/Domingo).

INSTRUCCIONES CLAVE DE EXTRACCIÓN:
1. EXHAUSTIVIDAD TOTAL: El boletín contiene habitualmente entre 30 y 40 conferencias en total para toda la semana. Debes recorrer el documento de principio a fin y extraer ABSOLUTAMENTE TODAS las actividades sin omitir ninguna y sin detenerte prematuramente.
2. FECHAS EXACTAS: El boletín agrupa las conferencias bajo encabezados de días como "Lunes 26 de octubre", "Martes 27 de octubre", "Miércoles 28 de octubre", "Jueves 29 de octubre", "Viernes 30 de octubre". Determina el año, mes y día exactos y escribe la fecha en formato ISO "AAAA-MM-DD" (por ejemplo: "2026-10-26") para cada actividad de ese día.
3. HORA: La hora de inicio (start_time) normalizada en formato 24h "HH:mm" (ej: "07:00", "08:30", "14:00"). La hora de fin (end_time) si existe en "HH:mm", o cadena vacía "" si no se especifica.
4. CAMPOS A EXTRAER POR CADA ACTIVIDAD (JSON):
- id: Identificador único generado (ej: "AA-2026-001", "AA-2026-002", etc.)
- date: Fecha en formato "AAAA-MM-DD"
- start_time: Hora de inicio en formato "HH:mm" (24h)
- end_time: Hora de finalización "HH:mm" o ""
- department: Especialidad, servicio o departamento médico (ej: "Urología", "Medicina Interna", "Dermatología", "Cirugía General", "GREAPIC", etc.)
- title: Título completo y exacto de la conferencia
- speakers: Nombre del ponente o ponentes separados por punto y coma ";". Si no hay, ""
- modality: "Virtual", "Presencial", "Híbrida" o "Por confirmar"
- location: Lugar físico o plataforma (ej: "Piso 5", "Auditorio", "Teams", "Zoom")
- meeting_url: URL real de conexión (Teams, Zoom, Meet, etc.) si aparece en el boletín, o ""
- recording_url: URL de grabación o transmisión si aparece, o ""
- summary: Breve descripción o temática si se detalla en el texto, o ""

IMPORTANTE: Devuelve ÚNICAMENTE un bloque JSON válido con el arreglo completo de actividades sin texto adicional.`;

    let successfulResponse = null;
    let usedModel = null;
    let lastError = null;

    for (const model of CANDIDATE_MODELS) {
      try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: [
              {
                role: 'user',
                parts: [{ text: `A continuación el contenido del boletín MailerLite para extraer:\n\n${contentToAnalyze}` }]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 8192,
              responseMimeType: 'application/json'
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) {
            successfulResponse = candidateText;
            usedModel = model;
            break;
          }
        } else {
          lastError = { model, status: response.status };
          console.warn(`[MailerLite Scraper] Fallo con ${model} (${response.status}), probando alternativa...`);
        }
      } catch (err) {
        lastError = { model, error: err.message };
      }
    }

    if (!successfulResponse) {
      return res.status(502).json({
        error: 'No se pudo procesar el boletín con los modelos de Gemini disponibles.',
        lastError
      });
    }

    // Parsear el JSON devuelto por Gemini
    let activities = [];
    try {
      const cleanJson = successfulResponse.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      activities = JSON.parse(cleanJson);
      if (!Array.isArray(activities) && activities.activities) {
        activities = activities.activities;
      }
    } catch (parseErr) {
      return res.status(500).json({
        error: 'La respuesta de la IA no pudo ser parseada como JSON válido.',
        rawText: successfulResponse
      });
    }

    // Convertir las actividades extraídas a formato CSV para Google Sheets
    const csvHeaders = ['id', 'date', 'start_time', 'end_time', 'department', 'title', 'speakers', 'modality', 'location', 'meeting_url', 'recording_url', 'summary'];
    const csvRows = [csvHeaders.join(',')];

    activities.forEach((act) => {
      const row = csvHeaders.map((header) => {
        const val = act[header] !== undefined && act[header] !== null ? String(act[header]) : '';
        // Escapar comillas dobles y encerrar si tiene comas o saltos de línea
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      });
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\r\n');

    return res.status(200).json({
      success: true,
      count: activities.length,
      modelUsed: usedModel,
      activities,
      csvContent,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[MailerLite Scraper Error]:', error);
    return res.status(500).json({
      error: 'Error interno en el scraper de MailerLite con Gemini.',
      details: error.message
    });
  }
}

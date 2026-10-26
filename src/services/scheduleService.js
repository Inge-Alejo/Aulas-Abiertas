/**
 * scheduleService.js
 * Capa de datos para Aulas Abiertas - Facultad de Medicina UdeA
 * Responsable de la obtención, análisis CSV, validación, normalización y agrupación de la agenda académica.
 */

import Papa from 'papaparse';

/**
 * Normaliza una hora en formatos diversos (ej: "7:00 am", "06:30 am", "02:00 pm", "14:00", "6:30") a "HH:mm" (24h)
 * @param {string} raw
 * @returns {string} Formato HH:mm
 */
export function normalizeTime(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const str = raw.trim().toLowerCase();
  
  // Detectar AM/PM
  const isPM = str.includes('pm') || str.includes('p.m.');
  const isAM = str.includes('am') || str.includes('a.m.');
  const cleaned = str.replace(/[^0-9:]/g, '');
  const parts = cleaned.split(':');
  
  if (parts.length < 2) return '';
  let hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  
  if (isNaN(hours) || isNaN(minutes) || minutes < 0 || minutes > 59) return '';
  
  if (isPM && hours < 12) {
    hours += 12;
  } else if (isAM && hours === 12) {
    hours = 0;
  }
  
  if (hours < 0 || hours > 23) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Valida un formato de fecha ISO YYYY-MM-DD
 * @param {string} dateStr
 * @returns {boolean}
 */
export function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * Valida si una URL es sintácticamente correcta y segura (http o https)
 * @param {string} urlStr
 * @returns {boolean}
 */
export function isValidUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const trimmed = urlStr.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Normaliza la modalidad a valores estándar
 * @param {string} raw
 * @returns {"Virtual" | "Presencial" | "Híbrida" | "Por confirmar"}
 */
export function normalizeModality(raw) {
  if (!raw || typeof raw !== 'string') return 'Por confirmar';
  const lower = raw.trim().toLowerCase();
  if (lower.includes('híbrid') || lower.includes('hibrid')) return 'Híbrida';
  if (lower.includes('presenc')) return 'Presencial';
  if (lower.includes('virtua') || lower.includes('remot') || lower.includes('en línea') || lower.includes('online')) return 'Virtual';
  return 'Por confirmar';
}

/**
 * Obtiene el lunes de la semana para una fecha determinada (en zona horaria America/Bogota)
 * @param {string} dateStr YYYY-MM-DD
 * @returns {string} YYYY-MM-DD del lunes
 */
export function getMondayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Usar UTC con fecha fija para evitar saltos de horario
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = date.getUTCDay(); // 0 es Domingo, 1 es Lunes
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  date.setUTCDate(date.getUTCDate() + diffToMonday);
  return date.toISOString().split('T')[0];
}

/**
 * Obtiene el domingo de la semana correspondiente a un lunes
 * @param {string} mondayStr YYYY-MM-DD
 * @returns {string} YYYY-MM-DD del domingo
 */
export function getSundayOfWeek(mondayStr) {
  const [y, m, d] = mondayStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().split('T')[0];
}

/**
 * Formatea un rango de fechas para presentar la semana
 * @param {string} startStr YYYY-MM-DD
 * @param {string} endStr YYYY-MM-DD
 * @returns {string} Ej: "Semana del 26 al 30 de octubre de 2026"
 */
export function formatWeekRange(startStr, endStr) {
  if (!startStr || !endStr) return '';
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  
  const [y1, m1, d1] = startStr.split('-').map(Number);
  const [y2, m2, d2] = endStr.split('-').map(Number);
  
  if (y1 === y2) {
    if (m1 === m2) {
      return `Semana del ${d1} al ${d2} de ${months[m1 - 1]} de ${y1}`;
    }
    return `Semana del ${d1} de ${months[m1 - 1]} al ${d2} de ${months[m2 - 1]} de ${y1}`;
  }
  return `Semana del ${d1} de ${months[m1 - 1]} de ${y1} al ${d2} de ${months[m2 - 1]} de ${y2}`;
}

/**
 * Formatea el nombre del día en español (ej: "Lunes 26 de octubre")
 * @param {string} dateStr YYYY-MM-DD
 * @returns {string}
 */
export function formatDayLabel(dateStr) {
  if (!isValidDate(dateStr)) return dateStr;
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayName = days[date.getUTCDay()];
  return `${dayName} ${d} de ${months[m - 1]}`;
}

/**
 * Parsea e interpreta el texto CSV a un array de actividades limpias y estructuradas
 * @param {string} csvText
 * @returns {{ activities: Array, warnings: Array }}
 */
export function parseScheduleCsv(csvText) {
  if (!csvText || typeof csvText !== 'string' || csvText.trim().length === 0) {
    return { activities: [], warnings: ['El contenido CSV está vacío'] };
  }

  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: h => h.trim().toLowerCase().replace(/\s+/g, '_')
  });

  const warnings = [];
  const validMap = new Map();

  result.data.forEach((row, index) => {
    // Columnas esperadas: id, date, start_time, end_time, department, title, speakers, modality, location, meeting_url, recording_url, summary
    const rawDate = row.date ? String(row.date).trim() : '';
    const rawStart = row.start_time ? String(row.start_time).trim() : '';
    const rawTitle = row.title ? String(row.title).trim() : '';
    const rawDept = row.department ? String(row.department).trim() : '';

    // Descartar filas sin campos mínimos obligatorios
    if (!rawDate && !rawTitle) {
      return; // fila vacía o de relleno
    }

    if (!isValidDate(rawDate)) {
      warnings.push(`Fila ${index + 2}: Fecha inválida o ausente "${rawDate}".`);
      return;
    }

    const startTime = normalizeTime(rawStart);
    if (!startTime) {
      warnings.push(`Fila ${index + 2}: Hora de inicio inválida o ausente "${rawStart}".`);
      return;
    }

    const endTime = row.end_time ? normalizeTime(String(row.end_time)) : '';
    const title = rawTitle.replace(/^["']|["']$/g, '').trim();
    if (!title) {
      warnings.push(`Fila ${index + 2}: Título ausente.`);
      return;
    }

    const department = rawDept || 'Facultad de Medicina';
    const speakers = row.speakers ? String(row.speakers).trim() : '';
    const modality = normalizeModality(row.modality);
    const location = row.location ? String(row.location).trim() : '';
    
    // Validación de URLs
    const rawMeeting = row.meeting_url ? String(row.meeting_url).trim() : '';
    const meeting_url = isValidUrl(rawMeeting) ? rawMeeting : '';
    
    const rawRecording = row.recording_url ? String(row.recording_url).trim() : '';
    const recording_url = isValidUrl(rawRecording) ? rawRecording : '';

    const summary = row.summary ? String(row.summary).trim() : '';

    // Generar ID único estable si no viene
    const id = (row.id && String(row.id).trim()) || `AA-${rawDate}-${startTime.replace(':', '')}-${index}`;

    // Evitar duplicados por ID
    if (validMap.has(id)) {
      warnings.push(`Fila ${index + 2}: Se descartó actividad duplicada con ID "${id}".`);
      return;
    }

    const monday = getMondayOfWeek(rawDate);
    const sunday = getSundayOfWeek(monday);

    validMap.set(id, {
      id,
      date: rawDate,
      startTime,
      endTime,
      department,
      title,
      speakers,
      modality,
      location,
      meeting_url,
      recording_url,
      summary,
      weekKey: monday,
      weekMonday: monday,
      weekSunday: sunday,
      dayLabel: formatDayLabel(rawDate)
    });
  });

  const activities = Array.from(validMap.values());

  // Orden cronológico: fecha ascendente, luego hora ascendente
  activities.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });

  return { activities, warnings };
}

/**
 * Obtiene la lista de semanas disponibles con sus metadatos
 * @param {Array} activities
 * @returns {Array<{ weekKey: string, monday: string, sunday: string, label: string, count: number }>}
 */
export function getAvailableWeeks(activities) {
  const weekMap = new Map();

  activities.forEach(act => {
    if (!weekMap.has(act.weekKey)) {
      weekMap.set(act.weekKey, {
        weekKey: act.weekKey,
        monday: act.weekMonday,
        sunday: act.weekSunday,
        label: formatWeekRange(act.weekMonday, act.weekSunday),
        count: 0
      });
    }
    weekMap.get(act.weekKey).count++;
  });

  const weeks = Array.from(weekMap.values());
  weeks.sort((a, b) => a.monday.localeCompare(b.monday));
  return weeks;
}

/**
 * Agrupa las actividades de una semana por día
 * @param {Array} activities
 * @param {string} weekKey
 * @returns {Array<{ date: string, dayLabel: string, activities: Array }>}
 */
export function getActivitiesGroupedByDay(activities, weekKey) {
  const weekActs = activities.filter(a => a.weekKey === weekKey);
  const dayMap = new Map();

  weekActs.forEach(act => {
    if (!dayMap.has(act.date)) {
      dayMap.set(act.date, {
        date: act.date,
        dayLabel: act.dayLabel,
        activities: []
      });
    }
    dayMap.get(act.date).activities.push(act);
  });

  const days = Array.from(dayMap.values());
  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}

/**
 * Obtiene información detallada y estado en tiempo real de la actividad actual (en vivo) o próxima sesión
 * @param {Array} activities
 * @param {Date} [referenceTime]
 * @returns {{ activity: Object, isLiveNow: boolean, isToday: boolean, badgeLabel: string, statusMessage: string, currentTimeStr: string }|null}
 */
export function getUpcomingActivityInfo(activities, referenceTime = new Date()) {
  if (!activities || activities.length === 0) return null;

  // Formatear fecha y hora en formato ISO para America/Bogota (COT / UTC-5)
  const bogotaFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = bogotaFormatter.formatToParts(referenceTime);
  const partMap = {};
  parts.forEach(p => { partMap[p.type] = p.value; });

  const currentDate = `${partMap.year}-${partMap.month}-${partMap.day}`;
  const currentTime = `${partMap.hour}:${partMap.minute}`;

  // Ordenar cronológicamente
  const sorted = [...activities].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.startTime || '').localeCompare(b.startTime || '');
  });

  // 1. REUNIÓN EN VIVO AHORA: Revisar si hay alguna actividad que esté ocurriendo en este instante
  for (const act of sorted) {
    if (act.date === currentDate) {
      const finishTime = act.endTime || (() => {
        const [h, m] = (act.startTime || '07:00').split(':').map(Number);
        return `${String(Math.min(23, h + 2)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      })();

      if (currentTime >= act.startTime && currentTime <= finishTime) {
        return {
          activity: act,
          isLiveNow: true,
          isToday: true,
          badgeLabel: '🔴 EN VIVO AHORA MISMO',
          statusMessage: `Sesión académica transmitiéndose en directo (finaliza aprox. ${finishTime} COT)`,
          currentTimeStr: currentTime
        };
      }
    }
  }

  // 2. PRÓXIMA REUNIÓN HOY: Misma fecha, hora futura
  for (const act of sorted) {
    if (act.date === currentDate && act.startTime > currentTime) {
      return {
        activity: act,
        isLiveNow: false,
        isToday: true,
        badgeLabel: `⏱️ Próxima Sesión Hoy a las ${act.startTime} COT`,
        statusMessage: `Comienza hoy a las ${act.startTime} COT`,
        currentTimeStr: currentTime
      };
    }
  }

  // 3. PRÓXIMA REUNIÓN EN DÍAS FUTUROS
  for (const act of sorted) {
    if (act.date > currentDate) {
      return {
        activity: act,
        isLiveNow: false,
        isToday: false,
        badgeLabel: '📅 Próxima Sesión Académica',
        statusMessage: `Programada para el ${act.dayLabel || act.date} a las ${act.startTime} COT`,
        currentTimeStr: currentTime
      };
    }
  }

  // 4. Si todas las actividades ya concluyeron, retornar la última para consulta de grabaciones
  const fallback = sorted[sorted.length - 1] || null;
  if (!fallback) return null;

  return {
    activity: fallback,
    isLiveNow: false,
    isToday: false,
    badgeLabel: 'Sesión Académica Reciente',
    statusMessage: `Última sesión realizada el ${fallback.dayLabel || fallback.date}`,
    currentTimeStr: currentTime
  };
}

/**
 * Obtiene la próxima actividad o sesión actual según la hora local de Colombia (America/Bogota)
 * Mantiene compatibilidad hacia atrás con pruebas y llamadas directas.
 * @param {Array} activities
 * @param {Date} [referenceTime]
 * @returns {Object|null}
 */
export function getUpcomingActivity(activities, referenceTime = new Date()) {
  const info = getUpcomingActivityInfo(activities, referenceTime);
  return info ? info.activity : null;
}

/**
 * Filtra actividades combinando texto, día, departamento y modalidad
 * @param {Array} activities
 * @param {{ search?: string, day?: string, department?: string, modality?: string }} filters
 * @returns {Array}
 */
export function filterActivities(activities, filters = {}) {
  const { search = '', day = '', department = '', modality = '' } = filters;
  const searchLower = search.trim().toLowerCase();

  return activities.filter(act => {
    // Filtro por día específico (YYYY-MM-DD)
    if (day && act.date !== day) return false;

    // Filtro por departamento
    if (department && act.department.toLowerCase() !== department.toLowerCase()) return false;

    // Filtro por modalidad
    if (modality && act.modality.toLowerCase() !== modality.toLowerCase()) return false;

    // Búsqueda de texto libre en título, ponentes, departamento y resumen
    if (searchLower) {
      const matchTitle = act.title.toLowerCase().includes(searchLower);
      const matchDept = act.department.toLowerCase().includes(searchLower);
      const matchSpeakers = act.speakers.toLowerCase().includes(searchLower);
      const matchSummary = act.summary.toLowerCase().includes(searchLower);
      const matchLocation = act.location.toLowerCase().includes(searchLower);

      if (!matchTitle && !matchDept && !matchSpeakers && !matchSummary && !matchLocation) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Servicio principal de carga de agenda
 * @param {Object} [options]
 * @param {string} [options.url]
 * @param {boolean} [options.forceRefresh]
 * @returns {Promise<{ activities: Array, source: string, lastUpdated: string, isLive: boolean, warnings: Array }>}
 */
export async function loadScheduleData(options = {}) {
  const configuredUrl = options.url || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PUBLIC_SCHEDULE_CSV_URL) || '';
  const isCustomUrl = Boolean(configuredUrl && configuredUrl.trim().length > 0);
  
  let targetUrl = isCustomUrl ? configuredUrl.trim() : '/data/programacion_semanal_octubre_2026.csv';
  
  if (options.forceRefresh) {
    const separator = targetUrl.includes('?') ? '&' : '?';
    targetUrl += `${separator}_ts=${Date.now()}`;
  }

  const response = await fetch(targetUrl);
  if (!response.ok) {
    throw new Error(`Error al consultar los datos: ${response.status} ${response.statusText}`);
  }

  const csvText = await response.text();
  const { activities, warnings } = parseScheduleCsv(csvText);

  return {
    activities,
    source: isCustomUrl ? 'Google Sheets (CSV en vivo)' : 'Programación Oficial UdeA (Octubre 2026)',
    isLive: isCustomUrl,
    lastUpdated: new Date().toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/Bogota'
    }),
    warnings
  };
}

/**
 * main.js
 * Lógica de interacción, renderizado reactivo y gestión de estado para Aulas Abiertas.
 */

import {
  loadScheduleData,
  getAvailableWeeks,
  getActivitiesGroupedByDay,
  getUpcomingActivity,
  getUpcomingActivityInfo,
  getActiveOrUpcomingSessions,
  filterActivities,
  formatDayLabel,
  formatTime12h,
  getMondayOfWeek,
  getSundayOfWeek,
  normalizeDate,
  isValidDate
} from './services/scheduleService.js';

import {
  loginAdmin,
  logoutAdmin,
  onAdminAuthChange,
  verifyAdminSession,
  getAdminUser
} from './services/authService.js';

import {
  saveLiveScheduleToFirebase,
  getLiveScheduleFromFirebase,
  subscribeToLiveSchedule,
  getFavoriteActivityIds,
  toggleFavoriteActivity,
  submitActivityQuestion,
  getFirebaseStatus
} from './services/firebaseService.js';

import {
  scrapeMailerliteWithGemini
} from './services/geminiService.js';

import {
  escapeHtml,
  sanitizeUrl
} from './utils/security.js';

export { escapeHtml, sanitizeUrl };

// Estado global de la aplicación
const state = {
  allActivities: [],
  availableWeeks: [],
  selectedWeekKey: '',
  filters: {
    search: '',
    day: '',
    department: '',
    modality: ''
  },
  isLoading: true,
  isRefreshing: false,
  dataSourceInfo: {
    source: '',
    lastUpdated: '',
    isLive: false
  }
};

// 12 Listas de reproducción temáticas oficiales verificadas del canal de Teleducación UdeA
// Incluye las especialidades solicitadas actualmente activas en Aulas Abiertas (3 filas x 4 columnas)
const VERIFIED_PLAYLISTS = [
  {
    title: 'Urología',
    id: 'PLWutZMaMUREe0B2XwcNLikJ-k-vdctked',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREe0B2XwcNLikJ-k-vdctked',
    category: 'Áreas médico-quirúrgicas',
    description: 'Urología oncológica, litiasis urinaria, endourología, trasplante y cirugía reconstructiva.'
  },
  {
    title: 'Anestesiología',
    id: 'PLWutZMaMUREe-WzJhxuwkjc5_On2c6--Q',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREe-WzJhxuwkjc5_On2c6--Q',
    category: 'Áreas médico-quirúrgicas',
    description: 'Vía aérea difícil, farmacología perioperatoria, monitoreo hemodinámico e invasivo.'
  },
  {
    title: 'Rehabilitación Cardiaca',
    id: 'rehabilitacion-cardiaca',
    url: 'https://www.youtube.com/@teleducacionmedicinaudea/search?query=Rehabilitaci%C3%B3n+Cardiaca',
    category: 'Especialidades médicas y cardiología',
    description: 'Rehabilitación en falla cardíaca, paciente oncológico, prevención secundaria y ejercicio terapéutico.'
  },
  {
    title: 'Medicina de Urgencias',
    id: 'PLWutZMaMUREcHGQHpTR1Orc08Zx1DGspv',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREcHGQHpTR1Orc08Zx1DGspv',
    category: 'Atención clínica y crítica',
    description: 'Reanimación cardiopulmonar, trombolisis, trauma, shock y soporte vital avanzado.'
  },
  {
    title: 'Medicina Crítica y Cuidados Intensivos',
    id: 'medicina-critica-cuidados-intensivos',
    url: 'https://www.youtube.com/@teleducacionmedicinaudea/search?query=Medicina+Cr%C3%ADtica+y+Cuidados+Intensivos',
    category: 'Atención clínica y crítica',
    description: 'Ventilación mecánica, vía aérea en UCI, shock cardiogénico, SDRA y cuidado crítico integral.'
  },
  {
    title: 'Alergología',
    id: 'PLWutZMaMUREeyppOkA_BSZWFI5rlEgM8e',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREeyppOkA_BSZWFI5rlEgM8e',
    category: 'Especialidades médicas',
    description: 'Hipersensibilidad a fármacos, inmunoterapia de alérgenos y patologías atópicas complejas.'
  },
  {
    title: 'Endocrinología',
    id: 'PLWutZMaMUREfcP8tw36_ngXsrOtpMgUwq',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREfcP8tw36_ngXsrOtpMgUwq',
    category: 'Especialidades médicas',
    description: 'Diabetes mellitus, tiroides, osteoporosis, metabolismo óseo y endocrinopatías.'
  },
  {
    title: 'GRAEPIC',
    id: 'PLWutZMaMUREd2CBAFWR0FaW_vK9U_7Wm3',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREd2CBAFWR0FaW_vK9U_7Wm3',
    category: 'Investigación y evidencia clínica',
    description: 'Grupo Académico de Epidemiología Clínica (GRAEPIC) UdeA y Cochrane: medicina basada en la evidencia y análisis causal.'
  },
  {
    title: 'Nefrología',
    id: 'PLWutZMaMUREfIPu3L-df2t0xnaJhL3pXz',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREfIPu3L-df2t0xnaJhL3pXz',
    category: 'Especialidades médicas',
    description: 'Enfermedad renal crónica, glomerulopatías primarias, hemodiálisis y trasplante renal.'
  },
  {
    title: 'Medicina Física y Rehabilitación',
    id: 'PLWutZMaMUREczvFffoLHzIgY0wjqkJsod',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREczvFffoLHzIgY0wjqkJsod',
    category: 'Especialidades médicas',
    description: 'Neurorrehabilitación, patologías neuromusculares y rehabilitación funcional integral.'
  },
  {
    title: 'Pediatría',
    id: 'PLWutZMaMUREfGxKGOcU0DJ1dyZQT0bmgt',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREfGxKGOcU0DJ1dyZQT0bmgt',
    category: 'Salud materno-infantil',
    description: 'Infectología pediátrica, nutrición, desarrollo infantil, urgencias pediátricas y neonatología.'
  },
  {
    title: 'Videoteca Completa Teleducación UdeA',
    id: 'todas-las-listas-udea',
    url: 'https://www.youtube.com/@teleducacionmedicinaudea/playlists',
    category: 'Repositorio institucional',
    description: 'Explora el archivo completo de conferencias, simposios y jornadas académicas de la Facultad de Medicina.'
  }
];

/**
 * Inicialización principal
 */
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  renderPlaylists();
  await loadAndRenderSchedule();
  setupFilterListeners();
  setupAdminPanel();
  setupLegalSystem();
  setupNewsletterSystem();
  initRealtimeSync();
});

/**
 * Suscripción reactiva en tiempo real con Firebase Firestore.
 * Sincroniza cualquier dispositivo en cuanto se publica una actualización en la nube.
 */
function initRealtimeSync() {
  subscribeToLiveSchedule((liveData) => {
    if (!liveData || !Array.isArray(liveData.activities) || liveData.activities.length === 0) return;

    // Si ya tenemos exactamente las mismas actividades, omitir re-renderizado
    if (
      state.allActivities &&
      state.allActivities.length === liveData.activities.length &&
      state.allActivities[0]?.id === liveData.activities[0]?.id &&
      state.allActivities[state.allActivities.length - 1]?.id === liveData.activities[liveData.activities.length - 1]?.id
    ) {
      return;
    }

    console.info(`[Sincronización en Vivo] Actualizando interfaz con ${liveData.activities.length} actividades...`);
    state.allActivities = liveData.activities;
    state.dataSourceInfo = {
      source: liveData.source || 'Firebase Firestore (En tiempo real)',
      lastUpdated: liveData.updatedAt || new Date().toLocaleTimeString('es-CO'),
      isLive: true
    };

    state.availableWeeks = getAvailableWeeks(state.allActivities);
    if (
      state.availableWeeks.length > 0 &&
      (!state.selectedWeekKey || !state.availableWeeks.some((w) => w.weekKey === state.selectedWeekKey))
    ) {
      state.selectedWeekKey = state.availableWeeks[0].weekKey;
    }

    updateDataStatusUI();
    renderSpotlightActivity();
    renderWeekNavigator();
    populateDepartmentFilter();
    populateDayFilter();
    renderScheduleList();

    if (liveData.fromRealtime) {
      showToast('✦ Programación sincronizada en tiempo real desde la nube', 'success');
    }
  });
}

/**
 * Carga de datos y renderizado
 */
async function loadAndRenderSchedule(forceRefresh = false) {
  const refreshBtn = document.getElementById('btn-refresh');
  const loadingIndicator = document.getElementById('schedule-loading-state');
  
  if (forceRefresh && refreshBtn) {
    refreshBtn.classList.add('loading');
    refreshBtn.disabled = true;
    showToast('Consultando actualización de la programación...', 'info');
  }

  try {
    let activities = null;
    let source = '';
    let lastUpdated = '';
    let isLive = false;

    // 1. Primero intentar cargar la agenda en tiempo real desde Firebase Firestore / Vercel Cloud
    if (!forceRefresh) {
      try {
        const live = await getLiveScheduleFromFirebase();
        if (live && Array.isArray(live.activities) && live.activities.length > 0) {
          activities = live.activities;
          source = live.source || 'Firebase Firestore (En tiempo real)';
          lastUpdated = live.updatedAt || new Date().toLocaleTimeString('es-CO');
          isLive = true;
          console.info(`[Aulas Abiertas] Agenda en tiempo real cargada (${activities.length} actividades).`);
        }
      } catch (err) {
        console.warn('Fallo al obtener agenda en tiempo real, usando CSV:', err);
      }
    }

    // 2. Si no hay agenda en Firebase aún o se forzó refresco de Google Sheets:
    if (!activities) {
      const data = await loadScheduleData({ forceRefresh });
      activities = data.activities;
      source = data.source;
      lastUpdated = data.lastUpdated;
      isLive = data.isLive;
    }

    state.allActivities = activities;
    state.dataSourceInfo = {
      source,
      lastUpdated,
      isLive
    };

    state.availableWeeks = getAvailableWeeks(state.allActivities);
    if (state.availableWeeks.length > 0 && !state.selectedWeekKey) {
      state.selectedWeekKey = state.availableWeeks[0].weekKey;
    }

    updateDataStatusUI();
    renderSpotlightActivity();
    renderWeekNavigator();
    populateDepartmentFilter();
    populateDayFilter();
    renderScheduleList();

    // Actualización reactiva periódica en tiempo real (cada 15 segundos)
    if (!window._spotlightInterval) {
      window._spotlightInterval = setInterval(() => {
        if (state.allActivities && state.allActivities.length > 0) {
          renderSpotlightActivity();
        }
      }, 15000);
    }

    if (forceRefresh) {
      showToast('Programación actualizada correctamente', 'success');
    }
  } catch (error) {
    console.error('Error al cargar la programación:', error);
    showToast(`No se pudo actualizar: ${error.message}`, 'error');
  } finally {
    if (refreshBtn) {
      refreshBtn.classList.remove('loading');
      refreshBtn.disabled = false;
    }
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
  }
}

/**
 * Actualiza la información de estado de los datos en la UI
 */
function updateDataStatusUI() {
  const badgeEl = document.getElementById('status-source-badge');
  const timeEl = document.getElementById('status-last-updated');

  if (badgeEl) {
    badgeEl.textContent = state.dataSourceInfo.source;
    badgeEl.className = `status-badge ${state.dataSourceInfo.isLive ? 'live' : 'local'}`;
  }
  if (timeEl) {
    timeEl.textContent = `Actualizado: ${state.dataSourceInfo.lastUpdated} (COT)`;
  }
}

/**
 * Renderiza el grupo de reuniones académicas destacadas en tiempo real (en vivo o próximas)
 * Muestra múltiples recuadros responsive con el diseño de la programación adaptado al tema institucional.
 */
function renderSpotlightActivity() {
  const container = document.getElementById('spotlight-container');
  if (!container) return;

  const data = getActiveOrUpcomingSessions(state.allActivities);
  if (!data || !data.activities || data.activities.length === 0) {
    container.innerHTML = `
      <div class="spotlight-wrapper">
        <div class="spotlight-header-row">
          <div>
            <span class="spotlight-badge">AGENDA DE LA FACULTAD</span>
            <h3 class="spotlight-main-heading">No hay actividades programadas para este momento</h3>
          </div>
        </div>
        <p style="color: #CBD5E1; margin-bottom: 20px;">
          Consulte la programación semanal completa a continuación o explore el archivo de conferencias grabadas en nuestro canal oficial.
        </p>
        <a href="#programacion" class="btn-spotlight-access">
          Ver Programación Semanal
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
      </div>
    `;
    return;
  }

  const isLive = data.isLiveNow;
  const badgeClass = isLive 
    ? 'spotlight-badge spotlight-badge-live' 
    : (data.type === 'upcoming_today' ? 'spotlight-badge spotlight-badge-today' : 'spotlight-badge');

  const dotClass = isLive ? 'spotlight-pulse-dot dot-live-red' : 'spotlight-pulse-dot';

  container.innerHTML = `
    <div class="spotlight-wrapper ${isLive ? 'is-live-mode' : ''}">
      <div class="spotlight-header-row">
        <div>
          <span class="${badgeClass}">
            <span class="${dotClass}" aria-hidden="true"></span>
            ${data.badgeLabel}
          </span>
          <h3 class="spotlight-main-heading">${data.sectionTitle}</h3>
        </div>
        <div class="spotlight-meta-right">
          <span class="spotlight-realtime-indicator" title="Sincronizado en tiempo real">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            En tiempo real
          </span>
          <span class="spotlight-sessions-counter">${data.activities.length} ${data.activities.length === 1 ? 'sesión' : 'sesiones'}</span>
        </div>
      </div>

      <div class="spotlight-grid">
        ${data.activities.map(act => renderSpotlightItemCard(act, isLive)).join('')}
      </div>
    </div>
  `;
}

/**
 * Renderiza la tarjeta de una sesión dentro de la cuadrícula destacada
 */
function renderSpotlightItemCard(act, isLive) {
  const isPresencial = (act.modality || '').toLowerCase().includes('presenc') && !(act.modality || '').toLowerCase().includes('híbrid');
  const meetingUrl = sanitizeUrl(act.meeting_url);
  const recordingUrl = sanitizeUrl(act.recording_url);
  const hasMeeting = Boolean(meetingUrl) && !isPresencial;
  const hasRecording = Boolean(recordingUrl);

  const safeId = escapeHtml(act.id);
  const safeTitle = escapeHtml(act.title);
  const safeDept = escapeHtml(act.department || 'Facultad de Medicina');
  const safeSpeakers = escapeHtml(act.speakers);
  const safeLocation = escapeHtml(act.location);
  const safeSummary = escapeHtml(act.summary);
  const safeModality = escapeHtml(act.modality || 'Virtual');
  const safeModalityClass = escapeHtml((act.modality || 'virtual').toLowerCase().replace(/[^a-z0-9_-]/g, ''));

  return `
    <article class="spotlight-item-card ${isLive ? 'is-live' : ''}" id="spotlight-item-${safeId}" tabindex="0">
      <div>
        <div class="spotlight-item-top">
          <span class="spotlight-item-time">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${formatTime12h(act.startTime)}${act.endTime ? ` – ${formatTime12h(act.endTime)}` : ''}
          </span>
          <span class="card-modality-badge modality-${safeModalityClass}">${safeModality}</span>
        </div>

        <div class="spotlight-item-dept">${safeDept}</div>
        <h4 class="spotlight-item-title">${safeTitle}</h4>

        ${safeSpeakers ? `
        <div class="spotlight-item-speakers">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span><strong>Presenta:</strong> ${safeSpeakers}</span>
        </div>
        ` : ''}

        ${safeLocation ? `
        <div class="spotlight-item-location">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>${safeLocation}</span>
        </div>
        ` : ''}

        ${safeSummary ? `
        <div class="spotlight-item-summary">
          ${safeSummary}
        </div>
        ` : ''}
      </div>

      <div class="spotlight-item-actions">
        ${isPresencial ? `
          <div class="spotlight-presencial-notice">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>Modalidad Presencial — Asistencia en sede</span>
          </div>
        ` : (hasMeeting ? `
          <a href="${meetingUrl}" target="_blank" rel="noopener noreferrer" class="btn-spotlight-access ${isLive ? 'btn-spotlight-live' : ''}" style="width: 100%; justify-content: center; font-size: 0.875rem; padding: 10px 16px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
            ${isLive ? 'Conectarse a la Sesión en Vivo' : 'Ingresar a la Sesión'}
          </a>
        ` : `
          <a href="#programacion" class="btn-secondary" style="width: 100%; justify-content: center; font-size: 0.8125rem; padding: 8px 12px; background: rgba(255,255,255,0.08); color: #FFFFFF; border-color: rgba(255,255,255,0.2);">
            Ver en Programación
          </a>
        `)}

        ${hasRecording ? `
          <a href="${recordingUrl}" target="_blank" rel="noopener noreferrer" class="btn-recording-link" style="width: 100%; justify-content: center; font-size: 0.8125rem; padding: 8px 12px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
            Ver grabación
          </a>
        ` : ''}
      </div>
    </article>
  `;
}

/**
 * Renderiza el selector y controles de semanas
 */
function renderWeekNavigator() {
  const titleEl = document.getElementById('current-week-title');
  const prevBtn = document.getElementById('btn-prev-week');
  const nextBtn = document.getElementById('btn-next-week');

  if (state.availableWeeks.length === 0) {
    if (titleEl) titleEl.textContent = 'Sin semanas registradas';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  const currentIndex = state.availableWeeks.findIndex(w => w.weekKey === state.selectedWeekKey);
  const currentWeek = state.availableWeeks[currentIndex] || state.availableWeeks[0];

  if (titleEl) {
    titleEl.textContent = currentWeek.label;
  }

  if (prevBtn) {
    prevBtn.disabled = currentIndex <= 0;
    prevBtn.onclick = () => {
      if (currentIndex > 0) {
        state.selectedWeekKey = state.availableWeeks[currentIndex - 1].weekKey;
        state.filters.day = ''; // reiniciar filtro de día al cambiar semana
        populateDayFilter();
        renderWeekNavigator();
        renderScheduleList();
      }
    };
  }

  if (nextBtn) {
    nextBtn.disabled = currentIndex >= state.availableWeeks.length - 1;
    nextBtn.onclick = () => {
      if (currentIndex < state.availableWeeks.length - 1) {
        state.selectedWeekKey = state.availableWeeks[currentIndex + 1].weekKey;
        state.filters.day = '';
        populateDayFilter();
        renderWeekNavigator();
        renderScheduleList();
      }
    };
  }
}

/**
 * Rellena el selector de departamentos de acuerdo a los datos reales
 */
function populateDepartmentFilter() {
  const select = document.getElementById('filter-department');
  if (!select) return;

  const currentVal = select.value;
  const departments = Array.from(new Set(state.allActivities.map(a => a.department))).sort((a, b) => a.localeCompare('es'));

  let optionsHtml = '<option value="">Todos los departamentos</option>';
  departments.forEach(dept => {
    optionsHtml += `<option value="${dept}" ${dept === currentVal ? 'selected' : ''}>${dept}</option>`;
  });

  select.innerHTML = optionsHtml;
}

/**
 * Rellena el selector de días según la semana actualmente seleccionada
 */
function populateDayFilter() {
  const select = document.getElementById('filter-day');
  if (!select) return;

  const weekActivities = (document.getElementById('current-week-title') && state.selectedWeekKey)
    ? state.allActivities.filter(a => a.weekKey === state.selectedWeekKey)
    : state.allActivities;
  const days = Array.from(new Set(weekActivities.map(a => a.date))).sort();

  let optionsHtml = '<option value="">Todos los días</option>';
  days.forEach(d => {
    const label = formatDayLabel(d);
    optionsHtml += `<option value="${d}" ${d === state.filters.day ? 'selected' : ''}>${label}</option>`;
  });

  select.innerHTML = optionsHtml;
}

/**
 * Renderiza el listado principal de actividades agrupadas por día
 */
function renderScheduleList() {
  const container = document.getElementById('schedule-days-container');
  const countEl = document.getElementById('results-count');
  const clearBtn = document.getElementById('btn-clear-filters');
  if (!container) return;

  // Filtrar actividades (de la semana si existe selector, o todas si se eliminó la barra)
  const weekActivities = (document.getElementById('current-week-title') && state.selectedWeekKey)
    ? state.allActivities.filter(a => a.weekKey === state.selectedWeekKey)
    : state.allActivities;
  const filtered = filterActivities(weekActivities, state.filters);

  // Mostrar / ocultar botón de limpiar filtros
  const hasActiveFilters = Boolean(
    state.filters.search ||
    state.filters.day ||
    state.filters.department ||
    state.filters.modality
  );

  if (clearBtn) {
    clearBtn.style.display = hasActiveFilters ? 'inline-block' : 'none';
  }

  if (countEl) {
    countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'actividad encontrada' : 'actividades encontradas'}`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-results-box" role="status">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--text-muted); margin-bottom: 12px;">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <h3>No se encontraron actividades</h3>
        <p>No existen sesiones académicas que coincidan con los criterios de búsqueda o filtros seleccionados.</p>
        <button class="btn-secondary" id="btn-reset-filters-empty">
          Limpiar todos los filtros
        </button>
      </div>
    `;

    const resetBtn = document.getElementById('btn-reset-filters-empty');
    if (resetBtn) {
      resetBtn.onclick = resetAllFilters;
    }
    return;
  }

  // Agrupar actividades filtradas por fecha
  const dayMap = new Map();
  filtered.forEach(act => {
    if (!dayMap.has(act.date)) {
      dayMap.set(act.date, {
        date: act.date,
        dayLabel: act.dayLabel,
        activities: []
      });
    }
    dayMap.get(act.date).activities.push(act);
  });

  const dayGroups = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  let html = '';
  dayGroups.forEach(group => {
    html += `
      <section class="day-group" aria-labelledby="day-header-${group.date}">
        <div class="day-header">
          <h3 class="day-title" id="day-header-${group.date}">${group.dayLabel}</h3>
          <span class="day-activity-count">${group.activities.length} ${group.activities.length === 1 ? 'sesión' : 'sesiones'}</span>
        </div>
        <div class="activities-list">
          ${group.activities.map(act => renderActivityCard(act)).join('')}
        </div>
      </section>
    `;
  });

  container.innerHTML = html;
}

/**
 * Renderiza la tarjeta individual de una actividad académica
 */
function renderActivityCard(act) {
  const isPresencial = (act.modality || '').toLowerCase().includes('presenc') && !(act.modality || '').toLowerCase().includes('híbrid');
  const meetingUrl = sanitizeUrl(act.meeting_url);
  const recordingUrl = sanitizeUrl(act.recording_url);
  const hasMeeting = Boolean(meetingUrl) && !isPresencial;
  const hasRecording = Boolean(recordingUrl);

  const safeId = escapeHtml(act.id);
  const safeTitle = escapeHtml(act.title);
  const safeDept = escapeHtml(act.department);
  const safeSpeakers = escapeHtml(act.speakers);
  const safeLocation = escapeHtml(act.location);
  const safeSummary = escapeHtml(act.summary);
  const safeModality = escapeHtml(act.modality);
  const safeModalityClass = escapeHtml((act.modality || '').toLowerCase().replace(/[^a-z0-9_-]/g, ''));

  return `
    <article class="activity-card" id="act-${safeId}" tabindex="0" aria-label="${safeTitle}">
      <div class="card-top-row">
        <span class="card-time-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${formatTime12h(act.startTime)}${act.endTime ? ` – ${formatTime12h(act.endTime)}` : ''}
        </span>
        <span class="card-modality-badge modality-${safeModalityClass}">${safeModality}</span>
      </div>

      <div class="card-department">${safeDept}</div>
      <h4 class="card-title">${safeTitle}</h4>

      ${safeSpeakers ? `
      <div class="card-speakers">
        <strong>Presenta:</strong> ${safeSpeakers}
      </div>
      ` : ''}

      ${safeLocation ? `
      <div class="card-location">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top:2px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <span>${safeLocation}</span>
      </div>
      ` : ''}

      ${safeSummary ? `
      <div class="card-summary">
        ${safeSummary}
      </div>
      ` : ''}

      <div class="card-actions">
        ${isPresencial ? `
          <span class="card-presencial-notice">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Asistencia presencial en sede
          </span>
        ` : (hasMeeting ? `
          <a href="${meetingUrl}" target="_blank" rel="noopener noreferrer" class="btn-session-link" id="link-meet-${safeId}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="10 8 16 12 10 16 10 8"/><circle cx="12" cy="12" r="10"/></svg>
            Ingresar a la sesión
          </a>
        ` : '')}

        ${hasRecording ? `
          <a href="${recordingUrl}" target="_blank" rel="noopener noreferrer" class="btn-recording-link" id="link-rec-${safeId}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
            Ver grabación
          </a>
        ` : ''}
      </div>
    </article>
  `;
}

/**
 * Renderiza las listas de reproducción oficiales en la sección de Biblioteca como un carrusel
 * Mantiene la cuadrícula institucional estricta de 3 filas x 4 columnas (12 tarjetas por vista)
 */
let currentPlaylistsPage = 0;
const PLAYLISTS_PER_PAGE = 12; // 3 filas x 4 columnas

function renderPlaylists() {
  const track = document.getElementById('playlists-carousel-track');
  const legacyContainer = document.getElementById('playlists-grid-container');
  const dotsContainer = document.getElementById('playlists-dots-container');
  const pageIndicator = document.getElementById('playlists-page-indicator');
  const prevBtn = document.getElementById('btn-playlists-prev');
  const nextBtn = document.getElementById('btn-playlists-next');
  const viewport = document.getElementById('playlists-carousel-viewport');

  // Modo carrusel interactivo moderno
  if (track) {
    const totalPages = Math.ceil(VERIFIED_PLAYLISTS.length / PLAYLISTS_PER_PAGE);

    const slidesHtml = [];
    for (let page = 0; page < totalPages; page++) {
      const pageItems = VERIFIED_PLAYLISTS.slice(page * PLAYLISTS_PER_PAGE, (page + 1) * PLAYLISTS_PER_PAGE);
      const cardsHtml = pageItems.map((pl, idx) => {
        const globalIdx = page * PLAYLISTS_PER_PAGE + idx;
        return `
          <div class="playlist-card" id="playlist-card-${globalIdx}">
            <div class="playlist-card-icon" aria-hidden="true">
              <svg width="32" height="23" viewBox="0 0 28 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M27.42 3.12C27.1 1.9 26.15 0.95 24.93 0.63 22.73 0.05 14 0 14 0s-8.73.05-10.93.63C1.85.95.9 1.9.58 3.12 0 5.32 0 9.9 0 9.9s0 4.58.58 6.78c.32 1.22 1.27 2.17 2.49 2.49 2.2.58 10.93.58 10.93.58s8.73 0 10.93-.58c1.22-.32 2.17-1.27 2.49-2.49.58-2.2.58-6.78.58-6.78s0-4.58-.58-6.78z" fill="#FF0000"/>
                <polygon points="11.2,14.2 18.5,9.9 11.2,5.6" fill="#FFFFFF"/>
              </svg>
            </div>
            <span class="playlist-card-category">
              ${pl.category}
            </span>
            <h4 class="playlist-card-title">${pl.title}</h4>
            <p class="playlist-card-meta">${pl.description}</p>
            <a href="${pl.url}" target="_blank" rel="noopener noreferrer" class="playlist-card-link" id="link-playlist-${globalIdx}">
              <span>Abrir en YouTube</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </div>
        `;
      }).join('');

      slidesHtml.push(`
        <div class="playlists-slide" data-page="${page}" aria-label="Página ${page + 1} de ${totalPages}">
          <div class="playlists-grid">
            ${cardsHtml}
          </div>
        </div>
      `);
    }

    track.innerHTML = slidesHtml.join('');

    // Generar dots si hay más de 1 página
    if (dotsContainer) {
      if (totalPages > 1) {
        dotsContainer.innerHTML = Array.from({ length: totalPages }).map((_, i) => `
          <button type="button" class="playlist-dot ${i === currentPlaylistsPage ? 'active' : ''}" data-page="${i}" aria-label="Ir a página ${i + 1} de listas" aria-selected="${i === currentPlaylistsPage}">
          </button>
        `).join('');

        dotsContainer.querySelectorAll('.playlist-dot').forEach(dot => {
          dot.addEventListener('click', () => {
            const page = parseInt(dot.getAttribute('data-page'), 10);
            goToPlaylistsPage(page);
          });
        });
      } else {
        dotsContainer.innerHTML = '';
      }
    }

    function updateCarouselUI() {
      track.style.transform = `translateX(-${currentPlaylistsPage * 100}%)`;

      if (prevBtn) {
        prevBtn.style.display = totalPages > 1 ? 'inline-flex' : 'none';
        prevBtn.disabled = currentPlaylistsPage === 0;
      }
      if (nextBtn) {
        nextBtn.style.display = totalPages > 1 ? 'inline-flex' : 'none';
        nextBtn.disabled = currentPlaylistsPage >= totalPages - 1;
      }
      if (pageIndicator) {
        pageIndicator.textContent = totalPages > 1
          ? `Página ${currentPlaylistsPage + 1} de ${totalPages}`
          : `${VERIFIED_PLAYLISTS.length} Especialidades Verificadas`;
      }
      if (dotsContainer) {
        dotsContainer.querySelectorAll('.playlist-dot').forEach((dot, idx) => {
          const isActive = idx === currentPlaylistsPage;
          dot.classList.toggle('active', isActive);
          dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
      }
    }

    function goToPlaylistsPage(page) {
      if (page < 0) page = 0;
      if (page >= totalPages) page = totalPages - 1;
      currentPlaylistsPage = page;
      updateCarouselUI();
    }

    if (prevBtn && !prevBtn._hasCarouselListener) {
      prevBtn._hasCarouselListener = true;
      prevBtn.addEventListener('click', () => goToPlaylistsPage(currentPlaylistsPage - 1));
    }

    if (nextBtn && !nextBtn._hasCarouselListener) {
      nextBtn._hasCarouselListener = true;
      nextBtn.addEventListener('click', () => goToPlaylistsPage(currentPlaylistsPage + 1));
    }

    // Soporte de navegación por teclado en el carrusel
    if (viewport && !viewport._hasKeyboardListener) {
      viewport._hasKeyboardListener = true;
      viewport.setAttribute('tabindex', '0');
      viewport.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
          goToPlaylistsPage(currentPlaylistsPage - 1);
        } else if (e.key === 'ArrowRight') {
          goToPlaylistsPage(currentPlaylistsPage + 1);
        }
      });

      // Soporte táctil / gestos swipe
      let touchStartX = 0;
      let touchEndX = 0;
      viewport.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      viewport.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        const diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 50) {
          if (diff > 0) {
            goToPlaylistsPage(currentPlaylistsPage + 1);
          } else {
            goToPlaylistsPage(currentPlaylistsPage - 1);
          }
        }
      }, { passive: true });
    }

    updateCarouselUI();
    return;
  }

  // Fallback para contenedor legado si no existe el track
  if (legacyContainer) {
    legacyContainer.innerHTML = VERIFIED_PLAYLISTS.slice(0, 12).map((pl, idx) => `
      <div class="playlist-card" id="playlist-card-${idx}">
        <div class="playlist-card-icon" aria-hidden="true">
          <svg width="32" height="23" viewBox="0 0 28 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M27.42 3.12C27.1 1.9 26.15 0.95 24.93 0.63 22.73 0.05 14 0 14 0s-8.73.05-10.93.63C1.85.95.9 1.9.58 3.12 0 5.32 0 9.9 0 9.9s0 4.58.58 6.78c.32 1.22 1.27 2.17 2.49 2.49 2.2.58 10.93.58 10.93.58s8.73 0 10.93-.58c1.22-.32 2.17-1.27 2.49-2.49.58-2.2.58-6.78.58-6.78s0-4.58-.58-6.78z" fill="#FF0000"/>
            <polygon points="11.2,14.2 18.5,9.9 11.2,5.6" fill="#FFFFFF"/>
          </svg>
        </div>
        <span class="playlist-card-category">${pl.category}</span>
        <h4 class="playlist-card-title">${pl.title}</h4>
        <p class="playlist-card-meta">${pl.description}</p>
        <a href="${pl.url}" target="_blank" rel="noopener noreferrer" class="playlist-card-link" id="link-playlist-${idx}">
          <span>Abrir en YouTube</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>
      </div>
    `).join('');
  }
}

/**
 * Configuración de eventos de filtros y búsqueda
 */
function setupFilterListeners() {
  const searchInput = document.getElementById('search-input');
  const daySelect = document.getElementById('filter-day');
  const deptSelect = document.getElementById('filter-department');
  const modalitySelect = document.getElementById('filter-modality');
  const clearBtn = document.getElementById('btn-clear-filters');
  const refreshBtn = document.getElementById('btn-refresh');

  if (searchInput) {
    let timeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        state.filters.search = e.target.value;
        renderScheduleList();
      }, 200);
    });
  }

  if (daySelect) {
    daySelect.addEventListener('change', (e) => {
      state.filters.day = e.target.value;
      renderScheduleList();
    });
  }

  if (deptSelect) {
    deptSelect.addEventListener('change', (e) => {
      state.filters.department = e.target.value;
      renderScheduleList();
    });
  }

  if (modalitySelect) {
    modalitySelect.addEventListener('change', (e) => {
      state.filters.modality = e.target.value;
      renderScheduleList();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', resetAllFilters);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadAndRenderSchedule(true);
    });
  }
}

/**
 * Reinicia todos los filtros a sus valores predeterminados
 */
function resetAllFilters() {
  state.filters = {
    search: '',
    day: '',
    department: '',
    modality: ''
  };

  const searchInput = document.getElementById('search-input');
  const daySelect = document.getElementById('filter-day');
  const deptSelect = document.getElementById('filter-department');
  const modalitySelect = document.getElementById('filter-modality');

  if (searchInput) searchInput.value = '';
  if (daySelect) daySelect.value = '';
  if (deptSelect) deptSelect.value = '';
  if (modalitySelect) modalitySelect.value = '';

  renderScheduleList();
  showToast('Filtros reiniciados', 'info');
}

/**
 * Configura la navegación interactiva, menú móvil y enlaces suaves
 */
function setupNavigation() {
  const header = document.querySelector('.site-header');
  const mobileToggle = document.getElementById('mobile-nav-toggle');
  const nav = document.getElementById('site-nav');

  // Menú móvil
  if (mobileToggle && nav) {
    mobileToggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');
      mobileToggle.setAttribute('aria-expanded', isOpen);
    });

    // Navegación en enlaces: cerrar menú móvil y actualizar estado activo
    nav.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        nav.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        nav.classList.remove('open');
        mobileToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Sombra del header persistente durante el desplazamiento
  window.addEventListener('scroll', () => {
    if (header) {
      if (window.scrollY > 20) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }
  }, { passive: true });
}

/**
 * Notificaciones Toast no intrusivas
 */
function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.setAttribute('role', 'status');
    toastContainer.setAttribute('aria-live', 'polite');
    toastContainer.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const bgColor = type === 'success' ? '#004D25' : type === 'error' ? '#DC2626' : '#0F172A';
  
  toast.style.cssText = `
    background-color: ${bgColor};
    color: #FFFFFF;
    padding: 14px 22px;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 600;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    gap: 10px;
    opacity: 0;
    transform: translateY(16px) scale(0.96);
    transition: opacity 280ms cubic-bezier(0.16, 1, 0.3, 1), transform 280ms cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: auto;
    border: 1px solid rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  `;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  // Animación de entrada suave
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0) scale(1)';
  });

  // Salida automática tras 4 segundos
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px) scale(0.97)';
    setTimeout(() => {
      toast.remove();
    }, 280);
  }, 4000);
}

/* ==========================================================================
   PANEL ADMINISTRATIVO PRIVADO (TELEDUCACIÓN UDEA)
   Acceso por Firebase Auth + Extractor con Gemini IA + Actualización en Vivo
   ========================================================================== */

let lastScrapedActivities = [];
let lastScrapedCsv = '';

function setupAdminPanel() {
  const adminNavBtn = document.getElementById('btn-admin-auth');
  const modal = document.getElementById('modal-admin-backdrop');
  const closeBtn1 = document.getElementById('btn-close-modal-admin');
  const closeBtn2 = document.getElementById('btn-close-admin-dash');
  const cancelBtn = document.getElementById('btn-cancel-admin-login');

  const viewLogin = document.getElementById('admin-view-login');
  const viewDash = document.getElementById('admin-view-dashboard');
  const userDisplay = document.getElementById('admin-user-display');
  const logoutBtn = document.getElementById('btn-admin-logout');

  const loginForm = document.getElementById('form-admin-login');
  const emailInput = document.getElementById('admin-input-email');
  const passwordInput = document.getElementById('admin-input-password');
  const loginError = document.getElementById('admin-login-error');
  const loginSubmitBtn = document.getElementById('btn-submit-admin-login');
  const loginServerStatus = document.getElementById('admin-login-server-status');
  const togglePassBtn = document.getElementById('btn-toggle-admin-password');
  const eyeIcon = document.getElementById('icon-eye-admin-password');

  const scraperForm = document.getElementById('form-admin-scraper');
  const scraperUrlInput = document.getElementById('admin-scraper-url');
  const scraperSubmitBtn = document.getElementById('btn-admin-run-ai');
  const scraperLoading = document.getElementById('admin-scraper-loading');
  const scraperResults = document.getElementById('admin-scraper-results');
  const countBadge = document.getElementById('admin-scraped-count');
  const modelBadge = document.getElementById('admin-scraped-model');
  const previewTbody = document.getElementById('admin-preview-tbody');
  const applyLiveBtn = document.getElementById('btn-admin-apply-live');
  const copyTableBtn = document.getElementById('btn-admin-copy-table');
  const downloadXlsxBtn = document.getElementById('btn-admin-download-xlsx');

  let currentUser = null;

  const checkLoginServerStatus = async () => {
    if (!loginServerStatus) return;
    try {
      const res = await fetch('/api/auth?action=status');
      if (res.ok) {
        const data = await res.json();
        if (data.hasAdminPassword === false) {
          loginServerStatus.style.display = 'block';
          loginServerStatus.innerHTML = `
            <div style="background: rgba(220, 38, 38, 0.08); border: 1px solid rgba(220, 38, 38, 0.25); border-radius: 6px; padding: 8px 12px; color: #dc2626; line-height: 1.4;">
              ⚠️ <strong>Atención:</strong> La variable <code>ADMIN_PASSWORD</code> no está detectada en el entorno de Vercel. Asegúrate de guardarla en Vercel Dashboard > Settings > Environment Variables y hacer un Redeploy.
            </div>
          `;
        } else {
          loginServerStatus.style.display = 'none';
        }
        if (emailInput && (!emailInput.value || emailInput.value === '')) {
          emailInput.value = data.configuredEmail || 'aprendizajes.med@udea.edu.co';
        }
      }
    } catch {
      // Ignorar fallos de red
    }
  };

  const openAdminModal = (e) => {
    if (e) e.preventDefault();
    if (modal) {
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
      if (!currentUser) {
        checkLoginServerStatus();
        if (emailInput && (!emailInput.value || emailInput.value === '')) {
          emailInput.value = 'aprendizajes.med@udea.edu.co';
        }
        passwordInput?.focus();
      }
    }
  };

  const closeAdminModal = () => {
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      if (loginError) loginError.style.display = 'none';
    }
  };

  if (adminNavBtn) adminNavBtn.addEventListener('click', openAdminModal);
  if (closeBtn1) closeBtn1.addEventListener('click', closeAdminModal);
  if (closeBtn2) closeBtn2.addEventListener('click', closeAdminModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeAdminModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAdminModal();
    });
  }

  // Estado de autenticación administrativa (Validada directamente por Vercel)
  onAdminAuthChange((user) => {
    currentUser = user;
    if (user) {
      if (adminNavBtn) {
        adminNavBtn.textContent = '⚙ Panel';
        adminNavBtn.style.color = 'var(--accent-lime)';
      }
      if (viewLogin) viewLogin.style.display = 'none';
      if (viewDash) viewDash.style.display = 'block';
      if (userDisplay) {
        userDisplay.textContent = user.displayName || user.email.split('@')[0];
      }
      updateAdminCloudStatusUI();
    } else {
      if (adminNavBtn) {
        adminNavBtn.textContent = 'Acceso';
        adminNavBtn.style.color = '';
      }
      if (viewLogin) viewLogin.style.display = 'block';
      if (viewDash) viewDash.style.display = 'none';
    }
  });

  /**
   * Actualiza el diagnóstico visual del estado de sincronización en la nube
   */
  const updateAdminCloudStatusUI = async () => {
    const statusBox = document.getElementById('admin-cloud-sync-status');
    if (!statusBox) return;

    statusBox.innerHTML = `
      <div style="font-size: 0.8125rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: rgba(0,0,0,0.02); border-radius: 6px; margin-bottom: 12px;">
        <span class="spinner-dot" style="width: 10px; height: 10px;"></span>
        Verificando estado de sincronización en la nube...
      </div>
    `;

    try {
      const fbStatus = getFirebaseStatus();
      const res = await fetch('/api/schedule?info=status');
      const data = res.ok ? await res.json() : null;

      const isRealtime = fbStatus.isReady;
      const projectId = fbStatus.projectId;
      const isSharedCloudActive = Boolean(isRealtime || data?.isSharedCloudActive || data?.cloudStorage?.vercelBlob || data?.cloudStorage?.firestoreRest || data?.cloudStorage?.vercelKv);

      if (isRealtime) {
        statusBox.innerHTML = `
          <div style="background: rgba(0, 77, 37, 0.08); border: 1px solid rgba(0, 77, 37, 0.25); border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.8125rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
              <span style="font-weight: 700; color: var(--udea-forest); display: flex; align-items: center; gap: 6px;">
                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#28a745;"></span>
                Sincronización en Tiempo Real Activa (WebSocket)
              </span>
              <span style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">${projectId || 'Firebase'}</span>
            </div>
            <p style="margin: 4px 0 0; color: var(--text-base); font-size: 0.75rem; line-height: 1.4;">
              Las conferencias publicadas se reflejan instantáneamente en cualquier celular, computador o ventana de incógnito conectada vía WebSocket.
            </p>
          </div>
        `;
      } else if (data?.cloudStorage?.vercelBlob) {
        statusBox.innerHTML = `
          <div style="background: rgba(0, 77, 37, 0.08); border: 1px solid rgba(0, 77, 37, 0.25); border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.8125rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
              <span style="font-weight: 700; color: var(--udea-forest); display: flex; align-items: center; gap: 6px;">
                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#28a745;"></span>
                Persistencia Global en la Nube Activa (Vercel Blob Storage)
              </span>
              <span style="font-size: 0.75rem; color: var(--udea-forest); font-weight: 600;">CDN Global</span>
            </div>
            <p style="margin: 4px 0 0; color: var(--text-base); font-size: 0.75rem; line-height: 1.4;">
              Cualquier dispositivo e incógnito obtiene la última programación publicada mediante la CDN de Vercel. Sondeo automático cada 15s y al volver a la pestaña.
            </p>
          </div>
        `;
      } else if (data?.cloudStorage?.firestoreRest || data?.cloudStorage?.vercelKv) {
        const providerName = data.cloudStorage.firestoreRest ? 'Google Cloud Firestore REST' : 'Vercel KV';
        statusBox.innerHTML = `
          <div style="background: rgba(0, 77, 37, 0.08); border: 1px solid rgba(0, 77, 37, 0.25); border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.8125rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
              <span style="font-weight: 700; color: var(--udea-forest); display: flex; align-items: center; gap: 6px;">
                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#28a745;"></span>
                Persistencia Global en la Nube Activa (${providerName})
              </span>
              <span style="font-size: 0.75rem; color: var(--udea-forest); font-weight: 600;">Sincronizado</span>
            </div>
            <p style="margin: 4px 0 0; color: var(--text-base); font-size: 0.75rem; line-height: 1.4;">
              Los cambios se guardan en la nube global y se propagan a todos los celulares y ventanas de incógnito.
            </p>
          </div>
        `;
      } else {
        statusBox.innerHTML = `
          <div style="background: rgba(220, 38, 38, 0.08); border: 1px solid rgba(220, 38, 38, 0.3); border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; font-size: 0.8125rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
              <span style="font-weight: 700; color: #dc2626; display: flex; align-items: center; gap: 6px;">
                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#dc2626;"></span>
                Modo Local (Sin base de datos compartida en la nube)
              </span>
            </div>
            <p style="margin: 6px 0 8px; color: var(--text-base); font-size: 0.775rem; line-height: 1.45;">
              Si publicas ahora, la programación solo se guardará en la memoria de este navegador. <strong>En incógnito y otros celulares no se verá</strong> hasta habilitar almacenamiento compartido.
            </p>
            <div style="background: rgba(255,255,255,0.7); border-radius: 6px; padding: 8px 10px; font-size: 0.75rem; color: #1e293b; border: 1px solid rgba(220, 38, 38, 0.2);">
              <p style="margin: 0 0 4px; font-weight: 700;">👉 ¿Cómo habilitar sincronización en 1 minuto?</p>
              <ul style="margin: 0; padding-left: 16px; line-height: 1.4;">
                <li><strong>Recomendado (1 clic):</strong> En tu proyecto en <a href="https://vercel.com" target="_blank" rel="noopener" style="color: #0284c7; text-decoration: underline;">Vercel</a> > <strong>Storage</strong> > <strong>Create Database</strong> > <strong>Blob</strong> > <strong>Connect</strong>.</li>
                <li><strong>O con Firebase:</strong> Configura <code>VITE_FIREBASE_API_KEY</code> y <code>VITE_FIREBASE_PROJECT_ID</code> en las variables de entorno de Vercel.</li>
              </ul>
            </div>
          </div>
        `;
      }
    } catch {
      // Ignorar fallos de diagnóstico
    }
  };

  // Alternar visualización de la contraseña (Mostrar / Ocultar)
  if (togglePassBtn && passwordInput) {
    togglePassBtn.addEventListener('click', () => {
      const isPass = passwordInput.getAttribute('type') === 'password';
      passwordInput.setAttribute('type', isPass ? 'text' : 'password');
      togglePassBtn.setAttribute('title', isPass ? 'Ocultar contraseña' : 'Mostrar contraseña');
      if (eyeIcon) {
        if (isPass) {
          // Icono de ojo tachado (ocultar)
          eyeIcon.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          `;
        } else {
          // Icono de ojo abierto (mostrar)
          eyeIcon.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          `;
        }
      }
    });
  }

  // Verificar si hay sesión administrativa activa en Vercel
  verifyAdminSession();

  // Iniciar sesión (Vercel Serverless Auth)
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput?.value.trim() || 'aprendizajes.med@udea.edu.co';
      const password = passwordInput?.value || '';

      if (loginError) loginError.style.display = 'none';
      if (loginSubmitBtn) {
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.textContent = 'Verificando con Vercel...';
      }

      try {
        await loginAdmin(email, password);
        showToast('Acceso administrativo concedido (Vercel Auth)', 'success');
        if (passwordInput) passwordInput.value = '';
        if (emailInput && (!emailInput.value || emailInput.value === '')) {
          emailInput.value = 'aprendizajes.med@udea.edu.co';
        }
      } catch (err) {
        if (loginError) {
          loginError.textContent = err.message || 'Error de credenciales.';
          loginError.style.display = 'block';
        }
      } finally {
        if (loginSubmitBtn) {
          loginSubmitBtn.disabled = false;
          loginSubmitBtn.textContent = 'Iniciar Sesión con Vercel';
        }
      }
    });
  }

  // Cerrar sesión
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logoutAdmin();
      showToast('Sesión administrativa cerrada', 'info');
      closeAdminModal();
    });
  }

  // Scraper con Gemini IA
  if (scraperForm) {
    scraperForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = scraperUrlInput.value.trim();
      if (!url) return;

      if (scraperSubmitBtn) scraperSubmitBtn.disabled = true;
      if (scraperLoading) scraperLoading.style.display = 'block';
      if (scraperResults) scraperResults.style.display = 'none';

      try {
        const result = await scrapeMailerliteWithGemini(url);
        lastScrapedActivities = result.activities || [];
        lastScrapedCsv = result.csvContent || '';

        if (countBadge) countBadge.textContent = `${lastScrapedActivities.length} actividades extraídas`;
        if (modelBadge) modelBadge.textContent = result.modelUsed || 'Gemini IA';

        if (previewTbody) {
          previewTbody.innerHTML = lastScrapedActivities.map((act) => {
            const rawD = act.date || act.fecha || act.dia || '';
            const normD = normalizeDate(rawD);
            const formattedDay = isValidDate(normD) ? formatDayLabel(normD) : (normD || rawD || 'Por confirmar');
            const safeDay = escapeHtml(formattedDay);
            const safeIso = normD ? `<span style="display: block; font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono); font-weight: normal;">${escapeHtml(normD)}</span>` : '';
            const safeTime = escapeHtml(formatTime12h(act.start_time || act.startTime || act.hora || '07:00'));
            const safeDept = escapeHtml(act.department || act.departamento || '');
            const safeTitle = escapeHtml(act.title || act.titulo || '');
            const safeMod = escapeHtml(act.modality || act.modalidad || 'Virtual');
            const safeModClass = escapeHtml((act.modality || act.modalidad || '').toLowerCase().replace(/[^a-z0-9_-]/g, ''));

            return `
            <tr>
              <td>
                <strong style="color: var(--udea-green-primary);">${safeDay}</strong>
                ${safeIso}
              </td>
              <td><span style="font-family: var(--font-mono); font-weight: 600;">${safeTime}</span></td>
              <td>${safeDept}</td>
              <td>${safeTitle}</td>
              <td><span class="card-modality-badge modality-${safeModClass}">${safeMod}</span></td>
            </tr>
          `;
          }).join('');
        }

        if (scraperResults) scraperResults.style.display = 'block';
        showToast(`¡Gemini IA extrajo ${lastScrapedActivities.length} conferencias con éxito!`, 'success');
      } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
      } finally {
        if (scraperSubmitBtn) scraperSubmitBtn.disabled = false;
        if (scraperLoading) scraperLoading.style.display = 'none';
      }
    });
  }

  // Publicar en vivo y sincronizar en Firebase Firestore para todos los dispositivos
  if (applyLiveBtn) {
    applyLiveBtn.addEventListener('click', async () => {
      if (!lastScrapedActivities || lastScrapedActivities.length === 0) {
        showToast('No hay actividades para aplicar.', 'info');
        return;
      }

      applyLiveBtn.disabled = true;
      const originalText = applyLiveBtn.textContent;
      applyLiveBtn.textContent = 'Guardando en Firebase...';

      try {
        // Normalizar estructura de actividades con cálculo exacto de semana (Lunes a Domingo)
        const normalized = lastScrapedActivities.map((a, i) => {
          const rawDate = normalizeDate(a.date);
          const monday = getMondayOfWeek(rawDate);
          const sunday = getSundayOfWeek(monday);
          const modality = a.modality || 'Virtual';
          const isStrictlyPresencial = modality.toLowerCase().includes('presenc') && !modality.toLowerCase().includes('híbrid');
          const rawMeeting = a.meeting_url ? String(a.meeting_url).trim() : '';
          const meeting_url = (!isStrictlyPresencial && !rawMeeting.includes('mailerlite.com') && rawMeeting.startsWith('http')) ? rawMeeting : '';

          return {
            id: a.id || `AA-${rawDate}-${(a.start_time || a.startTime || '0700').replace(':', '')}-${i}`,
            date: rawDate,
            startTime: a.start_time || a.startTime || '07:00',
            endTime: a.end_time || a.endTime || '',
            department: a.department || 'Facultad de Medicina',
            title: a.title,
            speakers: a.speakers || '',
            modality: modality,
            location: a.location || '',
            meeting_url: meeting_url,
            recording_url: a.recording_url || a.recordingUrl || '',
            summary: a.summary || '',
            dayLabel: formatDayLabel(rawDate),
            weekKey: monday,
            weekMonday: monday,
            weekSunday: sunday
          };
        });

        // 1. Persistir en Firebase Firestore y Vercel Cloud API
        const admin = getAdminUser();
        const saveResult = await saveLiveScheduleToFirebase(normalized, {
          user: admin?.email || 'teleducacion@udea.edu.co',
          source: 'Boletín MailerLite / Scraper Gemini IA'
        });

        // 2. Actualizar estado local inmediatamente
        const sourceLabel = saveResult.firestoreSaved
          ? 'Firebase Firestore (En tiempo real)'
          : `Vercel Cloud (${saveResult.vercelStorageProvider || 'Sincronizado'})`;

        state.allActivities = normalized;
        state.dataSourceInfo = {
          source: sourceLabel,
          lastUpdated: new Date().toLocaleTimeString('es-CO'),
          isLive: true
        };
        state.availableWeeks = getAvailableWeeks(state.allActivities);
        if (state.availableWeeks.length > 0) {
          state.selectedWeekKey = state.availableWeeks[0].weekKey;
        }

        updateDataStatusUI();
        renderSpotlightActivity();
        renderWeekNavigator();
        populateDepartmentFilter();
        populateDayFilter();
        renderScheduleList();

        if (saveResult.isSharedCloudActive) {
          const providerText = saveResult.firestoreSaved
            ? 'Firebase Firestore (En tiempo real)'
            : (saveResult.vercelStorageProvider === 'vercel_blob' ? 'Vercel Blob Storage' : saveResult.vercelStorageProvider);
          showToast(`¡Programación de ${normalized.length} conferencias guardada en ${providerText}! Visible en todos los dispositivos e incógnito. 🟢`, 'success');
          closeAdminModal();
        } else {
          showToast(`⚠️ Guardada en este navegador, pero NO en la nube global. En incógnito y otros celulares no se verá hasta activar Vercel Blob o Firebase.`, 'warning');
          const statusBox = document.getElementById('admin-cloud-sync-status');
          if (statusBox) {
            statusBox.innerHTML = `
              <div style="background: rgba(220, 38, 38, 0.1); border: 2px solid #dc2626; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; font-size: 0.8125rem;">
                <h5 style="color: #b91c1c; font-weight: 700; margin: 0 0 6px 0; font-size: 0.875rem;">
                  ⚠️ Guardado local exitoso — Falta Base de Datos en la Nube
                </h5>
                <p style="margin: 0 0 8px 0; color: var(--text-base); line-height: 1.45;">
                  La agenda ya está activa en este navegador, pero <strong>NO se verá en incógnito ni en otros celulares</strong> porque aún no has conectado un almacenamiento compartido en Vercel.
                </p>
                <div style="background: #ffffff; border-radius: 6px; padding: 10px; border: 1px solid #fca5a5; font-size: 0.775rem;">
                  <p style="margin: 0 0 4px 0; font-weight: 700; color: #1e293b;">👉 ¿Cómo habilitar sincronización en 1 minuto?</p>
                  <ol style="margin: 0; padding-left: 18px; color: #334155; line-height: 1.45;">
                    <li>Ve a tu proyecto en <strong>Vercel Dashboard</strong>.</li>
                    <li>Abre la pestaña <strong>Storage</strong> > <strong>Create Database</strong> > selecciona <strong>Blob</strong>.</li>
                    <li>Haz clic en <strong>Connect to Project</strong>. ¡Listo! Vercel activará automáticamente la persistencia global.</li>
                  </ol>
                </div>
              </div>
            `;
          }
        }
      } catch (err) {
        console.error('Error al sincronizar programación:', err);
        showToast(`Error al guardar en Firebase: ${err.message}`, 'error');
      } finally {
        applyLiveBtn.disabled = false;
        applyLiveBtn.textContent = originalText;
      }
    });
  }

  // Copiar tabla al portapapeles (formato TSV para Excel / Google Sheets)
  if (copyTableBtn) {
    copyTableBtn.addEventListener('click', async () => {
      if (!lastScrapedActivities || lastScrapedActivities.length === 0) {
        showToast('No hay datos en la tabla para copiar.', 'info');
        return;
      }

      const headers = ['Fecha', 'Hora', 'Departamento / Especialidad', 'Título de la Conferencia', 'Ponente(s)', 'Modalidad', 'Lugar', 'Enlace de Conexión', 'Grabación'];
      const rows = lastScrapedActivities.map(a => {
        const rawD = a.date || a.fecha || a.dia || '';
        const normD = normalizeDate(rawD);
        return [
          normD || rawD,
          a.start_time || a.startTime || a.hora || '',
          a.department || a.departamento || '',
          a.title || a.titulo || '',
          a.speakers || a.ponentes || a.ponente || '',
          a.modality || a.modalidad || 'Virtual',
          a.location || a.lugar || '',
          a.meeting_url || a.meetingUrl || a.enlace || '',
          a.recording_url || a.recordingUrl || a.grabacion || ''
        ];
      });

      const tsvContent = [
        headers.join('\t'),
        ...rows.map(r => r.join('\t'))
      ].join('\n');

      try {
        await navigator.clipboard.writeText(tsvContent);
        showToast(`¡Tabla de ${lastScrapedActivities.length} actividades copiada! Lista para pegar en Excel o Google Sheets.`, 'success');
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = tsvContent;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast(`¡Tabla copiada al portapapeles!`, 'success');
      }
    });
  }

  // Descargar archivo Excel (.xlsx) nativo
  if (downloadXlsxBtn) {
    downloadXlsxBtn.addEventListener('click', async () => {
      if (!lastScrapedActivities || lastScrapedActivities.length === 0) {
        showToast('No hay conferencias para exportar.', 'info');
        return;
      }

      try {
        downloadXlsxBtn.disabled = true;
        downloadXlsxBtn.textContent = 'Generando...';

        // Carga dinámica de la biblioteca xlsx
        const XLSX = await import('xlsx');

        const rows = lastScrapedActivities.map(a => {
          const rawD = a.date || a.fecha || a.dia || '';
          const normD = normalizeDate(rawD);
          return {
            'Fecha': normD || rawD,
            'Hora Inicio': a.start_time || a.startTime || a.hora || '07:00',
            'Hora Fin': a.end_time || a.endTime || a.hora_fin || '',
            'Departamento / Especialidad': a.department || a.departamento || '',
            'Título de la Conferencia': a.title || a.titulo || '',
            'Ponente(s)': a.speakers || a.ponentes || a.ponente || '',
            'Modalidad': a.modality || a.modalidad || 'Virtual',
            'Lugar': a.location || a.lugar || '',
            'Enlace de Conexión': a.meeting_url || a.meetingUrl || a.enlace || '',
            'Enlace de Grabación': a.recording_url || a.recordingUrl || a.grabacion || '',
            'Resumen': a.summary || a.resumen || ''
          };
        });

        const worksheet = XLSX.utils.json_to_sheet(rows);

        // Anchos de columna optimizados para lectura
        worksheet['!cols'] = [
          { wch: 12 }, // Fecha
          { wch: 12 }, // Hora Inicio
          { wch: 10 }, // Hora Fin
          { wch: 25 }, // Departamento
          { wch: 45 }, // Título
          { wch: 25 }, // Ponente
          { wch: 12 }, // Modalidad
          { wch: 20 }, // Lugar
          { wch: 35 }, // Enlace
          { wch: 35 }, // Grabación
          { wch: 40 }  // Resumen
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Aulas Abiertas');

        const fileName = `aulas_abiertas_programacion_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(workbook, fileName);

        showToast('¡Archivo Excel (.xlsx) descargado con éxito!', 'success');
      } catch (err) {
        console.error('Error al generar XLSX:', err);
        showToast(`No se pudo generar el archivo Excel: ${err.message}`, 'error');
      } finally {
        downloadXlsxBtn.disabled = false;
        downloadXlsxBtn.innerHTML = '📊 Descargar XLSX';
      }
    });
  }
}

function getWeekKeyFromDate(dateStr) {
  if (!dateStr) return 'sem-actual';
  const parts = dateStr.split('-');
  if (parts.length < 3) return 'sem-actual';
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month, day);
  const dayOfWeek = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - dayOfWeek);
  const mY = monday.getFullYear();
  const mM = String(monday.getMonth() + 1).padStart(2, '0');
  const mD = String(monday.getDate()).padStart(2, '0');
  return `${mY}-${mM}-${mD}`;
}

/**
 * Inicializa el sistema de cumplimiento legal:
 * - Banner discreto de almacenamiento local / cookies
 * - Modal unificado legal con pestañas navegables
 */
function setupLegalSystem() {
  const cookieBanner = document.getElementById('cookie-consent-banner');
  const btnCookieAccept = document.getElementById('btn-cookie-accept');
  const btnCookieDetails = document.getElementById('btn-cookie-details');

  const legalModal = document.getElementById('modal-legal-backdrop');
  const btnCloseLegal = document.getElementById('btn-close-modal-legal');
  const btnLegalOk = document.getElementById('btn-legal-modal-ok');
  const legalTabBtns = document.querySelectorAll('.legal-tab-btn');
  const legalTabPanes = document.querySelectorAll('.legal-tab-pane');
  const footerLegalLinks = document.querySelectorAll('.footer-legal-link');

  const STORAGE_KEY = 'aa_storage_consent';

  // 1. Mostrar banner si el usuario no ha aceptado previamente
  if (cookieBanner) {
    const isAccepted = localStorage.getItem(STORAGE_KEY) === 'accepted';
    if (!isAccepted) {
      setTimeout(() => {
        cookieBanner.style.display = 'block';
      }, 800);
    }

    if (btnCookieAccept) {
      btnCookieAccept.addEventListener('click', () => {
        localStorage.setItem(STORAGE_KEY, 'accepted');
        cookieBanner.style.animation = 'none';
        cookieBanner.style.opacity = '0';
        cookieBanner.style.transform = 'translateY(100%)';
        cookieBanner.style.transition = 'all 0.25s ease-out';
        setTimeout(() => {
          cookieBanner.style.display = 'none';
        }, 250);
      });
    }

    if (btnCookieDetails) {
      btnCookieDetails.addEventListener('click', () => {
        openLegalModal('cookies');
      });
    }
  }

  // 2. Control de pestañas del modal legal
  function switchLegalTab(tabId) {
    legalTabBtns.forEach(btn => {
      const isTarget = btn.getAttribute('data-tab') === tabId;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    legalTabPanes.forEach(pane => {
      const isTarget = pane.id === `legal-tab-${tabId}`;
      pane.classList.toggle('active', isTarget);
      pane.style.display = isTarget ? 'block' : 'none';
    });
  }

  legalTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      if (tabId) switchLegalTab(tabId);
    });
  });

  // 3. Abrir modal legal
  function openLegalModal(initialTab = 'disclaimer') {
    if (!legalModal) return;
    switchLegalTab(initialTab);
    legalModal.style.display = 'flex';
    legalModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeLegalModal() {
    if (!legalModal) return;
    legalModal.style.display = 'none';
    legalModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // 4. Enlaces del pie de página
  footerLegalLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = link.getAttribute('data-legal-tab') || 'disclaimer';
      openLegalModal(targetTab);
    });
  });

  if (btnCloseLegal) {
    btnCloseLegal.addEventListener('click', closeLegalModal);
  }

  if (btnLegalOk) {
    btnLegalOk.addEventListener('click', closeLegalModal);
  }

  if (legalModal) {
    legalModal.addEventListener('click', (e) => {
      if (e.target === legalModal) {
        closeLegalModal();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && legalModal && legalModal.style.display === 'flex') {
      closeLegalModal();
    }
  });
}

/**
 * ==============================================================================
 * SISTEMA DE SUSCRIPCIÓN AL BOLETÍN ACADÉMICO (MAILERLITE UDEA)
 * ==============================================================================
 */
function setupNewsletterSystem() {
  const modalNewsletter = document.getElementById('modal-newsletter-backdrop');
  const btnCloseModal = document.getElementById('btn-close-modal-newsletter');
  const btnCloseFooter = document.getElementById('btn-close-newsletter-footer');
  const btnOpenModal = document.getElementById('btn-open-newsletter-modal');
  const quickForm = document.getElementById('form-newsletter-quick');
  const quickEmailInput = document.getElementById('newsletter-quick-email');
  const iframe = document.getElementById('newsletter-mailerlite-iframe');
  const loader = document.getElementById('newsletter-iframe-loader');

  function openNewsletterModal(initialEmail = '') {
    if (!modalNewsletter) return;

    // Carga diferida (lazy load) del iframe para optimizar el rendimiento de red inicial
    if (iframe && !iframe.getAttribute('src')) {
      const dataSrc = iframe.getAttribute('data-src') || 'https://landing.mailerlite.com/webforms/landing/v8m8p9';
      iframe.setAttribute('src', dataSrc);

      iframe.addEventListener('load', () => {
        if (loader) loader.classList.add('hidden');
      });

      // Temporizador de respaldo si el evento onload de cross-origin no dispara o se retrasa
      setTimeout(() => {
        if (loader) loader.classList.add('hidden');
      }, 2500);
    }

    modalNewsletter.style.display = 'flex';
    modalNewsletter.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    if (initialEmail) {
      showToast('Completa tu selección de especialidades en el formulario oficial', 'info');
    }
  }

  function closeNewsletterModal() {
    if (!modalNewsletter) return;
    modalNewsletter.style.display = 'none';
    modalNewsletter.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // 1. Botón para abrir modal completo desde la sección
  if (btnOpenModal) {
    btnOpenModal.addEventListener('click', () => {
      openNewsletterModal();
    });
  }

  // 2. Formulario de suscripción rápida
  if (quickForm) {
    quickForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = quickEmailInput ? quickEmailInput.value.trim() : '';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!email || !emailRegex.test(email)) {
        showToast('Por favor, ingresa un correo electrónico institucional o personal válido.', 'error');
        if (quickEmailInput) quickEmailInput.focus();
        return;
      }

      showToast('¡Casi listo! Selecciona tus especialidades médicas en el formulario.', 'success');
      openNewsletterModal(email);
    });
  }

  // 3. Botones de cierre
  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', closeNewsletterModal);
  }

  if (btnCloseFooter) {
    btnCloseFooter.addEventListener('click', closeNewsletterModal);
  }

  // 4. Cierre al hacer clic en el backdrop exterior
  if (modalNewsletter) {
    modalNewsletter.addEventListener('click', (e) => {
      if (e.target === modalNewsletter) {
        closeNewsletterModal();
      }
    });
  }

  // 5. Cierre con tecla Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalNewsletter && modalNewsletter.style.display === 'flex') {
      closeNewsletterModal();
    }
  });
}





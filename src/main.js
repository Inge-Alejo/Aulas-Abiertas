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
  formatDayLabel
} from './services/scheduleService.js';

import {
  loginWithEmail,
  logoutUser,
  onAuthChange
} from './services/firebaseService.js';

import {
  scrapeMailerliteWithGemini
} from './services/geminiService.js';

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
const VERIFIED_PLAYLISTS = [
  {
    title: 'Medicina Interna',
    id: 'PLWutZMaMUREfzBbXZ8PWiR2-aYMNUV4br',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREfzBbXZ8PWiR2-aYMNUV4br',
    category: 'Atención clínica y crítica',
    description: 'Guías clínicas, falla cardíaca, riesgo cardiovascular y patologías sistémicas.'
  },
  {
    title: 'Ginecología y Obstetricia',
    id: 'PLWutZMaMUREdErivJcGl_RVOeCp15cOjh',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREdErivJcGl_RVOeCp15cOjh',
    category: 'Salud materno-infantil',
    description: 'Preeclampsia, embarazo de alto riesgo, salud fetal y oncología ginecológica.'
  },
  {
    title: 'Medicina de Urgencias',
    id: 'PLWutZMaMUREcHGQHpTR1Orc08Zx1DGspv',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREcHGQHpTR1Orc08Zx1DGspv',
    category: 'Atención clínica y crítica',
    description: 'Reanimación, trombolisis, trauma, shock y soporte vital avanzado.'
  },
  {
    title: 'Endocrinología',
    id: 'PLWutZMaMUREfcP8tw36_ngXsrOtpMgUwq',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREfcP8tw36_ngXsrOtpMgUwq',
    category: 'Especialidades médicas',
    description: 'Diabetes, osteoporosis, tiroides, metabolismo óseo y terapias hormonales.'
  },
  {
    title: 'Anestesiología y Reanimación',
    id: 'PLWutZMaMUREe-WzJhxuwkjc5_On2c6--Q',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREe-WzJhxuwkjc5_On2c6--Q',
    category: 'Áreas médico-quirúrgicas',
    description: 'Vía aérea difícil, farmacología perioperatoria, monitoreo hemodinámico.'
  },
  {
    title: 'Pediatría y Puericultura',
    id: 'PLWutZMaMUREfGxKGOcU0DJ1dyZQT0bmgt',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREfGxKGOcU0DJ1dyZQT0bmgt',
    category: 'Salud materno-infantil',
    description: 'Infectología pediátrica, nutrición, desarrollo infantil y neonatología.'
  },
  {
    title: 'Medicina Física y Rehabilitación',
    id: 'PLWutZMaMUREczvFffoLHzIgY0wjqkJsod',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREczvFffoLHzIgY0wjqkJsod',
    category: 'Especialidades médicas',
    description: 'Neurorrehabilitación, enfermedades neuromusculares y rehabilitación musculoesquelética.'
  },
  {
    title: 'Alergología Clínica',
    id: 'PLWutZMaMUREeyppOkA_BSZWFI5rlEgM8e',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREeyppOkA_BSZWFI5rlEgM8e',
    category: 'Especialidades médicas',
    description: 'Hipersensibilidad a fármacos, inmunoterapia y enfermedades atópicas graves.'
  },
  {
    title: 'Otorrinolaringología',
    id: 'PLWutZMaMUREdKYyYrlmTI20pawPQie37e',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREdKYyYrlmTI20pawPQie37e',
    category: 'Áreas médico-quirúrgicas',
    description: 'Patología de oído, nariz, laringe y cirugía de cabeza y cuello.'
  },
  {
    title: 'Psiquiatría y Salud Mental (GREAPIC)',
    id: 'PLWutZMaMUREdq_6zLkAUtHtmpCMnEoBLa',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREdq_6zLkAUtHtmpCMnEoBLa',
    category: 'Salud mental',
    description: 'Psiquiatría de enlace, salud mental infantil y prevención del burnout.'
  },
  {
    title: 'Microbiología y Parasitología',
    id: 'PLWutZMaMUREcdNPC94HRcliXT6wwxMqAL',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREcdNPC94HRcliXT6wwxMqAL',
    category: 'Investigación básica y aplicada',
    description: 'Resistencia antimicrobiana, mecanismos de virulencia y vigilancia epidemiológica.'
  },
  {
    title: 'Nefrología',
    id: 'PLWutZMaMUREfIPu3L-df2t0xnaJhL3pXz',
    url: 'https://www.youtube.com/playlist?list=PLWutZMaMUREfIPu3L-df2t0xnaJhL3pXz',
    category: 'Especialidades médicas',
    description: 'Enfermedad renal crónica, glomerulopatías, diálisis y trasplante renal.'
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
});

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
    const data = await loadScheduleData({ forceRefresh });
    state.allActivities = data.activities;
    state.dataSourceInfo = {
      source: data.source,
      lastUpdated: data.lastUpdated,
      isLive: data.isLive
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
          <span class="spotlight-realtime-indicator" title="Sincronizado en tiempo real con hora legal colombiana COT">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            En tiempo real · COT
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
  const hasMeeting = Boolean(act.meeting_url);
  const hasRecording = Boolean(act.recording_url);

  return `
    <article class="spotlight-item-card ${isLive ? 'is-live' : ''}" id="spotlight-item-${act.id}" tabindex="0">
      <div>
        <div class="spotlight-item-top">
          <span class="spotlight-item-time">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${act.startTime} COT ${act.endTime ? `– ${act.endTime}` : ''}
          </span>
          <span class="card-modality-badge modality-${(act.modality || 'virtual').toLowerCase()}">${act.modality || 'Virtual'}</span>
        </div>

        <div class="spotlight-item-dept">${act.department || 'Facultad de Medicina'}</div>
        <h4 class="spotlight-item-title">${act.title}</h4>

        ${act.speakers ? `
        <div class="spotlight-item-speakers">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span><strong>Presenta:</strong> ${act.speakers}</span>
        </div>
        ` : ''}

        ${act.location ? `
        <div class="spotlight-item-location">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>${act.location}</span>
        </div>
        ` : ''}

        ${act.summary ? `
        <div class="spotlight-item-summary">
          ${act.summary}
        </div>
        ` : ''}
      </div>

      <div class="spotlight-item-actions">
        ${hasMeeting ? `
          <a href="${act.meeting_url}" target="_blank" rel="noopener noreferrer" class="btn-spotlight-access ${isLive ? 'btn-spotlight-live' : ''}" style="width: 100%; justify-content: center; font-size: 0.875rem; padding: 10px 16px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
            ${isLive ? 'Conectarse a la Sesión en Vivo' : 'Ingresar a la Sesión'}
          </a>
        ` : `
          <a href="#programacion" class="btn-secondary" style="width: 100%; justify-content: center; font-size: 0.8125rem; padding: 8px 12px; background: rgba(255,255,255,0.08); color: #FFFFFF; border-color: rgba(255,255,255,0.2);">
            Ver en Programación
          </a>
        `}

        ${hasRecording ? `
          <a href="${act.recording_url}" target="_blank" rel="noopener noreferrer" class="btn-recording-link" style="width: 100%; justify-content: center; font-size: 0.8125rem; padding: 8px 12px;">
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
  const hasMeeting = Boolean(act.meeting_url);
  const hasRecording = Boolean(act.recording_url);

  return `
    <article class="activity-card" id="act-${act.id}" tabindex="0" aria-label="${act.title}">
      <div class="card-top-row">
        <span class="card-time-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${act.startTime} COT ${act.endTime ? `– ${act.endTime}` : ''}
        </span>
        <span class="card-modality-badge modality-${act.modality.toLowerCase()}">${act.modality}</span>
      </div>

      <div class="card-department">${act.department}</div>
      <h4 class="card-title">${act.title}</h4>

      ${act.speakers ? `
      <div class="card-speakers">
        <strong>Presenta:</strong> ${act.speakers}
      </div>
      ` : ''}

      ${act.location ? `
      <div class="card-location">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top:2px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <span>${act.location}</span>
      </div>
      ` : ''}

      ${act.summary ? `
      <div class="card-summary">
        ${act.summary}
      </div>
      ` : ''}

      <div class="card-actions">
        ${hasMeeting ? `
          <a href="${act.meeting_url}" target="_blank" rel="noopener noreferrer" class="btn-session-link" id="link-meet-${act.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="10 8 16 12 10 16 10 8"/><circle cx="12" cy="12" r="10"/></svg>
            Ingresar a la sesión
          </a>
        ` : ''}

        ${hasRecording ? `
          <a href="${act.recording_url}" target="_blank" rel="noopener noreferrer" class="btn-recording-link" id="link-rec-${act.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
            Ver grabación
          </a>
        ` : ''}
      </div>
    </article>
  `;
}

/**
 * Renderiza las listas de reproducción oficiales en la sección de Biblioteca
 */
function renderPlaylists() {
  const container = document.getElementById('playlists-grid-container');
  if (!container) return;

  container.innerHTML = VERIFIED_PLAYLISTS.map((pl, idx) => `
    <div class="playlist-card" id="playlist-card-${idx}">
      <div class="playlist-card-icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="10 8 16 12 10 16 10 8"/>
          <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/>
        </svg>
      </div>
      <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--udea-green-primary); margin-bottom: 4px;">
        ${pl.category}
      </span>
      <h4 class="playlist-card-title">${pl.title}</h4>
      <p class="playlist-card-meta">${pl.description}</p>
      <a href="${pl.url}" target="_blank" rel="noopener noreferrer" class="playlist-card-link" id="link-playlist-${idx}">
        <span>Abrir en YouTube</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
    </div>
  `).join('');
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

    // Cerrar menú al hacer clic en un enlace
    nav.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
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
    padding: 12px 20px;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2);
    display: flex;
    align-items: center;
    gap: 10px;
    opacity: 0;
    transform: translateY(10px);
    transition: all 250ms ease;
    pointer-events: auto;
  `;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  // Animación de entrada
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // Salida automática tras 3.5 segundos
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => {
      toast.remove();
    }, 250);
  }, 3500);
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

  const openAdminModal = (e) => {
    if (e) e.preventDefault();
    if (modal) {
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
      if (!currentUser) {
        emailInput?.focus();
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

  // Estado de autenticación
  onAuthChange((user) => {
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
    } else {
      if (adminNavBtn) {
        adminNavBtn.textContent = 'Acceso';
        adminNavBtn.style.color = '';
      }
      if (viewLogin) viewLogin.style.display = 'block';
      if (viewDash) viewDash.style.display = 'none';
    }
  });

  // Login
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (loginError) loginError.style.display = 'none';
      if (loginSubmitBtn) {
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.textContent = 'Verificando...';
      }

      try {
        await loginWithEmail(email, password);
        showToast('Acceso administrativo concedido', 'success');
        loginForm.reset();
      } catch (err) {
        if (loginError) {
          loginError.textContent = err.message || 'Error de credenciales.';
          loginError.style.display = 'block';
        }
      } finally {
        if (loginSubmitBtn) {
          loginSubmitBtn.disabled = false;
          loginSubmitBtn.textContent = 'Iniciar Sesión';
        }
      }
    });
  }

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logoutUser();
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
          previewTbody.innerHTML = lastScrapedActivities.map((act) => `
            <tr>
              <td><strong>${act.date}</strong></td>
              <td>${act.start_time || act.startTime} COT</td>
              <td>${act.department}</td>
              <td>${act.title}</td>
              <td><span class="card-modality-badge modality-${(act.modality || '').toLowerCase()}">${act.modality || 'Virtual'}</span></td>
            </tr>
          `).join('');
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

  // Actualizar página en vivo con 1 clic
  if (applyLiveBtn) {
    applyLiveBtn.addEventListener('click', () => {
      if (!lastScrapedActivities || lastScrapedActivities.length === 0) {
        showToast('No hay actividades para aplicar.', 'info');
        return;
      }

      // Normalizar estructura de actividades
      const normalized = lastScrapedActivities.map((a, i) => ({
        id: a.id || `SCRAP-${Date.now()}-${i}`,
        date: a.date,
        startTime: a.start_time || a.startTime || '07:00',
        endTime: a.end_time || a.endTime || '',
        department: a.department || 'Facultad de Medicina',
        title: a.title,
        speakers: a.speakers || '',
        modality: a.modality || 'Virtual',
        location: a.location || '',
        meeting_url: a.meeting_url || a.meetingUrl || '',
        recording_url: a.recording_url || a.recordingUrl || '',
        summary: a.summary || '',
        dayLabel: formatDayLabel(a.date),
        weekKey: getWeekKeyFromDate(a.date)
      }));

      state.allActivities = normalized;
      state.availableWeeks = getAvailableWeeks(state.allActivities);
      if (state.availableWeeks.length > 0) {
        state.selectedWeekKey = state.availableWeeks[0].weekKey;
      }

      renderSpotlightActivity();
      renderWeekNavigator();
      renderScheduleList();

      showToast(`¡Página actualizada en vivo con ${normalized.length} conferencias!`, 'success');
      closeAdminModal();
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
      const rows = lastScrapedActivities.map(a => [
        a.date || '',
        a.start_time || a.startTime || '',
        a.department || '',
        a.title || '',
        a.speakers || '',
        a.modality || 'Virtual',
        a.location || '',
        a.meeting_url || a.meetingUrl || '',
        a.recording_url || a.recordingUrl || ''
      ]);

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

        const rows = lastScrapedActivities.map(a => ({
          'Fecha': a.date || '',
          'Hora Inicio': a.start_time || a.startTime || '07:00',
          'Hora Fin': a.end_time || a.endTime || '',
          'Departamento / Especialidad': a.department || '',
          'Título de la Conferencia': a.title || '',
          'Ponente(s)': a.speakers || '',
          'Modalidad': a.modality || 'Virtual',
          'Lugar': a.location || '',
          'Enlace de Conexión': a.meeting_url || a.meetingUrl || '',
          'Enlace de Grabación': a.recording_url || a.recordingUrl || '',
          'Resumen': a.summary || ''
        }));

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



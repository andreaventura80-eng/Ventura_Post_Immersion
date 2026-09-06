// Portfolio Pipeline: Shared Store, Stage Tracker, and Collapsible Sections

export const ALLOWED_STATUSES = ["idle", "running", "done", "stale", "blocked"];

export const STAGES = [
  { id: 1, name: "Universe and settings", shortName: "Universe" },
  { id: 2, name: "Price history", shortName: "Price history" },
  { id: 3, name: "Indicators", shortName: "Indicators" },
  { id: 4, name: "Technical screen", shortName: "Technical screen" },
  { id: 5, name: "Text gate", shortName: "Text gate" },
  { id: 6, name: "Minimum variance", shortName: "Min variance" },
  { id: 7, name: "Guardrails and review", shortName: "Guardrails" },
  { id: 8, name: "Portfolio and note", shortName: "Portfolio & note" }
];

// Central application state with named slots for all pipeline stages
export const appState = {
  universe: null,
  selectedTickers: [],
  settings: {},
  keys: {
    twelveData: "",
    openRouter: ""
  },
  priceCache: {},
  lastFetchTime: null,
  alignedData: null,
  indicatorSeries: null,
  screenResult: null,
  alerts: [],
  profiles: null,
  labels: null,
  rawLabelResponse: null,
  weights: {
    minVariance: null,
    equalWeight: null,
    inverseVolatility: null
  },
  metrics: null,
  beta: null,
  guardrailResult: null,
  note: null,
  notePostCheck: null,
  reviewed: false,
  stageStatus: {
    1: "idle",
    2: "idle",
    3: "idle",
    4: "idle",
    5: "idle",
    6: "idle",
    7: "idle",
    8: "idle"
  }
};

/**
 * Updates the status of a specific stage.
 * Rejects any status string outside the five allowed values.
 *
 * @param {number|string} stage - Stage number (1 to 8)
 * @param {string} status - One of "idle", "running", "done", "stale", "blocked"
 * @returns {boolean} True if successfully applied
 */
export function setStageStatus(stage, status) {
  const stageNum = Number(stage);
  const isValidStageNum = Number.isInteger(stageNum) === true && stageNum >= 1 && stageNum <= 8;
  if (isValidStageNum === false) {
    const errorMsg = `Stage number "${stage}" is invalid. Expected an integer between 1 and 8.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  const statusIsAllowed = ALLOWED_STATUSES.includes(status);
  if (statusIsAllowed === true) {
    appState.stageStatus[stageNum] = status;
    updateStageUI(stageNum);
    return true;
  } else {
    const errorMsg = `Status "${status}" is rejected. Allowed statuses are: ${ALLOWED_STATUSES.join(", ")}.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Marks stages from fromStage to 8 as "stale", unless a stage is currently "blocked".
 *
 * @param {number|string} fromStage - Starting stage number (1 to 8)
 * @returns {boolean} True if execution completed
 */
export function markStagesStale(fromStage) {
  const startNum = Number(fromStage);
  const isValidStageNum = Number.isInteger(startNum) === true && startNum >= 1 && startNum <= 8;
  if (isValidStageNum === false) {
    const errorMsg = `Stage number "${fromStage}" is invalid. Expected an integer between 1 and 8.`;
    console.warn(errorMsg);
    return false;
  }

  for (let s = startNum; s <= 8; s += 1) {
    const isBlocked = appState.stageStatus[s] === "blocked";
    if (isBlocked === true) {
      // Leaves a stage that was blocked as blocked
      continue;
    } else {
      appState.stageStatus[s] = "stale";
      updateStageUI(s);
    }
  }

  return true;
}

/**
 * Updates both the stage tracker pill and the section header pill for a stage.
 *
 * @param {number} stageNum - Stage number (1 to 8)
 */
export function updateStageUI(stageNum) {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  const currentStatus = appState.stageStatus[stageNum];

  // 1. Update tracker pill
  const trackerPill = document.getElementById(`tracker-pill-${stageNum}`);
  const hasTrackerPill = trackerPill !== null;
  if (hasTrackerPill === true) {
    trackerPill.textContent = currentStatus;
    trackerPill.className = `status-pill status-${currentStatus}`;
  } else {
    // tracker pill may not yet be mounted
  }

  // 2. Update section header pill
  const headerPill = document.getElementById(`stage-header-pill-${stageNum}`);
  const hasHeaderPill = headerPill !== null;
  if (hasHeaderPill === true) {
    headerPill.textContent = currentStatus;
    headerPill.className = `status-pill status-${currentStatus}`;
  } else {
    // header pill may not yet be mounted
  }
}

/**
 * Renders the 8 pipeline stages into the sticky tracker bar at the top of the page.
 */
export function renderStageTracker() {
  const trackerContainer = document.getElementById("tracker-steps-list");
  const hasTrackerContainer = trackerContainer !== null;
  if (hasTrackerContainer === false) {
    return;
  }

  trackerContainer.innerHTML = "";

  STAGES.forEach((stage) => {
    const status = appState.stageStatus[stage.id];

    const stepItem = document.createElement("div");
    stepItem.className = "tracker-step-item";
    stepItem.id = `tracker-step-${stage.id}`;
    stepItem.setAttribute("role", "button");
    stepItem.setAttribute("tabindex", "0");
    stepItem.setAttribute("aria-label", `Jump to Stage ${stage.id}: ${stage.name}`);

    stepItem.innerHTML = `
      <div class="tracker-step-content">
        <span class="tracker-step-num">${stage.id}</span>
        <span class="tracker-step-name" title="${stage.name}">${stage.shortName}</span>
      </div>
      <span class="status-pill status-${status}" id="tracker-pill-${stage.id}">${status}</span>
    `;

    // Click on tracker step jumps to corresponding stage section and expands it
    stepItem.addEventListener("click", () => {
      jumpToStage(stage.id);
    });

    stepItem.addEventListener("keydown", (event) => {
      const isEnter = event.key === "Enter";
      const isSpace = event.key === " ";
      const isActivationKey = isEnter === true || isSpace === true;
      if (isActivationKey === true) {
        event.preventDefault();
        jumpToStage(stage.id);
      } else {
        // Ignore other keys
      }
    });

    trackerContainer.appendChild(stepItem);
  });
}

/**
 * Scrolls smoothly to a stage section and ensures it is expanded.
 *
 * @param {number} stageId - Stage number (1 to 8)
 */
export function jumpToStage(stageId) {
  const targetSection = document.getElementById(`stage-section-${stageId}`);
  const hasSection = targetSection !== null;
  if (hasSection === true) {
    // Ensure section is expanded
    expandStageSection(stageId);

    // Scroll section into view with offset for sticky bar
    targetSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    // Section not found
  }
}

/**
 * Expands a specific stage section if it was collapsed.
 *
 * @param {number} stageId - Stage number (1 to 8)
 */
export function expandStageSection(stageId) {
  const header = document.getElementById(`stage-header-${stageId}`);
  const body = document.getElementById(`stage-body-${stageId}`);
  const hasElements = header !== null && body !== null;
  if (hasElements === true) {
    header.setAttribute("aria-expanded", "true");
    body.classList.remove("collapsed");
  } else {
    // Elements not found
  }
}

/**
 * Toggles a stage section between expanded and collapsed states.
 *
 * @param {number} stageId - Stage number (1 to 8)
 */
export function toggleStageSection(stageId) {
  const header = document.getElementById(`stage-header-${stageId}`);
  const body = document.getElementById(`stage-body-${stageId}`);
  const hasElements = header !== null && body !== null;
  if (hasElements === false) {
    return;
  }

  const isExpanded = header.getAttribute("aria-expanded") === "true";
  if (isExpanded === true) {
    header.setAttribute("aria-expanded", "false");
    body.classList.add("collapsed");
  } else {
    header.setAttribute("aria-expanded", "true");
    body.classList.remove("collapsed");
  }
}

/**
 * Sets up click and keyboard listeners on all stage headers to support collapse/expand.
 */
export function setupCollapsibleSections() {
  STAGES.forEach((stage) => {
    const header = document.getElementById(`stage-header-${stage.id}`);
    const hasHeader = header !== null;
    if (hasHeader === true) {
      header.addEventListener("click", () => {
        toggleStageSection(stage.id);
      });

      header.addEventListener("keydown", (event) => {
        const isEnter = event.key === "Enter";
        const isSpace = event.key === " ";
        const isActivationKey = isEnter === true || isSpace === true;
        if (isActivationKey === true) {
          event.preventDefault();
          toggleStageSection(stage.id);
        } else {
          // Ignore other keys
        }
      });
    } else {
      // Header not in DOM
    }
  });
}

/**
 * Adds or updates a global banner in the global status area.
 *
 * @param {string} id - Unique identifier for the banner
 * @param {string} message - Banner text content
 * @param {"warning"|"info"|"error"} level - Banner style level
 */
export function addGlobalBanner(id, message, level = "warning") {
  const bannersContainer = document.getElementById("global-banners");
  const hasContainer = bannersContainer !== null;
  if (hasContainer === false) {
    return;
  }

  // Update in appState alerts
  const existingAlertIndex = appState.alerts.findIndex((a) => a.id === id);
  const hasExistingAlert = existingAlertIndex >= 0;
  if (hasExistingAlert === true) {
    appState.alerts[existingAlertIndex] = { id, message, level };
  } else {
    appState.alerts.push({ id, message, level });
  }

  let bannerElement = document.getElementById(`banner-${id}`);
  const hasBannerElement = bannerElement !== null;
  if (hasBannerElement === false) {
    bannerElement = document.createElement("div");
    bannerElement.id = `banner-${id}`;
    bannersContainer.appendChild(bannerElement);
  } else {
    // Reuse existing banner element
  }

  bannerElement.className = `global-banner banner-${level}`;
  bannerElement.setAttribute("role", level === "error" ? "alert" : "status");

  bannerElement.innerHTML = `
    <div class="banner-content">
      <svg class="banner-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span class="banner-text">${message}</span>
    </div>
    <button type="button" class="banner-close-btn" aria-label="Dismiss notification">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  const closeBtn = bannerElement.querySelector(".banner-close-btn");
  const hasCloseBtn = closeBtn !== null;
  if (hasCloseBtn === true) {
    closeBtn.addEventListener("click", () => {
      removeGlobalBanner(id);
    });
  } else {
    // No close button found
  }
}

/**
 * Removes a global banner by its identifier.
 *
 * @param {string} id - Unique identifier for the banner
 */
export function removeGlobalBanner(id) {
  const alertIndex = appState.alerts.findIndex((a) => a.id === id);
  const hasAlert = alertIndex >= 0;
  if (hasAlert === true) {
    appState.alerts.splice(alertIndex, 1);
  } else {
    // Alert not found in state
  }

  const bannerElement = document.getElementById(`banner-${id}`);
  const hasBannerElement = bannerElement !== null;
  if (hasBannerElement === true) {
    bannerElement.remove();
  } else {
    // Banner element not found in DOM
  }
}

/**
 * Clears all global banners.
 */
export function clearGlobalBanners() {
  appState.alerts = [];
  const bannersContainer = document.getElementById("global-banners");
  const hasContainer = bannersContainer !== null;
  if (hasContainer === true) {
    bannersContainer.innerHTML = "";
  } else {
    // Container not found
  }
}

// Attach helpers and state to window for testing and subsequent prompts
const hasWindow = typeof window !== "undefined";
if (hasWindow === true) {
  window.appState = appState;
  window.setStageStatus = setStageStatus;
  window.markStagesStale = markStagesStale;
  window.addGlobalBanner = addGlobalBanner;
  window.removeGlobalBanner = removeGlobalBanner;
  window.clearGlobalBanners = clearGlobalBanners;
  window.STAGES = STAGES;
  window.ALLOWED_STATUSES = ALLOWED_STATUSES;
}

function initializeApp() {
  renderStageTracker();
  setupCollapsibleSections();
}

const hasDocument = typeof document !== "undefined";
if (hasDocument === true) {
  const isDocReady = document.readyState === "complete" || document.readyState === "interactive";
  if (isDocReady === true) {
    initializeApp();
  } else {
    document.addEventListener("DOMContentLoaded", initializeApp);
  }
}

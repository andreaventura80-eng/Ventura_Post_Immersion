// Portfolio Pipeline: Shared Store, Stage Tracker, and Collapsible Sections

export const ALLOWED_STATUSES = ["idle", "running", "done", "stale", "blocked"];

export const GICS_SECTORS = [
  "Information Technology",
  "Communication Services",
  "Consumer Discretionary",
  "Consumer Staples",
  "Health Care",
  "Financials",
  "Industrials",
  "Energy",
  "Utilities",
  "Materials",
  "Real Estate"
];

export const DEFAULT_UNIVERSE = [
  { sector: "Information Technology", ticker: "AAPL" },
  { sector: "Information Technology", ticker: "MSFT" },
  { sector: "Information Technology", ticker: "NVDA" },
  { sector: "Communication Services", ticker: "GOOGL" },
  { sector: "Communication Services", ticker: "META" },
  { sector: "Communication Services", ticker: "NFLX" },
  { sector: "Consumer Discretionary", ticker: "AMZN" },
  { sector: "Consumer Discretionary", ticker: "HD" },
  { sector: "Consumer Discretionary", ticker: "NKE" },
  { sector: "Consumer Staples", ticker: "PG" },
  { sector: "Consumer Staples", ticker: "KO" },
  { sector: "Consumer Staples", ticker: "COST" },
  { sector: "Health Care", ticker: "JNJ" },
  { sector: "Health Care", ticker: "UNH" },
  { sector: "Health Care", ticker: "PFE" },
  { sector: "Financials", ticker: "JPM" },
  { sector: "Financials", ticker: "GS" },
  { sector: "Financials", ticker: "BLK" },
  { sector: "Industrials", ticker: "CAT" },
  { sector: "Industrials", ticker: "HON" },
  { sector: "Industrials", ticker: "UNP" },
  { sector: "Energy", ticker: "XOM" },
  { sector: "Energy", ticker: "CVX" },
  { sector: "Energy", ticker: "COP" },
  { sector: "Utilities", ticker: "NEE" },
  { sector: "Utilities", ticker: "DUK" },
  { sector: "Utilities", ticker: "SO" },
  { sector: "Materials", ticker: "LIN" },
  { sector: "Materials", ticker: "SHW" },
  { sector: "Materials", ticker: "NUE" },
  { sector: "Real Estate", ticker: "PLD" },
  { sector: "Real Estate", ticker: "AMT" },
  { sector: "Real Estate", ticker: "EQIX" },
  { sector: "Benchmark", ticker: "SPY" }
];

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

export const INDICATOR_CONSTANTS = Object.freeze({
  rsiPeriod: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9
});

export const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-3.5-sonnet";

export const DEFAULT_SETTINGS = Object.freeze({
  rsiThreshold: 40,
  rsiRelaxCount: 0,
  histogramLookback: 3,
  weightCap: 0.25,
  minimumBreadth: 5,
  gateMode: "exclude",
  investmentAmount: 1000000,
  riskFreeRate: 0.0391,
  creditsPerMinute: 144,
  openRouterModel: DEFAULT_OPENROUTER_MODEL
});

// Central application state with named slots for all pipeline stages
export const appState = {
  universe: null,
  selectedTickers: [],
  settings: {
    ...DEFAULT_SETTINGS
  },
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
 * Initializes the default universe and selects all 33 constituents.
 * SPY is never placed into selectedTickers.
 */
export function initDefaultUniverse() {
  appState.universe = DEFAULT_UNIVERSE.map((row) => ({ sector: row.sector, ticker: row.ticker }));
  appState.selectedTickers = DEFAULT_UNIVERSE
    .filter((row) => row.sector !== "Benchmark" && row.ticker !== "SPY")
    .map((row) => row.ticker);
}

// Pre-load default universe on module start
initDefaultUniverse();

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

/**
 * Parses and validates CSV content for the 33-constituent universe + SPY benchmark.
 * Enforces validation rules in strict sequential order and stops at the first failure.
 *
 * Rules:
 * 1. Header row must be exactly Sector,Ticker.
 * 2. Exactly 33 constituent rows.
 * 3. Exactly one SPY row whose sector is the exact string Benchmark.
 * 4. Every constituent sector must be one of the 11 names in GICS_SECTORS spelled exactly.
 * 5. Each of the 11 sectors must have exactly three tickers.
 * 6. No duplicate ticker anywhere in the file.
 *
 * @param {string} csvText - Raw text from uploaded CSV file
 * @returns {{ success: boolean, data?: Array<{sector: string, ticker: string}>, error?: string }}
 */
export function parseUniverseCSV(csvText) {
  const isString = typeof csvText === "string";
  if (isString === false) {
    return {
      success: false,
      error: "Invalid file content. Expected a text CSV file."
    };
  }

  // 1. Strip leading byte-order mark (BOM)
  const cleanText = csvText.replace(/^\uFEFF/, "");

  // 2. Accept both LF and CRLF line endings (and bare CR)
  const rawLines = cleanText.split(/\r\n|\n|\r/);

  // 3. Ignore trailing blank lines
  const lines = [...rawLines];
  while (lines.length > 0) {
    const lastIndex = lines.length - 1;
    const isBlank = lines[lastIndex].trim() === "";
    if (isBlank === true) {
      lines.pop();
    } else {
      break;
    }
  }

  // Rule 1: Header row must be exactly Sector,Ticker
  const hasLines = lines.length > 0;
  if (hasLines === false) {
    return {
      success: false,
      error: "Header rule broken: header row must be exactly Sector,Ticker."
    };
  }

  const headerCells = lines[0].split(",").map((c) => c.trim());
  const headerLenValid = headerCells.length === 2;
  const headerSectorValid = headerLenValid === true && headerCells[0] === "Sector";
  const headerTickerValid = headerLenValid === true && headerCells[1] === "Ticker";
  const headerIsValid = headerSectorValid === true && headerTickerValid === true;
  if (headerIsValid === false) {
    return {
      success: false,
      error: "Header rule broken: header row must be exactly Sector,Ticker."
    };
  }

  // Parse constituent and benchmark rows
  const dataLines = lines.slice(1);
  const parsedRows = [];

  for (let i = 0; i < dataLines.length; i += 1) {
    const rawLine = dataLines[i];
    const isLineBlank = rawLine.trim() === "";
    if (isLineBlank === true) {
      return {
        success: false,
        error: `Row format broken at line ${i + 2}: empty line encountered in data.`
      };
    }

    const cells = rawLine.split(",").map((c) => c.trim());
    const cellCountValid = cells.length === 2;
    if (cellCountValid === false) {
      return {
        success: false,
        error: `Row format broken at line ${i + 2}: expected exactly 2 comma-separated values (Sector,Ticker).`
      };
    }

    const sector = cells[0];
    const ticker = cells[1].toUpperCase();
    const tickerEmpty = ticker.length === 0;
    if (tickerEmpty === true) {
      return {
        success: false,
        error: `Ticker format broken at line ${i + 2}: ticker is empty.`
      };
    }

    parsedRows.push({ sector, ticker });
  }

  // Separate constituents and benchmark (SPY)
  const constituentRows = [];
  const benchmarkRows = [];

  for (let i = 0; i < parsedRows.length; i += 1) {
    const row = parsedRows[i];
    const isBenchmarkSector = row.sector === "Benchmark";
    const isSpyTicker = row.ticker === "SPY";
    const isBenchmarkOrSpy = isBenchmarkSector === true || isSpyTicker === true;
    if (isBenchmarkOrSpy === true) {
      benchmarkRows.push(row);
    } else {
      constituentRows.push(row);
    }
  }

  // Rule 2: Exactly 33 constituent rows
  const constituentCountValid = constituentRows.length === 33;
  if (constituentCountValid === false) {
    return {
      success: false,
      error: `Constituent count rule broken: exactly 33 constituent rows required (found ${constituentRows.length}).`
    };
  }

  // Rule 3: Exactly one SPY row whose sector is the exact string Benchmark
  const benchmarkCountValid = benchmarkRows.length === 1;
  const singleBenchmark = benchmarkCountValid === true ? benchmarkRows[0] : null;
  const benchmarkSectorValid = singleBenchmark !== null && singleBenchmark.sector === "Benchmark";
  const benchmarkTickerValid = singleBenchmark !== null && singleBenchmark.ticker === "SPY";
  const benchmarkRowValid = benchmarkCountValid === true && benchmarkSectorValid === true && benchmarkTickerValid === true;
  if (benchmarkRowValid === false) {
    return {
      success: false,
      error: "Benchmark rule broken: exactly one SPY row whose sector is the exact string Benchmark required."
    };
  }

  // Rule 4: Every constituent sector must be one of the 11 names in GICS_SECTORS spelled exactly
  for (let c = 0; c < constituentRows.length; c += 1) {
    const row = constituentRows[c];
    const sectorIsGics = GICS_SECTORS.includes(row.sector);
    if (sectorIsGics === false) {
      return {
        success: false,
        error: `Sector validity rule broken: every constituent sector must be one of the 11 names in GICS_SECTORS spelled exactly (invalid sector: "${row.sector}").`
      };
    }
  }

  // Rule 5: Each of the 11 sectors must have exactly three tickers
  const sectorTally = {};
  for (let s = 0; s < GICS_SECTORS.length; s += 1) {
    sectorTally[GICS_SECTORS[s]] = 0;
  }
  for (let c = 0; c < constituentRows.length; c += 1) {
    const row = constituentRows[c];
    sectorTally[row.sector] += 1;
  }
  for (let s = 0; s < GICS_SECTORS.length; s += 1) {
    const sectorName = GICS_SECTORS[s];
    const count = sectorTally[sectorName];
    const countIsThree = count === 3;
    if (countIsThree === false) {
      return {
        success: false,
        error: `Sector balance rule broken: each of the 11 sectors must have exactly three tickers (sector "${sectorName}" has ${count}).`
      };
    }
  }

  // Rule 6: No duplicate ticker anywhere in the file
  const seenTickers = new Set();
  const allRows = [...constituentRows, ...benchmarkRows];
  for (let a = 0; a < allRows.length; a += 1) {
    const ticker = allRows[a].ticker;
    const isDuplicate = seenTickers.has(ticker);
    if (isDuplicate === true) {
      return {
        success: false,
        error: `Duplicate ticker rule broken: no duplicate ticker anywhere in the file (duplicate found: "${ticker}").`
      };
    }
    seenTickers.add(ticker);
  }

  return {
    success: true,
    data: allRows
  };
}

/**
 * Applies uploaded CSV text to the application state if valid.
 * Replaces universe, updates selectedTickers, clears labels/rawLabelResponse,
 * cleans priceCache of removed tickers, and resets all stages to idle.
 * On failure, leaves all state unchanged and displays the error message.
 *
 * @param {string} csvText - Raw CSV text
 * @returns {{ success: boolean, error?: string }}
 */
export function applyUniverseCSV(csvText) {
  const result = parseUniverseCSV(csvText);
  const isValid = result.success === true;
  if (isValid === true) {
    const parsedRows = result.data;
    appState.universe = parsedRows.map((r) => ({ sector: r.sector, ticker: r.ticker }));
    appState.selectedTickers = parsedRows
      .filter((r) => r.sector !== "Benchmark" && r.ticker !== "SPY")
      .map((r) => r.ticker);
    appState.labels = null;
    appState.rawLabelResponse = null;

    // Remove from priceCache every ticker no longer in the list
    const newTickersSet = new Set(parsedRows.map((r) => r.ticker));
    const hasPriceCache = appState.priceCache !== null && typeof appState.priceCache === "object";
    if (hasPriceCache === true) {
      const cachedKeys = Object.keys(appState.priceCache);
      for (let k = 0; k < cachedKeys.length; k += 1) {
        const cachedTicker = cachedKeys[k];
        const isStillInUniverse = newTickersSet.has(cachedTicker);
        if (isStillInUniverse === false) {
          delete appState.priceCache[cachedTicker];
        }
      }
    }

    // Set all eight stages to "idle"
    for (let s = 1; s <= 8; s += 1) {
      setStageStatus(s, "idle");
    }

    renderUniverseUI();
    updatePreflightCard();
    showUniverseMessage("Universe updated successfully. 33 constituents and SPY benchmark loaded.", "success");
    return { success: true };
  } else {
    // Leave state.universe, selectedTickers, priceCache, and stage statuses unchanged
    showUniverseMessage(result.error, "error");
    return { success: false, error: result.error };
  }
}

/**
 * Displays a validation error or status message next to the file input.
 *
 * @param {string} message - Message text
 * @param {string} type - "error", "success", or "info"
 */
export function showUniverseMessage(message, type = "info") {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  const messageBox = document.getElementById("universe-upload-message");
  const hasMessageBox = messageBox !== null;
  if (hasMessageBox === true) {
    messageBox.className = `universe-upload-message message-${type}`;
    messageBox.textContent = message;
    messageBox.classList.remove("hidden");
  } else {
    // Message container not present in DOM
  }
}

/**
 * Downloads a sample balanced universe CSV template.
 */
export function downloadUniverseTemplate() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  const lines = ["Sector,Ticker"];
  DEFAULT_UNIVERSE.forEach((row) => {
    lines.push(`${row.sector},${row.ticker}`);
  });
  const csvContent = lines.join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "universe_template.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Resets universe back to the DEFAULT_UNIVERSE constant.
 */
export function resetToDefaultUniverse() {
  appState.universe = DEFAULT_UNIVERSE.map((row) => ({ sector: row.sector, ticker: row.ticker }));
  appState.selectedTickers = DEFAULT_UNIVERSE
    .filter((row) => row.sector !== "Benchmark" && row.ticker !== "SPY")
    .map((row) => row.ticker);
  appState.labels = null;
  appState.rawLabelResponse = null;

  const defaultTickersSet = new Set(DEFAULT_UNIVERSE.map((r) => r.ticker));
  const hasPriceCache = appState.priceCache !== null && typeof appState.priceCache === "object";
  if (hasPriceCache === true) {
    const cachedKeys = Object.keys(appState.priceCache);
    for (let k = 0; k < cachedKeys.length; k += 1) {
      const cachedTicker = cachedKeys[k];
      const isStillInUniverse = defaultTickersSet.has(cachedTicker);
      if (isStillInUniverse === false) {
        delete appState.priceCache[cachedTicker];
      }
    }
  }

  for (let s = 1; s <= 8; s += 1) {
    setStageStatus(s, "idle");
  }

  renderUniverseUI();
  updatePreflightCard();
  showUniverseMessage("Reset to default 33-constituent universe and SPY benchmark.", "info");
}

/**
 * Toggles a constituent ticker in appState.selectedTickers.
 * SPY is never toggled.
 *
 * @param {string} ticker
 */
export function toggleConstituentTicker(ticker) {
  const isSpy = ticker === "SPY";
  if (isSpy === true) {
    return;
  }

  const isSelected = appState.selectedTickers.includes(ticker);
  if (isSelected === true) {
    appState.selectedTickers = appState.selectedTickers.filter((t) => t !== ticker);
  } else {
    appState.selectedTickers = [...appState.selectedTickers, ticker];
  }

  renderUniverseUI();
  updatePreflightCard();
}

/**
 * Renders the sector cards and tickers inside Stage 1.
 */
export function renderUniverseUI() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  const gridContainer = document.getElementById("universe-sectors-grid");
  const hasGridContainer = gridContainer !== null;
  if (hasGridContainer === false) {
    return;
  }

  // Update summary stats
  const constituentsVal = document.getElementById("stat-constituents-count");
  const hasConstituentsVal = constituentsVal !== null;
  if (hasConstituentsVal === true) {
    const selectedCount = appState.selectedTickers ? appState.selectedTickers.length : 0;
    const totalConstituents = (appState.universe || []).filter((r) => r.sector !== "Benchmark" && r.ticker !== "SPY").length;
    constituentsVal.textContent = `${selectedCount} / ${totalConstituents} selected`;
  }

  gridContainer.innerHTML = "";

  const universe = appState.universe || [];

  GICS_SECTORS.forEach((sectorName) => {
    const sectorRows = universe.filter((row) => row.sector === sectorName);
    const activeInSector = sectorRows.filter((row) => appState.selectedTickers.includes(row.ticker)).length;

    const card = document.createElement("div");
    card.className = "sector-card";
    const slug = sectorName.toLowerCase().replace(/\s+/g, "-");
    card.id = `sector-card-${slug}`;

    const tickersHtml = sectorRows
      .map((row) => {
        const isSelected = appState.selectedTickers.includes(row.ticker);
        const chipClass = isSelected === true ? "ticker-chip selected" : "ticker-chip deselected";
        const ariaPressed = isSelected === true ? "true" : "false";
        return `<button type="button" class="${chipClass}" id="chip-${row.ticker.toLowerCase()}" data-ticker="${row.ticker}" aria-pressed="${ariaPressed}">${row.ticker}</button>`;
      })
      .join("");

    card.innerHTML = `
      <div class="sector-card-header">
        <span class="sector-name">${sectorName}</span>
        <span class="sector-badge-count">${activeInSector} / ${sectorRows.length} active</span>
      </div>
      <div class="sector-tickers-list">
        ${tickersHtml}
      </div>
    `;

    gridContainer.appendChild(card);
  });
}

/**
 * Displays a validation error message in the settings panel.
 *
 * @param {string} message
 */
export function showSettingsError(message) {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }
  const msgEl = document.getElementById("settings-validation-message");
  if (msgEl !== null) {
    msgEl.textContent = message;
    msgEl.classList.remove("hidden");
  }
}

/**
 * Clears the validation error message in the settings panel.
 */
export function clearSettingsError() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }
  const msgEl = document.getElementById("settings-validation-message");
  if (msgEl !== null) {
    msgEl.textContent = "";
    msgEl.classList.add("hidden");
  }
}

/**
 * Validates and updates the weight cap setting.
 * Range: 15% to 50% in steps of 1% (stored as fraction 0.15 to 0.50).
 * Enforces coupled constraint: minimumBreadth * weightCap >= 1.0.
 *
 * @param {string|number} rawInput
 * @returns {boolean} True if accepted
 */
export function validateAndSetWeightCap(rawInput) {
  const str = String(rawInput).trim().replace(/%/g, "");
  const num = parseFloat(str);
  const isNum = isNaN(num) === false;
  if (isNum === false) {
    showSettingsError(`Weight cap must be an integer percentage between 15% and 50% in steps of 1% (entered "${rawInput}").`);
    renderSettingsUI();
    return false;
  }

  let percentVal = num;
  const isFractionForm = num > 0 && num <= 1;
  if (isFractionForm === true) {
    percentVal = Math.round(num * 100);
  }

  const isInteger = Number.isInteger(percentVal) === true;
  const inRange = isInteger === true && percentVal >= 15 && percentVal <= 50;
  if (inRange === false) {
    showSettingsError(`Weight cap must be an integer percentage between 15% and 50% in steps of 1% (entered "${rawInput}").`);
    renderSettingsUI();
    return false;
  }

  const candidateFraction = percentVal / 100;
  const currentBreadth = appState.settings.minimumBreadth;
  const product = currentBreadth * candidateFraction;
  const breadthTimesCapIsFeasible = product >= 1.0 - 1e-9;
  if (breadthTimesCapIsFeasible === false) {
    const currentProductPercent = Math.round(product * 100);
    showSettingsError(
      `Coupled constraint rule broken: minimum breadth (${currentBreadth}) multiplied by weight cap (${percentVal}%) equals ${currentProductPercent}%, which is below 100%. Please raise the breadth before lowering the cap.`
    );
    renderSettingsUI();
    return false;
  }

  appState.settings.weightCap = candidateFraction;
  clearSettingsError();
  renderSettingsUI();
  updatePreflightCard();
  return true;
}

/**
 * Validates and updates the minimum breadth setting.
 * Range: integer >= 2.
 * Enforces coupled constraint: minimumBreadth * weightCap >= 1.0.
 *
 * @param {string|number} rawInput
 * @returns {boolean} True if accepted
 */
export function validateAndSetMinimumBreadth(rawInput) {
  const clean = String(rawInput).trim();
  const isInt = /^-?\d+$/.test(clean) === true;
  const num = parseInt(clean, 10);
  const isAtLeastTwo = isInt === true && num >= 2;
  if (isAtLeastTwo === false) {
    showSettingsError(`Minimum breadth must be an integer of at least 2 (entered "${rawInput}").`);
    renderSettingsUI();
    return false;
  }

  const currentCapFraction = appState.settings.weightCap;
  const product = num * currentCapFraction;
  const breadthTimesCapIsFeasible = product >= 1.0 - 1e-9;
  if (breadthTimesCapIsFeasible === false) {
    const capPercent = Math.round(currentCapFraction * 100);
    const currentProductPercent = Math.round(product * 100);
    showSettingsError(
      `Coupled constraint rule broken: minimum breadth (${num}) multiplied by weight cap (${capPercent}%) equals ${currentProductPercent}%, which is below 100%. Please raise the cap before lowering the breadth.`
    );
    renderSettingsUI();
    return false;
  }

  appState.settings.minimumBreadth = num;
  clearSettingsError();
  renderSettingsUI();
  updatePreflightCard();
  return true;
}

/**
 * Validates and updates the investment capital setting.
 * Range: whole dollars, at least 1,000 USD.
 * Accepts input with or without thousands commas.
 *
 * @param {string|number} rawInput
 * @returns {boolean} True if accepted
 */
export function validateAndSetInvestmentAmount(rawInput) {
  const clean = String(rawInput).trim().replace(/,/g, "").replace(/\$/g, "");
  const isWholeNumber = /^-?\d+$/.test(clean) === true;
  if (isWholeNumber === false) {
    showSettingsError(`Investment amount must be a whole dollar integer without decimals (entered "${rawInput}").`);
    renderSettingsUI();
    return false;
  }

  const num = parseInt(clean, 10);
  const isAtLeast1000 = num >= 1000;
  if (isAtLeast1000 === false) {
    showSettingsError(`Investment amount must be at least 1,000 USD (entered "${rawInput}").`);
    renderSettingsUI();
    return false;
  }

  appState.settings.investmentAmount = num;
  clearSettingsError();
  renderSettingsUI();
  updatePreflightCard();
  return true;
}

/**
 * Validates and updates the RSI threshold setting.
 * Range: integer 30 to 50.
 *
 * @param {string|number} rawInput
 * @returns {boolean} True if accepted
 */
export function validateAndSetRsiThreshold(rawInput) {
  const clean = String(rawInput).trim();
  const isInt = /^-?\d+$/.test(clean) === true;
  const num = parseInt(clean, 10);
  const inRange = isInt === true && num >= 30 && num <= 50;
  if (inRange === false) {
    showSettingsError(`RSI threshold must be an integer between 30 and 50 (entered "${rawInput}").`);
    renderSettingsUI();
    return false;
  }

  appState.settings.rsiThreshold = num;
  clearSettingsError();
  renderSettingsUI();
  updatePreflightCard();
  return true;
}

/**
 * Validates and updates the MACD histogram lookback (N) setting.
 * Range: integer 2 to 10.
 *
 * @param {string|number} rawInput
 * @returns {boolean} True if accepted
 */
export function validateAndSetHistogramLookback(rawInput) {
  const clean = String(rawInput).trim();
  const isInt = /^-?\d+$/.test(clean) === true;
  const num = parseInt(clean, 10);
  const inRange = isInt === true && num >= 2 && num <= 10;
  if (inRange === false) {
    showSettingsError(`MACD histogram lookback (N) must be an integer between 2 and 10 (entered "${rawInput}").`);
    renderSettingsUI();
    return false;
  }

  appState.settings.histogramLookback = num;
  clearSettingsError();
  renderSettingsUI();
  updatePreflightCard();
  return true;
}

/**
 * Validates and updates the risk-free rate setting.
 * Range: 0% to 10% in steps of 0.01% (stored as fraction 0.0 to 0.10).
 *
 * @param {string|number} rawInput
 * @returns {boolean} True if accepted
 */
export function validateAndSetRiskFreeRate(rawInput) {
  const clean = String(rawInput).trim().replace(/%/g, "");
  const num = parseFloat(clean);
  const isValid = isNaN(num) === false && num >= 0 && num <= 10;
  if (isValid === false) {
    showSettingsError(`Risk-free rate must be between 0% and 10% in steps of 0.01% (entered "${rawInput}").`);
    renderSettingsUI();
    return false;
  }

  const roundedPercent = Math.round(num * 100) / 100;
  appState.settings.riskFreeRate = roundedPercent / 100;
  clearSettingsError();
  renderSettingsUI();
  updatePreflightCard();
  return true;
}

/**
 * Validates and updates the credits per minute quota setting.
 * Range: integer >= 34.
 *
 * @param {string|number} rawInput
 * @returns {boolean} True if accepted
 */
export function validateAndSetCreditsPerMinute(rawInput) {
  const clean = String(rawInput).trim();
  const isInt = /^-?\d+$/.test(clean) === true;
  const num = parseInt(clean, 10);
  const isAtLeast34 = isInt === true && num >= 34;
  if (isAtLeast34 === false) {
    showSettingsError(`Credits per minute must be an integer of at least 34 credits/minute (entered "${rawInput}").`);
    renderSettingsUI();
    return false;
  }

  appState.settings.creditsPerMinute = num;
  clearSettingsError();
  renderSettingsUI();
  updatePreflightCard();
  return true;
}

/**
 * Validates and updates the qualitative text gate mode setting.
 * Values: "exclude" or "warn".
 *
 * @param {string} val
 * @returns {boolean} True if accepted
 */
export function validateAndSetGateMode(val) {
  const isAllowed = val === "exclude" || val === "warn";
  if (isAllowed === true) {
    appState.settings.gateMode = val;
    clearSettingsError();
  } else {
    showSettingsError(`Gate mode must be "exclude" or "warn" (entered "${val}").`);
    renderSettingsUI();
    return false;
  }
  updatePreflightCard();
  return true;
}

/**
 * Validates and updates the OpenRouter model identifier setting.
 * Must not be empty.
 *
 * @param {string} rawInput
 * @returns {boolean} True if accepted
 */
export function validateAndSetOpenRouterModel(rawInput) {
  const clean = String(rawInput).trim();
  const isEmpty = clean.length === 0;
  if (isEmpty === true) {
    showSettingsError("OpenRouter model identifier cannot be empty.");
    renderSettingsUI();
    updatePreflightCard();
    return false;
  }

  appState.settings.openRouterModel = clean;
  clearSettingsError();
  renderSettingsUI();
  updatePreflightCard();
  return true;
}

/**
 * Stores the Twelve Data API key in memory only.
 *
 * @param {string} key
 */
export function setTwelveDataKey(key) {
  appState.keys.twelveData = String(key || "");
  updatePreflightCard();
}

/**
 * Stores the OpenRouter API key in memory only.
 *
 * @param {string} key
 */
export function setOpenRouterKey(key) {
  appState.keys.openRouter = String(key || "");
  updatePreflightCard();
}

/**
 * Computes all setting-level reasons why a pipeline run cannot succeed.
 *
 * @returns {string[]} List of blocking reason messages
 */
export function computePreflightChecks() {
  const reasons = [];

  // 1. Fewer selected constituents than minimumBreadth
  const selectedConstituents = (appState.selectedTickers || []).filter((t) => t !== "SPY");
  const constituentCount = selectedConstituents.length;
  const minBreadth = appState.settings.minimumBreadth || 5;
  const hasEnoughConstituents = constituentCount >= minBreadth;
  if (hasEnoughConstituents === false) {
    reasons.push(
      `Fewer selected constituents (${constituentCount}) than minimum breadth (${minBreadth}).`
    );
  }

  // 2. Selected constituents in fewer than two sectors
  const universe = appState.universe || [];
  const tickerToSector = new Map();
  for (let i = 0; i < universe.length; i += 1) {
    const row = universe[i];
    const isConstituent = row.sector !== "Benchmark" && row.ticker !== "SPY";
    if (isConstituent === true) {
      tickerToSector.set(row.ticker, row.sector);
    }
  }

  const activeSectors = new Set();
  for (let j = 0; j < selectedConstituents.length; j += 1) {
    const t = selectedConstituents[j];
    const sec = tickerToSector.get(t);
    if (sec !== undefined) {
      activeSectors.add(sec);
    }
  }

  const hasAtLeastTwoSectors = activeSectors.size >= 2;
  if (hasAtLeastTwoSectors === false) {
    const sectorCount = activeSectors.size;
    reasons.push(
      `Selected constituents represent ${sectorCount} sector(s). At least 2 sectors are required.`
    );
  }

  // 3. investmentAmount not a whole number of at least 1,000
  const inv = appState.settings.investmentAmount;
  const isInvInteger = Number.isInteger(inv) === true;
  const isInvAtLeast1000 = typeof inv === "number" && inv >= 1000;
  const isInvValid = isInvInteger === true && isInvAtLeast1000 === true;
  if (isInvValid === false) {
    reasons.push("Investment amount must be a whole number of at least 1,000 USD.");
  }

  // 4. empty openRouterModel
  const model = (appState.settings.openRouterModel || "").trim();
  const isModelEmpty = model.length === 0;
  if (isModelEmpty === true) {
    reasons.push("OpenRouter model identifier is empty.");
  }

  // 5. empty twelveDataKey
  const tdKey = (appState.keys.twelveData || "").trim();
  const isTdKeyEmpty = tdKey.length === 0;
  if (isTdKeyEmpty === true) {
    reasons.push("Twelve Data API key is required.");
  }

  // 6. empty openRouterKey
  const orKey = (appState.keys.openRouter || "").trim();
  const isOrKeyEmpty = orKey.length === 0;
  if (isOrKeyEmpty === true) {
    reasons.push("OpenRouter API key is required.");
  }

  return reasons;
}

/**
 * Recomputes the pre-flight card display and updates the Run button state.
 */
export function updatePreflightCard() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  const reasonsListEl = document.getElementById("preflight-reasons-list");
  const statusBadgeEl = document.getElementById("preflight-status-badge");
  const runBtnEl = document.getElementById("btn-run-pipeline");
  const runHintEl = document.getElementById("run-pipeline-hint");

  const reasons = computePreflightChecks();
  const isReady = reasons.length === 0;

  if (reasonsListEl !== null) {
    if (isReady === true) {
      reasonsListEl.innerHTML = `
        <li class="preflight-success-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>All pre-flight checks passed. Universe, settings, and credentials are ready.</span>
        </li>
      `;
    } else {
      reasonsListEl.innerHTML = reasons
        .map((reason) => `<li>${reason}</li>`)
        .join("");
    }
  }

  if (statusBadgeEl !== null) {
    if (isReady === true) {
      statusBadgeEl.textContent = "Ready";
      statusBadgeEl.className = "preflight-badge status-ready";
    } else {
      statusBadgeEl.textContent = `Blocked (${reasons.length})`;
      statusBadgeEl.className = "preflight-badge status-blocked";
    }
  }

  if (runBtnEl !== null) {
    runBtnEl.disabled = isReady === false;
  }

  if (runHintEl !== null) {
    if (isReady === true) {
      runHintEl.textContent = "All pre-flight checks satisfied. Press Run Pipeline to begin.";
    } else {
      runHintEl.textContent = `Resolve the ${reasons.length} pre-flight item(s) above to enable Run.`;
    }
  }
}

/**
 * Handles clicking the Run Pipeline button.
 * Sets Stage 1 to "done" and Stage 2 to "running".
 */
export function handleRunPipeline() {
  const reasons = computePreflightChecks();
  const canRun = reasons.length === 0;
  if (canRun === true) {
    setStageStatus(1, "done");
    setStageStatus(2, "running");

    const hasDocument = typeof document !== "undefined";
    if (hasDocument === true) {
      const stageBody2 = document.getElementById("stage-body-2");
      const stageHeader2 = document.getElementById("stage-header-2");
      if (stageBody2 !== null && stageHeader2 !== null) {
        stageBody2.classList.remove("collapsed");
        stageHeader2.setAttribute("aria-expanded", "true");
      }

      const stageSection2 = document.getElementById("stage-section-2");
      if (stageSection2 !== null) {
        stageSection2.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  } else {
    updatePreflightCard();
  }
}

/**
 * Updates all settings input fields in the DOM from appState.settings.
 */
export function renderSettingsUI() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  const rsiInput = document.getElementById("setting-rsi-threshold");
  if (rsiInput !== null && document.activeElement !== rsiInput) {
    rsiInput.value = String(appState.settings.rsiThreshold);
  }

  const rsiRelaxSpan = document.getElementById("rsi-relax-count-val");
  if (rsiRelaxSpan !== null) {
    rsiRelaxSpan.textContent = String(appState.settings.rsiRelaxCount || 0);
  }

  const histInput = document.getElementById("setting-histogram-lookback");
  if (histInput !== null && document.activeElement !== histInput) {
    histInput.value = String(appState.settings.histogramLookback);
  }

  const capInput = document.getElementById("setting-weight-cap");
  if (capInput !== null && document.activeElement !== capInput) {
    const percent = Math.round((appState.settings.weightCap || 0.25) * 100);
    capInput.value = `${percent}%`;
  }

  const breadthInput = document.getElementById("setting-minimum-breadth");
  if (breadthInput !== null && document.activeElement !== breadthInput) {
    breadthInput.value = String(appState.settings.minimumBreadth);
  }

  const gateSelect = document.getElementById("setting-gate-mode");
  if (gateSelect !== null && document.activeElement !== gateSelect) {
    gateSelect.value = appState.settings.gateMode || "exclude";
  }

  const invInput = document.getElementById("setting-investment-amount");
  if (invInput !== null && document.activeElement !== invInput) {
    const inv = appState.settings.investmentAmount || 1000000;
    invInput.value = inv.toLocaleString("en-US");
  }

  const rfInput = document.getElementById("setting-risk-free-rate");
  if (rfInput !== null && document.activeElement !== rfInput) {
    const rf = (appState.settings.riskFreeRate || 0.0391) * 100;
    rfInput.value = `${rf.toFixed(2)}%`;
  }

  const credInput = document.getElementById("setting-credits-per-minute");
  if (credInput !== null && document.activeElement !== credInput) {
    credInput.value = String(appState.settings.creditsPerMinute || 144);
  }

  const modelInput = document.getElementById("setting-open-router-model");
  if (modelInput !== null && document.activeElement !== modelInput) {
    modelInput.value = appState.settings.openRouterModel || DEFAULT_OPENROUTER_MODEL;
  }
}

/**
 * Wires up all event listeners for the settings panel, constituent chips, and pre-flight card.
 */
export function setupSettingsPanel() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  // Delegated click listener for sector chips grid
  const sectorsGrid = document.getElementById("universe-sectors-grid");
  if (sectorsGrid !== null) {
    sectorsGrid.addEventListener("click", (event) => {
      const chipBtn = event.target.closest(".ticker-chip");
      if (chipBtn !== null) {
        const ticker = chipBtn.getAttribute("data-ticker");
        const isValidTicker = typeof ticker === "string" && ticker.length > 0 && ticker !== "SPY";
        if (isValidTicker === true) {
          toggleConstituentTicker(ticker);
        }
      }
    });
  }

  // Weight Cap
  const capInput = document.getElementById("setting-weight-cap");
  if (capInput !== null) {
    capInput.addEventListener("change", (e) => {
      validateAndSetWeightCap(e.target.value);
    });
  }

  // Minimum Breadth
  const breadthInput = document.getElementById("setting-minimum-breadth");
  if (breadthInput !== null) {
    breadthInput.addEventListener("change", (e) => {
      validateAndSetMinimumBreadth(e.target.value);
    });
  }

  // Investment Amount
  const invInput = document.getElementById("setting-investment-amount");
  if (invInput !== null) {
    invInput.addEventListener("change", (e) => {
      validateAndSetInvestmentAmount(e.target.value);
    });
  }

  // RSI Threshold
  const rsiInput = document.getElementById("setting-rsi-threshold");
  if (rsiInput !== null) {
    rsiInput.addEventListener("change", (e) => {
      validateAndSetRsiThreshold(e.target.value);
    });
  }

  // Histogram Lookback
  const histInput = document.getElementById("setting-histogram-lookback");
  if (histInput !== null) {
    histInput.addEventListener("change", (e) => {
      validateAndSetHistogramLookback(e.target.value);
    });
  }

  // Risk Free Rate
  const rfInput = document.getElementById("setting-risk-free-rate");
  if (rfInput !== null) {
    rfInput.addEventListener("change", (e) => {
      validateAndSetRiskFreeRate(e.target.value);
    });
  }

  // Credits Per Minute
  const credInput = document.getElementById("setting-credits-per-minute");
  if (credInput !== null) {
    credInput.addEventListener("change", (e) => {
      validateAndSetCreditsPerMinute(e.target.value);
    });
  }

  // Gate Mode
  const gateSelect = document.getElementById("setting-gate-mode");
  if (gateSelect !== null) {
    gateSelect.addEventListener("change", (e) => {
      validateAndSetGateMode(e.target.value);
    });
  }

  // OpenRouter Model
  const modelInput = document.getElementById("setting-open-router-model");
  if (modelInput !== null) {
    modelInput.addEventListener("input", (e) => {
      appState.settings.openRouterModel = e.target.value;
      updatePreflightCard();
    });
    modelInput.addEventListener("change", (e) => {
      validateAndSetOpenRouterModel(e.target.value);
    });
  }

  // Twelve Data Key
  const tdInput = document.getElementById("input-twelve-data-key");
  if (tdInput !== null) {
    tdInput.addEventListener("input", (e) => {
      setTwelveDataKey(e.target.value);
    });
    tdInput.addEventListener("change", (e) => {
      setTwelveDataKey(e.target.value);
    });
  }

  // OpenRouter Key
  const orInput = document.getElementById("input-open-router-key");
  if (orInput !== null) {
    orInput.addEventListener("input", (e) => {
      setOpenRouterKey(e.target.value);
    });
    orInput.addEventListener("change", (e) => {
      setOpenRouterKey(e.target.value);
    });
  }

  // Run Pipeline Button
  const runBtn = document.getElementById("btn-run-pipeline");
  if (runBtn !== null) {
    runBtn.addEventListener("click", () => {
      handleRunPipeline();
    });
  }

  renderSettingsUI();
  updatePreflightCard();
}

/**
 * Sets up CSV file upload, drag-and-drop, and action button listeners.
 */
export function setupUniverseUpload() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  const fileInput = document.getElementById("universe-csv-input");
  const uploadTrigger = document.getElementById("btn-upload-trigger");
  const downloadSample = document.getElementById("btn-download-sample");
  const resetDefault = document.getElementById("btn-reset-default");
  const dropzone = document.getElementById("universe-dropzone");

  const hasFileInput = fileInput !== null;
  if (hasFileInput === true) {
    fileInput.addEventListener("change", (event) => {
      const files = event.target.files;
      const hasFiles = files !== null && files.length > 0;
      if (hasFiles === true) {
        const file = files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target.result;
          applyUniverseCSV(content);
          fileInput.value = "";
        };
        reader.readAsText(file);
      }
    });
  }

  const hasUploadTrigger = uploadTrigger !== null && hasFileInput === true;
  if (hasUploadTrigger === true) {
    uploadTrigger.addEventListener("click", () => {
      fileInput.click();
    });
  }

  const hasDownloadSample = downloadSample !== null;
  if (hasDownloadSample === true) {
    downloadSample.addEventListener("click", () => {
      downloadUniverseTemplate();
    });
  }

  const hasResetDefault = resetDefault !== null;
  if (hasResetDefault === true) {
    resetDefault.addEventListener("click", () => {
      resetToDefaultUniverse();
    });
  }

  const hasDropzone = dropzone !== null && hasFileInput === true;
  if (hasDropzone === true) {
    dropzone.addEventListener("click", () => {
      fileInput.click();
    });

    dropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropzone.classList.add("drag-active");
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("drag-active");
    });

    dropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropzone.classList.remove("drag-active");
      const dt = event.dataTransfer;
      const hasDropFiles = dt !== null && dt.files !== null && dt.files.length > 0;
      if (hasDropFiles === true) {
        const file = dt.files[0];
        const isCsv = file.name.toLowerCase().endsWith(".csv");
        if (isCsv === false) {
          showUniverseMessage("Invalid file format. Please upload a .csv file.", "error");
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target.result;
          applyUniverseCSV(content);
          fileInput.value = "";
        };
        reader.readAsText(file);
      }
    });
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
  window.GICS_SECTORS = GICS_SECTORS;
  window.DEFAULT_UNIVERSE = DEFAULT_UNIVERSE;
  window.initDefaultUniverse = initDefaultUniverse;
  window.parseUniverseCSV = parseUniverseCSV;
  window.applyUniverseCSV = applyUniverseCSV;
  window.showUniverseMessage = showUniverseMessage;
  window.downloadUniverseTemplate = downloadUniverseTemplate;
  window.resetToDefaultUniverse = resetToDefaultUniverse;
  window.renderUniverseUI = renderUniverseUI;
  window.setupUniverseUpload = setupUniverseUpload;
  window.INDICATOR_CONSTANTS = INDICATOR_CONSTANTS;
  window.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  window.DEFAULT_OPENROUTER_MODEL = DEFAULT_OPENROUTER_MODEL;
  window.toggleConstituentTicker = toggleConstituentTicker;
  window.validateAndSetWeightCap = validateAndSetWeightCap;
  window.validateAndSetMinimumBreadth = validateAndSetMinimumBreadth;
  window.validateAndSetInvestmentAmount = validateAndSetInvestmentAmount;
  window.validateAndSetRsiThreshold = validateAndSetRsiThreshold;
  window.validateAndSetHistogramLookback = validateAndSetHistogramLookback;
  window.validateAndSetRiskFreeRate = validateAndSetRiskFreeRate;
  window.validateAndSetCreditsPerMinute = validateAndSetCreditsPerMinute;
  window.validateAndSetGateMode = validateAndSetGateMode;
  window.validateAndSetOpenRouterModel = validateAndSetOpenRouterModel;
  window.setTwelveDataKey = setTwelveDataKey;
  window.setOpenRouterKey = setOpenRouterKey;
  window.computePreflightChecks = computePreflightChecks;
  window.updatePreflightCard = updatePreflightCard;
  window.handleRunPipeline = handleRunPipeline;
  window.renderSettingsUI = renderSettingsUI;
  window.setupSettingsPanel = setupSettingsPanel;
}

function initializeApp() {
  renderStageTracker();
  setupCollapsibleSections();
  setupUniverseUpload();
  renderUniverseUI();
  setupSettingsPanel();
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

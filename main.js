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
  priceStatus: {},
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
    renderRawPricesTable();
    updateAlignmentSummaryCard();
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
  renderRawPricesTable();
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
  renderRawPricesTable();
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
 * Quota tracking state for Twelve Data requests.
 */
export const quotaState = {
  creditsLeft: null,
  isEstimated: true,
  lastResetMinute: Math.floor(Date.now() / 60000),
  waitingForQuota: false,
  countdownSeconds: 0,
  countdownIntervalId: null
};

/**
 * Returns today's date in America/New_York formatted as YYYY-MM-DD.
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function getTodayNYDateString(date = new Date()) {
  const nyDateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return nyDateFormatter.format(date);
}

/**
 * Checks if current time in America/New_York is before 16:00.
 *
 * @param {Date} [date]
 * @returns {boolean}
 */
export function isBefore16NY(date = new Date()) {
  const nyTimeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hour12: false
  });
  const parts = nyTimeFormatter.formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour");
  const hour = parseInt(hourPart.value, 10);
  const before16 = hour < 16;
  return before16;
}

/**
 * Returns the date one year before today in America/New_York (YYYY-MM-DD).
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function getOneYearAgoDateString(date = new Date()) {
  const todayNY = getTodayNYDateString(date);
  const parts = todayNY.split("-");
  const prevYear = parseInt(parts[0], 10) - 1;
  return `${prevYear}-${parts[1]}-${parts[2]}`;
}

/**
 * Cleans a daily price series returned by Twelve Data:
 * - Converts close string to number (prioritizing adjusted close)
 * - Drops any bar whose close is null or NaN
 * - Drops today's bar if current New York time is before 16:00
 *
 * @param {Array<object>} values
 * @param {Date} [testDate]
 * @returns {Array<{ datetime: string, close: number }>}
 */
export function cleanSymbolSeries(values, testDate = new Date()) {
  const isArray = Array.isArray(values) === true;
  if (isArray === false) {
    return [];
  }

  const validBars = [];
  for (let i = 0; i < values.length; i += 1) {
    const bar = values[i];
    const hasBar = bar !== null && typeof bar === "object";
    if (hasBar === true) {
      const rawClose = bar.adjusted_close !== undefined && bar.adjusted_close !== null ? bar.adjusted_close : bar.close;
      const numClose = typeof rawClose === "number" ? rawClose : parseFloat(rawClose);
      const isNumValid = isNaN(numClose) === false && numClose !== null;
      const hasDate = typeof bar.datetime === "string" && bar.datetime.length >= 10;
      if (isNumValid === true && hasDate === true) {
        validBars.push({
          datetime: bar.datetime.slice(0, 10),
          close: numClose
        });
      }
    }
  }

  // Sort ascending by plain date string
  validBars.sort((a, b) => {
    if (a.datetime < b.datetime) {
      return -1;
    }
    if (a.datetime > b.datetime) {
      return 1;
    }
    return 0;
  });

  // If the most recent bar carries today's date in America/New_York and time is before 16:00, drop that bar
  const hasBars = validBars.length > 0;
  if (hasBars === true) {
    const todayNY = getTodayNYDateString(testDate);
    const before16 = isBefore16NY(testDate);
    const lastBar = validBars[validBars.length - 1];
    const isTodaySession = lastBar.datetime === todayNY;
    if (isTodaySession === true && before16 === true) {
      validBars.pop();
    }
  }

  return validBars;
}

/**
 * Updates the quota display element in Stage 2.
 */
export function updateQuotaUI() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }
  const badge = document.getElementById("stage-2-credits-status");
  if (badge !== null) {
    if (quotaState.waitingForQuota === true) {
      badge.textContent = `waiting for quota (${quotaState.countdownSeconds}s)`;
      badge.className = "meta-value badge-quota waiting";
    } else if (quotaState.isEstimated === true) {
      const left = quotaState.creditsLeft !== null ? quotaState.creditsLeft : (appState.settings.creditsPerMinute || 144);
      badge.textContent = `${left} credits left (credit count estimated locally)`;
      badge.className = "meta-value badge-quota";
    } else {
      badge.textContent = `${quotaState.creditsLeft} credits left`;
      badge.className = "meta-value badge-quota";
    }
  }
}

/**
 * Ensures enough credits remain before dispatching a request.
 * Waits until the next clock minute if quota is exhausted.
 *
 * @param {number} neededCredits
 * @returns {Promise<void>}
 */
export async function ensureQuotaAvailable(neededCredits) {
  const quotaLimit = appState.settings.creditsPerMinute || 144;
  const currentMinute = Math.floor(Date.now() / 60000);
  if (currentMinute > quotaState.lastResetMinute) {
    quotaState.lastResetMinute = currentMinute;
    quotaState.creditsLeft = quotaLimit;
    quotaState.isEstimated = true;
  }
  if (quotaState.creditsLeft === null) {
    quotaState.creditsLeft = quotaLimit;
    quotaState.isEstimated = true;
  }

  updateQuotaUI();

  const hasEnough = quotaState.creditsLeft >= neededCredits;
  if (hasEnough === true) {
    return;
  }

  quotaState.waitingForQuota = true;
  return new Promise((resolve) => {
    const tick = () => {
      const now = Date.now();
      const msLeft = 60000 - (now % 60000);
      const secsLeft = Math.ceil(msLeft / 1000);
      quotaState.countdownSeconds = secsLeft;
      updateQuotaUI();

      const minuteNow = Math.floor(now / 60000);
      if (minuteNow > quotaState.lastResetMinute) {
        quotaState.lastResetMinute = minuteNow;
        quotaState.creditsLeft = appState.settings.creditsPerMinute || 144;
        quotaState.isEstimated = true;
        quotaState.waitingForQuota = false;
        if (quotaState.countdownIntervalId !== null) {
          clearInterval(quotaState.countdownIntervalId);
          quotaState.countdownIntervalId = null;
        }
        updateQuotaUI();
        resolve();
      }
    };

    tick();
    quotaState.countdownIntervalId = setInterval(tick, 1000);
  });
}

let activeRequestsCount = 0;
const MAX_CONCURRENT_REQUESTS = 5;

/**
 * Performs a fetch with 10s timeout, concurrency cap of 5, and exactly one retry.
 *
 * @param {string} url
 * @param {number} [timeoutMs]
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeoutAndRetry(url, timeoutMs = 10000) {
  while (activeRequestsCount >= MAX_CONCURRENT_REQUESTS) {
    await new Promise((res) => setTimeout(res, 50));
  }
  activeRequestsCount += 1;

  const attemptFetch = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return resp;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  };

  try {
    try {
      const res = await attemptFetch();
      activeRequestsCount -= 1;
      return res;
    } catch (firstErr) {
      await new Promise((res) => setTimeout(res, 1000));
      const resRetry = await attemptFetch();
      activeRequestsCount -= 1;
      return resRetry;
    }
  } catch (finalErr) {
    activeRequestsCount -= 1;
    throw finalErr;
  }
}

/**
 * Displays or hides the Stage 2 global alert message.
 *
 * @param {string} message
 * @param {"error" | "info"} [type]
 */
export function showStage2Alert(message, type = "error") {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }
  const alertEl = document.getElementById("stage-2-global-alert");
  if (alertEl !== null) {
    if (message === "" || message === null) {
      alertEl.className = "stage-2-alert hidden";
      alertEl.textContent = "";
    } else {
      alertEl.className = `stage-2-alert alert-${type}`;
      alertEl.textContent = message;
    }
  }
}

/**
 * Updates status metadata for a ticker in appState.priceStatus.
 *
 * @param {string} ticker
 * @param {"pending" | "fetching" | "done" | "failed" | "insufficient"} status
 * @param {string} [message]
 * @param {number|null} [rowCount]
 * @param {string|null} [dateRange]
 * @param {string|null} [note]
 * @param {number|null} [latestClose]
 */
export function setTickerPriceStatus(ticker, status, message = "", rowCount = null, dateRange = null, note = null, latestClose = null) {
  if (appState.priceStatus[ticker] === undefined) {
    appState.priceStatus[ticker] = {};
  }
  const current = appState.priceStatus[ticker];
  current.status = status;
  if (message !== "") {
    current.message = message;
  }
  if (rowCount !== null) {
    current.rowCount = rowCount;
  }
  if (dateRange !== null) {
    current.dateRange = dateRange;
  }
  if (note !== null) {
    current.note = note;
  }
  if (latestClose !== null) {
    current.latestClose = latestClose;
  }
}

/**
 * Renders the raw time series data table inside Stage 2.
 */
export function renderRawPricesTable() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }
  const tbody = document.getElementById("raw-prices-tbody");
  if (tbody === null) {
    return;
  }

  const universe = appState.universe || DEFAULT_UNIVERSE;
  const selectedSet = new Set(appState.selectedTickers || []);

  const rows = [];
  const processedTickers = new Set();
  for (let i = 0; i < universe.length; i += 1) {
    const item = universe[i];
    if (processedTickers.has(item.ticker) === false) {
      processedTickers.add(item.ticker);
      rows.push(item);
    }
  }

  let html = "";
  for (let i = 0; i < rows.length; i += 1) {
    const item = rows[i];
    const ticker = item.ticker;
    const sector = item.sector;
    const isBenchmark = ticker === "SPY" || sector === "Benchmark";
    const isSelected = isBenchmark === true || selectedSet.has(ticker) === true;

    const info = appState.priceStatus[ticker] || { status: "pending" };
    const cachedSeries = appState.priceCache[ticker];
    const hasCached = Array.isArray(cachedSeries) === true && cachedSeries.length > 0;

    let status = info.status || (hasCached === true ? "done" : (isSelected === true ? "pending" : "excluded"));
    if (isSelected === false) {
      status = "excluded";
    }

    let sessionsText = "—";
    let dateRangeText = "—";
    let latestCloseText = "—";

    if (hasCached === true) {
      const count = info.rowCount !== null && info.rowCount !== undefined ? info.rowCount : cachedSeries.length;
      sessionsText = `${count} sessions`;
      const firstD = cachedSeries[0].datetime;
      const lastD = cachedSeries[cachedSeries.length - 1].datetime;
      dateRangeText = info.dateRange ? info.dateRange : `${firstD} → ${lastD}`;
      const lastBar = cachedSeries[cachedSeries.length - 1];
      if (lastBar !== undefined && lastBar.close !== undefined) {
        latestCloseText = `$${lastBar.close.toFixed(2)}`;
      }
    }

    let statusClass = "status-pending";
    let statusLabel = status;
    if (status === "done") {
      statusClass = "status-done";
      statusLabel = "done";
    } else if (status === "fetching") {
      statusClass = "status-fetching";
      statusLabel = "fetching...";
    } else if (status === "failed") {
      statusClass = "status-failed";
      statusLabel = "failed";
    } else if (status === "insufficient") {
      statusClass = "status-insufficient";
      statusLabel = info.message || "insufficient history";
    } else if (status === "excluded") {
      statusClass = "status-pending";
      statusLabel = "deselected";
    }

    let noteText = info.note || info.message || "—";
    if (isBenchmark === true && (noteText === "—" || noteText === "")) {
      noteText = "Benchmark (rolling beta only)";
    }

    let constrainingHtml = noteText;
    if (noteText.includes("Constrains") === true) {
      constrainingHtml = `<span class="constraining-tag">${noteText}</span>`;
    } else if (noteText.includes("insufficient") === true) {
      constrainingHtml = `<span style="color: #b25e00; font-weight: 600;">${noteText}</span>`;
    } else if (status === "failed") {
      constrainingHtml = `<span style="color: #c91818; font-weight: 500;">${noteText}</span>`;
    }

    html += `
      <tr id="row-price-${ticker}">
        <td>
          <div class="ticker-cell-group">
            <span class="ticker-code">${ticker}</span>
            ${isBenchmark === true ? '<span class="badge-benchmark">Benchmark</span>' : ''}
          </div>
        </td>
        <td><span class="sector-text">${sector}</span></td>
        <td><span class="status-tag ${statusClass}">${statusLabel}</span></td>
        <td><span class="sessions-count">${sessionsText}</span></td>
        <td><span class="date-range-text">${dateRangeText}</span></td>
        <td><span class="price-mono">${latestCloseText}</span></td>
        <td>${constrainingHtml}</td>
      </tr>
    `;
  }

  tbody.innerHTML = html;

  const statsEl = document.getElementById("raw-data-table-stats");
  if (statsEl !== null) {
    statsEl.textContent = `${rows.length} total universe names (${selectedSet.size} selected constituents + 1 benchmark)`;
  }
}

/**
 * Updates the Stage 2 alignment summary card.
 */
export function updateAlignmentSummaryCard() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }
  const badge = document.getElementById("alignment-status-badge");
  const body = document.getElementById("alignment-card-body");
  if (badge === null || body === null) {
    return;
  }

  const aligned = appState.alignedData;
  const isAligned = aligned !== null && Array.isArray(aligned.dates) === true && aligned.dates.length > 0;
  if (isAligned === true) {
    badge.textContent = "Done";
    badge.className = "alignment-status-badge status-done";

    const constituentKeys = Object.keys(aligned.prices);
    const dates = aligned.dates;
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    const startConstraining = aligned.constrainingTickers && aligned.constrainingTickers.start ? aligned.constrainingTickers.start : [];
    const endConstraining = aligned.constrainingTickers && aligned.constrainingTickers.end ? aligned.constrainingTickers.end : [];

    const startNames = startConstraining.length > 0 ? startConstraining.join(", ") : "None";
    const endNames = endConstraining.length > 0 ? endConstraining.join(", ") : "None";

    body.innerHTML = `
      <div class="alignment-details-grid">
        <div class="alignment-metric-box">
          <div class="alignment-metric-label">Aligned Sessions</div>
          <div class="alignment-metric-value">${dates.length} days</div>
        </div>
        <div class="alignment-metric-box">
          <div class="alignment-metric-label">Aligned Date Range</div>
          <div class="alignment-metric-value" style="font-size: 13px;">${firstDate} → ${lastDate}</div>
        </div>
        <div class="alignment-metric-box">
          <div class="alignment-metric-label">Aligned Constituents</div>
          <div class="alignment-metric-value">${constituentKeys.length} names</div>
        </div>
        <div class="alignment-metric-box">
          <div class="alignment-metric-label">SPY Benchmark Sessions</div>
          <div class="alignment-metric-value">${aligned.spy ? aligned.spy.dates.length : 0} days</div>
        </div>
      </div>
      <div class="alignment-constraining-note">
        <strong>Constraining Constituents:</strong>
        Start date (${firstDate}) constrained by <strong>${startNames}</strong>.
        End date (${lastDate}) constrained by <strong>${endNames}</strong>.
      </div>
    `;
  } else {
    const stage2Status = appState.stageStatus[2];
    if (stage2Status === "running") {
      badge.textContent = "Running";
      badge.className = "alignment-status-badge status-running";
      body.innerHTML = `<p class="alignment-empty-text">Fetching adjusted daily closes and computing session alignment...</p>`;
    } else if (stage2Status === "blocked") {
      badge.textContent = "Blocked";
      badge.className = "alignment-status-badge status-blocked";
      body.innerHTML = `<p class="alignment-empty-text" style="color: #c91818;">Stage 2 execution blocked. Review error details above.</p>`;
    } else {
      badge.textContent = "Idle";
      badge.className = "alignment-status-badge status-idle";
      body.innerHTML = `<p class="alignment-empty-text">No price data fetched yet. Run the pipeline from Stage 1 to fetch and align prices.</p>`;
    }
  }
}

/**
 * Aligns the cleaned daily series of all valid constituents on the intersection of dates,
 * joins SPY to the aligned dates, updates alignedData, and transitions Stage 2 to done.
 */
export function alignAndCompleteStage2() {
  const selectedConstituents = (appState.selectedTickers || []).filter((t) => t !== "SPY");
  const validConstituents = [];

  for (let i = 0; i < selectedConstituents.length; i += 1) {
    const t = selectedConstituents[i];
    const series = appState.priceCache[t];
    const hasSeries = Array.isArray(series) === true;
    if (hasSeries === false) {
      setTickerPriceStatus(t, "failed", "No price data returned");
      continue;
    }
    const historyIsSufficient = series.length >= 200;
    if (historyIsSufficient === true) {
      validConstituents.push(t);
    } else {
      setTickerPriceStatus(t, "insufficient", `insufficient history (${series.length} sessions)`, series.length);
    }
  }

  const hasAnyConstituents = validConstituents.length > 0;
  if (hasAnyConstituents === false) {
    setStageStatus(2, "blocked");
    showStage2Alert("No selected constituents have sufficient price history (>= 200 sessions).", "error");
    updateAlignmentSummaryCard();
    renderRawPricesTable();
    return;
  }

  // Align the remaining constituents on the intersection of their dates
  const datesByTicker = {};
  const priceMapByTicker = {};

  for (let i = 0; i < validConstituents.length; i += 1) {
    const t = validConstituents[i];
    const series = appState.priceCache[t];
    datesByTicker[t] = series.map((b) => b.datetime);
    priceMapByTicker[t] = new Map(series.map((b) => [b.datetime, b.close]));
  }

  let commonDatesSet = new Set(datesByTicker[validConstituents[0]]);
  for (let i = 1; i < validConstituents.length; i += 1) {
    const t = validConstituents[i];
    const tSet = new Set(datesByTicker[t]);
    const nextSet = new Set();
    commonDatesSet.forEach((d) => {
      if (tSet.has(d) === true) {
        nextSet.add(d);
      }
    });
    commonDatesSet = nextSet;
  }

  const commonDates = Array.from(commonDatesSet).sort();
  const hasOverlap = commonDates.length > 0;
  if (hasOverlap === false) {
    setStageStatus(2, "blocked");
    showStage2Alert("Constituents have no common session dates to align.", "error");
    updateAlignmentSummaryCard();
    renderRawPricesTable();
    return;
  }

  // Name the ticker or tickers whose history constrains the intersection
  const firstDate = commonDates[0];
  const lastDate = commonDates[commonDates.length - 1];
  const startConstraining = [];
  const endConstraining = [];

  for (let i = 0; i < validConstituents.length; i += 1) {
    const t = validConstituents[i];
    const tDates = datesByTicker[t];
    const tFirst = tDates[0];
    const tLast = tDates[tDates.length - 1];
    if (tFirst === firstDate) {
      startConstraining.push(t);
    }
    if (tLast === lastDate) {
      endConstraining.push(t);
    }
  }

  // Join SPY afterwards to the aligned constituent dates and keep only the dates SPY has
  const spySeries = appState.priceCache["SPY"] || [];
  const spyPriceMap = new Map(spySeries.map((b) => [b.datetime, b.close]));
  const finalAlignedDates = commonDates.filter((d) => spyPriceMap.has(d) === true);

  const hasSpyOverlap = finalAlignedDates.length > 0;
  if (hasSpyOverlap === false) {
    setStageStatus(2, "blocked");
    showStage2Alert("SPY benchmark has no overlapping sessions with aligned constituents.", "error");
    updateAlignmentSummaryCard();
    renderRawPricesTable();
    return;
  }

  // Build alignedData
  const alignedPrices = {};
  for (let i = 0; i < validConstituents.length; i += 1) {
    const t = validConstituents[i];
    const pMap = priceMapByTicker[t];
    alignedPrices[t] = finalAlignedDates.map((d) => pMap.get(d));
  }

  const alignedSpy = {
    dates: [...finalAlignedDates],
    prices: finalAlignedDates.map((d) => spyPriceMap.get(d))
  };

  appState.alignedData = {
    dates: finalAlignedDates,
    prices: alignedPrices,
    spy: alignedSpy,
    constrainingTickers: {
      start: startConstraining,
      end: endConstraining
    }
  };

  // Update status and notes for each valid constituent
  for (let i = 0; i < validConstituents.length; i += 1) {
    const t = validConstituents[i];
    const isStart = startConstraining.includes(t) === true;
    const isEnd = endConstraining.includes(t) === true;
    let note = "Aligned";
    if (isStart === true && isEnd === true) {
      note = "Constrains start and end dates";
    } else if (isStart === true) {
      note = "Constrains start date";
    } else if (isEnd === true) {
      note = "Constrains end date";
    }
    setTickerPriceStatus(
      t,
      "done",
      "",
      finalAlignedDates.length,
      `${finalAlignedDates[0]} → ${finalAlignedDates[finalAlignedDates.length - 1]}`,
      note
    );
  }

  // Update SPY status
  setTickerPriceStatus(
    "SPY",
    "done",
    "",
    finalAlignedDates.length,
    `${finalAlignedDates[0]} → ${finalAlignedDates[finalAlignedDates.length - 1]}`,
    "Benchmark (joined to aligned dates)"
  );

  updateAlignmentSummaryCard();
  renderRawPricesTable();

  // Compute returns, annualized volatility, and covariance matrix for Stage 3
  computeReturnsAndCovariance();

  // Set stage 2 to done and stage 3 to done
  setStageStatus(2, "done");
  setStageStatus(3, "done");

  const hasDocument = typeof document !== "undefined";
  if (hasDocument === true) {
    const stageBody3 = document.getElementById("stage-body-3");
    const stageHeader3 = document.getElementById("stage-header-3");
    if (stageBody3 !== null && stageHeader3 !== null) {
      stageBody3.classList.remove("collapsed");
      stageHeader3.setAttribute("aria-expanded", "true");
    }
    const stageSection3 = document.getElementById("stage-section-3");
    if (stageSection3 !== null) {
      stageSection3.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

/**
 * Runs the Stage 2 price fetch and alignment pipeline.
 *
 * @param {boolean} [isRefresh]
 */
export async function runPriceFetchAndAlignment(isRefresh = false) {
  if (isRefresh === true) {
    appState.priceCache = {};
    appState.alignedData = null;
    appState.priceStatus = {};
    appState.indicatorSeries = null;
  }

  showStage2Alert("");
  setStageStatus(2, "running");
  updateAlignmentSummaryCard();

  const selectedConstituents = (appState.selectedTickers || []).filter((t) => t !== "SPY");
  const allRequiredTickers = [...selectedConstituents, "SPY"];

  const missingTickers = allRequiredTickers.filter((t) => {
    const cached = appState.priceCache[t];
    return Array.isArray(cached) === false || cached.length === 0;
  });

  const nothingMissing = missingTickers.length === 0;
  if (nothingMissing === true) {
    alignAndCompleteStage2();
    return;
  }

  // Check quota before issuing request
  await ensureQuotaAvailable(missingTickers.length);

  // Mark all missing tickers as fetching
  for (let i = 0; i < missingTickers.length; i += 1) {
    setTickerPriceStatus(missingTickers[i], "fetching", "fetching...");
  }
  renderRawPricesTable();

  const apiKey = (appState.keys.twelveData || "").trim();
  const startDate = getOneYearAgoDateString();
  const symbolsParam = missingTickers.join(",");
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbolsParam)}&interval=1day&start_date=${startDate}&order=asc&adjust=all&apikey=${encodeURIComponent(apiKey)}`;

  let response;
  try {
    response = await fetchWithTimeoutAndRetry(url, 10000);
  } catch (netErr) {
    setStageStatus(2, "blocked");
    for (let i = 0; i < missingTickers.length; i += 1) {
      setTickerPriceStatus(missingTickers[i], "failed", "Network request failed");
    }
    showStage2Alert("Network request to Twelve Data failed. Please verify your connection.", "error");
    updateAlignmentSummaryCard();
    renderRawPricesTable();
    return;
  }

  // Read api-credits-left response header if exposed
  let creditsLeftHeader = null;
  try {
    creditsLeftHeader = response.headers.get("api-credits-left");
  } catch (e) {}

  const hasCreditsHeader = creditsLeftHeader !== null && creditsLeftHeader !== "" && isNaN(parseInt(creditsLeftHeader, 10)) === false;
  if (hasCreditsHeader === true) {
    quotaState.creditsLeft = parseInt(creditsLeftHeader, 10);
    quotaState.isEstimated = false;
  } else {
    const currentCredits = quotaState.creditsLeft !== null ? quotaState.creditsLeft : (appState.settings.creditsPerMinute || 144);
    quotaState.creditsLeft = Math.max(0, currentCredits - missingTickers.length);
    quotaState.isEstimated = true;
  }
  updateQuotaUI();

  let json;
  try {
    json = await response.json();
  } catch (parseErr) {
    setStageStatus(2, "blocked");
    for (let i = 0; i < missingTickers.length; i += 1) {
      setTickerPriceStatus(missingTickers[i], "failed", "Failed to parse API response");
    }
    showStage2Alert("Failed to parse JSON response from Twelve Data.", "error");
    updateAlignmentSummaryCard();
    renderRawPricesTable();
    return;
  }

  // Check if provider rejected the key or refused browser request as a whole
  const isGlobalError = json.status === "error" || json.code === 401 || json.code === 403;
  const isKeyRejected = isGlobalError === true && (json.code === 401 || (typeof json.message === "string" && json.message.toLowerCase().includes("apikey")));
  if (isKeyRejected === true) {
    setStageStatus(2, "blocked");
    for (let i = 0; i < missingTickers.length; i += 1) {
      setTickerPriceStatus(missingTickers[i], "failed", "Twelve Data API key rejected");
    }
    showStage2Alert("Twelve Data API key was rejected. Please verify the Twelve Data API Key field in Stage 1 settings.", "error");
    updateAlignmentSummaryCard();
    renderRawPricesTable();
    return;
  }

  // Quota exhaustion response (code 429) is a wait, not a failure
  const isQuotaExhausted = json.code === 429 || (typeof json.message === "string" && json.message.toLowerCase().includes("run out of api credits"));
  if (isQuotaExhausted === true) {
    quotaState.creditsLeft = 0;
    updateQuotaUI();
    showStage2Alert("API credit quota reached for current minute. Waiting for next clock minute...", "info");
    await ensureQuotaAvailable(missingTickers.length);
    showStage2Alert("");
    return runPriceFetchAndAlignment(false);
  }

  if (isGlobalError === true) {
    setStageStatus(2, "blocked");
    const errMsg = json.message || "Twelve Data request failed";
    for (let i = 0; i < missingTickers.length; i += 1) {
      setTickerPriceStatus(missingTickers[i], "failed", errMsg);
    }
    showStage2Alert(`Twelve Data API error: ${errMsg}`, "error");
    updateAlignmentSummaryCard();
    renderRawPricesTable();
    return;
  }

  // Parse each symbol's series
  for (let i = 0; i < missingTickers.length; i += 1) {
    const t = missingTickers[i];
    let symData = null;
    if (json[t] !== undefined) {
      symData = json[t];
    } else if (json.meta !== undefined && json.meta.symbol === t) {
      symData = json;
    }

    const hasSymData = symData !== null && typeof symData === "object";
    const isSymError = hasSymData === true && (symData.status === "error" || symData.code !== undefined);
    if (hasSymData === false || isSymError === true) {
      const msg = hasSymData === true && symData.message ? symData.message : "Symbol not found in provider";
      setTickerPriceStatus(t, "failed", msg);
    } else {
      const rawValues = symData.values;
      const cleaned = cleanSymbolSeries(rawValues);
      appState.priceCache[t] = cleaned;
      setTickerPriceStatus(t, "done", "", cleaned.length);
    }
  }

  appState.lastFetchTime = new Date().toISOString();
  const hasDoc = typeof document !== "undefined";
  if (hasDoc === true) {
    const fetchTimeEl = document.getElementById("stage-2-last-fetch-time");
    if (fetchTimeEl !== null) {
      const nowTime = new Date().toLocaleTimeString();
      fetchTimeEl.textContent = nowTime;
    }
  }

  alignAndCompleteStage2();
}

/**
 * Handles clicking the Run Pipeline button.
 * Sets Stage 1 to "done" and Stage 2 to "running", then initiates price fetching and alignment.
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

    runPriceFetchAndAlignment(false);
  } else {
    updatePreflightCard();
  }
}

/**
 * Sets up Stage 2 event listeners and initial raw data view.
 */
export function setupStage2() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  const refreshBtn = document.getElementById("btn-refresh-prices");
  if (refreshBtn !== null) {
    refreshBtn.addEventListener("click", () => {
      runPriceFetchAndAlignment(true);
    });
  }

  updateQuotaUI();
  updateAlignmentSummaryCard();
  renderRawPricesTable();
}

/**
 * Computes the daily simple return series r_t = (P_t - P_{t-1}) / P_{t-1}.
 * Starts from the second session onward (length = prices.length - 1).
 *
 * @param {number[]} prices
 * @returns {number[]}
 */
export function computeDailyReturns(prices) {
  const isArray = Array.isArray(prices) === true;
  if (isArray === false) {
    return [];
  }
  const hasSufficientSessions = prices.length >= 2;
  if (hasSufficientSessions === false) {
    return [];
  }

  const returns = [];
  for (let i = 1; i < prices.length; i += 1) {
    const prevRaw = prices[i - 1];
    const currRaw = prices[i];
    const prev = typeof prevRaw === "number" ? prevRaw : parseFloat(prevRaw);
    const curr = typeof currRaw === "number" ? currRaw : parseFloat(currRaw);
    const isValid = isNaN(prev) === false && isNaN(curr) === false && prev !== 0;
    if (isValid === true) {
      const r = (curr - prev) / prev;
      returns.push(r);
    } else {
      returns.push(0);
    }
  }
  return returns;
}

/**
 * Computes the sample mean of a numeric series.
 *
 * @param {number[]} series
 * @returns {number}
 */
export function computeSampleMean(series) {
  const isArray = Array.isArray(series) === true;
  if (isArray === false) {
    return 0;
  }
  const hasItems = series.length > 0;
  if (hasItems === false) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < series.length; i += 1) {
    sum += series[i];
  }
  return sum / series.length;
}

/**
 * Computes the sample standard deviation (divide by n - 1) of daily simple returns.
 *
 * @param {number[]} returns
 * @returns {number}
 */
export function computeDailyStd(returns) {
  const isArray = Array.isArray(returns) === true;
  if (isArray === false) {
    return 0;
  }
  const hasDegreesOfFreedom = returns.length >= 2;
  if (hasDegreesOfFreedom === false) {
    return 0;
  }
  const mean = computeSampleMean(returns);
  let sumSqDiff = 0;
  for (let i = 0; i < returns.length; i += 1) {
    const diff = returns[i] - mean;
    sumSqDiff += diff * diff;
  }
  const variance = sumSqDiff / (returns.length - 1);
  return Math.sqrt(variance);
}

/**
 * Computes annualized volatility by multiplying daily standard deviation by sqrt(252).
 *
 * @param {number} dailyStd
 * @returns {number}
 */
export function computeAnnualizedVol(dailyStd) {
  const isValidNumber = typeof dailyStd === "number" && isNaN(dailyStd) === false;
  if (isValidNumber === false) {
    return 0;
  }
  return dailyStd * Math.sqrt(252);
}

/**
 * Computes the sample covariance (divide by n - 1) of two aligned return series.
 *
 * @param {number[]} seriesA
 * @param {number[]} seriesB
 * @returns {number}
 */
export function computeSampleCovariance(seriesA, seriesB) {
  const isArrayA = Array.isArray(seriesA) === true;
  const isArrayB = Array.isArray(seriesB) === true;
  if (isArrayA === false || isArrayB === false) {
    throw new Error("Both inputs to computeSampleCovariance must be arrays.");
  }
  const lengthsAreEqual = seriesA.length === seriesB.length;
  if (lengthsAreEqual === false) {
    throw new Error(`Return series lengths do not match: ${seriesA.length} vs ${seriesB.length}. Broken alignment upstream.`);
  }
  const n = seriesA.length;
  const hasDegreesOfFreedom = n >= 2;
  if (hasDegreesOfFreedom === false) {
    return 0;
  }

  const meanA = computeSampleMean(seriesA);
  const meanB = computeSampleMean(seriesB);
  let sumCrossDiff = 0;
  for (let i = 0; i < n; i += 1) {
    sumCrossDiff += (seriesA[i] - meanA) * (seriesB[i] - meanB);
  }
  return sumCrossDiff / (n - 1);
}

/**
 * Extracts a sub-matrix from the stored covariance matrix for a given list of tickers
 * in the exact specified order, without mutating the stored matrix.
 *
 * @param {string[]} tickers
 * @returns {number[][]}
 */
export function sliceCovariance(tickers) {
  const isArray = Array.isArray(tickers) === true;
  if (isArray === false) {
    throw new Error("sliceCovariance requires an array of ticker strings.");
  }
  const hasIndicators = appState.indicatorSeries !== null && typeof appState.indicatorSeries === "object" && Array.isArray(appState.indicatorSeries.covarianceMatrix) === true;
  if (hasIndicators === false) {
    throw new Error("Covariance matrix has not been computed yet.");
  }

  const covMatrix = appState.indicatorSeries.covarianceMatrix;
  const covTickers = appState.indicatorSeries.covarianceTickers;
  const tickerIndexMap = new Map();
  for (let i = 0; i < covTickers.length; i += 1) {
    tickerIndexMap.set(covTickers[i], i);
  }

  const n = tickers.length;
  const subMatrix = [];
  for (let i = 0; i < n; i += 1) {
    const rowTicker = tickers[i];
    const origRowIdx = tickerIndexMap.get(rowTicker);
    const hasRowIdx = origRowIdx !== undefined;
    if (hasRowIdx === false) {
      throw new Error(`Ticker ${rowTicker} not found in covariance matrix.`);
    }

    const row = [];
    for (let j = 0; j < n; j += 1) {
      const colTicker = tickers[j];
      const origColIdx = tickerIndexMap.get(colTicker);
      const hasColIdx = origColIdx !== undefined;
      if (hasColIdx === false) {
        throw new Error(`Ticker ${colTicker} not found in covariance matrix.`);
      }
      row.push(covMatrix[origRowIdx][origColIdx]);
    }
    subMatrix.push(row);
  }

  return subMatrix;
}

/**
 * Shows or hides the Stage 3 global alert banner.
 *
 * @param {string} message
 * @param {string} [type]
 */
export function showStage3Alert(message, type = "error") {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }
  const alertEl = document.getElementById("stage-3-global-alert");
  if (alertEl === null) {
    return;
  }
  const hasMsg = typeof message === "string" && message.trim().length > 0;
  if (hasMsg === true) {
    alertEl.textContent = message;
    alertEl.className = `stage-3-alert alert-${type}`;
    alertEl.classList.remove("hidden");
  } else {
    alertEl.textContent = "";
    alertEl.className = "stage-3-alert hidden";
  }
}

/**
 * Computes daily simple returns, daily standard deviation, annualized volatility,
 * and the sample covariance matrix across all aligned constituent tickers.
 * SPY returns and volatility are computed on its own dates and kept out of the matrix.
 */
export function computeReturnsAndCovariance() {
  const aligned = appState.alignedData;
  const hasAligned = aligned !== null && typeof aligned === "object" && Array.isArray(aligned.dates) === true;
  if (hasAligned === false) {
    showStage3Alert("Cannot compute returns: alignedData is missing or empty.", "error");
    throw new Error("Cannot compute returns: alignedData is missing or empty.");
  }

  const constituentTickers = Object.keys(aligned.prices);
  const hasConstituents = constituentTickers.length > 0;
  if (hasConstituents === false) {
    showStage3Alert("Cannot compute returns: no aligned constituent prices available.", "error");
    throw new Error("Cannot compute returns: no aligned constituent prices available.");
  }

  const expectedLength = aligned.dates.length - 1;
  const returnsByTicker = {};
  const dailyStdByTicker = {};
  const annualizedVolByTicker = {};
  const perTickerData = {};

  // Compute returns and volatilities for each constituent
  for (let i = 0; i < constituentTickers.length; i += 1) {
    const ticker = constituentTickers[i];
    const prices = aligned.prices[ticker];
    const retSeries = computeDailyReturns(prices);

    // Guardrail: check length against expected aligned sessions
    const isLengthValid = retSeries.length === expectedLength;
    if (isLengthValid === false) {
      const msg = `Constituent ${ticker} return series length (${retSeries.length}) differs from expected (${expectedLength}). Broken alignment upstream.`;
      showStage3Alert(msg, "error");
      throw new Error(msg);
    }

    const dStd = computeDailyStd(retSeries);
    const annVol = computeAnnualizedVol(dStd);

    returnsByTicker[ticker] = retSeries;
    dailyStdByTicker[ticker] = dStd;
    annualizedVolByTicker[ticker] = annVol;
    perTickerData[ticker] = {
      returns: [...retSeries],
      dailyStd: dStd,
      annualizedVol: annVol
    };
  }

  // Guardrail: verify that all constituent return series have identical length
  for (let i = 1; i < constituentTickers.length; i += 1) {
    const tA = constituentTickers[0];
    const tB = constituentTickers[i];
    const lenA = returnsByTicker[tA].length;
    const lenB = returnsByTicker[tB].length;
    const lengthsMatch = lenA === lenB;
    if (lengthsMatch === false) {
      const msg = `Return series length mismatch between ${tA} (${lenA}) and ${tB} (${lenB}). Broken alignment upstream.`;
      showStage3Alert(msg, "error");
      throw new Error(msg);
    }
  }

  // Compute SPY return series on its own dates (kept out of the covariance matrix)
  let spyData = null;
  const hasSpy = aligned.spy !== null && typeof aligned.spy === "object" && Array.isArray(aligned.spy.prices) === true;
  if (hasSpy === true) {
    const spyPrices = aligned.spy.prices;
    const spyReturns = computeDailyReturns(spyPrices);
    const spyStd = computeDailyStd(spyReturns);
    const spyAnnVol = computeAnnualizedVol(spyStd);
    const spyReturnDates = aligned.spy.dates.slice(1);
    spyData = {
      dates: spyReturnDates,
      returns: spyReturns,
      dailyStd: spyStd,
      annualizedVol: spyAnnVol
    };
  }

  // Covariance matrix: sample covariance of daily simple returns across all aligned constituents
  // SPY is kept out of the matrix
  const numTickers = constituentTickers.length;
  const covarianceMatrix = [];
  for (let i = 0; i < numTickers; i += 1) {
    const row = [];
    const tickerA = constituentTickers[i];
    const seriesA = returnsByTicker[tickerA];
    for (let j = 0; j < numTickers; j += 1) {
      const tickerB = constituentTickers[j];
      if (i === j) {
        const covSelf = computeSampleCovariance(seriesA, seriesA);
        row.push(covSelf);
      } else if (j < i) {
        // Sample covariance is symmetric: Cov(A, B) = Cov(B, A)
        row.push(covarianceMatrix[j][i]);
      } else {
        const seriesB = returnsByTicker[tickerB];
        const cov = computeSampleCovariance(seriesA, seriesB);
        row.push(cov);
      }
    }
    covarianceMatrix.push(row);
  }

  const returnDates = aligned.dates.slice(1);

  // Preserve existing indicatorSeries fields if any exist
  const existingIndicators = appState.indicatorSeries !== null && typeof appState.indicatorSeries === "object" ? appState.indicatorSeries : {};

  appState.indicatorSeries = {
    ...existingIndicators,
    dates: returnDates,
    tickers: [...constituentTickers],
    returns: returnsByTicker,
    dailyStd: dailyStdByTicker,
    annualizedVol: annualizedVolByTicker,
    perTicker: perTickerData,
    covarianceMatrix: covarianceMatrix,
    covarianceTickers: [...constituentTickers],
    spy: spyData
  };

  showStage3Alert("");
  renderIndicatorsUI();
}

/**
 * Updates summary metrics in Stage 3 banner.
 */
export function updateStage3SummaryMetrics() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }
  const constituentsEl = document.getElementById("s3-metric-constituents");
  const sessionsEl = document.getElementById("s3-metric-sessions");
  const spyVolEl = document.getElementById("s3-metric-spy-vol");
  const avgVolEl = document.getElementById("s3-metric-avg-vol");

  const ind = appState.indicatorSeries;
  const hasData = ind !== null && Array.isArray(ind.tickers) === true && ind.tickers.length > 0;
  if (hasData === false) {
    if (constituentsEl !== null) constituentsEl.textContent = "--";
    if (sessionsEl !== null) sessionsEl.textContent = "--";
    if (spyVolEl !== null) spyVolEl.textContent = "--";
    if (avgVolEl !== null) avgVolEl.textContent = "--";
    return;
  }

  if (constituentsEl !== null) {
    constituentsEl.textContent = `${ind.tickers.length} tickers`;
  }
  if (sessionsEl !== null) {
    const returnCount = ind.dates ? ind.dates.length : (ind.returns[ind.tickers[0]] ? ind.returns[ind.tickers[0]].length : 0);
    sessionsEl.textContent = `${returnCount} days`;
  }
  if (spyVolEl !== null) {
    if (ind.spy !== null && ind.spy !== undefined && ind.spy.annualizedVol !== undefined) {
      spyVolEl.textContent = `${(ind.spy.annualizedVol * 100).toFixed(2)}%`;
    } else {
      spyVolEl.textContent = "--";
    }
  }
  if (avgVolEl !== null) {
    let sumVol = 0;
    for (let i = 0; i < ind.tickers.length; i += 1) {
      sumVol += ind.annualizedVol[ind.tickers[i]] || 0;
    }
    const meanVol = sumVol / ind.tickers.length;
    avgVolEl.textContent = `${(meanVol * 100).toFixed(2)}%`;
  }
}

/**
 * Renders the volatilities table in Stage 3.
 */
export function renderVolatilitiesTable() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }
  const tbody = document.getElementById("volatilities-tbody");
  const statsEl = document.getElementById("volatilities-table-stats");
  if (tbody === null) {
    return;
  }

  const ind = appState.indicatorSeries;
  const hasData = ind !== null && Array.isArray(ind.tickers) === true && ind.tickers.length > 0;
  if (hasData === false) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty-row">Run the pipeline from Stage 1 to compute simple returns and annualized volatility.</td></tr>`;
    if (statsEl !== null) {
      statsEl.textContent = "";
    }
    return;
  }

  const tickers = ind.tickers;
  const universe = appState.universe || DEFAULT_UNIVERSE;
  const sectorMap = new Map();
  for (let i = 0; i < universe.length; i += 1) {
    sectorMap.set(universe[i].ticker, universe[i].sector);
  }

  let html = "";
  for (let i = 0; i < tickers.length; i += 1) {
    const ticker = tickers[i];
    const sector = sectorMap.get(ticker) || "Equity";
    const retSeries = ind.returns[ticker] || [];
    const dStd = ind.dailyStd[ticker];
    const annVol = ind.annualizedVol[ticker];
    const variance = dStd !== undefined ? dStd * dStd : 0;

    const dStdText = dStd !== undefined ? `${(dStd * 100).toFixed(2)}% (${dStd.toFixed(6)})` : "--";
    const varianceText = variance !== undefined ? variance.toFixed(6) : "--";
    const annVolText = annVol !== undefined ? `${(annVol * 100).toFixed(2)}%` : "--";

    html += `
      <tr>
        <td>
          <div class="ticker-cell-group">
            <span class="ticker-code">${ticker}</span>
          </div>
        </td>
        <td><span class="sector-text">${sector}</span></td>
        <td><span class="sessions-count">${retSeries.length} sessions</span></td>
        <td><span class="price-mono">${dStdText}</span></td>
        <td><span class="price-mono">${varianceText}</span></td>
        <td><span class="price-mono" style="font-weight: 700; color: var(--apple-text-primary);">${annVolText}</span></td>
      </tr>
    `;
  }

  // Also include SPY if available
  if (ind.spy !== null && ind.spy !== undefined && ind.spy.returns !== undefined) {
    const spyReturns = ind.spy.returns;
    const spyStd = ind.spy.dailyStd;
    const spyAnnVol = ind.spy.annualizedVol;
    const spyVar = spyStd * spyStd;

    html += `
      <tr style="background: #fafbfc; border-top: 2px solid var(--apple-border);">
        <td>
          <div class="ticker-cell-group">
            <span class="ticker-code">SPY</span>
            <span class="badge-benchmark">Benchmark</span>
          </div>
        </td>
        <td><span class="sector-text">Benchmark</span></td>
        <td><span class="sessions-count">${spyReturns.length} sessions</span></td>
        <td><span class="price-mono">${(spyStd * 100).toFixed(2)}% (${spyStd.toFixed(6)})</span></td>
        <td><span class="price-mono">${spyVar.toFixed(6)}</span></td>
        <td><span class="price-mono" style="font-weight: 700; color: var(--apple-blue);">${(spyAnnVol * 100).toFixed(2)}%</span></td>
      </tr>
    `;
  }

  tbody.innerHTML = html;

  if (statsEl !== null) {
    statsEl.textContent = `${tickers.length} constituents + 1 benchmark`;
  }
}

/**
 * Renders the full covariance matrix table.
 */
export function renderCovarianceMatrixTable() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }
  const container = document.getElementById("covariance-matrix-container");
  const dimsEl = document.getElementById("cov-matrix-dims");
  if (container === null) {
    return;
  }

  const ind = appState.indicatorSeries;
  const hasCov = ind !== null && Array.isArray(ind.covarianceMatrix) === true && ind.covarianceMatrix.length > 0;
  if (hasCov === false) {
    container.innerHTML = `<p class="table-empty-row">Covariance matrix not computed yet.</p>`;
    if (dimsEl !== null) {
      dimsEl.textContent = "--";
    }
    return;
  }

  const matrix = ind.covarianceMatrix;
  const tickers = ind.covarianceTickers;
  const n = tickers.length;
  if (dimsEl !== null) {
    dimsEl.textContent = `${n} x ${n}`;
  }

  let html = `<table class="matrix-table"><thead><tr><th class="sticky-col">Ticker</th>`;
  for (let j = 0; j < n; j += 1) {
    html += `<th>${tickers[j]}</th>`;
  }
  html += `</tr></thead><tbody>`;

  for (let i = 0; i < n; i += 1) {
    const rowTicker = tickers[i];
    html += `<tr><td class="sticky-col">${rowTicker}</td>`;
    for (let j = 0; j < n; j += 1) {
      const val = matrix[i][j];
      const isDiag = i === j;
      const cellClass = isDiag === true ? "diag-cell" : "";
      const formattedVal = val.toFixed(6);
      html += `<td class="${cellClass}" title="${rowTicker} vs ${tickers[j]}: ${val}">${formattedVal}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;

  container.innerHTML = html;
}

/**
 * Handles slicing the sub-matrix on user button click.
 */
export function handleSliceDiagnostic() {
  const inputEl = document.getElementById("slicer-input");
  const resultsEl = document.getElementById("slicer-results");
  if (inputEl === null || resultsEl === null) {
    return;
  }

  const rawText = inputEl.value || "";
  const tickers = rawText
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0);

  const hasTickers = tickers.length > 0;
  if (hasTickers === false) {
    resultsEl.innerHTML = `<p class="slicer-placeholder" style="color: #c91818;">Please enter at least one ticker symbol.</p>`;
    return;
  }

  try {
    const subMatrix = sliceCovariance(tickers);
    let html = `
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
        <span style="font-size: 13px; font-weight: 600; color: var(--apple-text-primary);">
          Extracted Sub-Matrix (${tickers.length} x ${tickers.length})
        </span>
        <span style="font-size: 11.5px; color: #2e7d32; font-weight: 500;">
          Stored matrix unmutated
        </span>
      </div>
      <div class="matrix-scroll-container" style="max-height: 250px;">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="sticky-col">Ticker</th>
    `;
    for (let j = 0; j < tickers.length; j += 1) {
      html += `<th>${tickers[j]}</th>`;
    }
    html += `</tr></thead><tbody>`;

    for (let i = 0; i < tickers.length; i += 1) {
      html += `<tr><td class="sticky-col">${tickers[i]}</td>`;
      for (let j = 0; j < tickers.length; j += 1) {
        const val = subMatrix[i][j];
        const isDiag = i === j;
        const cellClass = isDiag === true ? "diag-cell" : "";
        html += `<td class="${cellClass}">${val.toFixed(6)}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table></div>`;
    resultsEl.innerHTML = html;
  } catch (err) {
    resultsEl.innerHTML = `<p class="slicer-placeholder" style="color: #c91818;">Error: ${err.message}</p>`;
  }
}

/**
 * Renders all components in Stage 3 indicators.
 */
export function renderIndicatorsUI() {
  updateStage3SummaryMetrics();
  renderVolatilitiesTable();
  renderCovarianceMatrixTable();
}

/**
 * Sets up Stage 3 event listeners, tabs, and slicer interactions.
 */
export function setupStage3() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  // Tabs setup
  const tabs = [
    { btnId: "tab-volatilities", panelId: "panel-volatilities" },
    { btnId: "tab-covariance", panelId: "panel-covariance" },
    { btnId: "tab-slicer", panelId: "panel-slicer" }
  ];

  tabs.forEach((tab) => {
    const btn = document.getElementById(tab.btnId);
    if (btn !== null) {
      btn.addEventListener("click", () => {
        tabs.forEach((t) => {
          const b = document.getElementById(t.btnId);
          const p = document.getElementById(t.panelId);
          if (b !== null && p !== null) {
            const isActive = t.btnId === tab.btnId;
            if (isActive === true) {
              b.classList.add("active");
              b.setAttribute("aria-selected", "true");
              p.classList.add("active");
              p.removeAttribute("hidden");
            } else {
              b.classList.remove("active");
              b.setAttribute("aria-selected", "false");
              p.classList.remove("active");
              p.setAttribute("hidden", "true");
            }
          }
        });
      });
    }
  });

  // Slice button
  const sliceBtn = document.getElementById("btn-slice-covariance");
  if (sliceBtn !== null) {
    sliceBtn.addEventListener("click", handleSliceDiagnostic);
  }

  // Preset buttons
  const presetBtns = document.querySelectorAll(".btn-slice-preset");
  presetBtns.forEach((pBtn) => {
    pBtn.addEventListener("click", () => {
      const tickersAttr = pBtn.getAttribute("data-tickers");
      const inputEl = document.getElementById("slicer-input");
      if (inputEl !== null && tickersAttr !== null) {
        inputEl.value = tickersAttr;
        handleSliceDiagnostic();
      }
    });
  });

  renderIndicatorsUI();
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
  window.quotaState = quotaState;
  window.getTodayNYDateString = getTodayNYDateString;
  window.isBefore16NY = isBefore16NY;
  window.getOneYearAgoDateString = getOneYearAgoDateString;
  window.cleanSymbolSeries = cleanSymbolSeries;
  window.updateQuotaUI = updateQuotaUI;
  window.ensureQuotaAvailable = ensureQuotaAvailable;
  window.fetchWithTimeoutAndRetry = fetchWithTimeoutAndRetry;
  window.showStage2Alert = showStage2Alert;
  window.setTickerPriceStatus = setTickerPriceStatus;
  window.renderRawPricesTable = renderRawPricesTable;
  window.updateAlignmentSummaryCard = updateAlignmentSummaryCard;
  window.alignAndCompleteStage2 = alignAndCompleteStage2;
  window.runPriceFetchAndAlignment = runPriceFetchAndAlignment;
  window.setupStage2 = setupStage2;
  window.computeDailyReturns = computeDailyReturns;
  window.computeSampleMean = computeSampleMean;
  window.computeDailyStd = computeDailyStd;
  window.computeAnnualizedVol = computeAnnualizedVol;
  window.computeSampleCovariance = computeSampleCovariance;
  window.sliceCovariance = sliceCovariance;
  window.showStage3Alert = showStage3Alert;
  window.computeReturnsAndCovariance = computeReturnsAndCovariance;
  window.updateStage3SummaryMetrics = updateStage3SummaryMetrics;
  window.renderVolatilitiesTable = renderVolatilitiesTable;
  window.renderCovarianceMatrixTable = renderCovarianceMatrixTable;
  window.handleSliceDiagnostic = handleSliceDiagnostic;
  window.renderIndicatorsUI = renderIndicatorsUI;
  window.setupStage3 = setupStage3;
}

function initializeApp() {
  renderStageTracker();
  setupCollapsibleSections();
  setupUniverseUpload();
  renderUniverseUI();
  setupSettingsPanel();
  setupStage2();
  setupStage3();
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

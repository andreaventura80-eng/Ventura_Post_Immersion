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
  baseRsiThreshold: 40,
  rsiRelaxCount: 0,
  rsiThresholdRecord: "40",
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
  globalBanners: [],
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

  // Update in appState globalBanners
  if (Array.isArray(appState.globalBanners) === false) {
    appState.globalBanners = [];
  }
  const existingAlertIndex = appState.globalBanners.findIndex((a) => a.id === id);
  const hasExistingAlert = existingAlertIndex >= 0;
  if (hasExistingAlert === true) {
    appState.globalBanners[existingAlertIndex] = { id, message, level };
  } else {
    appState.globalBanners.push({ id, message, level });
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
  if (Array.isArray(appState.globalBanners) === true) {
    const alertIndex = appState.globalBanners.findIndex((a) => a.id === id);
    const hasAlert = alertIndex >= 0;
    if (hasAlert === true) {
      appState.globalBanners.splice(alertIndex, 1);
    } else {
      // Alert not found in state
    }
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
  appState.globalBanners = [];
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

  const hasScreenResult = appState.screenResult !== null && typeof appState.screenResult === "object";
  if (hasScreenResult === true) {
    renderStage4UI();
  }

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
 * A typed value resets rsiRelaxCount to 0 and re-runs technical screen live.
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

  const previousSurvivors = appState.screenResult !== null && typeof appState.screenResult === "object" && Array.isArray(appState.screenResult.survivors) === true
    ? [...appState.screenResult.survivors]
    : [];

  appState.settings.baseRsiThreshold = num;
  appState.settings.rsiThreshold = num;
  appState.settings.rsiRelaxCount = 0;
  appState.settings.rsiThresholdRecord = String(num);

  clearSettingsError();
  renderSettingsUI();
  updatePreflightCard();

  const hasIndicators = appState.indicatorSeries !== null && typeof appState.indicatorSeries === "object";
  if (hasIndicators === true) {
    runStage4Screen(previousSurvivors);
  }

  return true;
}

/**
 * Validates and updates the MACD histogram lookback (N) setting.
 * Range: integer 2 to 10.
 * Re-runs technical screen live without re-fetching.
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

  const previousSurvivors = appState.screenResult !== null && typeof appState.screenResult === "object" && Array.isArray(appState.screenResult.survivors) === true
    ? [...appState.screenResult.survivors]
    : [];

  appState.settings.histogramLookback = num;
  clearSettingsError();
  renderSettingsUI();
  updatePreflightCard();
  renderSignalTable();
  renderMacdPanelUI();

  const hasIndicators = appState.indicatorSeries !== null && typeof appState.indicatorSeries === "object";
  if (hasIndicators === true) {
    runStage4Screen(previousSurvivors);
  }

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

    let sessionsText = "--";
    let dateRangeText = "--";
    let latestCloseText = "--";

    if (hasCached === true) {
      const count = info.rowCount !== null && info.rowCount !== undefined ? info.rowCount : cachedSeries.length;
      sessionsText = `${count} sessions`;
      const firstD = cachedSeries[0].datetime;
      const lastD = cachedSeries[cachedSeries.length - 1].datetime;
      dateRangeText = info.dateRange ? info.dateRange : `${firstD} -> ${lastD}`;
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

    let noteText = info.note || info.message || "--";
    if (isBenchmark === true && (noteText === "--" || noteText === "")) {
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

  // Run Stage 4 technical screen
  runStage4Screen();

  // Run Stage 5 text gate if survivors exist
  const hasSurvivors = appState.screenResult !== null &&
    Array.isArray(appState.screenResult.survivors) === true &&
    appState.screenResult.survivors.length > 0;

  if (hasSurvivors === true) {
    runStage5Pipeline(false).catch((err) => {
      console.warn("Stage 5 run failed:", err);
    });
  }

  const hasDocument = typeof document !== "undefined";
  if (hasDocument === true) {
    const stageBody3 = document.getElementById("stage-body-3");
    const stageHeader3 = document.getElementById("stage-header-3");
    if (stageBody3 !== null && stageHeader3 !== null) {
      stageBody3.classList.remove("collapsed");
      stageHeader3.setAttribute("aria-expanded", "true");
    }
    const stageBody4 = document.getElementById("stage-body-4");
    const stageHeader4 = document.getElementById("stage-header-4");
    if (stageBody4 !== null && stageHeader4 !== null) {
      stageBody4.classList.remove("collapsed");
      stageHeader4.setAttribute("aria-expanded", "true");
    }
    if (hasSurvivors === true) {
      const stageBody5 = document.getElementById("stage-body-5");
      const stageHeader5 = document.getElementById("stage-header-5");
      if (stageBody5 !== null && stageHeader5 !== null) {
        stageBody5.classList.remove("collapsed");
        stageHeader5.setAttribute("aria-expanded", "true");
      }
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
 * Computes Relative Strength Index (RSI) using J. Welles Wilder smoothing recursion.
 * Period is fixed at 14 by the caller.
 *
 * Steps:
 * 1. Require at least period + 1 closes. If fewer are available, return an object
 *    with insufficientHistory set to true and let the row show "insufficient history".
 * 2. Compute change between consecutive closes: gain is positive part, loss is positive part of negative.
 * 3. Seed: average gain is simple mean of first 14 gains; average loss is simple mean of first 14 losses.
 * 4. For each following session, update with Wilder smoothing:
 *    new average = (previous average * 13 + current gain or loss) / 14.
 *    Record running average gain and average loss at every session.
 * 5. At every session from seed onward compute RS = average gain / average loss,
 *    RSI = 100 - 100 / (1 + RS), with edge cases:
 *    average loss zero gives RSI 100; average gain zero gives RSI 0; both zero gives RSI 50.
 * 6. Return the full RSI series, seed averages, arrays of running average gain and average loss,
 *    and final average gain and loss. The current RSI is the last value of the series.
 *
 * @param {number[]} closes - Array of adjusted close prices
 * @param {number} [period=14] - Lookback period (fixed at 14 by caller)
 * @returns {object} Full RSI series, seed data, running averages, and current RSI
 */
export function computeRsi(closes, period = 14) {
  const isArray = Array.isArray(closes) === true;
  const targetPeriod = typeof period === "number" && period > 0 ? period : 14;
  const minRequiredCloses = targetPeriod + 1;

  if (isArray === false) {
    return {
      insufficientHistory: true,
      period: targetPeriod,
      closesCount: 0,
      seedAvgGain: null,
      seedAvgLoss: null,
      seedIndex: null,
      runningAvgGains: [],
      runningAvgLosses: [],
      rsiSeries: [],
      currentRsi: null,
      finalAvgGain: null,
      finalAvgLoss: null
    };
  }

  const hasSufficientCloses = closes.length >= minRequiredCloses;
  if (hasSufficientCloses === false) {
    return {
      insufficientHistory: true,
      period: targetPeriod,
      closesCount: closes.length,
      seedAvgGain: null,
      seedAvgLoss: null,
      seedIndex: null,
      runningAvgGains: [],
      runningAvgLosses: [],
      rsiSeries: [],
      currentRsi: null,
      finalAvgGain: null,
      finalAvgLoss: null
    };
  }

  const numChanges = closes.length - 1;
  const gains = [];
  const losses = [];

  for (let i = 1; i < closes.length; i += 1) {
    const prevRaw = closes[i - 1];
    const currRaw = closes[i];
    const prevIsNum = typeof prevRaw === "number";
    const prev = prevIsNum === true ? prevRaw : parseFloat(prevRaw);
    const currIsNum = typeof currRaw === "number";
    const curr = currIsNum === true ? currRaw : parseFloat(currRaw);
    const isValid = isNaN(prev) === false && isNaN(curr) === false;

    if (isValid === false) {
      gains.push(0);
      losses.push(0);
      continue;
    }

    const change = curr - prev;
    const isPositiveChange = change > 0;
    const isNegativeChange = change < 0;

    if (isPositiveChange === true) {
      gains.push(change);
      losses.push(0);
    } else if (isNegativeChange === true) {
      gains.push(0);
      losses.push(-change);
    } else {
      gains.push(0);
      losses.push(0);
    }
  }

  // Seed: simple mean of first targetPeriod gains and losses (changes 0 to targetPeriod - 1)
  let sumFirstGains = 0;
  let sumFirstLosses = 0;
  for (let i = 0; i < targetPeriod; i += 1) {
    sumFirstGains += gains[i];
    sumFirstLosses += losses[i];
  }
  const seedAvgGain = sumFirstGains / targetPeriod;
  const seedAvgLoss = sumFirstLosses / targetPeriod;

  // Helper to compute RSI with specified edge cases
  const calculateRsiValue = (avgGain, avgLoss) => {
    const gainIsZero = avgGain === 0;
    const lossIsZero = avgLoss === 0;

    if (gainIsZero === true && lossIsZero === true) {
      return 50;
    }
    if (lossIsZero === true) {
      return 100;
    }
    if (gainIsZero === true) {
      return 0;
    }

    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  };

  const seedRsi = calculateRsiValue(seedAvgGain, seedAvgLoss);

  // Stored running averages and RSI series (one entry per session from seed onward)
  const runningAvgGains = [seedAvgGain];
  const runningAvgLosses = [seedAvgLoss];
  const rsiSeries = [seedRsi];

  let currentAvgGain = seedAvgGain;
  let currentAvgLoss = seedAvgLoss;

  // Wilder smoothing recursion for subsequent sessions:
  // new average = (previous average * 13 + current) / 14
  const multiplier = targetPeriod - 1;
  for (let i = targetPeriod; i < numChanges; i += 1) {
    const currentGain = gains[i];
    const currentLoss = losses[i];

    currentAvgGain = (currentAvgGain * multiplier + currentGain) / targetPeriod;
    currentAvgLoss = (currentAvgLoss * multiplier + currentLoss) / targetPeriod;

    runningAvgGains.push(currentAvgGain);
    runningAvgLosses.push(currentAvgLoss);

    const rsiVal = calculateRsiValue(currentAvgGain, currentAvgLoss);
    rsiSeries.push(rsiVal);
  }

  const finalAvgGain = runningAvgGains[runningAvgGains.length - 1];
  const finalAvgLoss = runningAvgLosses[runningAvgLosses.length - 1];
  const currentRsi = rsiSeries[rsiSeries.length - 1];

  return {
    insufficientHistory: false,
    period: targetPeriod,
    closesCount: closes.length,
    seedAvgGain: seedAvgGain,
    seedAvgLoss: seedAvgLoss,
    seedIndex: targetPeriod,
    runningAvgGains: runningAvgGains,
    runningAvgLosses: runningAvgLosses,
    rsiSeries: rsiSeries,
    currentRsi: currentRsi,
    finalAvgGain: finalAvgGain,
    finalAvgLoss: finalAvgLoss
  };
}

/**
 * Exponential Moving Average (EMA) helper seeded with the simple mean
 * of its first "period" values, then updated with multiplier 2 / (period + 1).
 * Output starts at index period - 1 of its input.
 *
 * @param {number[]} values - Array of numeric price or indicator values.
 * @param {number} period - Number of sessions for the smoothing window.
 * @returns {number[]} EMA series starting at input index period - 1.
 */
export function computeEma(values, period) {
  const isArray = Array.isArray(values) === true;
  const isPeriodValid = typeof period === "number" && period > 0;
  const isInputValid = isArray === true && isPeriodValid === true;
  if (isInputValid === false) {
    return [];
  }

  const hasEnoughValues = values.length >= period;
  if (hasEnoughValues === false) {
    return [];
  }

  // Check if all values in the input are identical to prevent floating-point drift
  let allIdentical = true;
  const firstVal = values[0];
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] !== firstVal) {
      allIdentical = false;
      break;
    }
  }

  if (allIdentical === true) {
    return new Array(values.length - period + 1).fill(firstVal);
  }

  const multiplier = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i += 1) {
    const raw = values[i];
    const isNum = typeof raw === "number";
    const val = isNum === true ? raw : parseFloat(raw);
    const isValidNum = isNaN(val) === false;
    sum += isValidNum === true ? val : 0;
  }

  let prevEma = sum / period;
  const ema = [prevEma];

  for (let i = period; i < values.length; i += 1) {
    const raw = values[i];
    const isNum = typeof raw === "number";
    const val = isNum === true ? raw : parseFloat(raw);
    const num = isNaN(val) === false ? val : prevEma;
    const curEma = (num - prevEma) * multiplier + prevEma;
    ema.push(curEma);
    prevEma = curEma;
  }

  return ema;
}

/**
 * Computes MACD line, Signal line, and Histogram H for a series of closes.
 * Parameters fixed at 12, 26, 9.
 *
 * - MACD line = EMA(12) minus EMA(26), defined from close index 25 onward.
 * - Signal line = EMA(9) of the defined portion of the MACD line only,
 *   starting at MACD index 8 (close index 33, session 34).
 * - Histogram H = MACD line minus signal line, defined from close index 33 onward.
 *
 * Requires at least 34 closes (26 + 9 - 1).
 *
 * @param {number[]} closes - Array of chronologically aligned closing prices.
 * @param {number} [fast=12] - Fast EMA period (default 12).
 * @param {number} [slow=26] - Slow EMA period (default 26).
 * @param {number} [signal=9] - Signal line EMA period (default 9).
 * @returns {object} Indicator series and audit records.
 */
export function computeMacd(closes, fast = 12, slow = 26, signal = 9) {
  const isArray = Array.isArray(closes) === true;
  const fastPeriod = typeof fast === "number" && fast > 0 ? fast : 12;
  const slowPeriod = typeof slow === "number" && slow > 0 ? slow : 26;
  const signalPeriod = typeof signal === "number" && signal > 0 ? signal : 9;

  const minRequiredCloses = slowPeriod + signalPeriod - 1; // 26 + 9 - 1 = 34
  const hasSufficientCloses = isArray === true && closes.length >= minRequiredCloses;

  if (hasSufficientCloses === false) {
    const count = isArray === true ? closes.length : 0;
    return {
      insufficientHistory: true,
      closesCount: count,
      fastPeriod: fastPeriod,
      slowPeriod: slowPeriod,
      signalPeriod: signalPeriod,
      macdStartIndex: slowPeriod - 1,
      signalStartIndex: slowPeriod + signalPeriod - 2,
      histogramStartIndex: slowPeriod + signalPeriod - 2,
      emaFast: [],
      emaSlow: [],
      macdSeries: [],
      signalSeries: [],
      histogramSeries: [],
      records: [],
      currentMacd: null,
      currentSignal: null,
      currentHistogram: null
    };
  }

  const emaFast = computeEma(closes, fastPeriod);
  const emaSlow = computeEma(closes, slowPeriod);

  const macdSeries = [];
  const fastOffset = slowPeriod - fastPeriod; // 26 - 12 = 14
  for (let i = 0; i < emaSlow.length; i += 1) {
    const fastVal = emaFast[i + fastOffset];
    const slowVal = emaSlow[i];
    let diff = fastVal - slowVal;
    if (Math.abs(diff) < 1e-12) {
      diff = 0;
    }
    macdSeries.push(diff);
  }

  const signalSeries = computeEma(macdSeries, signalPeriod);

  const histogramSeries = [];
  const records = [];
  const macdSignalOffset = signalPeriod - 1; // 9 - 1 = 8
  const baseCloseIndex = (slowPeriod - 1) + macdSignalOffset; // 25 + 8 = 33 (session 34)

  for (let i = 0; i < signalSeries.length; i += 1) {
    const macdVal = macdSeries[i + macdSignalOffset];
    const signalVal = signalSeries[i];
    let histVal = macdVal - signalVal;
    if (Math.abs(histVal) < 1e-12) {
      histVal = 0;
    }
    const currentCloseIndex = baseCloseIndex + i;

    histogramSeries.push(histVal);
    records.push({
      session: currentCloseIndex + 1,
      closeIndex: currentCloseIndex,
      macd: macdVal,
      signal: signalVal,
      histogram: histVal
    });
  }

  const hasMacd = macdSeries.length > 0;
  const currentMacd = hasMacd === true ? macdSeries[macdSeries.length - 1] : null;

  const hasSignal = signalSeries.length > 0;
  const currentSignal = hasSignal === true ? signalSeries[signalSeries.length - 1] : null;

  const hasHistogram = histogramSeries.length > 0;
  const currentHistogram = hasHistogram === true ? histogramSeries[histogramSeries.length - 1] : null;

  return {
    insufficientHistory: false,
    closesCount: closes.length,
    fastPeriod: fastPeriod,
    slowPeriod: slowPeriod,
    signalPeriod: signalPeriod,
    macdStartIndex: slowPeriod - 1, // 25
    signalStartIndex: baseCloseIndex, // 33
    histogramStartIndex: baseCloseIndex, // 33
    emaFast: emaFast,
    emaSlow: emaSlow,
    macdSeries: macdSeries,
    signalSeries: signalSeries,
    histogramSeries: histogramSeries,
    records: records,
    currentMacd: currentMacd,
    currentSignal: currentSignal,
    currentHistogram: currentHistogram
  };
}

/**
 * Returns { current, lagged } for H_t and H_(t-N), or an insufficient-history
 * result when the series has fewer than N + 1 histogram values.
 *
 * @param {object|number[]} series - Object from computeMacd or array of histogram values.
 * @param {number} N - Histogram lookback session offset (e.g. 2 to 10).
 * @returns {object} Object with current, lagged, difference, and isRising.
 */
export function histogramPair(series, N) {
  const isLookbackValid = typeof N === "number" && N > 0;
  if (isLookbackValid === false) {
    return {
      insufficientHistory: true,
      current: null,
      lagged: null,
      difference: null,
      isRising: null,
      lookback: N,
      requiredHistogramValues: null,
      actualHistogramValues: 0
    };
  }

  let histArr = [];
  const isArray = Array.isArray(series) === true;
  if (isArray === true) {
    histArr = series;
  } else {
    const isObj = series !== null && typeof series === "object";
    if (isObj === true) {
      const hasHistSeries = Array.isArray(series.histogramSeries) === true;
      if (hasHistSeries === true) {
        histArr = series.histogramSeries;
      } else if (Array.isArray(series.histogram) === true) {
        histArr = series.histogram;
      }
    }
  }

  const requiredValues = N + 1;
  const hasEnoughValues = histArr.length >= requiredValues;
  if (hasEnoughValues === false) {
    return {
      insufficientHistory: true,
      current: null,
      lagged: null,
      difference: null,
      isRising: null,
      lookback: N,
      requiredHistogramValues: requiredValues,
      actualHistogramValues: histArr.length
    };
  }

  const currentVal = histArr[histArr.length - 1];
  const laggedVal = histArr[histArr.length - 1 - N];
  let diff = currentVal - laggedVal;
  if (Math.abs(diff) < 1e-12) {
    diff = 0;
  }
  const isRising = currentVal > laggedVal;

  return {
    insufficientHistory: false,
    current: currentVal,
    lagged: laggedVal,
    difference: diff,
    isRising: isRising,
    lookback: N,
    requiredHistogramValues: requiredValues,
    actualHistogramValues: histArr.length
  };
}


/**
 * Computes daily simple returns, daily standard deviation, annualized volatility,
 * sample covariance matrix across all aligned constituent tickers, and Wilder RSI(14).
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
  const rsiByTicker = {};
  const macdByTicker = {};
  const perTickerData = {};

  // Compute returns, volatilities, Wilder RSI(14), and MACD(12,26,9) for each constituent
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
    const rsiResult = computeRsi(prices, 14);
    const macdResult = computeMacd(prices, 12, 26, 9);

    returnsByTicker[ticker] = retSeries;
    dailyStdByTicker[ticker] = dStd;
    annualizedVolByTicker[ticker] = annVol;
    rsiByTicker[ticker] = rsiResult;
    macdByTicker[ticker] = macdResult;
    perTickerData[ticker] = {
      ticker: ticker,
      prices: [...prices],
      returns: [...retSeries],
      dailyStd: dStd,
      annualizedVol: annVol,
      rsi: rsiResult,
      macd: macdResult
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

  // Compute SPY return series, RSI, and MACD on its own dates (kept out of the covariance matrix)
  let spyData = null;
  const hasSpy = aligned.spy !== null && typeof aligned.spy === "object" && Array.isArray(aligned.spy.prices) === true;
  if (hasSpy === true) {
    const spyPrices = aligned.spy.prices;
    const spyReturns = computeDailyReturns(spyPrices);
    const spyStd = computeDailyStd(spyReturns);
    const spyAnnVol = computeAnnualizedVol(spyStd);
    const spyRsi = computeRsi(spyPrices, 14);
    const spyMacd = computeMacd(spyPrices, 12, 26, 9);
    const spyDates = (aligned.spy && Array.isArray(aligned.spy.dates) === true) ? aligned.spy.dates : aligned.dates;
    const spyReturnDates = Array.isArray(spyDates) === true ? spyDates.slice(1) : [];
    spyData = {
      dates: spyReturnDates,
      prices: spyPrices,
      returns: spyReturns,
      dailyStd: spyStd,
      annualizedVol: spyAnnVol,
      rsi: spyRsi,
      macd: spyMacd
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
    rsi: rsiByTicker,
    macd: macdByTicker,
    spy: spyData
  };

  showStage3Alert("");
  setStageStatus(3, "done");
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
 * State for currently active signal table transparency drill-down.
 */
export let activeSignalDrilldown = {
  ticker: null,
  metric: null // "rsi" | "hist_current" | "hist_lagged" | "volatility"
};

/**
 * Sets or toggles the active drill-down for a ticker and metric.
 *
 * @param {string} ticker
 * @param {string} metric
 */
export function setSignalDrilldown(ticker, metric) {
  const isSameTicker = activeSignalDrilldown.ticker === ticker;
  const isSameMetric = activeSignalDrilldown.metric === metric;
  if (isSameTicker === true && isSameMetric === true) {
    activeSignalDrilldown.ticker = null;
    activeSignalDrilldown.metric = null;
  } else {
    activeSignalDrilldown.ticker = ticker;
    activeSignalDrilldown.metric = metric;
  }
  renderSignalTable();
}

/**
 * Closes the active signal drill-down panel.
 */
export function closeSignalDrilldown() {
  activeSignalDrilldown.ticker = null;
  activeSignalDrilldown.metric = null;
  renderSignalTable();
}

/**
 * Generates unrounded HTML transparency drill-down for a given ticker and indicator metric.
 *
 * @param {string} ticker
 * @param {string} metric - "rsi" | "hist_current" | "hist_lagged" | "volatility"
 * @returns {string} HTML markup
 */
export function renderSignalDrilldownHtml(ticker, metric) {
  const ind = appState.indicatorSeries;
  const hasIndicators = ind !== null && typeof ind === "object";
  if (hasIndicators === false) {
    return `<div class="drilldown-card"><p>No indicator data available.</p></div>`;
  }

  const isSpy = ticker === "SPY";
  const rsiObj = isSpy === true ? (ind.spy && ind.spy.rsi) : (ind.rsi && ind.rsi[ticker]);
  const macdObj = isSpy === true ? (ind.spy && ind.spy.macd) : (ind.macd && ind.macd[ticker]);
  const prices = (isSpy === true ? (ind.spy && ind.spy.prices) : (ind.perTicker && ind.perTicker[ticker] && ind.perTicker[ticker].prices)) || (appState.alignedData && appState.alignedData.prices && appState.alignedData.prices[ticker]) || [];
  const dates = (isSpy === true ? ((ind.spy && ind.spy.dates) || (appState.alignedData && appState.alignedData.dates)) : (appState.alignedData && appState.alignedData.dates)) || [];
  const lookback = typeof appState.settings.histogramLookback === "number" ? appState.settings.histogramLookback : 3;

  const isRsi = metric === "rsi";
  const isHistCurrent = metric === "hist_current";
  const isHistLagged = metric === "hist_lagged";
  const isHist = isHistCurrent === true || isHistLagged === true;
  const isVol = metric === "volatility";

  const headerHtml = `
    <div class="drilldown-header">
      <div class="drilldown-title-group">
        <h4 class="drilldown-title">
          <span>${ticker}</span>
          <span style="font-weight: 400; color: var(--apple-text-secondary); font-size: 14px;">Transparency Drill-Down</span>
        </h4>
        <span class="drilldown-subtitle">Raw unrounded mathematical inputs and recursion</span>
      </div>
      <div class="drilldown-actions">
        <div class="drilldown-nav-pills" role="tablist">
          <button type="button" class="drilldown-nav-pill ${isRsi === true ? "active" : ""}" data-ticker="${ticker}" data-metric="rsi">RSI(14)</button>
          <button type="button" class="drilldown-nav-pill ${isHistCurrent === true ? "active" : ""}" data-ticker="${ticker}" data-metric="hist_current">H_t (Current)</button>
          <button type="button" class="drilldown-nav-pill ${isHistLagged === true ? "active" : ""}" data-ticker="${ticker}" data-metric="hist_lagged">H_(t-${lookback}) (Lagged)</button>
          <button type="button" class="drilldown-nav-pill ${isVol === true ? "active" : ""}" data-ticker="${ticker}" data-metric="volatility">Volatility</button>
        </div>
        <button type="button" class="btn-drilldown-close" title="Close drill-down">Close ✕</button>
      </div>
    </div>
  `;

  let contentHtml = "";

  if (isRsi === true) {
    const hasRsi = rsiObj !== undefined && rsiObj !== null && rsiObj.insufficientHistory === false;
    if (hasRsi === false) {
      contentHtml = `<p class="table-empty-row">Insufficient history to compute RSI(14) for ${ticker}.</p>`;
    } else {
      const fixedNote = "These averages depend on the whole series. The last 15 closes alone do not reproduce this figure and are not shown as if they did.";
      const seedAvgGain = rsiObj.seedAvgGain;
      const seedAvgLoss = rsiObj.seedAvgLoss;
      const finalAvgGain = rsiObj.finalAvgGain;
      const finalAvgLoss = rsiObj.finalAvgLoss;
      const currentRsi = rsiObj.currentRsi;
      const seedRs = seedAvgLoss !== 0 ? (seedAvgGain / seedAvgLoss) : (seedAvgGain > 0 ? "Infinity" : 0);
      const finalRs = finalAvgLoss !== 0 ? (finalAvgGain / finalAvgLoss) : (finalAvgGain > 0 ? "Infinity" : 0);

      let tableRows = "";
      for (let i = 0; i < prices.length; i += 1) {
        const sessionNum = i + 1;
        const date = dates[i] || `--`;
        const close = prices[i];
        let changeStr = "--";
        let gainStr = "--";
        let lossStr = "--";
        let avgGainStr = "--";
        let avgLossStr = "--";
        let rsStr = "--";
        let rsiStr = "--";

        if (i >= 1) {
          const change = close - prices[i - 1];
          changeStr = String(change);
          const gain = Math.max(0, change);
          const loss = Math.max(0, -change);
          gainStr = String(gain);
          lossStr = String(loss);

          if (i < 14) {
            avgGainStr = `(accumulating seed ${sessionNum}/14)`;
            avgLossStr = `(accumulating seed ${sessionNum}/14)`;
          } else if (i === 14) {
            avgGainStr = `${seedAvgGain} (seed mean)`;
            avgLossStr = `${seedAvgLoss} (seed mean)`;
            rsStr = String(seedRs);
            rsiStr = String(rsiObj.rsiSeries[0]);
          } else {
            const seriesIdx = i - 14;
            avgGainStr = String(rsiObj.runningAvgGains[seriesIdx]);
            avgLossStr = String(rsiObj.runningAvgLosses[seriesIdx]);
            const rAvgGain = rsiObj.runningAvgGains[seriesIdx];
            const rAvgLoss = rsiObj.runningAvgLosses[seriesIdx];
            const sRs = rAvgLoss !== 0 ? (rAvgGain / rAvgLoss) : (rAvgGain > 0 ? "Infinity" : 0);
            rsStr = String(sRs);
            rsiStr = String(rsiObj.rsiSeries[seriesIdx]);
          }
        }

        const isSeedRow = i === 14;
        const rowClass = isSeedRow === true ? "seed-init" : (i < 14 ? "seed-window" : "");

        tableRows += `
          <tr class="${rowClass}">
            <td>${sessionNum}</td>
            <td>${date}</td>
            <td>${close}</td>
            <td>${changeStr}</td>
            <td>${gainStr}</td>
            <td>${lossStr}</td>
            <td>${avgGainStr}</td>
            <td>${avgLossStr}</td>
            <td>${rsStr}</td>
            <td style="font-weight: 700;">${rsiStr}</td>
          </tr>
        `;
      }

      contentHtml = `
        <div class="drilldown-note-card">
          <strong>Methodological Note:</strong> ${fixedNote}
        </div>
        <div class="drilldown-metrics-summary">
          <div class="drilldown-metric-box">
            <span class="drilldown-box-label">Seed Average Gain (First 14 Gains)</span>
            <span class="drilldown-box-value">${seedAvgGain}</span>
            <span class="drilldown-box-note">Simple mean of positive changes in closes 1 to 15</span>
          </div>
          <div class="drilldown-metric-box">
            <span class="drilldown-box-label">Seed Average Loss (First 14 Losses)</span>
            <span class="drilldown-box-value">${seedAvgLoss}</span>
            <span class="drilldown-box-note">Simple mean of absolute negative changes in closes 1 to 15</span>
          </div>
          <div class="drilldown-metric-box">
            <span class="drilldown-box-label">Final Average Gain (Wilder Smoothed)</span>
            <span class="drilldown-box-value">${finalAvgGain}</span>
            <span class="drilldown-box-note">Recursive: (prevAvg * 13 + currentGain) / 14</span>
          </div>
          <div class="drilldown-metric-box">
            <span class="drilldown-box-label">Final Average Loss (Wilder Smoothed)</span>
            <span class="drilldown-box-value">${finalAvgLoss}</span>
            <span class="drilldown-box-note">Recursive: (prevAvg * 13 + currentLoss) / 14</span>
          </div>
          <div class="drilldown-metric-box highlight">
            <span class="drilldown-box-label">Current Unrounded RSI</span>
            <span class="drilldown-box-value" style="color: var(--apple-blue);">${currentRsi}</span>
            <span class="drilldown-box-note">100 - (100 / (1 + RS)), where RS = ${finalRs}</span>
          </div>
        </div>
        <div class="drilldown-table-wrapper">
          <table>
            <thead>
              <tr>
                <th scope="col">Session</th>
                <th scope="col">Date</th>
                <th scope="col">Close</th>
                <th scope="col">Change</th>
                <th scope="col">Gain</th>
                <th scope="col">Loss</th>
                <th scope="col">Average Gain</th>
                <th scope="col">Average Loss</th>
                <th scope="col">RS</th>
                <th scope="col">RSI</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      `;
    }
  } else if (isHist === true) {
    const hasMacd = macdObj !== undefined && macdObj !== null && macdObj.insufficientHistory === false;
    if (hasMacd === false) {
      contentHtml = `<p class="table-empty-row">Insufficient history to compute MACD and histogram for ${ticker}.</p>`;
    } else {
      const pair = histogramPair(macdObj, lookback);
      const isTargetLagged = isHistLagged === true;
      const targetHistIdx = isTargetLagged === true ? (macdObj.histogramSeries.length - 1 - lookback) : (macdObj.histogramSeries.length - 1);
      const targetClosesIdx = isTargetLagged === true ? (prices.length - 1 - lookback) : (prices.length - 1);

      const hasValidTarget = targetHistIdx >= 0 && targetClosesIdx >= 0;
      if (hasValidTarget === false) {
        contentHtml = `<p class="table-empty-row">Lookback N=${lookback} precedes the start of the histogram series.</p>`;
      } else {
        const inspectedDate = dates[targetClosesIdx] || "--";
        const inspectedClose = prices[targetClosesIdx];
        const ema12 = macdObj.emaFast[targetClosesIdx - 11];
        const ema26 = macdObj.emaSlow[targetClosesIdx - 25];
        const macdVal = macdObj.macdSeries[targetClosesIdx - 25];
        const signalVal = macdObj.signalSeries[targetHistIdx];
        const histVal = macdObj.histogramSeries[targetHistIdx];

        contentHtml = `
          <div class="drilldown-formula-card">
            <div class="drilldown-formula-step">
              <span style="font-weight: 700; color: var(--apple-blue);">Inspected Target:</span>
              <span>${isTargetLagged === true ? `Lagged Session t-${lookback} (${lookback} sessions ago)` : `Current Session t (Latest)`} on Date ${inspectedDate} (Close: $${inspectedClose})</span>
            </div>
            <div class="drilldown-formula-step">
              <span style="font-weight: 700;">1. Fast EMA(12):</span>
              <span>${ema12}</span>
            </div>
            <div class="drilldown-formula-step">
              <span style="font-weight: 700;">2. Slow EMA(26):</span>
              <span>${ema26}</span>
            </div>
            <div class="drilldown-formula-step">
              <span style="font-weight: 700;">3. MACD Line:</span>
              <span>EMA(12) - EMA(26) = ${ema12} - ${ema26} = <strong style="color: var(--apple-text-primary);">${macdVal}</strong></span>
            </div>
            <div class="drilldown-formula-step">
              <span style="font-weight: 700;">4. Signal Line:</span>
              <span>EMA(9) of MACD Line = <strong style="color: var(--apple-text-primary);">${signalVal}</strong></span>
            </div>
            <div class="drilldown-formula-step">
              <span style="font-weight: 700;">5. Histogram (H):</span>
              <span>MACD Line - Signal Line = ${macdVal} - ${signalVal} = <strong style="color: var(--apple-blue);">${histVal}</strong></span>
            </div>
          </div>

          <div class="drilldown-metrics-summary">
            <div class="drilldown-metric-box">
              <span class="drilldown-box-label">Current Histogram H_t</span>
              <span class="drilldown-box-value">${pair.current}</span>
              <span class="drilldown-box-note">Latest session close</span>
            </div>
            <div class="drilldown-metric-box">
              <span class="drilldown-box-label">Lagged Histogram H_(t-${lookback})</span>
              <span class="drilldown-box-value">${pair.lagged}</span>
              <span class="drilldown-box-note">${lookback} sessions ago (re-read live)</span>
            </div>
            <div class="drilldown-metric-box">
              <span class="drilldown-box-label">Difference (H_t - H_(t-${lookback}))</span>
              <span class="drilldown-box-value">${pair.difference}</span>
              <span class="drilldown-box-note">${pair.isRising === true ? "Rising (thesis condition met)" : "Falling or flat"}</span>
            </div>
            <div class="drilldown-metric-box highlight">
              <span class="drilldown-box-label">Thesis Direction Rule</span>
              <span class="drilldown-box-value" style="color: ${pair.isRising === true ? "#166534" : "#991b1b"};">${pair.isRising === true ? "Rising (H_t > H_(t-N))" : "Not Rising (H_t <= H_(t-N))"}</span>
              <span class="drilldown-box-note">Evaluated regardless of sign</span>
            </div>
          </div>
        `;
      }
    }
  } else if (isVol === true) {
    const dailyStd = isSpy === true ? (ind.spy && ind.spy.dailyStd) : (ind.dailyStd && ind.dailyStd[ticker]);
    const annVol = isSpy === true ? (ind.spy && ind.spy.annualizedVol) : (ind.annualizedVol && ind.annualizedVol[ticker]);
    const returns = isSpy === true ? (ind.spy && ind.spy.returns) : (ind.returns && ind.returns[ticker]);
    const returnDates = ind.dates || [];

    const hasVolData = typeof dailyStd === "number" && typeof annVol === "number" && Array.isArray(returns) === true;
    if (hasVolData === false) {
      contentHtml = `<p class="table-empty-row">No volatility data computed for ${ticker}.</p>`;
    } else {
      const sqrt252 = Math.sqrt(252);
      const sqrt252Str = String(sqrt252);
      const dailyStdSq = dailyStd * dailyStd;

      const covIdx = Array.isArray(ind.covarianceTickers) === true ? ind.covarianceTickers.indexOf(ticker) : -1;
      const covDiagonal = covIdx >= 0 && Array.isArray(ind.covarianceMatrix) === true && Array.isArray(ind.covarianceMatrix[covIdx]) === true ? ind.covarianceMatrix[covIdx][covIdx] : dailyStdSq;
      const diffVariance = Math.abs(covDiagonal - dailyStdSq);
      const meanReturn = computeSampleMean(returns);

      let returnRows = "";
      for (let i = 0; i < returns.length; i += 1) {
        const sessionNum = i + 1;
        const date = returnDates[i] || `--`;
        const retVal = returns[i];
        const diffFromMean = retVal - meanReturn;
        const sqDiff = diffFromMean * diffFromMean;

        returnRows += `
          <tr>
            <td>${sessionNum}</td>
            <td>${date}</td>
            <td>${retVal}</td>
            <td>${diffFromMean}</td>
            <td>${sqDiff}</td>
          </tr>
        `;
      }

      contentHtml = `
        <div class="drilldown-metrics-summary">
          <div class="drilldown-metric-box">
            <span class="drilldown-box-label">Daily Sample Std Dev (s)</span>
            <span class="drilldown-box-value">${dailyStd}</span>
            <span class="drilldown-box-note">Sample standard deviation with n - 1 degrees of freedom</span>
          </div>
          <div class="drilldown-metric-box">
            <span class="drilldown-box-label">Annualization Factor sqrt(252)</span>
            <span class="drilldown-box-value">${sqrt252Str}</span>
            <span class="drilldown-box-note">Square root of 252 annual trading sessions</span>
          </div>
          <div class="drilldown-metric-box highlight">
            <span class="drilldown-box-label">Annualized Volatility</span>
            <span class="drilldown-box-value" style="color: var(--apple-blue);">${annVol}</span>
            <span class="drilldown-box-note">s * sqrt(252) = ${dailyStd} * ${sqrt252Str}</span>
          </div>
          <div class="drilldown-metric-box">
            <span class="drilldown-box-label">Covariance Matrix Diagonal Entry</span>
            <span class="drilldown-box-value">${covDiagonal}</span>
            <span class="drilldown-box-note">Sample variance Cov(${ticker}, ${ticker})</span>
          </div>
          <div class="drilldown-metric-box">
            <span class="drilldown-box-label">Daily Std Dev Squared (s^2)</span>
            <span class="drilldown-box-value">${dailyStdSq}</span>
            <span class="drilldown-box-note">Matches diagonal entry (difference: ${diffVariance})</span>
          </div>
        </div>

        <div class="drilldown-formula-card">
          <div class="drilldown-formula-step">
            <span style="font-weight: 700; color: var(--apple-blue);">Equality Proof:</span>
            <span>Covariance diagonal entry equals daily standard deviation squared: ${covDiagonal} === ${dailyStdSq}</span>
          </div>
          <div class="drilldown-formula-step">
            <span style="font-weight: 700;">Return Sample Mean:</span>
            <span>${meanReturn} across ${returns.length} sessions (degrees of freedom: ${returns.length - 1})</span>
          </div>
        </div>

        <div class="drilldown-table-wrapper">
          <table>
            <thead>
              <tr>
                <th scope="col">Session</th>
                <th scope="col">Date</th>
                <th scope="col">Daily Simple Return (r_t)</th>
                <th scope="col">Deviation from Mean (r_t - mean)</th>
                <th scope="col">Squared Deviation (r_t - mean)^2</th>
              </tr>
            </thead>
            <tbody>
              ${returnRows}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  return `
    <div class="drilldown-card" id="drilldown-card-${ticker}">
      ${headerHtml}
      ${contentHtml}
    </div>
  `;
}

/**
 * Renders the primary indicator signal table with transparency drill-down (Prompt 8).
 * One row per constituent: Ticker, Sector, RSI, H_t, H_(t-N), Volatility.
 * Excluded tickers for insufficient history are displayed on a greyed row.
 * Every numeric cell is clickable to open an unrounded transparency drill-down directly under the row.
 */
export function renderSignalTable() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }
  const tbody = document.getElementById("signal-table-tbody");
  const statsEl = document.getElementById("signals-table-stats");
  const lagHeaderEl = document.getElementById("col-header-h-lag");

  const lookback = typeof appState.settings.histogramLookback === "number" ? appState.settings.histogramLookback : 3;
  if (lagHeaderEl !== null) {
    lagHeaderEl.textContent = `H_(t-${lookback})`;
  }

  if (tbody === null) {
    return;
  }

  const ind = appState.indicatorSeries;
  const hasData = ind !== null && typeof ind === "object" && Array.isArray(ind.tickers) === true && ind.tickers.length > 0;
  if (hasData === false) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty-row">Run the pipeline from Stage 1 to generate indicator signals and unrounded transparency drill-downs.</td></tr>`;
    if (statsEl !== null) {
      statsEl.textContent = "";
    }
    return;
  }

  const universe = appState.universe || DEFAULT_UNIVERSE;
  const sectorMap = new Map();
  for (let i = 0; i < universe.length; i += 1) {
    sectorMap.set(universe[i].ticker, universe[i].sector);
  }

  const selectedConstituents = (appState.selectedTickers || []).filter((t) => t !== "SPY");
  const constituentList = selectedConstituents.length > 0 ? selectedConstituents : ind.tickers;

  let html = "";
  let validSignalsCount = 0;
  let insufficientCount = 0;

  for (let i = 0; i < constituentList.length; i += 1) {
    const ticker = constituentList[i];
    const sector = sectorMap.get(ticker) || "Equity";

    const isAligned = ind.tickers.includes(ticker);
    const priceStatusObj = appState.priceStatus[ticker];
    const isStage2Insufficient = priceStatusObj !== undefined && priceStatusObj.status === "insufficient";

    const rsiData = (ind.rsi && ind.rsi[ticker]) || (ind.perTicker && ind.perTicker[ticker] && ind.perTicker[ticker].rsi);
    const macdData = (ind.macd && ind.macd[ticker]) || (ind.perTicker && ind.perTicker[ticker] && ind.perTicker[ticker].macd);

    const isRsiInsufficient = rsiData === undefined || rsiData === null || rsiData.insufficientHistory === true;
    const isMacdInsufficient = macdData === undefined || macdData === null || macdData.insufficientHistory === true;

    const rowHasSufficientHistory = isAligned === true && isStage2Insufficient === false && isRsiInsufficient === false && isMacdInsufficient === false;

    if (rowHasSufficientHistory === true) {
      validSignalsCount += 1;
      const rsiVal = rsiData.currentRsi;
      const htVal = macdData.currentHistogram;
      const pair = histogramPair(macdData, lookback);
      const annVol = ind.annualizedVol[ticker];

      const rsiDisplay = typeof rsiVal === "number" ? rsiVal.toFixed(2) : "--";
      const htDisplay = typeof htVal === "number" ? (htVal >= 0 ? "+" + htVal.toFixed(4) : htVal.toFixed(4)) : "--";
      const pairSufficient = pair.insufficientHistory === false;
      const htLagDisplay = pairSufficient === true ? (pair.lagged >= 0 ? "+" + pair.lagged.toFixed(4) : pair.lagged.toFixed(4)) : "insufficient history";
      const volDisplay = typeof annVol === "number" ? (annVol * 100).toFixed(2) + "%" : "--";

      const isRsiActive = activeSignalDrilldown.ticker === ticker && activeSignalDrilldown.metric === "rsi";
      const isHtActive = activeSignalDrilldown.ticker === ticker && activeSignalDrilldown.metric === "hist_current";
      const isHtLagActive = activeSignalDrilldown.ticker === ticker && activeSignalDrilldown.metric === "hist_lagged";
      const isVolActive = activeSignalDrilldown.ticker === ticker && activeSignalDrilldown.metric === "volatility";

      const htClass = typeof htVal === "number" && htVal >= 0 ? "metric-positive" : "metric-negative";
      const htLagClass = pairSufficient === true && pair.lagged >= 0 ? "metric-positive" : "metric-negative";

      html += `
        <tr id="signal-row-${ticker}">
          <td>
            <div class="ticker-cell-group">
              <span class="ticker-code">${ticker}</span>
            </div>
          </td>
          <td><span class="sector-text">${sector}</span></td>
          <td>
            <button type="button" class="signal-metric-btn btn-drilldown ${isRsiActive === true ? "active" : ""}" data-ticker="${ticker}" data-metric="rsi" title="Click to inspect raw unrounded RSI recursion">
              ${rsiDisplay}
            </button>
          </td>
          <td>
            <button type="button" class="signal-metric-btn btn-drilldown ${htClass} ${isHtActive === true ? "active" : ""}" data-ticker="${ticker}" data-metric="hist_current" title="Click to inspect raw unrounded H_t inputs">
              ${htDisplay}
            </button>
          </td>
          <td>
            ${pairSufficient === true ? `
              <button type="button" class="signal-metric-btn btn-drilldown ${htLagClass} ${isHtLagActive === true ? "active" : ""}" data-ticker="${ticker}" data-metric="hist_lagged" title="Click to inspect raw unrounded H_(t-${lookback}) inputs">
                ${htLagDisplay}
              </button>
            ` : `<span class="badge-insufficient">insufficient history</span>`}
          </td>
          <td>
            <button type="button" class="signal-metric-btn btn-drilldown ${isVolActive === true ? "active" : ""}" data-ticker="${ticker}" data-metric="volatility" title="Click to inspect raw unrounded volatility and covariance diagonal">
              ${volDisplay}
            </button>
          </td>
        </tr>
      `;

      const isRowDrilldownActive = activeSignalDrilldown.ticker === ticker;
      if (isRowDrilldownActive === true) {
        html += `
          <tr class="signal-drilldown-row" id="drilldown-row-${ticker}">
            <td colspan="6" class="drilldown-cell-wrapper">
              ${renderSignalDrilldownHtml(ticker, activeSignalDrilldown.metric)}
            </td>
          </tr>
        `;
      }
    } else {
      insufficientCount += 1;
      const reason = isStage2Insufficient === true ? "insufficient history (< 200 sessions in alignment)" : "insufficient history";
      html += `
        <tr class="row-insufficient-history" id="signal-row-${ticker}">
          <td>
            <div class="ticker-cell-group">
              <span class="ticker-code">${ticker}</span>
            </div>
          </td>
          <td><span class="sector-text">${sector}</span></td>
          <td colspan="4">
            <span class="badge-insufficient">${reason}</span>
          </td>
        </tr>
      `;
    }
  }

  // Benchmark SPY row
  const hasSpy = ind.spy !== null && ind.spy !== undefined;
  if (hasSpy === true) {
    const spyRsi = ind.spy.rsi;
    const spyMacd = ind.spy.macd;
    const spyVol = ind.spy.annualizedVol;

    const isSpyRsiInsufficient = spyRsi === undefined || spyRsi === null || spyRsi.insufficientHistory === true;
    const isSpyMacdInsufficient = spyMacd === undefined || spyMacd === null || spyMacd.insufficientHistory === true;
    const spyHasSufficientHistory = isSpyRsiInsufficient === false && isSpyMacdInsufficient === false;

    if (spyHasSufficientHistory === true) {
      const spyRsiVal = spyRsi.currentRsi;
      const spyHtVal = spyMacd.currentHistogram;
      const spyPair = histogramPair(spyMacd, lookback);

      const spyRsiDisplay = typeof spyRsiVal === "number" ? spyRsiVal.toFixed(2) : "--";
      const spyHtDisplay = typeof spyHtVal === "number" ? (spyHtVal >= 0 ? "+" + spyHtVal.toFixed(4) : spyHtVal.toFixed(4)) : "--";
      const spyPairSufficient = spyPair.insufficientHistory === false;
      const spyHtLagDisplay = spyPairSufficient === true ? (spyPair.lagged >= 0 ? "+" + spyPair.lagged.toFixed(4) : spyPair.lagged.toFixed(4)) : "insufficient history";
      const spyVolDisplay = typeof spyVol === "number" ? (spyVol * 100).toFixed(2) + "%" : "--";

      const isSpyRsiActive = activeSignalDrilldown.ticker === "SPY" && activeSignalDrilldown.metric === "rsi";
      const isSpyHtActive = activeSignalDrilldown.ticker === "SPY" && activeSignalDrilldown.metric === "hist_current";
      const isSpyHtLagActive = activeSignalDrilldown.ticker === "SPY" && activeSignalDrilldown.metric === "hist_lagged";
      const isSpyVolActive = activeSignalDrilldown.ticker === "SPY" && activeSignalDrilldown.metric === "volatility";

      const spyHtClass = typeof spyHtVal === "number" && spyHtVal >= 0 ? "metric-positive" : "metric-negative";
      const spyHtLagClass = spyPairSufficient === true && spyPair.lagged >= 0 ? "metric-positive" : "metric-negative";

      html += `
        <tr class="benchmark-row" id="signal-row-SPY" style="border-top: 2px solid var(--apple-border); background-color: #f8fafc;">
          <td>
            <div class="ticker-cell-group">
              <span class="ticker-code">SPY</span>
              <span class="ticker-name" style="color: var(--apple-blue); font-weight: 600;">Benchmark</span>
            </div>
          </td>
          <td><span class="sector-text">S&P 500 Benchmark</span></td>
          <td>
            <button type="button" class="signal-metric-btn btn-drilldown ${isSpyRsiActive === true ? "active" : ""}" data-ticker="SPY" data-metric="rsi" title="Click to inspect raw unrounded SPY RSI recursion">
              ${spyRsiDisplay}
            </button>
          </td>
          <td>
            <button type="button" class="signal-metric-btn btn-drilldown ${spyHtClass} ${isSpyHtActive === true ? "active" : ""}" data-ticker="SPY" data-metric="hist_current" title="Click to inspect raw unrounded SPY H_t inputs">
              ${spyHtDisplay}
            </button>
          </td>
          <td>
            ${spyPairSufficient === true ? `
              <button type="button" class="signal-metric-btn btn-drilldown ${spyHtLagClass} ${isSpyHtLagActive === true ? "active" : ""}" data-ticker="SPY" data-metric="hist_lagged" title="Click to inspect raw unrounded SPY H_(t-${lookback}) inputs">
                ${spyHtLagDisplay}
              </button>
            ` : `<span class="badge-insufficient">insufficient history</span>`}
          </td>
          <td>
            <button type="button" class="signal-metric-btn btn-drilldown ${isSpyVolActive === true ? "active" : ""}" data-ticker="SPY" data-metric="volatility" title="Click to inspect raw unrounded SPY volatility">
              ${spyVolDisplay}
            </button>
          </td>
        </tr>
      `;

      const isSpyDrilldownActive = activeSignalDrilldown.ticker === "SPY";
      if (isSpyDrilldownActive === true) {
        html += `
          <tr class="signal-drilldown-row" id="drilldown-row-SPY">
            <td colspan="6" class="drilldown-cell-wrapper">
              ${renderSignalDrilldownHtml("SPY", activeSignalDrilldown.metric)}
            </td>
          </tr>
        `;
      }
    }
  }

  tbody.innerHTML = html;

  if (statsEl !== null) {
    statsEl.textContent = `${validSignalsCount} active constituents • ${insufficientCount} excluded (insufficient history) • Lookback N = ${lookback}`;
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

    // RSI(14) data
    const rsiData = (ind.rsi && ind.rsi[ticker]) || (ind.perTicker && ind.perTicker[ticker] && ind.perTicker[ticker].rsi);
    let rsiCellHtml = "--";

    if (rsiData !== null && rsiData !== undefined) {
      const isInsufficient = rsiData.insufficientHistory === true;
      if (isInsufficient === true) {
        rsiCellHtml = `<span class="badge-insufficient">insufficient history</span>`;
      } else {
        const rsiVal = rsiData.currentRsi;
        const isNum = typeof rsiVal === "number" && isNaN(rsiVal) === false;
        if (isNum === true) {
          const isOversold = rsiVal < 30;
          const isOverbought = rsiVal > 70;
          let badgeHtml = "";
          if (isOversold === true) {
            badgeHtml = `<span class="badge-rsi-oversold">Oversold</span>`;
          } else if (isOverbought === true) {
            badgeHtml = `<span class="badge-rsi-overbought">Overbought</span>`;
          }
          rsiCellHtml = `<span class="price-mono" style="font-weight: 700; color: var(--apple-text-primary);">${rsiVal.toFixed(2)}</span>${badgeHtml}`;
        }
      }
    }

    // MACD(12,26,9) data
    const macdData = (ind.macd && ind.macd[ticker]) || (ind.perTicker && ind.perTicker[ticker] && ind.perTicker[ticker].macd);
    let macdCellHtml = "--";
    let signalCellHtml = "--";
    let histCellHtml = "--";

    if (macdData !== null && macdData !== undefined) {
      const isInsufficient = macdData.insufficientHistory === true;
      if (isInsufficient === true) {
        macdCellHtml = `<span class="badge-insufficient">insufficient history</span>`;
        signalCellHtml = "--";
        histCellHtml = "--";
      } else {
        const mVal = macdData.currentMacd;
        const sVal = macdData.currentSignal;
        const hVal = macdData.currentHistogram;
        const hasNumbers = typeof mVal === "number" && typeof sVal === "number" && typeof hVal === "number";
        if (hasNumbers === true) {
          macdCellHtml = `<span class="price-mono">${mVal >= 0 ? "+" + mVal.toFixed(4) : mVal.toFixed(4)}</span>`;
          signalCellHtml = `<span class="price-mono">${sVal >= 0 ? "+" + sVal.toFixed(4) : sVal.toFixed(4)}</span>`;
          histCellHtml = `<span class="price-mono" style="font-weight: 700; color: var(--apple-text-primary);">${hVal >= 0 ? "+" + hVal.toFixed(4) : hVal.toFixed(4)}</span>`;
        }
      }
    }

    const auditBtnHtml = `
      <div class="btn-group-audit">
        <button type="button" class="btn-inspect-rsi" data-ticker="${ticker}">RSI</button>
        <button type="button" class="btn-inspect-macd" data-ticker="${ticker}">MACD</button>
      </div>
    `;

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
        <td>${rsiCellHtml}</td>
        <td>${macdCellHtml}</td>
        <td>${signalCellHtml}</td>
        <td>${histCellHtml}</td>
        <td>${auditBtnHtml}</td>
      </tr>
    `;
  }

  // Also include SPY if available
  if (ind.spy !== null && ind.spy !== undefined && ind.spy.returns !== undefined) {
    const spyReturns = ind.spy.returns;
    const spyStd = ind.spy.dailyStd;
    const spyAnnVol = ind.spy.annualizedVol;
    const spyVar = spyStd * spyStd;

    const spyRsi = (ind.spy && ind.spy.rsi) || (ind.rsi && ind.rsi["SPY"]);
    let spyRsiCellHtml = "--";
    if (spyRsi !== null && spyRsi !== undefined) {
      const isInsufficient = spyRsi.insufficientHistory === true;
      if (isInsufficient === true) {
        spyRsiCellHtml = `<span class="badge-insufficient">insufficient history</span>`;
      } else {
        const spyVal = spyRsi.currentRsi;
        const isNum = typeof spyVal === "number" && isNaN(spyVal) === false;
        if (isNum === true) {
          spyRsiCellHtml = `<span class="price-mono" style="font-weight: 700; color: var(--apple-blue);">${spyVal.toFixed(2)}</span>`;
        }
      }
    }

    const spyMacd = (ind.spy && ind.spy.macd) || (ind.macd && ind.macd["SPY"]);
    let spyMacdCellHtml = "--";
    let spySignalCellHtml = "--";
    let spyHistCellHtml = "--";
    if (spyMacd !== null && spyMacd !== undefined) {
      const isInsufficient = spyMacd.insufficientHistory === true;
      if (isInsufficient === true) {
        spyMacdCellHtml = `<span class="badge-insufficient">insufficient history</span>`;
        spySignalCellHtml = "--";
        spyHistCellHtml = "--";
      } else {
        const mVal = spyMacd.currentMacd;
        const sVal = spyMacd.currentSignal;
        const hVal = spyMacd.currentHistogram;
        const hasNumbers = typeof mVal === "number" && typeof sVal === "number" && typeof hVal === "number";
        if (hasNumbers === true) {
          spyMacdCellHtml = `<span class="price-mono">${mVal >= 0 ? "+" + mVal.toFixed(4) : mVal.toFixed(4)}</span>`;
          spySignalCellHtml = `<span class="price-mono">${sVal >= 0 ? "+" + sVal.toFixed(4) : sVal.toFixed(4)}</span>`;
          spyHistCellHtml = `<span class="price-mono" style="font-weight: 700; color: var(--apple-blue);">${hVal >= 0 ? "+" + hVal.toFixed(4) : hVal.toFixed(4)}</span>`;
        }
      }
    }

    const spyAuditBtnHtml = `
      <div class="btn-group-audit">
        <button type="button" class="btn-inspect-rsi" data-ticker="SPY">RSI</button>
        <button type="button" class="btn-inspect-macd" data-ticker="SPY">MACD</button>
      </div>
    `;

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
        <td>${spyRsiCellHtml}</td>
        <td>${spyMacdCellHtml}</td>
        <td>${spySignalCellHtml}</td>
        <td>${spyHistCellHtml}</td>
        <td>${spyAuditBtnHtml}</td>
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

let currentRsiSelectedTicker = null;

/**
 * Renders the RSI(14) inspection panel and full Wilder smoothing recursion audit table.
 *
 * @param {string} [targetTicker]
 */
export function renderRsiPanelUI(targetTicker) {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  const ind = appState.indicatorSeries;
  const aligned = appState.alignedData;
  const selectEl = document.getElementById("rsi-ticker-select");
  const quickEl = document.getElementById("rsi-quick-tickers");
  const statsEl = document.getElementById("rsi-table-stats");
  const tbodyEl = document.getElementById("rsi-recursion-tbody");

  const cardTickerEl = document.getElementById("rsi-card-ticker");
  const cardCurrentEl = document.getElementById("rsi-card-current");
  const cardSeedGainEl = document.getElementById("rsi-card-seed-gain");
  const cardSeedLossEl = document.getElementById("rsi-card-seed-loss");
  const cardSeedRsiEl = document.getElementById("rsi-card-seed-rsi");
  const cardFinalGainEl = document.getElementById("rsi-card-final-gain");
  const cardFinalLossEl = document.getElementById("rsi-card-final-loss");
  const cardClosesEl = document.getElementById("rsi-card-closes-count");

  const hasInd = ind !== null && typeof ind === "object";
  const hasAligned = aligned !== null && typeof aligned === "object";
  const hasData = hasInd === true && hasAligned === true && Array.isArray(ind.tickers) === true && ind.tickers.length > 0;

  if (hasData === false) {
    if (selectEl !== null) {
      selectEl.innerHTML = `<option value="">Run Stage 1 to calculate indicators</option>`;
    }
    if (quickEl !== null) {
      quickEl.innerHTML = "";
    }
    if (statsEl !== null) {
      statsEl.textContent = "";
    }
    if (tbodyEl !== null) {
      tbodyEl.innerHTML = `<tr><td colspan="10" class="table-empty-row">Run the pipeline from Stage 1 to view RSI recursion series.</td></tr>`;
    }
    if (cardTickerEl !== null) {
      cardTickerEl.textContent = "--";
    }
    if (cardCurrentEl !== null) {
      cardCurrentEl.textContent = "--";
    }
    if (cardSeedGainEl !== null) {
      cardSeedGainEl.textContent = "--";
    }
    if (cardSeedLossEl !== null) {
      cardSeedLossEl.textContent = "--";
    }
    if (cardSeedRsiEl !== null) {
      cardSeedRsiEl.textContent = "--";
    }
    if (cardFinalGainEl !== null) {
      cardFinalGainEl.textContent = "--";
    }
    if (cardFinalLossEl !== null) {
      cardFinalLossEl.textContent = "--";
    }
    if (cardClosesEl !== null) {
      cardClosesEl.textContent = "--";
    }
    return;
  }

  const availableTickers = [...ind.tickers];
  const hasSpy = ind.spy !== null && ind.spy !== undefined;
  if (hasSpy === true) {
    availableTickers.push("SPY");
  }

  let activeTicker = targetTicker;
  const isTargetValid = typeof activeTicker === "string" && availableTickers.includes(activeTicker);
  if (isTargetValid === false) {
    const isCurrentValid = currentRsiSelectedTicker !== null && availableTickers.includes(currentRsiSelectedTicker);
    if (isCurrentValid === true) {
      activeTicker = currentRsiSelectedTicker;
    } else {
      activeTicker = availableTickers[0];
    }
  }
  currentRsiSelectedTicker = activeTicker;

  // Update select dropdown
  if (selectEl !== null) {
    let opts = "";
    for (let i = 0; i < availableTickers.length; i += 1) {
      const t = availableTickers[i];
      const isSelected = t === activeTicker;
      const isSpyTicker = t === "SPY";
      const rsiObj = isSpyTicker === true ? (ind.spy && ind.spy.rsi) : (ind.rsi && ind.rsi[t]);
      let rsiStr = "--";
      if (rsiObj !== null && rsiObj !== undefined) {
        const isNotInsufficient = rsiObj.insufficientHistory === false;
        const hasRsiVal = rsiObj.currentRsi !== null && rsiObj.currentRsi !== undefined;
        if (isNotInsufficient === true && hasRsiVal === true) {
          rsiStr = rsiObj.currentRsi.toFixed(2);
        }
      }
      opts += `<option value="${t}" ${isSelected ? "selected" : ""}>${t} (RSI: ${rsiStr})</option>`;
    }
    selectEl.innerHTML = opts;
  }

  // Update quick buttons
  if (quickEl !== null) {
    let quickHtml = `<span style="font-weight: 600; color: var(--apple-text-secondary); margin-right: 4px;">Quick Select:</span>`;
    for (let i = 0; i < availableTickers.length; i += 1) {
      const t = availableTickers[i];
      const isSelected = t === activeTicker;
      quickHtml += `<button type="button" class="btn-quick-ticker ${isSelected ? "active" : ""}" data-ticker="${t}">${t}</button>`;
    }
    quickEl.innerHTML = quickHtml;
  }

  // Retrieve closes, dates, and rsi object for activeTicker
  let closes = [];
  let dates = [];
  let rsiObj = null;

  const isActiveSpy = activeTicker === "SPY";
  if (isActiveSpy === true) {
    const hasSpyPrices = aligned.spy !== null && aligned.spy !== undefined && Array.isArray(aligned.spy.prices) === true;
    closes = hasSpyPrices === true ? aligned.spy.prices : [];
    const hasSpyDates = aligned.spy !== null && aligned.spy !== undefined && Array.isArray(aligned.spy.dates) === true;
    dates = hasSpyDates === true ? aligned.spy.dates : [];
    rsiObj = ind.spy && ind.spy.rsi;
  } else {
    closes = aligned.prices[activeTicker] || [];
    dates = aligned.dates || [];
    rsiObj = ind.rsi && ind.rsi[activeTicker];
  }

  if (statsEl !== null) {
    statsEl.textContent = `${activeTicker}: ${closes.length} closes evaluated`;
  }

  if (cardTickerEl !== null) {
    cardTickerEl.textContent = activeTicker;
  }

  const isRsiNull = rsiObj === null || rsiObj === undefined;
  const isInsufficient = isRsiNull === true || rsiObj.insufficientHistory === true;

  if (isInsufficient === true) {
    if (cardCurrentEl !== null) {
      cardCurrentEl.innerHTML = `<span class="badge-insufficient">insufficient history</span>`;
    }
    if (cardSeedGainEl !== null) {
      cardSeedGainEl.textContent = "--";
    }
    if (cardSeedLossEl !== null) {
      cardSeedLossEl.textContent = "--";
    }
    if (cardSeedRsiEl !== null) {
      cardSeedRsiEl.textContent = "--";
    }
    if (cardFinalGainEl !== null) {
      cardFinalGainEl.textContent = "--";
    }
    if (cardFinalLossEl !== null) {
      cardFinalLossEl.textContent = "--";
    }
    if (cardClosesEl !== null) {
      cardClosesEl.textContent = `${closes.length} closes (< 15 required)`;
    }

    if (tbodyEl !== null) {
      tbodyEl.innerHTML = `<tr><td colspan="10" class="table-empty-row">Insufficient history for ${activeTicker}: ${closes.length} closes found, but Wilder RSI(14) requires at least 15 closes.</td></tr>`;
    }
    return;
  }

  // Valid RSI data
  const currentRsi = rsiObj.currentRsi;
  if (cardCurrentEl !== null) {
    let badgeHtml = "";
    const isOversold = currentRsi < 30;
    const isOverbought = currentRsi > 70;
    if (isOversold === true) {
      badgeHtml = `<span class="badge-rsi-oversold">Oversold</span>`;
    } else if (isOverbought === true) {
      badgeHtml = `<span class="badge-rsi-overbought">Overbought</span>`;
    } else {
      badgeHtml = `<span class="badge-rsi-neutral">Neutral</span>`;
    }
    cardCurrentEl.innerHTML = `<span class="price-mono" style="font-weight: 700;">${currentRsi.toFixed(2)}</span> ${badgeHtml}`;
  }

  if (cardSeedGainEl !== null) {
    const hasSeedGain = rsiObj.seedAvgGain !== null && rsiObj.seedAvgGain !== undefined;
    cardSeedGainEl.textContent = hasSeedGain === true ? rsiObj.seedAvgGain.toFixed(6) : "--";
  }
  if (cardSeedLossEl !== null) {
    const hasSeedLoss = rsiObj.seedAvgLoss !== null && rsiObj.seedAvgLoss !== undefined;
    cardSeedLossEl.textContent = hasSeedLoss === true ? rsiObj.seedAvgLoss.toFixed(6) : "--";
  }
  if (cardSeedRsiEl !== null) {
    const hasSeedRsi = rsiObj.rsiSeries.length > 0;
    cardSeedRsiEl.textContent = hasSeedRsi === true ? rsiObj.rsiSeries[0].toFixed(2) : "--";
  }
  if (cardFinalGainEl !== null) {
    const hasFinalGain = rsiObj.finalAvgGain !== null && rsiObj.finalAvgGain !== undefined;
    cardFinalGainEl.textContent = hasFinalGain === true ? rsiObj.finalAvgGain.toFixed(6) : "--";
  }
  if (cardFinalLossEl !== null) {
    const hasFinalLoss = rsiObj.finalAvgLoss !== null && rsiObj.finalAvgLoss !== undefined;
    cardFinalLossEl.textContent = hasFinalLoss === true ? rsiObj.finalAvgLoss.toFixed(6) : "--";
  }
  if (cardClosesEl !== null) {
    cardClosesEl.textContent = `${closes.length} closes (${rsiObj.rsiSeries.length} RSI sessions)`;
  }

  // Render the step-by-step table
  if (tbodyEl !== null) {
    let rowsHtml = "";
    const runningGains = rsiObj.runningAvgGains;
    const runningLosses = rsiObj.runningAvgLosses;
    const rsiSeries = rsiObj.rsiSeries;

    for (let i = 0; i < closes.length; i += 1) {
      const sessionNum = i + 1;
      const dateStr = dates[i] || `Session ${sessionNum}`;
      const closeVal = closes[i];
      const isFirstClose = i === 0;
      const isSeedAccumulation = i >= 1 && i < 14;
      const isSeedSession = i === 14;

      if (isFirstClose === true) {
        // Session 1: Baseline close, no prior session for change
        rowsHtml += `
          <tr class="seed-window">
            <td><span class="price-mono">${sessionNum}</span></td>
            <td><span class="date-mono">${dateStr}</span></td>
            <td><span class="price-mono">${closeVal.toFixed(2)}</span></td>
            <td><span class="price-mono" style="color: var(--apple-text-secondary);">--</span></td>
            <td><span class="price-mono" style="color: var(--apple-text-secondary);">--</span></td>
            <td><span class="price-mono" style="color: var(--apple-text-secondary);">--</span></td>
            <td><span class="price-mono" style="color: var(--apple-text-secondary);">--</span></td>
            <td><span class="price-mono" style="color: var(--apple-text-secondary);">--</span></td>
            <td><span class="price-mono" style="color: var(--apple-text-secondary);">--</span></td>
            <td><span class="price-mono" style="color: var(--apple-text-secondary); font-size: 11px;">Baseline</span></td>
          </tr>
        `;
      } else if (isSeedAccumulation === true) {
        // Sessions 2 to 14: Accumulating first 14 changes for seed
        const prevClose = closes[i - 1];
        const change = closeVal - prevClose;
        const isPos = change > 0;
        const isNeg = change < 0;
        const gain = isPos === true ? change : 0;
        const loss = isNeg === true ? -change : 0;
        const changeStr = change >= 0 ? "+" + change.toFixed(2) : change.toFixed(2);

        rowsHtml += `
          <tr class="seed-window">
            <td><span class="price-mono">${sessionNum}</span></td>
            <td><span class="date-mono">${dateStr}</span></td>
            <td><span class="price-mono">${closeVal.toFixed(2)}</span></td>
            <td><span class="price-mono">${changeStr}</span></td>
            <td><span class="price-mono">${gain.toFixed(2)}</span></td>
            <td><span class="price-mono">${loss.toFixed(2)}</span></td>
            <td><span class="price-mono" style="color: var(--apple-text-secondary);">--</span></td>
            <td><span class="price-mono" style="color: var(--apple-text-secondary);">--</span></td>
            <td><span class="price-mono" style="color: var(--apple-text-secondary);">--</span></td>
            <td><span class="price-mono" style="color: var(--apple-text-secondary); font-size: 11px;">Seed Window (${i}/14)</span></td>
          </tr>
        `;
      } else if (isSeedSession === true) {
        // Session 15 (index 14): Seed initialized!
        const prevClose = closes[i - 1];
        const change = closeVal - prevClose;
        const isPos = change > 0;
        const isNeg = change < 0;
        const gain = isPos === true ? change : 0;
        const loss = isNeg === true ? -change : 0;
        const seedGain = runningGains[0];
        const seedLoss = runningLosses[0];
        const isLossZero = seedLoss === 0;
        const seedRs = isLossZero === true ? "Inf" : (seedGain / seedLoss).toFixed(4);
        const rsiVal = rsiSeries[0];
        const changeStr = change >= 0 ? "+" + change.toFixed(2) : change.toFixed(2);

        rowsHtml += `
          <tr class="seed-init">
            <td><span class="price-mono" style="font-weight: 700;">${sessionNum}</span></td>
            <td><span class="date-mono" style="font-weight: 600;">${dateStr}</span></td>
            <td><span class="price-mono">${closeVal.toFixed(2)}</span></td>
            <td><span class="price-mono">${changeStr}</span></td>
            <td><span class="price-mono">${gain.toFixed(2)}</span></td>
            <td><span class="price-mono">${loss.toFixed(2)}</span></td>
            <td><span class="price-mono" style="font-weight: 700; color: var(--apple-blue);">${seedGain.toFixed(6)}</span></td>
            <td><span class="price-mono" style="font-weight: 700; color: var(--apple-blue);">${seedLoss.toFixed(6)}</span></td>
            <td><span class="price-mono">${seedRs}</span></td>
            <td><span class="price-mono" style="font-weight: 700; color: var(--apple-blue);">${rsiVal.toFixed(2)} (Seed)</span></td>
          </tr>
        `;
      } else {
        // Sessions 16 onward: Wilder smoothing recursion
        const prevClose = closes[i - 1];
        const change = closeVal - prevClose;
        const isPos = change > 0;
        const isNeg = change < 0;
        const gain = isPos === true ? change : 0;
        const loss = isNeg === true ? -change : 0;
        const seriesIdx = i - 14;
        const curGain = runningGains[seriesIdx];
        const curLoss = runningLosses[seriesIdx];
        const isLossZero = curLoss === 0;
        const curRs = isLossZero === true ? "Inf" : (curGain / curLoss).toFixed(4);
        const curRsi = rsiSeries[seriesIdx];
        const changeStr = change >= 0 ? "+" + change.toFixed(2) : change.toFixed(2);

        rowsHtml += `
          <tr>
            <td><span class="price-mono">${sessionNum}</span></td>
            <td><span class="date-mono">${dateStr}</span></td>
            <td><span class="price-mono">${closeVal.toFixed(2)}</span></td>
            <td><span class="price-mono">${changeStr}</span></td>
            <td><span class="price-mono">${gain.toFixed(2)}</span></td>
            <td><span class="price-mono">${loss.toFixed(2)}</span></td>
            <td><span class="price-mono">${curGain.toFixed(6)}</span></td>
            <td><span class="price-mono">${curLoss.toFixed(6)}</span></td>
            <td><span class="price-mono">${curRs}</span></td>
            <td><span class="price-mono" style="font-weight: 600; color: var(--apple-text-primary);">${curRsi.toFixed(2)}</span></td>
          </tr>
        `;
      }
    }

    tbodyEl.innerHTML = rowsHtml;
  }
}

let currentMacdSelectedTicker = null;

/**
 * Renders the MACD line, signal line, and histogram inspection panel.
 * Displays current values, lagged pair comparison H_t and H_(t-N),
 * and session-by-session recursion records.
 *
 * @param {string} [targetTicker] - Ticker symbol to inspect.
 */
export function renderMacdPanelUI(targetTicker) {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  const ind = appState.indicatorSeries;
  const aligned = appState.alignedData;
  const selectEl = document.getElementById("macd-ticker-select");
  const quickEl = document.getElementById("macd-quick-tickers");
  const statsEl = document.getElementById("macd-table-stats");
  const tbodyEl = document.getElementById("macd-records-tbody");

  const cardTickerEl = document.getElementById("macd-card-ticker");
  const cardClosesEl = document.getElementById("macd-card-closes-count");
  const cardMacdEl = document.getElementById("macd-card-macd");
  const cardSignalEl = document.getElementById("macd-card-signal");
  const cardHistEl = document.getElementById("macd-card-hist");
  const cardPairEl = document.getElementById("macd-card-pair");
  const cardPairSubEl = document.getElementById("macd-card-pair-sub");

  const hasInd = ind !== null && typeof ind === "object";
  const hasAligned = aligned !== null && typeof aligned === "object";
  const hasData = hasInd === true && hasAligned === true && Array.isArray(ind.tickers) === true && ind.tickers.length > 0;

  if (hasData === false) {
    if (selectEl !== null) {
      selectEl.innerHTML = `<option value="">Run Stage 1 to calculate indicators</option>`;
    }
    if (quickEl !== null) {
      quickEl.innerHTML = "";
    }
    if (statsEl !== null) {
      statsEl.textContent = "";
    }
    if (tbodyEl !== null) {
      tbodyEl.innerHTML = `<tr><td colspan="9" class="table-empty-row">Run the pipeline from Stage 1 to view MACD and histogram series.</td></tr>`;
    }
    if (cardTickerEl !== null) {
      cardTickerEl.textContent = "--";
    }
    if (cardClosesEl !== null) {
      cardClosesEl.textContent = "-- closes";
    }
    if (cardMacdEl !== null) {
      cardMacdEl.textContent = "--";
    }
    if (cardSignalEl !== null) {
      cardSignalEl.textContent = "--";
    }
    if (cardHistEl !== null) {
      cardHistEl.textContent = "--";
    }
    if (cardPairEl !== null) {
      cardPairEl.textContent = "--";
    }
    if (cardPairSubEl !== null) {
      cardPairSubEl.textContent = "histogramPair (N = 3)";
    }
    return;
  }

  const availableTickers = [...ind.tickers];
  const hasSpy = ind.spy !== null && ind.spy !== undefined;
  if (hasSpy === true) {
    availableTickers.push("SPY");
  }

  let activeTicker = targetTicker;
  const isTargetValid = typeof activeTicker === "string" && availableTickers.includes(activeTicker);
  if (isTargetValid === false) {
    const isCurrentValid = currentMacdSelectedTicker !== null && availableTickers.includes(currentMacdSelectedTicker);
    if (isCurrentValid === true) {
      activeTicker = currentMacdSelectedTicker;
    } else {
      activeTicker = availableTickers[0];
    }
  }
  currentMacdSelectedTicker = activeTicker;

  // Update select dropdown
  if (selectEl !== null) {
    let opts = "";
    for (let i = 0; i < availableTickers.length; i += 1) {
      const t = availableTickers[i];
      const isSelected = t === activeTicker;
      const isSpyTicker = t === "SPY";
      const macdObj = isSpyTicker === true ? (ind.spy && ind.spy.macd) : (ind.macd && ind.macd[t]);
      let histStr = "--";
      if (macdObj !== null && macdObj !== undefined) {
        const isNotInsufficient = macdObj.insufficientHistory === false;
        const hasHistVal = macdObj.currentHistogram !== null && macdObj.currentHistogram !== undefined;
        if (isNotInsufficient === true && hasHistVal === true) {
          histStr = `${macdObj.currentHistogram >= 0 ? "+" : ""}${macdObj.currentHistogram.toFixed(4)}`;
        }
      }
      opts += `<option value="${t}" ${isSelected === true ? "selected" : ""}>${t} (Hist: ${histStr})</option>`;
    }
    selectEl.innerHTML = opts;
  }

  // Update quick buttons
  if (quickEl !== null) {
    let btnsHtml = "";
    for (let i = 0; i < availableTickers.length; i += 1) {
      const t = availableTickers[i];
      const isActive = t === activeTicker;
      btnsHtml += `<button type="button" class="btn-quick-ticker ${isActive === true ? "active" : ""}" data-macd-ticker="${t}">${t}</button>`;
    }
    quickEl.innerHTML = btnsHtml;
  }

  const isSpy = activeTicker === "SPY";
  const closes = isSpy === true ? aligned.spy.prices : aligned.prices[activeTicker];
  const dates = isSpy === true ? aligned.spy.dates : aligned.dates;
  const macdObj = isSpy === true ? (ind.spy && ind.spy.macd) : (ind.macd && ind.macd[activeTicker]);

  const hasCloses = Array.isArray(closes) === true && closes.length > 0;
  if (hasCloses === false || macdObj === null || macdObj === undefined) {
    if (tbodyEl !== null) {
      tbodyEl.innerHTML = `<tr><td colspan="9" class="table-empty-row">No MACD data available for ${activeTicker}.</td></tr>`;
    }
    return;
  }

  if (statsEl !== null) {
    statsEl.textContent = `Displaying ${activeTicker} | ${closes.length} sessions`;
  }

  const lookback = appState.settings !== null && typeof appState.settings.histogramLookback === "number" ? appState.settings.histogramLookback : 3;

  const isInsufficient = macdObj.insufficientHistory === true;
  if (isInsufficient === true) {
    if (cardTickerEl !== null) {
      cardTickerEl.textContent = activeTicker;
    }
    if (cardClosesEl !== null) {
      cardClosesEl.textContent = `${closes.length} closes (min 34 required)`;
    }
    if (cardMacdEl !== null) {
      cardMacdEl.textContent = "insufficient history";
    }
    if (cardSignalEl !== null) {
      cardSignalEl.textContent = "--";
    }
    if (cardHistEl !== null) {
      cardHistEl.textContent = "--";
    }
    if (cardPairEl !== null) {
      cardPairEl.textContent = "--";
    }
    if (cardPairSubEl !== null) {
      cardPairSubEl.textContent = `histogramPair (N = ${lookback})`;
    }
    if (tbodyEl !== null) {
      tbodyEl.innerHTML = `<tr><td colspan="9" class="table-empty-row">Insufficient history: ${activeTicker} has only ${closes.length} closes (minimum 34 required for MACD, Signal, and Histogram).</td></tr>`;
    }
    return;
  }

  // Populate cards with valid MACD data
  if (cardTickerEl !== null) {
    cardTickerEl.textContent = activeTicker;
  }
  if (cardClosesEl !== null) {
    cardClosesEl.textContent = `${closes.length} closes (${macdObj.histogramSeries.length} histogram sessions)`;
  }
  if (cardMacdEl !== null) {
    const hasMacdVal = macdObj.currentMacd !== null && macdObj.currentMacd !== undefined;
    cardMacdEl.textContent = hasMacdVal === true ? `${macdObj.currentMacd >= 0 ? "+" : ""}${macdObj.currentMacd.toFixed(4)}` : "--";
  }
  if (cardSignalEl !== null) {
    const hasSigVal = macdObj.currentSignal !== null && macdObj.currentSignal !== undefined;
    cardSignalEl.textContent = hasSigVal === true ? `${macdObj.currentSignal >= 0 ? "+" : ""}${macdObj.currentSignal.toFixed(4)}` : "--";
  }
  if (cardHistEl !== null) {
    const hasHistVal = macdObj.currentHistogram !== null && macdObj.currentHistogram !== undefined;
    cardHistEl.textContent = hasHistVal === true ? `${macdObj.currentHistogram >= 0 ? "+" : ""}${macdObj.currentHistogram.toFixed(4)}` : "--";
  }

  // Lookback pair evaluation using histogramPair(series, N)
  const pair = histogramPair(macdObj, lookback);
  if (cardPairEl !== null && cardPairSubEl !== null) {
    const isPairInsufficient = pair.insufficientHistory === true;
    if (isPairInsufficient === true) {
      cardPairEl.textContent = "Insufficient";
      cardPairSubEl.textContent = `Requires at least ${34 + lookback} closes (has ${closes.length})`;
    } else {
      const curStr = `${pair.current >= 0 ? "+" : ""}${pair.current.toFixed(4)}`;
      const lagStr = `${pair.lagged >= 0 ? "+" : ""}${pair.lagged.toFixed(4)}`;
      const diffStr = `${pair.difference >= 0 ? "+" : ""}${pair.difference.toFixed(4)}`;
      cardPairEl.textContent = `H_t: ${curStr} | H_(t-${lookback}): ${lagStr}`;
      cardPairSubEl.textContent = `Diff: ${diffStr} (N = ${lookback})`;
    }
  }

  // Render session-by-session table
  if (tbodyEl !== null) {
    let rowsHtml = "";
    const emaFast = computeEma(closes, 12);
    const emaSlow = computeEma(closes, 26);
    const macdSeries = macdObj.macdSeries;
    const signalSeries = macdObj.signalSeries;
    const histogramSeries = macdObj.histogramSeries;

    for (let i = 0; i < closes.length; i += 1) {
      const sessionNum = i + 1;
      const dateStr = dates[i] || `Session ${sessionNum}`;
      const closeVal = closes[i];

      // EMA(12) exists from index 11 (session 12)
      let ema12Str = "--";
      const hasEma12 = i >= 11;
      if (hasEma12 === true) {
        const val = emaFast[i - 11];
        if (typeof val === "number" && isNaN(val) === false) {
          ema12Str = val.toFixed(4);
        }
      }

      // EMA(26) exists from index 25 (session 26)
      let ema26Str = "--";
      const hasEma26 = i >= 25;
      if (hasEma26 === true) {
        const val = emaSlow[i - 25];
        if (typeof val === "number" && isNaN(val) === false) {
          ema26Str = val.toFixed(4);
        }
      }

      // MACD line exists from index 25 (session 26)
      let macdStr = "--";
      if (hasEma26 === true) {
        const val = macdSeries[i - 25];
        if (typeof val === "number" && isNaN(val) === false) {
          macdStr = `${val >= 0 ? "+" : ""}${val.toFixed(4)}`;
        }
      }

      // Signal line and Histogram exist from index 33 (session 34)
      let signalStr = "--";
      let histStr = "--";
      const hasSignal = i >= 33;
      if (hasSignal === true) {
        const sigVal = signalSeries[i - 33];
        if (typeof sigVal === "number" && isNaN(sigVal) === false) {
          signalStr = `${sigVal >= 0 ? "+" : ""}${sigVal.toFixed(4)}`;
        }
        const hVal = histogramSeries[i - 33];
        if (typeof hVal === "number" && isNaN(hVal) === false) {
          histStr = `${hVal >= 0 ? "+" : ""}${hVal.toFixed(4)}`;
        }
      }

      let rowClass = "seed-window";
      let statusDesc = "";
      if (i < 11) {
        rowClass = "seed-window";
        statusDesc = "EMA(12) seed window (closes 1-12)";
      } else if (i < 25) {
        rowClass = "seed-window";
        statusDesc = "EMA(12) active, EMA(26) seed window";
      } else if (i < 33) {
        rowClass = "macd-active";
        statusDesc = "MACD line active, Signal(9) seed window";
      } else if (i === 33) {
        rowClass = "seed-init";
        statusDesc = "Signal(9) seeded, first Histogram (session 34)";
      } else {
        rowClass = "histogram-active";
        statusDesc = `Full indicator active (session ${sessionNum})`;
      }

      rowsHtml += `
        <tr class="${rowClass}">
          <td><span class="price-mono">${sessionNum}</span></td>
          <td><span class="date-mono">${dateStr}</span></td>
          <td><span class="price-mono">${closeVal.toFixed(2)}</span></td>
          <td><span class="price-mono">${ema12Str}</span></td>
          <td><span class="price-mono">${ema26Str}</span></td>
          <td><span class="price-mono">${macdStr}</span></td>
          <td><span class="price-mono">${signalStr}</span></td>
          <td><span class="price-mono" style="font-weight: ${hasSignal === true ? "700" : "400"};">${histStr}</span></td>
          <td><span class="sector-text">${statusDesc}</span></td>
        </tr>
      `;
    }

    tbodyEl.innerHTML = rowsHtml;
  }
}

/**
 * Renders all components in Stage 3 indicators.
 */
export function renderIndicatorsUI() {
  updateStage3SummaryMetrics();
  renderSignalTable();
  renderVolatilitiesTable();
  renderCovarianceMatrixTable();
  renderRsiPanelUI();
  renderMacdPanelUI();
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
    { btnId: "tab-signals", panelId: "panel-signals" },
    { btnId: "tab-volatilities", panelId: "panel-volatilities" },
    { btnId: "tab-covariance", panelId: "panel-covariance" },
    { btnId: "tab-rsi", panelId: "panel-rsi" },
    { btnId: "tab-macd", panelId: "panel-macd" },
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

  // RSI dropdown selection
  const rsiSelect = document.getElementById("rsi-ticker-select");
  if (rsiSelect !== null) {
    rsiSelect.addEventListener("change", (evt) => {
      const ticker = evt.target.value;
      const hasTicker = typeof ticker === "string" && ticker.length > 0;
      if (hasTicker === true) {
        renderRsiPanelUI(ticker);
      }
    });
  }

  // MACD dropdown selection
  const macdSelect = document.getElementById("macd-ticker-select");
  if (macdSelect !== null) {
    macdSelect.addEventListener("change", (evt) => {
      const ticker = evt.target.value;
      const hasTicker = typeof ticker === "string" && ticker.length > 0;
      if (hasTicker === true) {
        renderMacdPanelUI(ticker);
      }
    });
  }

  // Delegated clicks for signal table drill-downs, inspect buttons, and quick ticker buttons
  document.addEventListener("click", (evt) => {
    const target = evt.target;
    if (target === null || target === undefined) {
      return;
    }

    // Drilldown button in signal table numeric cell
    const drilldownBtn = target.closest(".btn-drilldown");
    if (drilldownBtn !== null) {
      const ticker = drilldownBtn.getAttribute("data-ticker");
      const metric = drilldownBtn.getAttribute("data-metric");
      const hasTicker = typeof ticker === "string" && ticker.length > 0;
      const hasMetric = typeof metric === "string" && metric.length > 0;
      if (hasTicker === true && hasMetric === true) {
        setSignalDrilldown(ticker, metric);
      }
      return;
    }

    // Drilldown navigation pill within drilldown card
    const navPill = target.closest(".drilldown-nav-pill");
    if (navPill !== null) {
      const ticker = navPill.getAttribute("data-ticker");
      const metric = navPill.getAttribute("data-metric");
      const hasTicker = typeof ticker === "string" && ticker.length > 0;
      const hasMetric = typeof metric === "string" && metric.length > 0;
      if (hasTicker === true && hasMetric === true) {
        setSignalDrilldown(ticker, metric);
      }
      return;
    }

    // Drilldown close button
    const closeBtn = target.closest(".btn-drilldown-close");
    if (closeBtn !== null) {
      closeSignalDrilldown();
      return;
    }

    const isInspectRsiBtn = target.matches(".btn-inspect-rsi");
    if (isInspectRsiBtn === true) {
      const ticker = target.getAttribute("data-ticker");
      const hasTicker = typeof ticker === "string" && ticker.length > 0;
      if (hasTicker === true) {
        const rsiTabBtn = document.getElementById("tab-rsi");
        if (rsiTabBtn !== null) {
          rsiTabBtn.click();
        }
        renderRsiPanelUI(ticker);
      }
      return;
    }
    const isInspectMacdBtn = target.matches(".btn-inspect-macd");
    if (isInspectMacdBtn === true) {
      const ticker = target.getAttribute("data-ticker");
      const hasTicker = typeof ticker === "string" && ticker.length > 0;
      if (hasTicker === true) {
        const macdTabBtn = document.getElementById("tab-macd");
        if (macdTabBtn !== null) {
          macdTabBtn.click();
        }
        renderMacdPanelUI(ticker);
      }
      return;
    }
    const isRsiQuickBtn = target.matches("#rsi-quick-tickers .btn-quick-ticker");
    if (isRsiQuickBtn === true) {
      const ticker = target.getAttribute("data-ticker");
      const hasTicker = typeof ticker === "string" && ticker.length > 0;
      if (hasTicker === true) {
        renderRsiPanelUI(ticker);
      }
      return;
    }
    const isMacdQuickBtn = target.matches("#macd-quick-tickers .btn-quick-ticker");
    if (isMacdQuickBtn === true) {
      const ticker = target.getAttribute("data-macd-ticker");
      const hasTicker = typeof ticker === "string" && ticker.length > 0;
      if (hasTicker === true) {
        renderMacdPanelUI(ticker);
      }
      return;
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
 * Executes a controlled relaxation of the RSI threshold by +5 up to 50.
 * Sets rsiThreshold to min(current + 5, 50), increments rsiRelaxCount,
 * records "base, relaxed once" format, updates settings without re-fetching,
 * re-runs technical screen live, and invalidates stages 5 to 8 if survivors changed and labels exist.
 *
 * @returns {boolean} True if relaxation succeeded, false if already at 50
 */
export function relaxRsiThreshold() {
  const currentThreshold = appState.settings.rsiThreshold;
  const isAtMax = currentThreshold >= 50;
  if (isAtMax === true) {
    return false;
  }

  const previousSurvivors = appState.screenResult !== null && typeof appState.screenResult === "object" && Array.isArray(appState.screenResult.survivors) === true
    ? [...appState.screenResult.survivors]
    : [];

  const hasBase = typeof appState.settings.baseRsiThreshold === "number";
  if (hasBase === false) {
    appState.settings.baseRsiThreshold = currentThreshold;
  }

  const nextThreshold = Math.min(currentThreshold + 5, 50);
  appState.settings.rsiThreshold = nextThreshold;

  const nextCount = (appState.settings.rsiRelaxCount || 0) + 1;
  appState.settings.rsiRelaxCount = nextCount;

  const relaxText = nextCount === 1 ? "relaxed once" : `relaxed ${nextCount} times`;
  appState.settings.rsiThresholdRecord = `${appState.settings.baseRsiThreshold}, ${relaxText}`;

  clearSettingsError();
  renderSettingsUI();
  updatePreflightCard();

  const hasIndicators = appState.indicatorSeries !== null && typeof appState.indicatorSeries === "object";
  if (hasIndicators === true) {
    runStage4Screen(previousSurvivors);
  }

  return true;
}

/**
 * Screens aligned constituents on two technical rules:
 * 1. Oversold: last RSI < rsiThreshold
 * 2. Turning: H_t > H_(t-N) via histogramPair
 *
 * A constituent passes when both conditions are true.
 * Order of survivors strictly matches the universe order.
 *
 * @param {object} indicatorSeries - Indicator state from Stage 3
 * @param {number} rsiThreshold - Maximum RSI threshold (e.g. 40)
 * @param {number} N - MACD histogram lookback session offset (e.g. 3)
 * @returns {object} Full screening audit object with survivors, byTicker, results, and reasons
 */
export function screenTickers(indicatorSeries, rsiThreshold, N) {
  const hasSeries = indicatorSeries !== null && typeof indicatorSeries === "object";
  if (hasSeries === false) {
    return {
      survivors: [],
      byTicker: {},
      results: [],
      rsiThreshold: rsiThreshold,
      histogramLookback: N,
      survivorCount: 0,
      totalEvaluated: 0
    };
  }

  const threshold = typeof rsiThreshold === "number" ? rsiThreshold : 40;
  const lookback = typeof N === "number" ? N : 3;

  // Gather candidate tickers in universe order
  let candidateTickers = [];
  if (Array.isArray(indicatorSeries.tickers) === true) {
    candidateTickers = [...indicatorSeries.tickers];
  } else if (indicatorSeries.rsi !== null && typeof indicatorSeries.rsi === "object") {
    candidateTickers = Object.keys(indicatorSeries.rsi);
  }

  // Preserve strict universe order
  const hasUniverse = appState.universe !== null && Array.isArray(appState.universe) === true;
  if (hasUniverse === true) {
    const universeOrder = appState.universe.map((u) => u.ticker).filter((t) => t !== "SPY");
    const candidateSet = new Set(candidateTickers);
    const sorted = universeOrder.filter((t) => candidateSet.has(t));
    if (sorted.length === candidateTickers.length) {
      candidateTickers = sorted;
    }
  }

  const survivors = [];
  const byTicker = {};
  const results = [];

  for (let i = 0; i < candidateTickers.length; i += 1) {
    const ticker = candidateTickers[i];
    const rsiObj = indicatorSeries.rsi !== undefined && indicatorSeries.rsi !== null ? indicatorSeries.rsi[ticker] : null;
    const macdObj = indicatorSeries.macd !== undefined && indicatorSeries.macd !== null ? indicatorSeries.macd[ticker] : null;

    // Evaluate history sufficiency
    const isRsiInsufficient = rsiObj === null || rsiObj === undefined || rsiObj.insufficientHistory === true;
    const isMacdInsufficient = macdObj === null || macdObj === undefined || macdObj.insufficientHistory === true;

    // 1. Oversold rule: last RSI < rsiThreshold
    let currentRsi = null;
    let isOversold = false;
    let oversoldReason = null;

    if (isRsiInsufficient === true) {
      isOversold = false;
      oversoldReason = "RSI unavailable (insufficient history)";
    } else {
      currentRsi = typeof rsiObj.currentRsi === "number" ? rsiObj.currentRsi : (typeof rsiObj.lastRsi === "number" ? rsiObj.lastRsi : null);
      const isValidRsi = typeof currentRsi === "number" && !isNaN(currentRsi);
      if (isValidRsi === true) {
        isOversold = currentRsi < threshold;
        if (isOversold === false) {
          oversoldReason = `RSI ${currentRsi.toFixed(2)} is not below ${threshold}`;
        }
      } else {
        isOversold = false;
        oversoldReason = "RSI calculation unavailable";
      }
    }

    // 2. Turning rule: H_t > H_(t-N) via histogramPair
    let currentHist = null;
    let laggedHist = null;
    let isTurning = false;
    let turningReason = null;

    if (isMacdInsufficient === true) {
      isTurning = false;
      turningReason = "Histogram unavailable (insufficient history)";
    } else {
      const pair = histogramPair(macdObj, lookback);
      const isPairInsufficient = pair.insufficientHistory === true;
      if (isPairInsufficient === true) {
        isTurning = false;
        const reqValues = typeof pair.requiredHistogramValues === "number" ? pair.requiredHistogramValues : (34 + lookback);
        turningReason = `Histogram lookback unavailable (${reqValues} sessions required)`;
      } else {
        currentHist = pair.current;
        laggedHist = pair.lagged;
        const hasValidHistValues = typeof currentHist === "number" && typeof laggedHist === "number";
        if (hasValidHistValues === true) {
          isTurning = currentHist > laggedHist;
          if (isTurning === false) {
            const curStr = currentHist.toFixed(4);
            const lagStr = laggedHist.toFixed(4);
            turningReason = `Histogram ${curStr} is not above ${lagStr} (${lookback} sessions ago)`;
          }
        } else {
          isTurning = false;
          turningReason = "Histogram values unavailable";
        }
      }
    }

    // Name passes screen if and only if both conditions are true
    const passesScreen = isOversold === true && isTurning === true;
    if (passesScreen === true) {
      survivors.push(ticker);
    }

    const failedReasons = [];
    if (oversoldReason !== null) {
      failedReasons.push(oversoldReason);
    }
    if (turningReason !== null) {
      failedReasons.push(turningReason);
    }

    const itemResult = {
      ticker: ticker,
      isOversold: isOversold,
      isTurning: isTurning,
      passes: passesScreen,
      passesScreen: passesScreen,
      rsi: currentRsi,
      rsiThreshold: threshold,
      oversoldReason: oversoldReason,
      histogramCurrent: currentHist,
      histogramLagged: laggedHist,
      histogramLookback: lookback,
      turningReason: turningReason,
      reasons: failedReasons
    };

    byTicker[ticker] = itemResult;
    results.push(itemResult);
  }

  const output = {
    survivors: survivors,
    byTicker: byTicker,
    results: results,
    rsiThreshold: threshold,
    histogramLookback: lookback,
    survivorCount: survivors.length,
    totalEvaluated: candidateTickers.length
  };

  // Assign direct ticker properties on output object
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    output[r.ticker] = r;
  }

  return output;
}

/**
 * Runs the Stage 4 technical screen live, stores survivors in appState.screenResult,
 * sets Stage 4 status to "done", applies stage invalidation if survivors changed and labels exist,
 * and updates the Stage 4 UI.
 *
 * @param {string[]|null} [previousSurvivors] - Prior list of survivor tickers to detect set changes
 * @returns {object|null} The screen result object
 */
export function runStage4Screen(previousSurvivors = null) {
  const hasIndicators = appState.indicatorSeries !== null && typeof appState.indicatorSeries === "object";
  if (hasIndicators === false) {
    return null;
  }

  let prevSurvivorsList = [];
  if (previousSurvivors !== null && Array.isArray(previousSurvivors) === true) {
    prevSurvivorsList = previousSurvivors;
  } else if (appState.screenResult !== null && Array.isArray(appState.screenResult.survivors) === true) {
    prevSurvivorsList = [...appState.screenResult.survivors];
  }

  const rsiThreshold = appState.settings.rsiThreshold;
  const lookback = appState.settings.histogramLookback;

  const result = screenTickers(appState.indicatorSeries, rsiThreshold, lookback);
  appState.screenResult = result;
  setStageStatus(4, "done");

  // Invalidation check: when survivor set changes and labels exist, mark stages 5 to 8 as stale
  const newSurvivors = result.survivors;
  let survivorsChanged = prevSurvivorsList.length !== newSurvivors.length;
  if (survivorsChanged === false) {
    for (let i = 0; i < prevSurvivorsList.length; i += 1) {
      if (prevSurvivorsList[i] !== newSurvivors[i]) {
        survivorsChanged = true;
        break;
      }
    }
  }

  const hasLabels = appState.labels !== null && typeof appState.labels === "object" && Object.keys(appState.labels).length > 0;
  if (survivorsChanged === true && hasLabels === true) {
    markStagesStale(5);
  }

  renderStage4UI();
  return result;
}

/**
 * Renders the Stage 4 technical screen user interface:
 * 1. Early warning card if technical survivors < minimumBreadth (with Relax RSI button)
 * 2. Summary metrics cards (Survivors, Oversold Gate, Turning Gate, Minimum Breadth)
 * 3. Survivors list card in universe order
 * 4. Comprehensive breakdown table with pass/fail badges and reasons quoting failing values
 */
export function renderStage4UI() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  const placeholderEl = document.getElementById("stage-4-placeholder");
  const containerEl = document.getElementById("stage-4-container");
  const hasScreenResult = appState.screenResult !== null && typeof appState.screenResult === "object";

  if (hasScreenResult === false) {
    if (placeholderEl !== null) {
      placeholderEl.classList.remove("hidden");
    }
    if (containerEl !== null) {
      containerEl.classList.add("hidden");
    }
    return;
  }

  if (placeholderEl !== null) {
    placeholderEl.classList.add("hidden");
  }
  if (containerEl !== null) {
    containerEl.classList.remove("hidden");
  }

  const result = appState.screenResult;
  const survivorCount = result.survivorCount;
  const totalCount = result.totalEvaluated;
  const minBreadth = appState.settings.minimumBreadth;
  const rsiThreshold = appState.settings.rsiThreshold;
  const lookback = appState.settings.histogramLookback;

  // 1. Summary Bar
  const metricSurvivorsEl = document.getElementById("s4-metric-survivors");
  if (metricSurvivorsEl !== null) {
    metricSurvivorsEl.textContent = `${survivorCount} of ${totalCount} passed`;
  }
  const metricOversoldEl = document.getElementById("s4-metric-oversold");
  if (metricOversoldEl !== null) {
    metricOversoldEl.textContent = `RSI < ${rsiThreshold}`;
  }
  const metricTurningEl = document.getElementById("s4-metric-turning");
  if (metricTurningEl !== null) {
    metricTurningEl.textContent = `H_t > H_(t-${lookback})`;
  }
  const metricBreadthEl = document.getElementById("s4-metric-breadth");
  if (metricBreadthEl !== null) {
    metricBreadthEl.textContent = `${minBreadth} required`;
  }

  // 2. Early Warning Card and Relax RSI Action
  const warningCard = document.getElementById("stage-4-warning-card");
  const warningTextEl = document.getElementById("stage-4-warning-text");
  const relaxBtn = document.getElementById("btn-relax-rsi");
  const relaxNoteEl = document.getElementById("stage-4-relax-note");

  const isBelowBreadth = survivorCount < minBreadth;
  if (warningCard !== null) {
    if (isBelowBreadth === true) {
      warningCard.classList.remove("hidden");

      if (warningTextEl !== null) {
        warningTextEl.textContent = `This is an early warning: technical survivor count (${survivorCount}) is below minimum breadth (${minBreadth}). The binding breadth check happens after the text gate.`;
      }

      const isAtMax = rsiThreshold >= 50;
      if (relaxBtn !== null) {
        if (isAtMax === true) {
          relaxBtn.disabled = true;
          relaxBtn.setAttribute("disabled", "true");
          relaxBtn.textContent = "Relax RSI by +5 (Max 50 reached)";
        } else {
          relaxBtn.disabled = false;
          relaxBtn.removeAttribute("disabled");
          relaxBtn.textContent = "Relax RSI by +5";
        }
      }

      if (relaxNoteEl !== null) {
        const relaxCount = appState.settings.rsiRelaxCount || 0;
        const relaxText = relaxCount > 0 ? ` (${appState.settings.rsiThresholdRecord})` : "";
        if (isAtMax === true) {
          relaxNoteEl.textContent = `Threshold at maximum 50${relaxText}. Cannot be relaxed further.`;
        } else {
          const nextTarget = Math.min(rsiThreshold + 5, 50);
          relaxNoteEl.textContent = `Current threshold: ${rsiThreshold}${relaxText}. Pressing sets threshold to ${nextTarget}.`;
        }
      }
    } else {
      warningCard.classList.add("hidden");
    }
  }

  // 3. Survivors List Card
  const universe = appState.universe || DEFAULT_UNIVERSE;
  const sectorMap = new Map();
  for (let u = 0; u < universe.length; u += 1) {
    sectorMap.set(universe[u].ticker, universe[u].sector);
  }

  const survivorsBadge = document.getElementById("s4-survivors-count-badge");
  if (survivorsBadge !== null) {
    survivorsBadge.textContent = `${survivorCount} survivor${survivorCount === 1 ? "" : "s"}`;
  }

  const survivorsBody = document.getElementById("s4-survivors-list-body");
  if (survivorsBody !== null) {
    if (survivorCount > 0) {
      const chipsHtml = result.survivors.map((ticker) => {
        const item = result.byTicker[ticker];
        const sector = sectorMap.get(ticker) || "Equity";
        const rsiDisplay = item && typeof item.rsi === "number" ? item.rsi.toFixed(2) : "--";
        const htDisplay = item && typeof item.histogramCurrent === "number" ? (item.histogramCurrent >= 0 ? "+" + item.histogramCurrent.toFixed(4) : item.histogramCurrent.toFixed(4)) : "--";
        return `
          <div class="survivor-chip" id="survivor-chip-${ticker}">
            <span class="survivor-chip-ticker">${ticker}</span>
            <span class="survivor-chip-sector">${sector}</span>
            <span class="survivor-chip-metric">RSI: ${rsiDisplay}</span>
            <span class="survivor-chip-metric">H_t: ${htDisplay}</span>
          </div>
        `;
      }).join("");

      survivorsBody.innerHTML = `<div class="survivors-chips-grid">${chipsHtml}</div>`;
    } else {
      survivorsBody.innerHTML = `<p class="table-empty-row">No tickers passed both technical screening criteria. Relax the RSI threshold or adjust parameters to broaden the candidate set.</p>`;
    }
  }

  // 4. Screening Breakdown Table
  const tbodyEl = document.getElementById("stage-4-screen-tbody");
  if (tbodyEl !== null) {
    const rowsHtml = result.results.map((item) => {
      const ticker = item.ticker;
      const sector = sectorMap.get(ticker) || "Equity";

      // Oversold badge & details
      let oversoldCell = "";
      if (item.isOversold === true) {
        const rsiVal = typeof item.rsi === "number" ? item.rsi.toFixed(2) : "--";
        oversoldCell = `<span class="badge-status-pass">Pass</span> <span class="screen-metric-text">RSI ${rsiVal} &lt; ${rsiThreshold}</span>`;
      } else {
        oversoldCell = `<span class="badge-status-fail">Fail</span> <span class="screen-reason-text">${item.oversoldReason}</span>`;
      }

      // Turning badge & details
      let turningCell = "";
      if (item.isTurning === true) {
        const curVal = typeof item.histogramCurrent === "number" ? (item.histogramCurrent >= 0 ? "+" + item.histogramCurrent.toFixed(4) : item.histogramCurrent.toFixed(4)) : "--";
        const lagVal = typeof item.histogramLagged === "number" ? (item.histogramLagged >= 0 ? "+" + item.histogramLagged.toFixed(4) : item.histogramLagged.toFixed(4)) : "--";
        turningCell = `<span class="badge-status-pass">Pass</span> <span class="screen-metric-text">H_t (${curVal}) &gt; H_(t-${lookback}) (${lagVal})</span>`;
      } else {
        turningCell = `<span class="badge-status-fail">Fail</span> <span class="screen-reason-text">${item.turningReason}</span>`;
      }

      // Outcome badge
      let outcomeCell = "";
      if (item.passesScreen === true) {
        outcomeCell = `<span class="badge-survivor">Survivor</span>`;
      } else {
        outcomeCell = `<span class="badge-eliminated">Eliminated</span>`;
      }

      return `
        <tr id="stage-4-row-${ticker}" class="${item.passesScreen === true ? "row-survivor" : "row-eliminated"}">
          <td>
            <div class="ticker-cell-group">
              <span class="ticker-code">${ticker}</span>
            </div>
          </td>
          <td><span class="sector-text">${sector}</span></td>
          <td>${oversoldCell}</td>
          <td>${turningCell}</td>
          <td>${outcomeCell}</td>
        </tr>
      `;
    }).join("");

    tbodyEl.innerHTML = rowsHtml;
  }
}

/**
 * Sets up Stage 4 user interactions and button handlers.
 */
export function setupStage4() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  // Delegated click handler for Relax RSI button
  document.addEventListener("click", (evt) => {
    const target = evt.target;
    if (target === null || target === undefined) {
      return;
    }
    const relaxBtn = target.closest("#btn-relax-rsi, .btn-relax-rsi");
    if (relaxBtn !== null) {
      relaxRsiThreshold();
    }
  });

  renderStage4UI();
}

// ============================================================================
// STAGE 5: TEXT GATE (RISKLINE MACRO ALERTS & TWELVE DATA BUSINESS SUMMARIES)
// ============================================================================

/**
 * Escapes special HTML characters to prevent XSS and rendering issues.
 * @param {string} str - Raw string
 * @returns {string} Escaped HTML string
 */
export function escapeHtml(str) {
  const isString = typeof str === "string";
  if (isString === false) {
    return "";
  }
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const DEFAULT_RISKLINE_URL = "https://api.riskline.com/alerts/latest.json";
export let risklineAlertsUrl = DEFAULT_RISKLINE_URL;

/**
 * Sets the URL used for fetching Riskline macro alerts. Useful for testing.
 * @param {string} url - Target URL
 */
export function setRisklineAlertsUrl(url) {
  risklineAlertsUrl = url;
}

/**
 * Custom sentence splitter that does not break on common abbreviations
 * such as "Inc.", "Corp.", "Ltd.", "Co.", "U.S.", "e.g.", "vs.", or on decimals inside a sentence.
 *
 * @param {string} text - Raw input text
 * @returns {Array<string>} Array of clean sentences
 */
export function splitSentences(text) {
  const isString = typeof text === "string";
  if (isString === false) {
    return [];
  }

  const trimmed = text.trim();
  const isEmpty = trimmed.length === 0;
  if (isEmpty === true) {
    return [];
  }

  // Protect decimals (e.g. 14.5%, $2.5B, 0.05) using zero-width space
  let str = trimmed.replace(/(\d)\.(\d)/g, "$1\u200B$2");

  // Protect multi-dot common abbreviations
  str = str.replace(/\bU\.S\./g, "U\u200CS\u200C");
  str = str.replace(/\be\.g\./gi, "e\u200Cg\u200C");
  str = str.replace(/\bi\.e\./gi, "i\u200Ce\u200C");

  // Protect common single-dot abbreviations
  str = str.replace(
    /\b(Inc|Corp|Ltd|Co|vs|etc|approx|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|St|Dr|Mr|Mrs|Ms|Jr|Sr|No)\./gi,
    "$1\u200C"
  );

  // Protect single uppercase initials like "J. F. Kennedy"
  str = str.replace(/\b([A-Z])\.\s+/g, "$1\u200C ");

  // Match sentences ending in ., !, or ? followed by whitespace or string end
  const rawSentences = str.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [str];

  const sentences = rawSentences.map((s) => {
    return s
      .replace(/\u200B/g, ".")
      .replace(/\u200C/g, ".")
      .trim();
  }).filter((s) => {
    return s.length > 0;
  });

  return sentences;
}

/**
 * Truncates text to its first three sentences preserving abbreviations and decimals.
 *
 * @param {string} text - Input text
 * @returns {string} Truncated three-sentence summary
 */
export function truncateToThreeSentences(text) {
  const isString = typeof text === "string";
  if (isString === false) {
    return "";
  }

  const sentences = splitSentences(text);
  const isWithinLimit = sentences.length <= 3;
  if (isWithinLimit === true) {
    return sentences.join(" ");
  }

  return sentences.slice(0, 3).join(" ");
}

/**
 * Fetches the unauthenticated Riskline macro risk feed.
 * 10-second timeout, 1 retry.
 * Keeps only title, region, and category for each alert and at most the 50 most recent.
 *
 * @returns {Promise<Array<{title: string, region: string, category: string}>>}
 */
export async function fetchRisklineAlerts() {
  const response = await fetchWithTimeoutAndRetry(risklineAlertsUrl, 10000);
  const isOk = response.ok === true;
  if (isOk === false) {
    throw new Error(`Riskline feed responded with status ${response.status}`);
  }

  const data = await response.json();
  let rawAlerts = [];
  if (Array.isArray(data) === true) {
    rawAlerts = data;
  } else if (data !== null && typeof data === "object") {
    if (Array.isArray(data.alerts) === true) {
      rawAlerts = data.alerts;
    } else if (Array.isArray(data.data) === true) {
      rawAlerts = data.data;
    }
  }

  const cleanAlerts = [];
  const limit = Math.min(rawAlerts.length, 50);
  for (let i = 0; i < limit; i += 1) {
    const item = rawAlerts[i];
    if (item !== null && typeof item === "object") {
      const title = typeof item.title === "string" ? item.title.trim() : (typeof item.headline === "string" ? item.headline.trim() : "Macro Alert");
      const region = typeof item.region === "string" ? item.region.trim() : (typeof item.country === "string" ? item.country.trim() : "Global");
      const category = typeof item.category === "string" ? item.category.trim() : (typeof item.type === "string" ? item.type.trim() : "Geopolitical");
      cleanAlerts.push({ title, region, category });
    }
  }

  appState.alerts = cleanAlerts;
  return cleanAlerts;
}

// Promise chain to serialize quota budget acquisitions
let profileQuotaQueue = Promise.resolve();
let profileCountdownIntervalId = null;

/**
 * Serializes and checks quota availability for fetching a company profile (10 credits).
 * If credits left are below 10, waits for the wall-clock minute to advance.
 *
 * @param {string} ticker - Ticker requesting profile quota
 * @param {Function} onCountdownTick - Callback for countdown seconds
 * @returns {Promise<void>}
 */
export async function acquireProfileQuota(ticker, onCountdownTick) {
  return new Promise((resolve) => {
    profileQuotaQueue = profileQuotaQueue.then(async () => {
      // Check wall-clock minute advancement
      const currentMinute = Math.floor(Date.now() / 60000);
      const hasMinuteRolled = currentMinute > quotaState.lastResetMinute;
      if (hasMinuteRolled === true) {
        quotaState.lastResetMinute = currentMinute;
        quotaState.creditsLeft = appState.settings.creditsPerMinute || 144;
        quotaState.isEstimated = true;
      }

      if (quotaState.creditsLeft === null) {
        quotaState.creditsLeft = appState.settings.creditsPerMinute || 144;
        quotaState.isEstimated = true;
      }

      const quotaAllowsRequest = quotaState.creditsLeft >= 10;
      if (quotaAllowsRequest === true) {
        // Sufficient credits available immediately
        quotaState.creditsLeft -= 10;
        updateQuotaUI();
        resolve();
        return;
      }

      // Insufficient credits, must wait for next clock minute
      quotaState.waitingForQuota = true;
      updateQuotaUI();

      await new Promise((waitResolve) => {
        const checkWallClockMinute = () => {
          const now = Date.now();
          const msRemaining = 60000 - (now % 60000);
          const secsRemaining = Math.max(1, Math.ceil(msRemaining / 1000));
          quotaState.countdownSeconds = secsRemaining;

          if (typeof onCountdownTick === "function") {
            onCountdownTick(ticker, secsRemaining);
          }
          updateQuotaUI();

          const nowMinute = Math.floor(now / 60000);
          const hasAdvanced = nowMinute > quotaState.lastResetMinute;
          if (hasAdvanced === true) {
            quotaState.lastResetMinute = nowMinute;
            quotaState.creditsLeft = appState.settings.creditsPerMinute || 144;
            quotaState.isEstimated = true;
            quotaState.waitingForQuota = false;
            if (profileCountdownIntervalId !== null) {
              clearInterval(profileCountdownIntervalId);
              profileCountdownIntervalId = null;
            }
            // Deduct 10 credits for this request
            quotaState.creditsLeft -= 10;
            updateQuotaUI();
            waitResolve();
          }
        };

        checkWallClockMinute();
        profileCountdownIntervalId = setInterval(checkWallClockMinute, 1000);
      });

      resolve();
    });
  });
}

/**
 * Fetches company profile description from Twelve Data profile endpoint.
 * Budgeted at 10 credits per symbol with 10s timeout and 1 retry.
 *
 * @param {string} ticker - Constituent ticker symbol
 * @param {string} apiKey - Twelve Data API key
 * @param {Function} onCountdownTick - Callback for quota countdown
 * @returns {Promise<Object>} Profile object
 */
export async function fetchCompanyProfile(ticker, apiKey, onCountdownTick) {
  // Ensure profile cache object exists
  if (appState.profiles === null || typeof appState.profiles !== "object") {
    appState.profiles = {};
  }

  // Return cached profile if already fetched
  const existingProfile = appState.profiles[ticker];
  const isAlreadyCached = existingProfile !== undefined && existingProfile !== null;
  if (isAlreadyCached === true) {
    return existingProfile;
  }

  // Acquire 10 credits from shared quotaState
  await acquireProfileQuota(ticker, onCountdownTick);

  // Update in-progress status row
  setSurvivorProfileStatus(ticker, "fetching");

  const url = `https://api.twelvedata.com/profile?symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetchWithTimeoutAndRetry(url, 10000);

    // Read provider header if present
    let headerCredits = null;
    try {
      headerCredits = response.headers.get("api-credits-left");
    } catch (e) {
      // Header inspection ignored
    }
    const hasHeader = headerCredits !== null && headerCredits !== "" && isNaN(parseInt(headerCredits, 10)) === false;
    if (hasHeader === true) {
      quotaState.creditsLeft = parseInt(headerCredits, 10);
      quotaState.isEstimated = false;
      updateQuotaUI();
    }

    const isOk = response.ok === true;
    if (isOk === false) {
      const isRateLimit = response.status === 429;
      if (isRateLimit === true) {
        quotaState.creditsLeft = 0;
        quotaState.waitingForQuota = true;
        // Retry after waiting for next minute
        await acquireProfileQuota(ticker, onCountdownTick);
        return fetchCompanyProfile(ticker, apiKey, onCountdownTick);
      }
      throw new Error(`Profile endpoint failed with status ${response.status}`);
    }

    const data = await response.json();
    const isApiError = data !== null && typeof data === "object" && (data.status === "error" || data.code === 429);
    if (isApiError === true) {
      const errMsg = typeof data.message === "string" ? data.message.toLowerCase() : "";
      const isQuotaMsg = errMsg.includes("run out of api credits") || data.code === 429;
      if (isQuotaMsg === true) {
        quotaState.creditsLeft = 0;
        quotaState.waitingForQuota = true;
        await acquireProfileQuota(ticker, onCountdownTick);
        return fetchCompanyProfile(ticker, apiKey, onCountdownTick);
      }
      throw new Error(data.message || "Twelve Data error");
    }

    const rawDescription = typeof data.description === "string" ? data.description.trim() : "";
    const hasValidDesc = rawDescription.length > 0;
    const fullDescription = hasValidDesc === true ? rawDescription : "Summary unavailable";
    const threeSentenceSummary = hasValidDesc === true ? truncateToThreeSentences(rawDescription) : "Summary unavailable";
    const status = hasValidDesc === true ? "done" : "unavailable";

    const profileObj = {
      ticker: ticker,
      description: fullDescription,
      summary: threeSentenceSummary,
      status: status,
      isEstimated: quotaState.isEstimated,
      creditSource: quotaState.isEstimated === true ? "estimated locally" : "provider header"
    };

    appState.profiles[ticker] = profileObj;
    setSurvivorProfileStatus(ticker, status, profileObj);
    return profileObj;
  } catch (err) {
    console.warn(`Profile fetch failed for ${ticker}:`, err);
    const fallbackObj = {
      ticker: ticker,
      description: "Summary unavailable",
      summary: "Summary unavailable",
      status: "unavailable",
      isEstimated: quotaState.isEstimated,
      creditSource: quotaState.isEstimated === true ? "estimated locally" : "provider header"
    };
    appState.profiles[ticker] = fallbackObj;
    setSurvivorProfileStatus(ticker, "unavailable", fallbackObj);
    return fallbackObj;
  }
}

/**
 * Temporary status tracking for rendering profile table rows before full completion.
 */
const survivorRowState = {};

function setSurvivorProfileStatus(ticker, status, profileObj = null) {
  survivorRowState[ticker] = {
    status: status,
    profile: profileObj,
    countdown: quotaState.countdownSeconds || 60
  };
  updateSingleSurvivorRowUI(ticker);
  updateStage5Metrics();
}

/**
 * Runs the full Stage 5 Text Gate pipeline:
 * 1. Checks Riskline feed first. If unavailable, technical survivors pass as Unclassified.
 * 2. Fetches Twelve Data profile descriptions for technical survivors within quota budget.
 * 3. Truncates descriptions to 3 sentences and renders Stage 5 UI.
 *
 * @param {boolean} forceRefresh - If true, re-evaluates stage (cached profiles are still kept)
 * @returns {Promise<boolean>}
 */
export async function runStage5Pipeline(forceRefresh = false) {
  const hasSurvivors = appState.screenResult !== null &&
    Array.isArray(appState.screenResult.survivors) === true &&
    appState.screenResult.survivors.length > 0;

  if (hasSurvivors === false) {
    setStageStatus(5, "idle");
    renderStage5UI();
    return false;
  }

  setStageStatus(5, "running");
  renderStage5UI();

  // Remove existing feed banners
  removeGlobalBanner("riskline-feed-unavailable");

  // Step 1: Check Riskline macro feed FIRST
  let risklineSuccess = false;
  try {
    await fetchRisklineAlerts();
    risklineSuccess = true;
  } catch (err) {
    console.warn("Riskline feed unavailable:", err);
    risklineSuccess = false;
  }

  const survivors = appState.screenResult.survivors;

  // If Riskline is unavailable, no profile is fetched and no classifier call is made
  if (risklineSuccess === false) {
    if (appState.labels === null || typeof appState.labels !== "object") {
      appState.labels = {};
    }

    for (let i = 0; i < survivors.length; i += 1) {
      const sym = survivors[i];
      appState.labels[sym] = {
        label: "Unclassified",
        reason: "macro feed unavailable"
      };
    }

    appState.passedSurvivors = [...survivors];

    addGlobalBanner(
      "riskline-feed-unavailable",
      "Riskline macro alerts feed is unavailable. Technical survivors have been marked as Unclassified and pass through the text gate.",
      "warning"
    );

    setStageStatus(5, "done");
    renderStage5UI();
    return true;
  }

  // Step 2: Riskline available, fetch profiles for technical survivors
  if (appState.profiles === null || typeof appState.profiles !== "object") {
    appState.profiles = {};
  }

  const apiKey = appState.keys.twelveData || "";
  const tickersToFetch = survivors.filter((sym) => {
    const isCached = appState.profiles[sym] !== undefined && appState.profiles[sym] !== null;
    return isCached === false;
  });

  // Set initial waiting / idle state for un-fetched survivors
  for (let i = 0; i < survivors.length; i += 1) {
    const sym = survivors[i];
    const isCached = appState.profiles[sym] !== undefined && appState.profiles[sym] !== null;
    if (isCached === true) {
      survivorRowState[sym] = {
        status: appState.profiles[sym].status,
        profile: appState.profiles[sym],
        countdown: 0
      };
    } else {
      survivorRowState[sym] = {
        status: "waiting",
        profile: null,
        countdown: quotaState.countdownSeconds || 60
      };
    }
  }

  renderStage5UI();

  if (tickersToFetch.length > 0) {
    // Process profile requests with concurrency cap of 5
    const CONCURRENCY_LIMIT = 5;
    let index = 0;

    const worker = async () => {
      while (index < tickersToFetch.length) {
        const currentIndex = index;
        index += 1;
        const sym = tickersToFetch[currentIndex];

        await fetchCompanyProfile(sym, apiKey, (tickerSym, secs) => {
          if (survivorRowState[tickerSym] !== undefined) {
            survivorRowState[tickerSym].status = "waiting";
            survivorRowState[tickerSym].countdown = secs;
            updateSingleSurvivorRowUI(tickerSym);
          }
        });
      }
    };

    const workerCount = Math.min(CONCURRENCY_LIMIT, tickersToFetch.length);
    const workers = [];
    for (let w = 0; w < workerCount; w += 1) {
      workers.push(worker());
    }

    await Promise.all(workers);
  }

  setStageStatus(5, "done");
  renderStage5UI();
  return true;
}

/**
 * Updates a single survivor table row in Stage 5 for responsive status and countdown changes.
 *
 * @param {string} ticker - Constituent ticker
 */
function updateSingleSurvivorRowUI(ticker) {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  const statusCell = document.getElementById(`s5-status-cell-${ticker}`);
  if (statusCell === null) {
    return;
  }

  const rowState = survivorRowState[ticker];
  if (rowState === undefined) {
    return;
  }

  const isDone = rowState.status === "done";
  const isWaiting = rowState.status === "waiting";
  const isFetching = rowState.status === "fetching";
  const isUnavailable = rowState.status === "unavailable";

  const creditSourceLabel = (rowState.profile && rowState.profile.creditSource === "provider header") || quotaState.isEstimated === false
    ? "credits from provider header"
    : "credits estimated locally";

  let statusBadgeHtml = "";
  if (isDone === true) {
    statusBadgeHtml = `
      <span class="badge-status-pass">Done</span>
      <span class="credit-source-text">${creditSourceLabel}</span>
    `;
  } else if (isWaiting === true) {
    const countdown = rowState.countdown || quotaState.countdownSeconds || 60;
    statusBadgeHtml = `
      <span class="badge-status-waiting">Waiting for quota (${countdown}s)</span>
      <span class="credit-source-text">${creditSourceLabel}</span>
    `;
  } else if (isFetching === true) {
    statusBadgeHtml = `
      <span class="badge-status-running">Fetching profile...</span>
      <span class="credit-source-text">${creditSourceLabel}</span>
    `;
  } else if (isUnavailable === true) {
    statusBadgeHtml = `
      <span class="badge-status-fail">Summary unavailable</span>
      <span class="credit-source-text">${creditSourceLabel}</span>
    `;
  }

  statusCell.innerHTML = statusBadgeHtml;

  // Also update summary cell if done or unavailable
  const summaryCell = document.getElementById(`s5-summary-cell-${ticker}`);
  if (summaryCell !== null && rowState.profile !== null) {
    const summary = rowState.profile.summary;
    const fullDesc = rowState.profile.description;
    const hasMore = fullDesc !== "Summary unavailable" && fullDesc.trim() !== summary.trim();

    summaryCell.innerHTML = `
      <div class="summary-cell-content">
        <p class="three-sentence-summary">${escapeHtml(summary)}</p>
        ${hasMore === true ? `
          <button type="button" class="btn-more-less" id="btn-toggle-desc-${ticker}" data-ticker="${ticker}" aria-expanded="false">
            More
          </button>
          <div class="full-description-box hidden" id="full-desc-${ticker}">
            <span class="full-description-label">Full Company Description</span>
            <p class="full-description-text">${escapeHtml(fullDesc)}</p>
          </div>
        ` : ""}
      </div>
    `;
  }
}

/**
 * Updates Stage 5 summary metrics cards.
 */
function updateStage5Metrics() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  const survivors = (appState.screenResult && appState.screenResult.survivors) || [];
  const survivorsEl = document.getElementById("s5-survivors-count");
  if (survivorsEl !== null) {
    survivorsEl.textContent = survivors.length.toString();
  }

  const alertsEl = document.getElementById("s5-alerts-count");
  if (alertsEl !== null) {
    alertsEl.textContent = (appState.alerts ? appState.alerts.length : 0).toString();
  }

  const creditsEl = document.getElementById("s5-credits-left");
  if (creditsEl !== null) {
    const credVal = quotaState.creditsLeft !== null ? quotaState.creditsLeft : (appState.settings.creditsPerMinute || 144);
    creditsEl.textContent = credVal.toString();
  }

  const sourceEl = document.getElementById("s5-credits-source");
  if (sourceEl !== null) {
    sourceEl.textContent = quotaState.isEstimated === true ? "Estimated locally" : "From provider header";
  }

  const cachedEl = document.getElementById("s5-profiles-cached");
  if (cachedEl !== null) {
    const cachedCount = survivors.filter((s) => appState.profiles && appState.profiles[s]).length;
    cachedEl.textContent = `${cachedCount} / ${survivors.length}`;
  }
}

/**
 * Returns sector for a ticker symbol from universe or default list.
 *
 * @param {string} ticker - Constituent symbol
 * @returns {string} Sector name
 */
function getConstituentSector(ticker) {
  if (appState.universe !== null && Array.isArray(appState.universe) === true) {
    const item = appState.universe.find((c) => c.ticker === ticker);
    if (item !== undefined && typeof item.sector === "string") {
      return item.sector;
    }
  } else if (appState.universe !== null && typeof appState.universe === "object" && Array.isArray(appState.universe.constituents) === true) {
    const item = appState.universe.constituents.find((c) => c.ticker === ticker);
    if (item !== undefined && typeof item.sector === "string") {
      return item.sector;
    }
  }

  if (Array.isArray(DEFAULT_UNIVERSE) === true) {
    const defItem = DEFAULT_UNIVERSE.find((c) => c.ticker === ticker);
    if (defItem !== undefined && typeof defItem.sector === "string") {
      return defItem.sector;
    }
  }

  return "Unknown";
}

/**
 * Renders the entire Stage 5 Text Gate UI:
 * - Metrics summary
 * - Macro alerts card
 * - Survivor business summaries table with More/Less toggle and status column
 */
export function renderStage5UI() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  const placeholderEl = document.getElementById("stage-5-placeholder");
  const containerEl = document.getElementById("stage-5-container");
  if (placeholderEl === null || containerEl === null) {
    return;
  }

  const survivors = (appState.screenResult && appState.screenResult.survivors) || [];
  const hasSurvivors = survivors.length > 0;

  if (hasSurvivors === false) {
    placeholderEl.classList.remove("hidden");
    containerEl.classList.add("hidden");
    const placeholderText = document.getElementById("stage-5-placeholder-text");
    if (placeholderText !== null) {
      placeholderText.textContent = "Stage 5: Macro alerts and business summaries will be assembled here once technical survivors qualify from Stage 4.";
    }
    return;
  }

  placeholderEl.classList.add("hidden");
  containerEl.classList.remove("hidden");

  updateStage5Metrics();

  // Render Riskline Macro Alerts
  const alertsListEl = document.getElementById("s5-macro-alerts-list");
  const macroStatusBadge = document.getElementById("s5-macro-status-badge");
  const hasAlerts = Array.isArray(appState.alerts) === true && appState.alerts.length > 0;

  if (alertsListEl !== null) {
    if (hasAlerts === true) {
      if (macroStatusBadge !== null) {
        macroStatusBadge.className = "badge badge-status-pass";
        macroStatusBadge.textContent = `${appState.alerts.length} alerts loaded`;
      }
      const alertsHtml = appState.alerts.map((a) => {
        return `
          <div class="macro-alert-item">
            <span class="macro-alert-title">${escapeHtml(a.title)}</span>
            <div class="macro-alert-meta">
              <span class="macro-tag macro-tag-region">${escapeHtml(a.region)}</span>
              <span class="macro-tag macro-tag-category">${escapeHtml(a.category)}</span>
            </div>
          </div>
        `;
      }).join("");
      alertsListEl.innerHTML = alertsHtml;
    } else {
      const isDone = appState.stageStatus[5] === "done";
      if (macroStatusBadge !== null) {
        macroStatusBadge.className = isDone ? "badge badge-status-fail" : "badge";
        macroStatusBadge.textContent = isDone ? "Feed Unavailable" : "Not Loaded";
      }
      alertsListEl.innerHTML = `<p class="table-empty-row" style="padding: 12px;">No macro alerts loaded. ${isDone ? "Macro feed was unreachable; technical survivors pass as Unclassified." : "Click Assemble Alerts & Summaries to fetch."}</p>`;
    }
  }

  // Render Business Summaries Table
  const tbodyEl = document.getElementById("stage-5-profiles-tbody");
  const profilesStatusBadge = document.getElementById("s5-profiles-status-badge");

  if (tbodyEl !== null) {
    const rowsHtml = survivors.map((ticker) => {
      const sector = getConstituentSector(ticker);
      const profile = appState.profiles ? appState.profiles[ticker] : null;
      const rowState = survivorRowState[ticker];

      let summaryText = "Pending fetch...";
      let fullDesc = "";
      let hasMore = false;
      let statusBadgeHtml = `<span class="badge-status-waiting">Waiting</span>`;

      if (profile !== null && profile !== undefined) {
        summaryText = profile.summary;
        fullDesc = profile.description;
        hasMore = fullDesc !== "Summary unavailable" && fullDesc.trim() !== summaryText.trim();
        const creditSourceLabel = profile.creditSource === "provider header" || quotaState.isEstimated === false
          ? "credits from provider header"
          : "credits estimated locally";

        if (profile.status === "done") {
          statusBadgeHtml = `
            <span class="badge-status-pass">Done</span>
            <span class="credit-source-text">${creditSourceLabel}</span>
          `;
        } else if (profile.status === "unavailable") {
          statusBadgeHtml = `
            <span class="badge-status-fail">Summary unavailable</span>
            <span class="credit-source-text">${creditSourceLabel}</span>
          `;
        }
      } else if (rowState !== undefined) {
        const creditSourceLabel = quotaState.isEstimated === false
          ? "credits from provider header"
          : "credits estimated locally";

        if (rowState.status === "waiting") {
          const countdown = rowState.countdown || quotaState.countdownSeconds || 60;
          statusBadgeHtml = `
            <span class="badge-status-waiting">Waiting for quota (${countdown}s)</span>
            <span class="credit-source-text">${creditSourceLabel}</span>
          `;
        } else if (rowState.status === "fetching") {
          statusBadgeHtml = `
            <span class="badge-status-running">Fetching profile...</span>
            <span class="credit-source-text">${creditSourceLabel}</span>
          `;
        }
      }

      return `
        <tr id="s5-row-${ticker}">
          <td>
            <span class="constituent-ticker-cell">${escapeHtml(ticker)}</span>
          </td>
          <td>
            <span class="constituent-sector-cell">${escapeHtml(sector)}</span>
          </td>
          <td id="s5-summary-cell-${ticker}">
            <div class="summary-cell-content">
              <p class="three-sentence-summary">${escapeHtml(summaryText)}</p>
              ${hasMore === true ? `
                <button type="button" class="btn-more-less" id="btn-toggle-desc-${ticker}" data-ticker="${ticker}" aria-expanded="false">
                  More
                </button>
                <div class="full-description-box hidden" id="full-desc-${ticker}">
                  <span class="full-description-label">Full Company Description</span>
                  <p class="full-description-text">${escapeHtml(fullDesc)}</p>
                </div>
              ` : ""}
            </div>
          </td>
          <td id="s5-status-cell-${ticker}">
            ${statusBadgeHtml}
          </td>
        </tr>
      `;
    }).join("");

    tbodyEl.innerHTML = rowsHtml;

    if (profilesStatusBadge !== null) {
      const allDone = survivors.every((s) => appState.profiles && appState.profiles[s]);
      if (allDone === true) {
        profilesStatusBadge.className = "badge badge-status-pass";
        profilesStatusBadge.textContent = "Done";
      } else {
        profilesStatusBadge.className = "badge";
        profilesStatusBadge.textContent = `${survivors.filter((s) => appState.profiles && appState.profiles[s]).length} / ${survivors.length} Ready`;
      }
    }
  }
}

/**
 * Sets up user interaction listeners for Stage 5.
 */
export function setupStage5() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  // Run Stage 5 button
  const runBtn = document.getElementById("btn-run-stage-5");
  if (runBtn !== null) {
    runBtn.addEventListener("click", () => {
      runStage5Pipeline(false);
    });
  }

  // Delegated More/Less toggle handler
  document.addEventListener("click", (evt) => {
    const target = evt.target;
    if (target === null || target === undefined) {
      return;
    }
    const moreBtn = target.closest(".btn-more-less");
    if (moreBtn !== null) {
      const ticker = moreBtn.getAttribute("data-ticker");
      const descBox = document.getElementById(`full-desc-${ticker}`);
      if (descBox !== null) {
        const isHidden = descBox.classList.contains("hidden");
        if (isHidden === true) {
          descBox.classList.remove("hidden");
          moreBtn.textContent = "Less";
          moreBtn.setAttribute("aria-expanded", "true");
        } else {
          descBox.classList.add("hidden");
          moreBtn.textContent = "More";
          moreBtn.setAttribute("aria-expanded", "false");
        }
      }
    }
  });

  renderStage5UI();
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
  const rsiRelaxStatus = document.getElementById("rsi-relax-status");
  const relaxCount = appState.settings.rsiRelaxCount || 0;

  if (rsiRelaxSpan !== null) {
    if (relaxCount === 0) {
      rsiRelaxSpan.textContent = "0";
    } else if (relaxCount === 1) {
      rsiRelaxSpan.textContent = "1 (relaxed once)";
    } else {
      rsiRelaxSpan.textContent = `${relaxCount} (relaxed ${relaxCount} times)`;
    }
  }

  if (rsiRelaxStatus !== null) {
    if (relaxCount === 0) {
      rsiRelaxStatus.textContent = "";
      rsiRelaxStatus.classList.add("hidden");
    } else {
      const relaxWord = relaxCount === 1 ? "relaxed once" : `relaxed ${relaxCount} times`;
      rsiRelaxStatus.textContent = `${appState.settings.baseRsiThreshold || 40}, ${relaxWord}`;
      rsiRelaxStatus.classList.remove("hidden");
    }
  }

  const rsiHint = document.getElementById("hint-rsi-threshold");
  if (rsiHint !== null) {
    if (relaxCount > 0) {
      const relaxWord = relaxCount === 1 ? "relaxed once" : `relaxed ${relaxCount} times`;
      rsiHint.textContent = `Currently ${appState.settings.rsiThreshold} (${appState.settings.baseRsiThreshold || 40}, ${relaxWord}). Integer 30 to 50.`;
    } else {
      rsiHint.textContent = "Integer 30 to 50. Floor for oversold technical screen.";
    }
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
  window.computeRsi = computeRsi;
  window.renderRsiPanelUI = renderRsiPanelUI;
  window.computeEma = computeEma;
  window.computeMacd = computeMacd;
  window.histogramPair = histogramPair;
  window.renderMacdPanelUI = renderMacdPanelUI;
  window.renderSignalTable = renderSignalTable;
  window.renderSignalDrilldownHtml = renderSignalDrilldownHtml;
  window.setSignalDrilldown = setSignalDrilldown;
  window.closeSignalDrilldown = closeSignalDrilldown;
  window.activeSignalDrilldown = activeSignalDrilldown;
  window.relaxRsiThreshold = relaxRsiThreshold;
  window.screenTickers = screenTickers;
  window.runStage4Screen = runStage4Screen;
  window.renderStage4UI = renderStage4UI;
  window.setupStage4 = setupStage4;
  window.DEFAULT_RISKLINE_URL = DEFAULT_RISKLINE_URL;
  window.risklineAlertsUrl = risklineAlertsUrl;
  window.setRisklineAlertsUrl = setRisklineAlertsUrl;
  window.splitSentences = splitSentences;
  window.truncateToThreeSentences = truncateToThreeSentences;
  window.fetchRisklineAlerts = fetchRisklineAlerts;
  window.acquireProfileQuota = acquireProfileQuota;
  window.fetchCompanyProfile = fetchCompanyProfile;
  window.runStage5Pipeline = runStage5Pipeline;
  window.renderStage5UI = renderStage5UI;
  window.setupStage5 = setupStage5;
}

function initializeApp() {
  renderStageTracker();
  setupCollapsibleSections();
  setupUniverseUpload();
  renderUniverseUI();
  setupSettingsPanel();
  setupStage2();
  setupStage3();
  setupStage4();
  setupStage5();
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

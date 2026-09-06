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
  { id: 8, name: "Portfolio and note", shortName: "Portfolio & note" },
  { id: 9, name: "Walk-forward backtest", shortName: "Backtest" }
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
  openRouterModel: DEFAULT_OPENROUTER_MODEL,
  holdingPeriod: 20,
  exitThreshold: 60,
  cadence: 5
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
  backtest: null,
  stageStatus: {
    1: "idle",
    2: "idle",
    3: "idle",
    4: "idle",
    5: "idle",
    6: "idle",
    7: "idle",
    8: "idle",
    9: "idle"
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
 * Stage 9 is never blocked; if an upstream stage is blocked or fails, stage 9 remains idle.
 *
 * @param {number|string} stage - Stage number (1 to 9)
 * @param {string} status - One of "idle", "running", "done", "stale", "blocked"
 * @returns {boolean} True if successfully applied
 */
export function setStageStatus(stage, status) {
  const stageNum = Number(stage);
  const isValidStageNum = Number.isInteger(stageNum) === true && stageNum >= 1 && stageNum <= 9;
  if (isValidStageNum === false) {
    const errorMsg = `Stage number "${stage}" is invalid. Expected an integer between 1 and 9.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Stage 9 is never blocked: if blocked is requested, set to idle
  let effectiveStatus = status;
  if (stageNum === 9 && status === "blocked") {
    effectiveStatus = "idle";
  }

  const statusIsAllowed = ALLOWED_STATUSES.includes(effectiveStatus);
  if (statusIsAllowed === true) {
    appState.stageStatus[stageNum] = effectiveStatus;
    updateStageUI(stageNum);
    return true;
  } else {
    const errorMsg = `Status "${effectiveStatus}" is rejected. Allowed statuses are: ${ALLOWED_STATUSES.join(", ")}.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Marks stages from fromStage to 9 as "stale", unless a stage is currently "blocked".
 *
 * @param {number|string} fromStage - Starting stage number (1 to 9)
 * @returns {boolean} True if execution completed
 */
export function markStagesStale(fromStage) {
  const startNum = Number(fromStage);
  const isValidStageNum = Number.isInteger(startNum) === true && startNum >= 1 && startNum <= 9;
  if (isValidStageNum === false) {
    const errorMsg = `Stage number "${fromStage}" is invalid. Expected an integer between 1 and 9.`;
    console.warn(errorMsg);
    return false;
  }

  for (let s = startNum; s <= 9; s += 1) {
    const isBlocked = appState.stageStatus[s] === "blocked";
    if (isBlocked === true) {
      // Leaves a stage that was blocked as blocked
      continue;
    } else {
      // If stage 9 has never run (idle), keep it idle rather than stale
      if (s === 9 && appState.stageStatus[9] === "idle") {
        continue;
      }
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

  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  const bannersContainer = document.getElementById("global-banners");
  const hasContainer = bannersContainer !== null;
  if (hasContainer === false) {
    return;
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

  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
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
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }
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

    clearReview();
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

  clearReview();
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

  clearReview();

  const isNowSelected = appState.selectedTickers.includes(ticker);
  const isCached = appState.priceCache && Array.isArray(appState.priceCache[ticker]) && appState.priceCache[ticker].length > 0;
  if (isNowSelected === true && isCached === false) {
    markStagesStale(2);
  } else {
    const hasIndicators = appState.indicatorSeries !== null && typeof appState.indicatorSeries === "object";
    if (hasIndicators === true) {
      runStage4Screen();
    }
    evaluateGuardrails();
  }

  renderUniverseUI();
  updatePreflightCard();
  renderRawPricesTable();
  renderStage7UI();
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
  clearReview();

  if (appState.stageStatus[9] === "done") {
    setStageStatus(9, "stale");
  }

  const hasGated = Array.isArray(appState.gatedSurvivors) === true && appState.gatedSurvivors.length > 0;
  const isStage5Done = appState.stageStatus[5] === "done";
  if (hasGated === true && isStage5Done === true) {
    runStage6Optimization();
    recomputeRollingBeta();
  }
  evaluateGuardrails();
  renderStage6UI();
  renderStage7UI();

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
  clearReview();

  if (appState.stageStatus[9] === "done") {
    setStageStatus(9, "stale");
  }

  const hasScreenResult = appState.screenResult !== null && typeof appState.screenResult === "object";
  if (hasScreenResult === true) {
    renderStage4UI();
  }
  evaluateGuardrails();
  renderStage7UI();

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
  clearReview();

  const hasWeights = appState.weights !== null && typeof appState.weights === "object" && Array.isArray(appState.weights.minVariance) === true;
  if (hasWeights === true) {
    updateStage6InvestmentAmount(num);
  }
  evaluateGuardrails();
  if (appState.note !== null && typeof appState.note === "object") {
    if (appState.note.investmentAmount !== num) {
      appState.note.isStale = true;
      setStageStatus(8, "stale");
    }
  }
  renderStage7UI();
  renderStage8UI();

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

  const currentExitThreshold = Number.isFinite(appState.settings.exitThreshold) === true
    ? appState.settings.exitThreshold
    : 60;
  if (currentExitThreshold < num + 10) {
    showSettingsError(
      `Cross-field rule violated: exit threshold (${currentExitThreshold}) must be at least 10 points above RSI threshold as set (${num}). Please raise the exit threshold first.`
    );
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
  clearReview();

  if (appState.stageStatus[9] === "done") {
    setStageStatus(9, "stale");
  }

  const hasIndicators = appState.indicatorSeries !== null && typeof appState.indicatorSeries === "object";
  if (hasIndicators === true) {
    runStage4Screen(previousSurvivors);
  }
  evaluateGuardrails();
  renderStage7UI();

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
  clearReview();

  if (appState.stageStatus[9] === "done") {
    setStageStatus(9, "stale");
  }

  const hasIndicators = appState.indicatorSeries !== null && typeof appState.indicatorSeries === "object";
  if (hasIndicators === true) {
    runStage4Screen(previousSurvivors);
  }
  evaluateGuardrails();
  renderStage7UI();

  return true;
}

/**
 * Validates and updates the walk-forward backtest holding period (H).
 * Range: integer 5 to 60 sessions. Default 20.
 * Marks stage 9 stale but marks no other stage stale and does not clear review.
 *
 * @param {string|number} rawInput
 * @returns {boolean} True if accepted
 */
export function validateAndSetHoldingPeriod(rawInput) {
  const clean = String(rawInput).trim();
  const isInt = /^-?\d+$/.test(clean) === true;
  const num = parseInt(clean, 10);
  const inRange = isInt === true && num >= 5 && num <= 60;
  if (inRange === false) {
    showSettingsError(`Holding period (H) must be an integer between 5 and 60 sessions (entered "${rawInput}").`);
    renderSettingsUI();
    return false;
  }

  appState.settings.holdingPeriod = num;
  clearSettingsError();
  renderSettingsUI();

  if (appState.stageStatus[9] === "done") {
    setStageStatus(9, "stale");
  }

  return true;
}

/**
 * Validates and updates the walk-forward backtest exit threshold setting.
 * Range: integer 50 to 80. Default 60.
 * Cross-field rule: must be at least 10 points above RSI threshold as set.
 * Marks stage 9 stale but marks no other stage stale and does not clear review.
 *
 * @param {string|number} rawInput
 * @returns {boolean} True if accepted
 */
export function validateAndSetExitThreshold(rawInput) {
  const clean = String(rawInput).trim();
  const isInt = /^-?\d+$/.test(clean) === true;
  const num = parseInt(clean, 10);
  const inRange = isInt === true && num >= 50 && num <= 80;
  if (inRange === false) {
    showSettingsError(`Exit threshold must be an integer between 50 and 80 (entered "${rawInput}").`);
    renderSettingsUI();
    return false;
  }

  const currentRsi = Number.isFinite(appState.settings.rsiThreshold) === true
    ? appState.settings.rsiThreshold
    : 40;
  if (num < currentRsi + 10) {
    showSettingsError(
      `Cross-field rule violated: exit threshold (${num}) must be at least 10 points above RSI threshold as set (${currentRsi}).`
    );
    renderSettingsUI();
    return false;
  }

  appState.settings.exitThreshold = num;
  clearSettingsError();
  renderSettingsUI();

  if (appState.stageStatus[9] === "done") {
    setStageStatus(9, "stale");
  }

  return true;
}

/**
 * Validates and updates the walk-forward backtest cadence setting.
 * Range: integer 1 to 21 sessions. Default 5.
 * Marks stage 9 stale but marks no other stage stale and does not clear review.
 *
 * @param {string|number} rawInput
 * @returns {boolean} True if accepted
 */
export function validateAndSetCadence(rawInput) {
  const clean = String(rawInput).trim();
  const isInt = /^-?\d+$/.test(clean) === true;
  const num = parseInt(clean, 10);
  const inRange = isInt === true && num >= 1 && num <= 21;
  if (inRange === false) {
    showSettingsError(`Cadence must be an integer between 1 and 21 sessions (entered "${rawInput}").`);
    renderSettingsUI();
    return false;
  }

  appState.settings.cadence = num;
  clearSettingsError();
  renderSettingsUI();

  if (appState.stageStatus[9] === "done") {
    setStageStatus(9, "stale");
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
  clearReview();

  const hasMetrics = appState.metrics !== null && typeof appState.metrics === "object" && appState.metrics.minVariance !== undefined;
  if (hasMetrics === true) {
    updateStage6RiskFreeRate(appState.settings.riskFreeRate);
  }
  evaluateGuardrails();
  renderStage7UI();

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
    clearReview();
    const hasLabels = appState.labels !== null && typeof appState.labels === "object";
    if (hasLabels === true) {
      applyTextGate();
      const hasGated = Array.isArray(appState.gatedSurvivors) === true && appState.gatedSurvivors.length > 0;
      if (hasGated === true) {
        runStage6Optimization();
        recomputeRollingBeta();
      }
    }
    evaluateGuardrails();
    renderStage5UI();
    renderStage6UI();
    renderStage7UI();
  } else {
    showSettingsError(`Gate mode must be "exclude" or "warn" (entered "${val}").`);
    renderSettingsUI();
    return false;
  }
  updatePreflightCard();
  renderSettingsUI();
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
 * Returns the date three years before today in America/New_York (YYYY-MM-DD).
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function getThreeYearsAgoDateString(date = new Date()) {
  const todayNY = getTodayNYDateString(date);
  const parts = todayNY.split("-");
  const prevYear = parseInt(parts[0], 10) - 3;
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
/**
 * Performs a fetch with timeout, concurrency cap of 5, and exactly one retry.
 * Supports both (url, timeoutMs) and (url, options, timeoutMs).
 *
 * @param {string} url
 * @param {number | RequestInit} [optionsOrTimeout]
 * @param {number} [maybeTimeout]
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeoutAndRetry(url, optionsOrTimeout = 10000, maybeTimeout = 10000) {
  let options = {};
  let timeoutMs = 10000;

  const isNumberFirst = typeof optionsOrTimeout === "number";
  if (isNumberFirst === true) {
    timeoutMs = optionsOrTimeout;
  } else {
    const isObjectFirst = typeof optionsOrTimeout === "object" && optionsOrTimeout !== null;
    if (isObjectFirst === true) {
      options = optionsOrTimeout;
      const isNumberSecond = typeof maybeTimeout === "number";
      if (isNumberSecond === true) {
        timeoutMs = maybeTimeout;
      }
    }
  }

  while (activeRequestsCount >= MAX_CONCURRENT_REQUESTS) {
    await new Promise((res) => setTimeout(res, 50));
  }
  activeRequestsCount += 1;

  const attemptFetch = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const fetchOptions = {
        ...options,
        signal: controller.signal
      };
      const resp = await fetch(url, fetchOptions);
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

  // The live stages (1 to 8) continue to use only the trailing one-year window (up to 252 sessions) from this fetch.
  // Outputs remain bit-for-bit identical to previous versions while the full three-year series stays in priceCache for stage 9.
  const liveWindowSize = Math.min(252, commonDates.length);
  const finalAlignedDates = commonDates.slice(-liveWindowSize);

  // Name the ticker or tickers whose history constrains the intersection
  const firstDate = finalAlignedDates[0];
  const lastDate = finalAlignedDates[finalAlignedDates.length - 1];
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

  // Join SPY afterwards to the aligned constituent dates and keep only the dates SPY has (prompt 5)
  const spySeries = appState.priceCache["SPY"] || [];
  const hasSpyData = Array.isArray(spySeries) === true && spySeries.length > 0;
  const spyPriceMap = new Map();
  if (hasSpyData === true) {
    for (let i = 0; i < spySeries.length; i += 1) {
      const b = spySeries[i];
      const isValidRow = b !== null && typeof b === "object" && typeof b.datetime === "string" && typeof b.close === "number";
      if (isValidRow === true) {
        spyPriceMap.set(b.datetime, b.close);
      }
    }
  }

  // Align SPY on constituent dates (or its own dates) if available; SPY failure never blocks stage 2
  let alignedSpy = null;
  const hasSpyPrices = hasSpyData === true && spyPriceMap.size > 0;
  if (hasSpyPrices === true) {
    const spyDates = [];
    const spyPrices = [];
    for (let i = 0; i < finalAlignedDates.length; i += 1) {
      const d = finalAlignedDates[i];
      const hasPrice = spyPriceMap.has(d);
      if (hasPrice === true) {
        spyDates.push(d);
        spyPrices.push(spyPriceMap.get(d));
      }
    }
    const hasOverlapSpy = spyDates.length > 0;
    if (hasOverlapSpy === true) {
      alignedSpy = {
        dates: spyDates,
        prices: spyPrices
      };
    } else {
      alignedSpy = {
        dates: Array.from(spyPriceMap.keys()),
        prices: Array.from(spyPriceMap.values())
      };
    }
  }

  // Build alignedData
  const alignedPrices = {};
  for (let i = 0; i < validConstituents.length; i += 1) {
    const t = validConstituents[i];
    const pMap = priceMapByTicker[t];
    alignedPrices[t] = finalAlignedDates.map((d) => pMap.get(d));
  }

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
  // Distinguish between insufficient history for backtest (< 500) and fully admitted (>= 500)
  for (let i = 0; i < validConstituents.length; i += 1) {
    const t = validConstituents[i];
    const series = appState.priceCache[t] || [];
    const isStart = startConstraining.includes(t) === true;
    const isEnd = endConstraining.includes(t) === true;
    let note = "Aligned";
    if (series.length < 500) {
      note = `insufficient history for backtest (${series.length} sessions)`;
    } else if (isStart === true && isEnd === true) {
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

  // Update SPY status (diagnostic only, absent SPY never blocks stages)
  const hasAlignedSpy = alignedSpy !== null && Array.isArray(alignedSpy.dates) === true && alignedSpy.dates.length > 0;
  if (hasAlignedSpy === true) {
    let spyNote = "Benchmark (joined to aligned dates)";
    if (spySeries.length < 500) {
      spyNote = `Benchmark (${spySeries.length} sessions - insufficient for backtest)`;
    }
    setTickerPriceStatus(
      "SPY",
      "done",
      "",
      alignedSpy.dates.length,
      `${alignedSpy.dates[0]} → ${alignedSpy.dates[alignedSpy.dates.length - 1]}`,
      spyNote
    );
  } else {
    setTickerPriceStatus(
      "SPY",
      "error",
      "SPY unavailable",
      0,
      "-",
      "Benchmark unavailable (diagnostic only)"
    );
  }

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
  const startDate = getThreeYearsAgoDateString();
  const symbolsParam = missingTickers.join(",");
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbolsParam)}&interval=1day&start_date=${startDate}&outputsize=800&order=asc&adjust=all&apikey=${encodeURIComponent(apiKey)}`;

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
  clearReview();

  const hasIndicators = appState.indicatorSeries !== null && typeof appState.indicatorSeries === "object";
  if (hasIndicators === true) {
    runStage4Screen(previousSurvivors);
  }

  evaluateGuardrails();
  renderStage7UI();

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

export const ALLOWED_GATE_LABELS = ["Headwind", "Neutral", "Tailwind"];

/**
 * Builds the single classification request for the survivor set:
 * System instruction, list of constituent packages, and alert list.
 * Request text is capped at roughly 12,000 characters; if over budget,
 * oldest alerts are dropped first.
 *
 * @param {string[]} survivors
 * @param {Record<string, any>} [profiles]
 * @param {Array<{title: string, region: string, category: string}>} [alerts]
 * @param {any} [universe]
 * @returns {{systemInstruction: string, userContent: string, fullPromptText: string, includedAlertsCount: number}}
 */
export function buildClassificationRequest(survivors, profiles, alerts, universe) {
  const systemInstruction = `You are a financial risk classifier. Given a list of stock market constituents with their sectors and business summaries, and a list of current macroeconomic risk alerts, determine whether each company faces forward-looking headwinds, tailwinds, or neutral conditions.
You MUST respond with EXACTLY ONE JSON object and nothing else. No explanation outside JSON, no markdown formatting.
The JSON schema MUST be:
{
  "results": [
    {
      "ticker": "TICKER_SYMBOL",
      "label": "Headwind" | "Neutral" | "Tailwind",
      "reason": "One single sentence explaining the assessment. The sentence MUST NOT contain any numbers or digits.",
      "alerts_cited": ["Exact Alert Title 1", "Exact Alert Title 2"]
    }
  ]
}
Requirements:
- Provide exactly one result object per requested constituent ticker.
- The 'label' field must strictly be one of 'Headwind', 'Neutral', or 'Tailwind'.
- The 'reason' field must be exactly one sentence and MUST NOT contain any digits (0-9). Write numbers in words if needed or avoid numbers altogether.
- The 'alerts_cited' array must contain only exact titles from the provided macroeconomic risk alerts that are relevant to this constituent, or an empty array [] if none apply.
- Base your label on whether the company's business summary, sector, and current macroeconomic alerts indicate a forward-looking headwind, tailwind, or neither.`;

  const packages = survivors.map((ticker) => {
    const sector = getConstituentSector(ticker);
    const profile = profiles !== null && profiles !== undefined ? profiles[ticker] : null;
    const hasValidSummary = profile !== null && profile !== undefined && typeof profile.summary === "string" && profile.summary.trim().length > 0;
    const summary = hasValidSummary === true ? profile.summary.trim() : "Summary unavailable";
    return `Ticker: ${ticker}\nSector: ${sector}\nSummary: ${summary}`;
  });

  const constituentsText = `Constituents to classify:\n\n${packages.join("\n\n")}\n\n`;

  let alertsList = Array.isArray(alerts) === true ? [...alerts] : [];

  const buildAlertsText = (alertItems) => {
    const hasItems = alertItems.length > 0;
    if (hasItems === false) {
      return "Macroeconomic Risk Alerts:\n(No alerts available)\n";
    }
    const lines = alertItems.map((a) => `- Title: ${a.title} | Region: ${a.region} | Category: ${a.category}`);
    return `Macroeconomic Risk Alerts (newest to oldest):\n${lines.join("\n")}\n`;
  };

  const MAX_CHAR_BUDGET = 12000;
  let alertsText = buildAlertsText(alertsList);
  let totalChars = systemInstruction.length + constituentsText.length + alertsText.length;

  // Drop oldest alerts first (from the end) if exceeding budget
  while (totalChars > MAX_CHAR_BUDGET && alertsList.length > 0) {
    alertsList.pop();
    alertsText = buildAlertsText(alertsList);
    totalChars = systemInstruction.length + constituentsText.length + alertsText.length;
  }

  const userContent = `${constituentsText}${alertsText}`;

  return {
    systemInstruction,
    userContent,
    fullPromptText: `${systemInstruction}\n\n${userContent}`,
    includedAlertsCount: alertsList.length
  };
}

/**
 * Sets a survivor's categorical label in appState.labels.
 *
 * @param {string} ticker
 * @param {{label: string, reason: string, alerts_cited?: string[], isMalformed?: boolean, originalMalformed?: boolean, malformedReason?: string}} data
 */
export function setSurvivorLabel(ticker, data) {
  const hasLabelsObj = appState.labels !== null && typeof appState.labels === "object";
  if (hasLabelsObj === false) {
    appState.labels = {};
  }

  const isMalformed = data.isMalformed === true;
  const originalMalformed = data.originalMalformed === true || isMalformed === true;

  appState.labels[ticker] = {
    label: data.label,
    reason: data.reason,
    alerts_cited: Array.isArray(data.alerts_cited) === true ? data.alerts_cited : [],
    isMalformed: isMalformed,
    originalMalformed: originalMalformed,
    malformedReason: data.malformedReason || ""
  };

  clearReview();
}

/**
 * Parses the raw classifier response text, validates all constraints,
 * and sets labels in appState.labels.
 *
 * @param {string} rawText
 * @param {string[]} targetSurvivors
 * @returns {boolean} True if all target survivors are well-formed
 */
export function parseClassifierResponse(rawText, targetSurvivors) {
  let parsedObj = null;
  let parseSuccess = false;

  try {
    const rootData = JSON.parse(rawText);
    const hasChoices = rootData !== null && typeof rootData === "object" && Array.isArray(rootData.choices) === true && rootData.choices[0] !== undefined;
    if (hasChoices === true) {
      const choiceMessage = rootData.choices[0].message;
      const content = choiceMessage !== null && choiceMessage !== undefined ? choiceMessage.content : "";
      const isString = typeof content === "string";
      if (isString === true) {
        const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
        parsedObj = JSON.parse(cleaned);
        parseSuccess = true;
      }
    } else {
      const isDirectObject = rootData !== null && typeof rootData === "object";
      if (isDirectObject === true) {
        const hasResults = Array.isArray(rootData.results) === true;
        if (hasResults === true) {
          parsedObj = rootData;
          parseSuccess = true;
        } else {
          const isArrayRoot = Array.isArray(rootData) === true;
          if (isArrayRoot === true) {
            parsedObj = { results: rootData };
            parseSuccess = true;
          }
        }
      }
    }
  } catch (err) {
    parseSuccess = false;
  }

  const hasValidResultsArray = parseSuccess === true && parsedObj !== null && Array.isArray(parsedObj.results) === true;

  if (hasValidResultsArray === false) {
    for (let i = 0; i < targetSurvivors.length; i += 1) {
      const sym = targetSurvivors[i];
      setSurvivorLabel(sym, {
        label: "Malformed",
        reason: "Model response could not be parsed as JSON",
        alerts_cited: [],
        isMalformed: true,
        originalMalformed: true,
        malformedReason: "Model response could not be parsed as JSON"
      });
    }
    return false;
  }

  // Count occurrences of each ticker in results
  const tickerCounts = new Map();
  for (let i = 0; i < parsedObj.results.length; i += 1) {
    const entry = parsedObj.results[i];
    const isObject = entry !== null && typeof entry === "object";
    const hasTickerStr = isObject === true && typeof entry.ticker === "string";
    if (hasTickerStr === true) {
      const sym = entry.ticker.trim().toUpperCase();
      const prevCount = tickerCounts.get(sym) || 0;
      tickerCounts.set(sym, prevCount + 1);
    }
  }

  const validAlertTitles = new Set();
  const hasAlerts = Array.isArray(appState.alerts) === true;
  if (hasAlerts === true) {
    for (let i = 0; i < appState.alerts.length; i += 1) {
      const a = appState.alerts[i];
      const hasTitle = a !== null && typeof a === "object" && typeof a.title === "string";
      if (hasTitle === true) {
        validAlertTitles.add(a.title.trim());
      }
    }
  }

  let allSurvivorsWellFormed = true;

  for (let i = 0; i < targetSurvivors.length; i += 1) {
    const sym = targetSurvivors[i];
    const appearsInResults = tickerCounts.has(sym);
    const count = tickerCounts.get(sym) || 0;
    const isRepeated = count > 1;

    if (appearsInResults === false) {
      allSurvivorsWellFormed = false;
      setSurvivorLabel(sym, {
        label: "Malformed",
        reason: "Constituent omitted from model response",
        alerts_cited: [],
        isMalformed: true,
        originalMalformed: true,
        malformedReason: "Constituent omitted from model response"
      });
      continue;
    }

    if (isRepeated === true) {
      allSurvivorsWellFormed = false;
      setSurvivorLabel(sym, {
        label: "Malformed",
        reason: "Duplicate constituent entry returned by model",
        alerts_cited: [],
        isMalformed: true,
        originalMalformed: true,
        malformedReason: "Duplicate constituent entry returned by model"
      });
      continue;
    }

    const entry = parsedObj.results.find((r) => {
      const isObj = r !== null && typeof r === "object";
      const hasT = isObj === true && typeof r.ticker === "string";
      return hasT === true && r.ticker.trim().toUpperCase() === sym;
    });

    const hasValidEntry = entry !== undefined && entry !== null;
    if (hasValidEntry === false) {
      allSurvivorsWellFormed = false;
      setSurvivorLabel(sym, {
        label: "Malformed",
        reason: "Constituent missing from results",
        alerts_cited: [],
        isMalformed: true,
        originalMalformed: true,
        malformedReason: "Constituent missing from results"
      });
      continue;
    }

    const rawLabel = typeof entry.label === "string" ? entry.label.trim() : "";
    const labelIsAllowed = ALLOWED_GATE_LABELS.includes(rawLabel);

    const rawReason = typeof entry.reason === "string" ? entry.reason.trim() : "";
    const reasonHasNoDigit = rawReason.length > 0 && /\d/.test(rawReason) === false;

    if (labelIsAllowed === false) {
      allSurvivorsWellFormed = false;
      setSurvivorLabel(sym, {
        label: "Malformed",
        reason: "Model returned invalid categorical label",
        alerts_cited: [],
        isMalformed: true,
        originalMalformed: true,
        malformedReason: "Model returned invalid categorical label"
      });
      continue;
    }

    if (reasonHasNoDigit === false) {
      allSurvivorsWellFormed = false;
      setSurvivorLabel(sym, {
        label: "Malformed",
        reason: "Model reason contained digits",
        alerts_cited: [],
        isMalformed: true,
        originalMalformed: true,
        malformedReason: "Model reason contained digits"
      });
      continue;
    }

    let cited = [];
    const isAlertsArray = Array.isArray(entry.alerts_cited) === true;
    if (isAlertsArray === true) {
      cited = entry.alerts_cited
        .filter((t) => typeof t === "string" && validAlertTitles.has(t.trim()))
        .map((t) => t.trim());
    }

    setSurvivorLabel(sym, {
      label: rawLabel,
      reason: rawReason,
      alerts_cited: cited,
      isMalformed: false,
      originalMalformed: false,
      malformedReason: ""
    });
  }

  return allSurvivorsWellFormed;
}

/**
 * Invokes OpenRouter to classify the requested survivors.
 * Uses 20-second timeout, 1 retry, temperature 0, and JSON response format.
 *
 * @param {string[]} survivorsToClassify
 * @returns {Promise<boolean>}
 */
export async function callOpenRouterClassifier(survivorsToClassify) {
  const hasSurvivors = Array.isArray(survivorsToClassify) === true && survivorsToClassify.length > 0;
  if (hasSurvivors === false) {
    return true;
  }

  appState.stage5KeyRejected = false;
  appState.stage5KeyRejectedMessage = "";

  const apiKey = (appState.keys.openRouter || "").trim();
  const keyIsMissing = apiKey.length === 0;

  if (keyIsMissing === true) {
    appState.stage5KeyRejected = true;
    appState.stage5KeyRejectedMessage = "OpenRouter API Key field in Settings is missing. Please enter your API key.";
    appState.rawLabelResponse = "Error: OpenRouter API key is missing. Please enter your API key in the OpenRouter API Key field in Settings.";

    for (let i = 0; i < survivorsToClassify.length; i += 1) {
      const sym = survivorsToClassify[i];
      setSurvivorLabel(sym, {
        label: "Malformed",
        reason: "OpenRouter API Key field in Settings is missing",
        alerts_cited: [],
        isMalformed: true,
        originalMalformed: true,
        malformedReason: "OpenRouter API Key field in Settings is missing"
      });
    }
    return false;
  }

  const { systemInstruction, userContent } = buildClassificationRequest(
    survivorsToClassify,
    appState.profiles,
    appState.alerts,
    appState.universe
  );

  const modelId = (appState.settings.openRouterModel || DEFAULT_OPENROUTER_MODEL).trim();

  const payload = {
    model: modelId,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: userContent }
    ]
  };

  const fetchOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://ai.studio/",
      "X-Title": "Momentum Value Asset Allocation"
    },
    body: JSON.stringify(payload)
  };

  let response;
  try {
    response = await fetchWithTimeoutAndRetry("https://openrouter.ai/api/v1/chat/completions", fetchOptions, 20000);
  } catch (err) {
    appState.rawLabelResponse = `Network error after retry: ${err.message || String(err)}`;
    for (let i = 0; i < survivorsToClassify.length; i += 1) {
      const sym = survivorsToClassify[i];
      setSurvivorLabel(sym, {
        label: "Malformed",
        reason: "Classifier network request failed after retry",
        alerts_cited: [],
        isMalformed: true,
        originalMalformed: true,
        malformedReason: "Classifier network request failed after retry"
      });
    }
    return false;
  }

  const isKeyRejected = response.status === 401 || response.status === 403;
  if (isKeyRejected === true) {
    let errBody = "";
    try {
      errBody = await response.text();
    } catch (e) {
      errBody = "";
    }
    appState.stage5KeyRejected = true;
    appState.stage5KeyRejectedMessage = `OpenRouter API Key field in Settings was rejected (HTTP ${response.status}).`;
    appState.rawLabelResponse = `HTTP ${response.status} Rejected Key: ${errBody}`;

    for (let i = 0; i < survivorsToClassify.length; i += 1) {
      const sym = survivorsToClassify[i];
      setSurvivorLabel(sym, {
        label: "Malformed",
        reason: "OpenRouter API Key field in Settings was rejected",
        alerts_cited: [],
        isMalformed: true,
        originalMalformed: true,
        malformedReason: "OpenRouter API Key field in Settings was rejected"
      });
    }
    return false;
  }

  const isOk = response.ok === true;
  if (isOk === false) {
    let errBody = "";
    try {
      errBody = await response.text();
    } catch (e) {
      errBody = "";
    }
    appState.rawLabelResponse = `HTTP ${response.status}: ${errBody}`;
    for (let i = 0; i < survivorsToClassify.length; i += 1) {
      const sym = survivorsToClassify[i];
      setSurvivorLabel(sym, {
        label: "Malformed",
        reason: "OpenRouter server returned error status",
        alerts_cited: [],
        isMalformed: true,
        originalMalformed: true,
        malformedReason: "OpenRouter server returned error status"
      });
    }
    return false;
  }

  let rawText = "";
  try {
    rawText = await response.text();
  } catch (err) {
    rawText = String(err);
  }

  appState.rawLabelResponse = rawText;

  return parseClassifierResponse(rawText, survivorsToClassify);
}

/**
 * Applies the qualitative text gate according to appState.settings.gateMode:
 * - Exclude mode: Headwinds are removed; malformed entries are held out and block Stage 5.
 * - Warn mode: Headwinds are kept and flagged; malformed entries become Unclassified with reason "response malformed".
 * Stores the gated survivor list in appState.labels.gatedSurvivors, appState.gatedSurvivors, and appState.passedSurvivors.
 */
export function applyTextGate() {
  const hasScreen = appState.screenResult !== null && typeof appState.screenResult === "object";
  const survivors = hasScreen === true && Array.isArray(appState.screenResult.survivors) === true
    ? appState.screenResult.survivors
    : [];

  const hasLabelsObj = appState.labels !== null && typeof appState.labels === "object";
  if (hasLabelsObj === false) {
    appState.labels = {};
  }

  if (survivors.length === 0) {
    appState.labels.gatedSurvivors = [];
    appState.gatedSurvivors = [];
    appState.passedSurvivors = [];
    removeGlobalBanner("stage-5-gate-blocked");
    return;
  }

  const gateMode = appState.settings.gateMode || "exclude";
  const isExcludeMode = gateMode === "exclude";

  const gatedList = [];
  let hasMalformed = false;

  removeGlobalBanner("stage-5-gate-blocked");

  for (let i = 0; i < survivors.length; i += 1) {
    const sym = survivors[i];
    let entry = appState.labels[sym];

    const hasEntry = entry !== undefined && entry !== null;
    if (hasEntry === false) {
      entry = {
        label: "Malformed",
        reason: "No classification recorded",
        alerts_cited: [],
        isMalformed: true,
        originalMalformed: true,
        malformedReason: "No classification recorded"
      };
      appState.labels[sym] = entry;
    }

    if (isExcludeMode === true) {
      // Exclude mode
      const wasOriginalMalformed = entry.originalMalformed === true;
      if (wasOriginalMalformed === true) {
        entry.isMalformed = true;
        entry.label = "Malformed";
        entry.reason = entry.malformedReason || "response malformed";
      }

      entry.flagged = false;

      const isCurrentMalformed = entry.isMalformed === true;
      if (isCurrentMalformed === true) {
        hasMalformed = true;
        // Held out of the gated survivor list
      } else {
        const isHeadwind = entry.label === "Headwind";
        if (isHeadwind === true) {
          // Headwind names are removed from the gated survivor list
        } else {
          // Neutral, Tailwind, and Unclassified pass unchanged
          gatedList.push(sym);
        }
      }
    } else {
      // Warn mode
      const wasOriginalMalformed = entry.originalMalformed === true;
      if (wasOriginalMalformed === true) {
        entry.isMalformed = false;
        entry.label = "Unclassified";
        entry.reason = "response malformed";
      }

      const isHeadwind = entry.label === "Headwind";
      if (isHeadwind === true) {
        // Headwind names are kept and flagged
        entry.flagged = true;
        gatedList.push(sym);
      } else {
        entry.flagged = false;
        // Neutral, Tailwind, and Unclassified pass unchanged
        gatedList.push(sym);
      }
    }
  }

  appState.labels.gatedSurvivors = [...gatedList];
  appState.gatedSurvivors = [...gatedList];
  appState.passedSurvivors = [...gatedList];

  const shouldBlockStage5 = isExcludeMode === true && hasMalformed === true;
  if (shouldBlockStage5 === true) {
    setStageStatus(5, "blocked");
    const isKeyRejected = appState.stage5KeyRejected === true;
    let blockedMsg = "Regenerate labels or switch the gate to warn";
    if (isKeyRejected === true) {
      blockedMsg = `${appState.stage5KeyRejectedMessage || "OpenRouter API Key field in Settings was rejected."} Regenerate labels or switch the gate to warn.`;
    }
    addGlobalBanner("stage-5-gate-blocked", blockedMsg, "error");
    setStageStatus(6, "idle");
  } else {
    setStageStatus(5, "done");
    if (gatedList.length > 0) {
      runStage6Optimization();
      recomputeRollingBeta();
    }
  }

  evaluateGuardrails();
  renderStage5UI();
  renderStage6UI();
  renderStage7UI();
}

/**
 * Regenerates categorical labels for the whole survivor set.
 * Repeats classifier call without fetching Twelve Data profiles.
 * Makes exactly one OpenRouter request and zero Twelve Data requests.
 *
 * @returns {Promise<boolean>}
 */
export async function regenerateLabels() {
  clearReview();
  const hasScreen = appState.screenResult !== null && typeof appState.screenResult === "object";
  const survivors = hasScreen === true && Array.isArray(appState.screenResult.survivors) === true
    ? appState.screenResult.survivors
    : [];

  if (survivors.length === 0) {
    return false;
  }

  appState.labels = {};
  appState.rawLabelResponse = null;
  appState.stage5KeyRejected = false;
  appState.stage5KeyRejectedMessage = "";

  setStageStatus(5, "running");
  renderStage5UI();

  const success = await callOpenRouterClassifier(survivors);
  applyTextGate();
  evaluateGuardrails();
  renderStage5UI();
  renderStage6UI();
  renderStage7UI();
  return success;
}

/**
 * Labels new or unlabelled survivors.
 * Fetches only missing profiles and makes one additional classifier call
 * covering only the unlabelled tickers, merging results into stored labels.
 *
 * @returns {Promise<boolean>}
 */
export async function labelNewSurvivors() {
  clearReview();
  const hasScreen = appState.screenResult !== null && typeof appState.screenResult === "object";
  const survivors = hasScreen === true && Array.isArray(appState.screenResult.survivors) === true
    ? appState.screenResult.survivors
    : [];

  if (survivors.length === 0) {
    return false;
  }

  const unlabelled = survivors.filter((sym) => {
    const hasLabelsObj = appState.labels !== null && typeof appState.labels === "object";
    const entry = hasLabelsObj === true ? appState.labels[sym] : null;
    const hasValidLabel = entry !== null && entry !== undefined && entry.isMalformed === false && entry.label !== "Malformed";
    return hasValidLabel === false;
  });

  const hasUnlabelled = unlabelled.length > 0;
  if (hasUnlabelled === false) {
    applyTextGate();
    evaluateGuardrails();
    renderStage5UI();
    renderStage6UI();
    renderStage7UI();
    return true;
  }

  setStageStatus(5, "running");
  renderStage5UI();

  // Fetch only missing profiles for unlabelled tickers
  const apiKey = appState.keys.twelveData || "";
  const missingProfiles = unlabelled.filter((sym) => {
    const isCached = appState.profiles !== null && appState.profiles[sym] !== undefined && appState.profiles[sym] !== null;
    return isCached === false;
  });

  for (let i = 0; i < missingProfiles.length; i += 1) {
    const sym = missingProfiles[i];
    await fetchCompanyProfile(sym, apiKey);
  }

  // Exactly one classifier call covering only the unlabelled tickers
  await callOpenRouterClassifier(unlabelled);

  applyTextGate();
  evaluateGuardrails();
  renderStage5UI();
  renderStage6UI();
  renderStage7UI();
  return true;
}

/**
 * Runs the full Stage 5 Text Gate pipeline:
 * 1. Checks Riskline feed first. If unavailable, technical survivors pass as Unclassified.
 * 2. Fetches Twelve Data profile descriptions for technical survivors within quota budget.
 * 3. Truncates descriptions to 3 sentences and runs classifier.
 * 4. Applies qualitative text gate.
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

  const survivors = appState.screenResult.survivors;

  // Check if labels are cached for the session and can be reused
  const hasLabelsObj = appState.labels !== null && typeof appState.labels === "object";
  const allLabelled = hasLabelsObj === true && survivors.every((sym) => {
    const entry = appState.labels[sym];
    return entry !== undefined && entry !== null;
  });

  const canReuseCachedLabels = forceRefresh === false && allLabelled === true;
  if (canReuseCachedLabels === true) {
    applyTextGate();
    renderStage5UI();
    const failures = evaluateGuardrails();
    const guardrailsPass = failures.length === 0;
    if (guardrailsPass === true) {
      try {
        await generateNote();
      } catch (noteErr) {
        console.warn("Pipeline note generation error:", noteErr);
      }
    }
    return true;
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

  // If Riskline is unavailable, no profile is fetched and no classifier call is made
  if (risklineSuccess === false) {
    if (appState.labels === null || typeof appState.labels !== "object") {
      appState.labels = {};
    }

    for (let i = 0; i < survivors.length; i += 1) {
      const sym = survivors[i];
      appState.labels[sym] = {
        label: "Unclassified",
        reason: "macro feed unavailable",
        alerts_cited: [],
        isMalformed: false,
        originalMalformed: false,
        malformedReason: ""
      };
    }

    addGlobalBanner(
      "riskline-feed-unavailable",
      "Riskline macro alerts feed is unavailable. Technical survivors have been marked as Unclassified and pass through the text gate.",
      "warning"
    );

    applyTextGate();
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

  // Step 3: Run the classifier call for survivors
  await callOpenRouterClassifier(survivors);

  // Step 4: Apply qualitative text gate
  applyTextGate();
  renderStage5UI();

  // Step 5: If guardrails pass, generate committee note (Call 2 of the run)
  const failures = evaluateGuardrails();
  const guardrailsPass = failures.length === 0;
  if (guardrailsPass === true) {
    try {
      await generateNote();
    } catch (noteErr) {
      console.warn("Pipeline note generation error:", noteErr);
    }
  }
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
      <span class="badge-status-pass" style="font-size: 11px;">Profile ready</span>
    `;
  } else if (isWaiting === true) {
    const countdown = rowState.countdown || quotaState.countdownSeconds || 60;
    statusBadgeHtml = `
      <span class="badge-status-waiting" style="font-size: 11px;">Waiting for quota (${countdown}s)</span>
    `;
  } else if (isFetching === true) {
    statusBadgeHtml = `
      <span class="badge-status-running" style="font-size: 11px;">Fetching profile...</span>
    `;
  } else if (isUnavailable === true) {
    statusBadgeHtml = `
      <span class="badge-status-fail" style="font-size: 11px;">Summary unavailable</span>
    `;
  }

  // Update summary cell
  const summaryCell = document.getElementById(`s5-summary-cell-${ticker}`);
  if (summaryCell !== null && rowState.profile !== null) {
    const summary = rowState.profile.summary;
    const fullDesc = rowState.profile.description;
    const hasMore = fullDesc !== "Summary unavailable" && fullDesc.trim() !== summary.trim();

    summaryCell.innerHTML = `
      <div class="summary-cell-content">
        <p class="three-sentence-summary">${escapeHtml(summary)}</p>
        ${statusBadgeHtml.length > 0 ? `<div style="margin-top: 4px;">${statusBadgeHtml}</div>` : ""}
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
  } else if (summaryCell !== null) {
    summaryCell.innerHTML = `
      <div class="summary-cell-content">
        ${statusBadgeHtml}
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

  const gatedEl = document.getElementById("s5-gated-count");
  if (gatedEl !== null) {
    const gatedCount = (appState.gatedSurvivors || []).length;
    gatedEl.textContent = `${gatedCount} / ${survivors.length}`;
  }

  const gatedSubtextEl = document.getElementById("s5-gated-subtext");
  if (gatedSubtextEl !== null) {
    const diff = survivors.length - (appState.gatedSurvivors || []).length;
    gatedSubtextEl.textContent = diff > 0 ? `${diff} excluded by gate` : "Passed qualitative gate";
  }

  const gateModeValEl = document.getElementById("s5-gate-mode-val");
  if (gateModeValEl !== null) {
    gateModeValEl.textContent = (appState.settings.gateMode || "exclude").toUpperCase();
  }

  const gateModeSubtextEl = document.getElementById("s5-gate-mode-subtext");
  if (gateModeSubtextEl !== null) {
    const isEx = (appState.settings.gateMode || "exclude") === "exclude";
    gateModeSubtextEl.textContent = isEx ? "Headwind names removed" : "Headwind names kept & flagged";
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
 * - Survivor business summaries and qualitative text gate table with 6 columns
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

  // Sync gate mode selector in Stage 5 actions bar
  const gateSelectEl = document.getElementById("s5-gate-mode-select");
  if (gateSelectEl !== null) {
    gateSelectEl.value = appState.settings.gateMode || "exclude";
  }

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
      alertsListEl.innerHTML = `<p class="table-empty-row" style="padding: 12px;">No macro alerts loaded. ${isDone ? "Macro feed was unreachable; technical survivors pass as Unclassified." : "Click Assemble & Classify to fetch."}</p>`;
    }
  }

  // Render Business Summaries & Text Gate Results Table
  const tbodyEl = document.getElementById("stage-5-profiles-tbody");
  const profilesStatusBadge = document.getElementById("s5-profiles-status-badge");
  const gateMode = appState.settings.gateMode || "exclude";
  const isExcludeMode = gateMode === "exclude";

  if (tbodyEl !== null) {
    const rowsHtml = survivors.map((ticker) => {
      const sector = getConstituentSector(ticker);
      const profile = appState.profiles ? appState.profiles[ticker] : null;
      const rowState = survivorRowState[ticker];
      const labelEntry = appState.labels ? appState.labels[ticker] : null;

      let summaryText = "Pending fetch...";
      let fullDesc = "";
      let hasMore = false;
      let profileBadgeHtml = "";

      if (profile !== null && profile !== undefined) {
        summaryText = profile.summary;
        fullDesc = profile.description;
        hasMore = fullDesc !== "Summary unavailable" && fullDesc.trim() !== summaryText.trim();
        const creditSourceLabel = profile.creditSource === "provider header" || quotaState.isEstimated === false
          ? "credits from provider header"
          : "credits estimated locally";

        if (profile.status === "done") {
          profileBadgeHtml = `<span class="badge-status-pass" style="font-size: 11px;">Profile ready</span>`;
        } else if (profile.status === "unavailable") {
          profileBadgeHtml = `<span class="badge-status-fail" style="font-size: 11px;">Summary unavailable</span>`;
        }
      } else if (rowState !== undefined) {
        if (rowState.status === "waiting") {
          const countdown = rowState.countdown || quotaState.countdownSeconds || 60;
          profileBadgeHtml = `<span class="badge-status-waiting" style="font-size: 11px;">Waiting for quota (${countdown}s)</span>`;
        } else if (rowState.status === "fetching") {
          profileBadgeHtml = `<span class="badge-status-running" style="font-size: 11px;">Fetching profile...</span>`;
        }
      }

      // Classifier label & reason cell
      let labelBadgeClass = "badge";
      let labelText = "Pending";
      let reasonText = "";
      let showRawBtn = false;

      if (labelEntry !== null && labelEntry !== undefined) {
        labelText = labelEntry.label;
        reasonText = labelEntry.reason || "";
        const isMalformed = labelEntry.isMalformed === true || labelEntry.originalMalformed === true;
        if (isMalformed === true) {
          labelBadgeClass = "badge badge-malformed";
          showRawBtn = true;
        } else if (labelText === "Headwind") {
          labelBadgeClass = "badge badge-headwind";
        } else if (labelText === "Neutral") {
          labelBadgeClass = "badge badge-neutral";
        } else if (labelText === "Tailwind") {
          labelBadgeClass = "badge badge-tailwind";
        } else if (labelText === "Unclassified") {
          labelBadgeClass = "badge badge-unclassified";
          if (labelEntry.originalMalformed === true) {
            showRawBtn = true;
          }
        }
      }

      const classificationCellHtml = labelEntry !== null && labelEntry !== undefined
        ? `
          <div class="classification-cell-box">
            <span class="${labelBadgeClass}">${escapeHtml(labelText)}</span>
            ${reasonText.length > 0 ? `<p class="classifier-reason-text">${escapeHtml(reasonText)}</p>` : ""}
            ${showRawBtn === true ? `
              <button type="button" class="btn-raw-response" data-action="view-raw-response" data-ticker="${escapeHtml(ticker)}">
                View raw response
              </button>
            ` : ""}
          </div>
        `
        : `<span class="badge-status-waiting">Pending</span>`;

      // Cited Alerts cell
      let citedAlertsHtml = `<span class="text-subtle">None cited</span>`;
      if (labelEntry !== null && labelEntry !== undefined && Array.isArray(labelEntry.alerts_cited) === true && labelEntry.alerts_cited.length > 0) {
        citedAlertsHtml = `
          <div class="cited-alerts-list">
            ${labelEntry.alerts_cited.map((a) => `<span class="macro-tag macro-tag-cited">${escapeHtml(a)}</span>`).join("")}
          </div>
        `;
      }

      // Gate Status cell
      let gateStatusHtml = `<span class="badge-status-waiting">Pending</span>`;
      if (labelEntry !== null && labelEntry !== undefined) {
        if (isExcludeMode === true) {
          if (labelEntry.isMalformed === true) {
            gateStatusHtml = `<span class="badge badge-status-fail">Held out (malformed)</span>`;
          } else if (labelEntry.label === "Headwind") {
            gateStatusHtml = `<span class="badge badge-status-fail">Excluded by gate</span>`;
          } else {
            gateStatusHtml = `<span class="badge badge-status-pass">Passed gate</span>`;
          }
        } else {
          // Warn mode
          if (labelEntry.label === "Headwind") {
            gateStatusHtml = `<span class="badge badge-status-warning">Flagged (Kept)</span>`;
          } else if (labelEntry.label === "Unclassified") {
            gateStatusHtml = `<span class="badge badge-status-pass">Passed (Unclassified)</span>`;
          } else {
            gateStatusHtml = `<span class="badge badge-status-pass">Passed gate</span>`;
          }
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
              ${profileBadgeHtml.length > 0 ? `<div style="margin-top: 4px;">${profileBadgeHtml}</div>` : ""}
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
          <td id="s5-label-cell-${ticker}">
            ${classificationCellHtml}
          </td>
          <td id="s5-alerts-cell-${ticker}">
            ${citedAlertsHtml}
          </td>
          <td id="s5-gate-cell-${ticker}">
            ${gateStatusHtml}
          </td>
        </tr>
      `;
    }).join("");

    tbodyEl.innerHTML = rowsHtml;

    if (profilesStatusBadge !== null) {
      const allClassified = survivors.every((s) => appState.labels && appState.labels[s] && appState.labels[s].label !== undefined);
      if (allClassified === true) {
        profilesStatusBadge.className = "badge badge-status-pass";
        profilesStatusBadge.textContent = "Done";
      } else {
        const classifiedCount = survivors.filter((s) => appState.labels && appState.labels[s] && appState.labels[s].label !== undefined).length;
        profilesStatusBadge.className = "badge";
        profilesStatusBadge.textContent = `${classifiedCount} / ${survivors.length} Classified`;
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

  // Run Stage 5 button (Assemble & Classify)
  const runBtn = document.getElementById("btn-run-stage-5");
  if (runBtn !== null) {
    runBtn.addEventListener("click", () => {
      runStage5Pipeline(false);
    });
  }

  // Regenerate labels button
  const regenBtn = document.getElementById("btn-regenerate-labels");
  if (regenBtn !== null) {
    regenBtn.addEventListener("click", () => {
      regenerateLabels();
    });
  }

  // Label new survivors button
  const labelNewBtn = document.getElementById("btn-label-new-survivors");
  if (labelNewBtn !== null) {
    labelNewBtn.addEventListener("click", () => {
      labelNewSurvivors();
    });
  }

  // Gate mode select in Stage 5 actions bar
  const gateSelect = document.getElementById("s5-gate-mode-select");
  if (gateSelect !== null) {
    gateSelect.addEventListener("change", (evt) => {
      validateAndSetGateMode(evt.target.value);
    });
  }

  // Raw response modal close buttons
  const rawModal = document.getElementById("modal-raw-response");
  const closeBtn = document.getElementById("btn-close-raw-modal");
  const closeFooterBtn = document.getElementById("btn-close-raw-modal-footer");

  const hideRawModal = () => {
    if (rawModal !== null) {
      rawModal.classList.add("hidden");
    }
  };

  if (closeBtn !== null) {
    closeBtn.addEventListener("click", hideRawModal);
  }
  if (closeFooterBtn !== null) {
    closeFooterBtn.addEventListener("click", hideRawModal);
  }
  if (rawModal !== null) {
    rawModal.addEventListener("click", (evt) => {
      if (evt.target === rawModal) {
        hideRawModal();
      }
    });
  }

  // Delegated click handler for More/Less toggle and View Raw Response
  document.addEventListener("click", (evt) => {
    const target = evt.target;
    if (target === null || target === undefined) {
      return;
    }

    // More / Less description toggle
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
      return;
    }

    // View Raw Response button
    const rawBtn = target.closest("[data-action='view-raw-response']");
    if (rawBtn !== null) {
      const preEl = document.getElementById("raw-response-content");
      if (preEl !== null) {
        preEl.textContent = appState.rawLabelResponse || "No raw response recorded.";
      }
      if (rawModal !== null) {
        rawModal.classList.remove("hidden");
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

  // Backtest settings
  const holdingInput = document.getElementById("setting-holding-period");
  if (holdingInput !== null && document.activeElement !== holdingInput) {
    holdingInput.value = String(appState.settings.holdingPeriod || 20);
  }

  const exitInput = document.getElementById("setting-exit-threshold");
  if (exitInput !== null && document.activeElement !== exitInput) {
    exitInput.value = String(appState.settings.exitThreshold || 60);
  }

  const cadenceInput = document.getElementById("setting-cadence");
  if (cadenceInput !== null && document.activeElement !== cadenceInput) {
    cadenceInput.value = String(appState.settings.cadence || 5);
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

  // Backtest: Holding Period
  const holdingInput = document.getElementById("setting-holding-period");
  if (holdingInput !== null) {
    holdingInput.addEventListener("change", (e) => {
      validateAndSetHoldingPeriod(e.target.value);
    });
  }

  // Backtest: Exit Threshold
  const exitInput = document.getElementById("setting-exit-threshold");
  if (exitInput !== null) {
    exitInput.addEventListener("change", (e) => {
      validateAndSetExitThreshold(e.target.value);
    });
  }

  // Backtest: Cadence
  const cadenceInput = document.getElementById("setting-cadence");
  if (cadenceInput !== null) {
    cadenceInput.addEventListener("change", (e) => {
      validateAndSetCadence(e.target.value);
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

// ============================================================================
// STAGE 6: FEASIBILITY, SIMPLEX PROJECTION, AND SECTOR CONSTRAINTS (DYKSTRA)
// ============================================================================

/**
 * Builds a map from sector name to constituent index arrays,
 * matching the order of the supplied ticker list.
 *
 * @param {string[]} tickers - Array of ticker strings in order
 * @param {string[]|Record<string, number[]>|null} [sectors] - Optional sector list or sector group map
 * @returns {Record<string, number[]>} Sector names mapped to array of 0-based constituent indices
 */
export function buildSectorGroups(tickers, sectors = null) {
  const isArray = Array.isArray(tickers) === true;
  if (isArray === false) {
    throw new Error("buildSectorGroups requires an array of ticker strings.");
  }

  const groups = {};
  for (let i = 0; i < tickers.length; i += 1) {
    const ticker = tickers[i];
    let sectorName = "";
    const hasSectorsArray = Array.isArray(sectors) === true && i < sectors.length && typeof sectors[i] === "string";
    if (hasSectorsArray === true) {
      sectorName = sectors[i];
    } else {
      sectorName = getConstituentSector(ticker);
    }
    const hasGroup = groups[sectorName] !== undefined;
    if (hasGroup === false) {
      groups[sectorName] = [];
    }
    groups[sectorName].push(i);
  }
  return groups;
}

/**
 * Convenience helper returning sector groups for the current gated survivors list.
 *
 * @returns {Record<string, number[]>} Sector groups for appState.gatedSurvivors
 */
export function getGatedSectorGroups() {
  const survivors = Array.isArray(appState.gatedSurvivors) === true ? appState.gatedSurvivors : [];
  return buildSectorGroups(survivors);
}

/**
 * Evaluates whether the allocation problem is mathematically feasible.
 * The problem is feasible only when cap times the number of names is at least 1
 * and the names span at least two sectors.
 *
 * @param {string[]} tickers - Constituent ticker symbols
 * @param {string[]|Record<string, number[]>|number|null} [sectors] - Optional sectors, sectorGroups, or cap if called with two arguments
 * @param {number} [cap] - Maximum allowed weight per asset
 * @returns {{ feasible: boolean, cause: string, smallestFeasibleCap: string|null }} Feasibility assessment result
 */
export function checkFeasibility(tickers, sectors = null, cap = undefined) {
  let effectiveSectors = sectors;
  let effectiveCap = cap;

  // Support two-argument invocation: checkFeasibility(tickers, cap)
  const isSecondArgNumber = typeof sectors === "number" && (cap === undefined || cap === null);
  if (isSecondArgNumber === true) {
    effectiveCap = sectors;
    effectiveSectors = null;
  }

  const hasCap = typeof effectiveCap === "number" && isNaN(effectiveCap) === false;
  if (hasCap === false) {
    effectiveCap = appState.settings.weightCap || 0.25;
  }

  const n = Array.isArray(tickers) === true ? tickers.length : 0;
  const hasNoNames = n === 0;
  if (hasNoNames === true) {
    return {
      feasible: false,
      cause: "No constituents selected; the screen must be relaxed.",
      smallestFeasibleCap: "The screen must be relaxed"
    };
  }

  // 1. Cap condition: cap * n must be at least 1.0 (with 1e-9 tolerance)
  const capTimesN = n * effectiveCap;
  const capIsFeasible = capTimesN >= (1.0 - 1e-9);
  if (capIsFeasible === false) {
    const smallestCapPercent = Math.ceil(100 / n);
    const exceedsFiftyPercent = smallestCapPercent > 50;
    if (exceedsFiftyPercent === true) {
      return {
        feasible: false,
        cause: "Smallest feasible cap exceeds 50%; the screen must be relaxed.",
        smallestFeasibleCap: "The screen must be relaxed"
      };
    } else {
      return {
        feasible: false,
        cause: `Weight cap of ${Math.round(effectiveCap * 100)}% times ${n} names is below 100%. Smallest feasible cap on the 1% grid is ${smallestCapPercent}%.`,
        smallestFeasibleCap: `${smallestCapPercent}%`
      };
    }
  }

  // 2. Sector condition: names must span at least two distinct sectors
  let sectorList = [];
  const isSectorArray = Array.isArray(effectiveSectors) === true && effectiveSectors.length === n;
  if (isSectorArray === true) {
    sectorList = effectiveSectors;
  } else {
    const isSectorObject = effectiveSectors !== null && typeof effectiveSectors === "object";
    if (isSectorObject === true) {
      sectorList = new Array(n).fill("");
      const entries = effectiveSectors instanceof Map ? Array.from(effectiveSectors.entries()) : Object.entries(effectiveSectors);
      for (let s = 0; s < entries.length; s += 1) {
        const [secName, indices] = entries[s];
        if (Array.isArray(indices) === true) {
          for (let j = 0; j < indices.length; j += 1) {
            const idx = indices[j];
            if (idx >= 0 && idx < n) {
              sectorList[idx] = secName;
            }
          }
        }
      }
    } else {
      sectorList = tickers.map((ticker) => {
        return getConstituentSector(ticker);
      });
    }
  }

  const distinctSectors = new Set();
  for (let i = 0; i < sectorList.length; i += 1) {
    const sName = sectorList[i];
    const isNamed = typeof sName === "string" && sName.trim().length > 0;
    if (isNamed === true) {
      distinctSectors.add(sName.trim());
    }
  }

  const hasAtLeastTwoSectors = distinctSectors.size >= 2;
  if (hasAtLeastTwoSectors === false) {
    return {
      feasible: false,
      cause: "All survivors sit in one sector; at least two sectors are required to satisfy the 50% sector limit. The screen must be relaxed or a name in another sector selected.",
      smallestFeasibleCap: null
    };
  }

  return {
    feasible: true,
    cause: "",
    smallestFeasibleCap: null
  };
}

/**
 * Internal helper to project a vector onto the capped simplex into a target buffer.
 *
 * @param {ArrayLike<number>} v - Input vector
 * @param {number} cap - Upper bound per asset
 * @param {Float64Array|number[]} out - Target buffer
 * @returns {Float64Array|number[]} The updated target buffer
 */
function projectCappedSimplexInto(v, cap, out) {
  const n = v.length;
  const isEmpty = n === 0;
  if (isEmpty === true) {
    return out;
  }

  let alreadyFeasible = true;
  let currentSum = 0;
  for (let i = 0; i < n; i += 1) {
    const val = v[i];
    const inBounds = val >= -1e-12 && val <= cap + 1e-12;
    if (inBounds === false) {
      alreadyFeasible = false;
    }
    currentSum += val;
  }

  const sumIsCloseToOne = Math.abs(currentSum - 1) <= 1e-12;
  const isAlreadyFeasible = alreadyFeasible === true && sumIsCloseToOne === true;
  if (isAlreadyFeasible === true) {
    for (let i = 0; i < n; i += 1) {
      out[i] = v[i];
    }
    return out;
  }

  let vMin = v[0];
  let vMax = v[0];
  for (let i = 1; i < n; i += 1) {
    const val = v[i];
    if (val < vMin) {
      vMin = val;
    }
    if (val > vMax) {
      vMax = val;
    }
  }

  let tauLow = vMin - cap - 1.0;
  let tauHigh = vMax + 1.0;

  for (let step = 0; step < 100; step += 1) {
    const tauMid = (tauLow + tauHigh) / 2;
    let sumW = 0;
    for (let i = 0; i < n; i += 1) {
      const w = Math.min(cap, Math.max(0, v[i] - tauMid));
      out[i] = w;
      sumW += w;
    }

    const diff = sumW - 1;
    const isWithinTolerance = Math.abs(diff) <= 1e-12;
    if (isWithinTolerance === true) {
      break;
    }

    const sumIsGreater = sumW > 1;
    if (sumIsGreater === true) {
      tauLow = tauMid;
    } else {
      tauHigh = tauMid;
    }
  }

  return out;
}

/**
 * Euclidean projection onto the capped simplex:
 * { w | sum(w) = 1, 0 <= w_i <= cap }
 * via bisection on the Lagrange multiplier tau.
 * Never mutates the input vector.
 *
 * @param {number[]} v - Candidate weight vector
 * @param {number} cap - Upper bound per asset
 * @returns {number[]} New array containing projected weights
 */
export function projectCappedSimplex(v, cap) {
  const isArray = Array.isArray(v) === true;
  if (isArray === false) {
    throw new Error("projectCappedSimplex requires an array of numbers.");
  }
  const n = v.length;
  const out = new Array(n);
  projectCappedSimplexInto(v, cap, out);
  return out;
}

/**
 * Euclidean projection onto the half-space for a single GICS sector:
 * { w | sum_{i in sectorIndices} w_i <= limit }
 * If the sum exceeds the limit (0.5), subtracts the excess equally from each constituent.
 * Never mutates the input vector.
 *
 * @param {number[]} v - Candidate weight vector
 * @param {number[]} sectorIndices - 0-based indices of constituents in the sector
 * @param {number} [limit=0.5] - Maximum allowed sector allocation
 * @returns {number[]} New array containing projected weights
 */
export function projectSectorHalfSpace(v, sectorIndices, limit = 0.5) {
  const isArray = Array.isArray(v) === true;
  if (isArray === false) {
    throw new Error("projectSectorHalfSpace requires an array of weights.");
  }
  const hasIndices = Array.isArray(sectorIndices) === true && sectorIndices.length > 0;
  if (hasIndices === false) {
    return v.slice();
  }

  let sectorSum = 0;
  for (let i = 0; i < sectorIndices.length; i += 1) {
    const idx = sectorIndices[i];
    const isInBounds = idx >= 0 && idx < v.length;
    if (isInBounds === true) {
      sectorSum += v[idx];
    }
  }

  const exceedsLimit = sectorSum > limit;
  if (exceedsLimit === false) {
    return v.slice();
  }

  const excess = sectorSum - limit;
  const reduction = excess / sectorIndices.length;
  const result = v.slice();
  for (let i = 0; i < sectorIndices.length; i += 1) {
    const idx = sectorIndices[i];
    const isInBounds = idx >= 0 && idx < v.length;
    if (isInBounds === true) {
      result[idx] = result[idx] - reduction;
    }
  }
  return result;
}

/**
 * Validates whether a weight vector satisfies all portfolio constraints within 1e-9 tolerance:
 * 1. Every weight is at least -1e-9 and at most cap + 1e-9
 * 2. Total weight sum is within 1e-9 of 1.0
 * 3. Every sector total is at most 0.5 + 1e-9
 *
 * @param {number[]} w - Weight vector to validate
 * @param {number} [cap=0.25] - Maximum asset weight
 * @param {Record<string, number[]>|Map<string, number[]>|null} [sectorGroups] - Sector constituent index map
 * @returns {boolean} True if all constraints are satisfied within tolerance
 */
export function validateWeights(w, cap = 0.25, sectorGroups = null) {
  const isArray = Array.isArray(w) === true;
  const hasItems = isArray === true && w.length > 0;
  if (hasItems === false) {
    return false;
  }

  const effectiveCap = typeof cap === "number" && isNaN(cap) === false ? cap : 0.25;
  let totalSum = 0;

  for (let i = 0; i < w.length; i += 1) {
    const weight = w[i];
    const isAboveMin = weight >= -1e-9;
    const isBelowMax = weight <= effectiveCap + 1e-9;
    const isValidComponent = isAboveMin === true && isBelowMax === true;
    if (isValidComponent === false) {
      return false;
    }
    totalSum += weight;
  }

  const sumDiff = Math.abs(totalSum - 1);
  const isSumOne = sumDiff <= 1e-9;
  if (isSumOne === false) {
    return false;
  }

  const hasSectors = sectorGroups !== null && typeof sectorGroups === "object";
  if (hasSectors === true) {
    const sectorEntries = sectorGroups instanceof Map
      ? Array.from(sectorGroups.entries())
      : Object.entries(sectorGroups);

    for (let s = 0; s < sectorEntries.length; s += 1) {
      const [secName, indices] = sectorEntries[s];
      const hasIndices = Array.isArray(indices) === true && indices.length > 0;
      if (hasIndices === true) {
        let sectorSum = 0;
        for (let j = 0; j < indices.length; j += 1) {
          const idx = indices[j];
          const isInBounds = idx >= 0 && idx < w.length;
          if (isInBounds === true) {
            sectorSum += w[idx];
          }
        }
        const sectorLimit = effectiveCap > 0.5 ? effectiveCap : 0.5;
        const sectorWithinLimit = sectorSum <= sectorLimit + 1e-9;
        if (sectorWithinLimit === false) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Projects a candidate weight vector onto the intersection of the capped simplex
 * and all GICS sector half-spaces using Dykstra's alternating projection algorithm.
 * Never mutates the input array.
 *
 * @param {number[]} v - Candidate weight vector
 * @param {number} cap - Maximum weight per asset
 * @param {Record<string, number[]>|Map<string, number[]>|null} sectorGroups - Sector to index array mapping
 * @returns {number[]} Feasible weight vector
 */
export function projectFeasible(v, cap, sectorGroups) {
  const isArray = Array.isArray(v) === true;
  if (isArray === false) {
    throw new Error("projectFeasible requires an array of numbers.");
  }
  const n = v.length;
  const isEmpty = n === 0;
  if (isEmpty === true) {
    return [];
  }

  const sectorIndicesList = [];
  const hasSectorGroups = sectorGroups !== null && typeof sectorGroups === "object";
  if (hasSectorGroups === true) {
    if (sectorGroups instanceof Map) {
      for (const indices of sectorGroups.values()) {
        const hasValidIndices = Array.isArray(indices) === true && indices.length > 0;
        if (hasValidIndices === true) {
          sectorIndicesList.push(indices);
        }
      }
    } else {
      const keys = Object.keys(sectorGroups);
      for (let k = 0; k < keys.length; k += 1) {
        const indices = sectorGroups[keys[k]];
        const hasValidIndices = Array.isArray(indices) === true && indices.length > 0;
        if (hasValidIndices === true) {
          sectorIndicesList.push(indices);
        }
      }
    }
  }

  const m = sectorIndicesList.length;
  const sectorLimit = typeof cap === "number" && cap > 0.5 ? cap : 0.5;

  // Pre-allocate working memory to maintain allocation-free execution in the cycle loop
  const p = new Array(m + 1);
  for (let k = 0; k <= m; k += 1) {
    p[k] = new Float64Array(n);
  }

  const x = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    x[i] = v[i];
  }

  const xPrev = new Float64Array(n);
  const y = new Float64Array(n);
  const tempProjected = new Float64Array(n);

  for (let cycle = 0; cycle < 200; cycle += 1) {
    for (let i = 0; i < n; i += 1) {
      xPrev[i] = x[i];
    }

    // 1. Constraint 0: Capped simplex projection
    for (let i = 0; i < n; i += 1) {
      y[i] = x[i] + p[0][i];
    }
    projectCappedSimplexInto(y, cap, tempProjected);
    for (let i = 0; i < n; i += 1) {
      p[0][i] = y[i] - tempProjected[i];
      x[i] = tempProjected[i];
    }

    // 2. Constraints 1..m: GICS sector half-space projections
    for (let s = 0; s < m; s += 1) {
      const k = s + 1;
      const secIndices = sectorIndicesList[s];
      for (let i = 0; i < n; i += 1) {
        y[i] = x[i] + p[k][i];
      }

      let sectorSum = 0;
      for (let j = 0; j < secIndices.length; j += 1) {
        const idx = secIndices[j];
        if (idx >= 0 && idx < n) {
          sectorSum += y[idx];
        }
      }

      const exceedsSectorLimit = sectorSum > sectorLimit;
      if (exceedsSectorLimit === true) {
        const excess = sectorSum - sectorLimit;
        const reduction = excess / secIndices.length;
        for (let i = 0; i < n; i += 1) {
          tempProjected[i] = y[i];
        }
        for (let j = 0; j < secIndices.length; j += 1) {
          const idx = secIndices[j];
          if (idx >= 0 && idx < n) {
            tempProjected[idx] = tempProjected[idx] - reduction;
          }
        }
      } else {
        for (let i = 0; i < n; i += 1) {
          tempProjected[i] = y[i];
        }
      }

      for (let i = 0; i < n; i += 1) {
        p[k][i] = y[i] - tempProjected[i];
        x[i] = tempProjected[i];
      }
    }

    let maxChange = 0;
    for (let i = 0; i < n; i += 1) {
      const diff = Math.abs(x[i] - xPrev[i]);
      if (diff > maxChange) {
        maxChange = diff;
      }
    }

    const maxChangeIsBelowTolerance = maxChange < 1e-12;
    const cycleLimitIsReached = cycle >= 199;
    const shouldStop = maxChangeIsBelowTolerance === true || cycleLimitIsReached === true;
    if (shouldStop === true) {
      break;
    }
  }

  const result = Array.from(x);

  // Assert that output adheres to all constraints within 1e-9 tolerance
  const isValid = validateWeights(result, cap, sectorGroups);
  if (isValid === false) {
    throw new Error("projectFeasible assertion failed: output weights violate constraints (weight below 0, above cap, or sector above limit by more than 1e-9).");
  }

  return result;
}

/**
 * Computes the minimum variance portfolio weights via projected gradient descent (PGD):
 * minimizes w' Sigma w
 * subject to sum(w) = 1, 0 <= w_i <= cap, and every sector total <= 0.5.
 *
 * @param {number[][]} sigma - Covariance matrix of daily simple returns
 * @param {number} [cap] - Maximum allowed weight per asset
 * @param {Record<string, number[]>|Map<string, number[]>|null} [sectorGroups] - Map from sector name to constituent index arrays
 * @returns {{ feasible: boolean, weights?: number[], iterations?: number, objective?: number, converged?: boolean, cause?: string, message?: string }}
 */
export function solveMinimumVariance(sigma, cap = undefined, sectorGroups = null) {
  const isSigmaArray = Array.isArray(sigma) === true;
  const n = isSigmaArray === true ? sigma.length : 0;
  const hasNoDimensions = n === 0;
  if (hasNoDimensions === true) {
    return {
      feasible: false,
      cause: "Covariance matrix is empty."
    };
  }

  let effectiveCap = cap;
  const hasCap = typeof effectiveCap === "number" && isNaN(effectiveCap) === false;
  if (hasCap === false) {
    effectiveCap = appState.settings.weightCap || 0.25;
  }

  // 1. Derive constituent sector list and verify feasibility with checkFeasibility
  let dummyTickers = [];
  const hasGatedSurvivors = Array.isArray(appState.gatedSurvivors) === true && appState.gatedSurvivors.length === n;
  if (hasGatedSurvivors === true) {
    dummyTickers = appState.gatedSurvivors.slice();
  } else {
    dummyTickers = Array.from({ length: n }, (_, i) => String(i));
  }

  const sectorList = new Array(n).fill("");
  const hasSectorGroups = sectorGroups !== null && typeof sectorGroups === "object";
  if (hasSectorGroups === true) {
    const entries = sectorGroups instanceof Map
      ? Array.from(sectorGroups.entries())
      : Object.entries(sectorGroups);
    for (let s = 0; s < entries.length; s += 1) {
      const [secName, indices] = entries[s];
      const hasIndices = Array.isArray(indices) === true;
      if (hasIndices === true) {
        for (let j = 0; j < indices.length; j += 1) {
          const idx = indices[j];
          const inBounds = idx >= 0 && idx < n;
          if (inBounds === true) {
            sectorList[idx] = secName;
          }
        }
      }
    }
  } else {
    for (let i = 0; i < n; i += 1) {
      sectorList[i] = getConstituentSector(dummyTickers[i]);
    }
  }

  const feasResult = checkFeasibility(dummyTickers, sectorList, effectiveCap);
  const isFeasible = feasResult.feasible === true;
  if (isFeasible === false) {
    return {
      feasible: false,
      cause: feasResult.cause
    };
  }

  // 2. Start at equal weight (1/n each) projected once onto the feasible set
  let w = new Array(n).fill(1 / n);
  w = projectFeasible(w, effectiveCap, sectorGroups);

  // 3. Compute L as the Gershgorin bound on the largest eigenvalue of 2 Sigma:
  // the maximum over rows of the sum of absolute values in that row of 2 Sigma.
  let L = 0;
  for (let i = 0; i < n; i += 1) {
    let rowSum = 0;
    for (let j = 0; j < n; j += 1) {
      const absVal = Math.abs(2 * sigma[i][j]);
      rowSum += absVal;
    }
    const isRowGreater = rowSum > L;
    if (isRowGreater === true) {
      L = rowSum;
    }
  }
  const safeL = Math.max(L, 1e-12);
  const stepSize = 1 / safeL;

  // Initial objective f0 = w' Sigma w
  let fPrevious = 0;
  for (let i = 0; i < n; i += 1) {
    let sigW_i = 0;
    for (let j = 0; j < n; j += 1) {
      sigW_i += sigma[i][j] * w[j];
    }
    fPrevious += w[i] * sigW_i;
  }

  let iterations = 0;
  let converged = false;

  // 4. Projected Gradient Descent iterations
  for (let iter = 1; iter <= 5000; iter += 1) {
    iterations = iter;

    // Compute gradient: 2 Sigma w
    const v = new Array(n);
    for (let i = 0; i < n; i += 1) {
      let grad_i = 0;
      for (let j = 0; j < n; j += 1) {
        grad_i += 2 * sigma[i][j] * w[j];
      }
      // Step against gradient with step size 1/L
      v[i] = w[i] - stepSize * grad_i;
    }

    // Project result with projectFeasible
    const wNext = projectFeasible(v, effectiveCap, sectorGroups);

    // Compute objective f = w' Sigma w
    let fCurrent = 0;
    for (let i = 0; i < n; i += 1) {
      let sigW_i = 0;
      for (let j = 0; j < n; j += 1) {
        sigW_i += sigma[i][j] * wNext[j];
      }
      fCurrent += wNext[i] * sigW_i;
    }

    // Relative change: |f_k - f_(k-1)| / max(|f_(k-1)|, 1e-18)
    const fDiff = Math.abs(fCurrent - fPrevious);
    const denom = Math.max(Math.abs(fPrevious), 1e-18);
    const relativeChange = fDiff / denom;

    let maxWeightChange = 0;
    for (let i = 0; i < n; i += 1) {
      const wDiff = Math.abs(wNext[i] - w[i]);
      if (wDiff > maxWeightChange) {
        maxWeightChange = wDiff;
      }
    }

    w = wNext;
    fPrevious = fCurrent;

    const relativeChangeIsBelowTolerance = relativeChange < 1e-8;
    const weightChangeIsBelowTolerance = maxWeightChange < 1e-6;
    const isSatisfied = relativeChangeIsBelowTolerance === true && (weightChangeIsBelowTolerance === true || iter >= 25);

    if (isSatisfied === true) {
      converged = true;
      break;
    }
  }

  // 5. Validate weights with validateWeights
  const weightsAreValid = validateWeights(w, effectiveCap, sectorGroups);
  if (weightsAreValid === false) {
    return {
      feasible: true,
      weights: w,
      iterations,
      objective: fPrevious,
      converged: false,
      message: "The solver, not the input, is at fault: computed weights failed constraint validation."
    };
  }

  return {
    feasible: true,
    weights: w,
    iterations,
    objective: fPrevious,
    converged
  };
}

/**
 * ============================================================================
 * STAGE 6: PORTFOLIO METRICS, BENCHMARKS, DOLLAR ALLOCATIONS, & CONSISTENCY
 * ============================================================================
 */

/**
 * Formats a number as whole US dollars with commas.
 *
 * @param {number} amount
 * @returns {string} e.g. "$1,000,000"
 */
export function formatWholeDollars(amount) {
  const isNum = typeof amount === "number" && isNaN(amount) === false;
  if (isNum === false) {
    return "$0";
  }
  const rounded = Math.round(amount);
  return "$" + rounded.toLocaleString("en-US");
}

/**
 * Formats a ratio as a percentage with two decimal places.
 *
 * @param {number} val
 * @returns {string} e.g. "12.34%"
 */
export function formatPercentage(val) {
  const isNum = typeof val === "number" && isNaN(val) === false;
  if (isNum === false) {
    return "0.00%";
  }
  return (val * 100).toFixed(2) + "%";
}

/**
 * Formats a numeric value to two decimal places.
 *
 * @param {number} val
 * @returns {string} e.g. "1.23"
 */
export function formatTwoDecimals(val) {
  const isNum = typeof val === "number" && isNaN(val) === false;
  if (isNum === false) {
    return "0.00";
  }
  return val.toFixed(2);
}

/**
 * Formats a Sharpe ratio to two decimal places.
 *
 * @param {number} val
 * @returns {string} e.g. "1.23"
 */
export function formatSharpe(val) {
  return formatTwoDecimals(val);
}

/**
 * Formats a Beta value to two decimal places.
 *
 * @param {number} val
 * @returns {string} e.g. "0.85"
 */
export function formatBeta(val) {
  return formatTwoDecimals(val);
}

/**
 * Single display formatting suite shared by Stage 8 and the note payload builder.
 */
export const displayFormatters = {
  percentage: formatPercentage,
  dollars: formatWholeDollars,
  twoDecimals: formatTwoDecimals,
  sharpe: formatSharpe,
  beta: formatBeta
};

/**
 * Computes portfolio return, volatility, Sharpe ratio, and daily series.
 * In-sample: weights applied to trailing return series window.
 *
 * @param {number[]} weights
 * @param {Record<string, number[]>} returnSeriesByTicker
 * @param {string[]} tickers
 * @param {number} [riskFreeRate]
 * @returns {{ annualizedReturn: number, annualizedVolatility: number, sharpe: number, dailySeries: number[] }}
 */
export function computePortfolioSeries(weights, returnSeriesByTicker, tickers, riskFreeRate) {
  const isWeightsArray = Array.isArray(weights) === true;
  if (isWeightsArray === false || weights.length === 0) {
    throw new Error("computePortfolioSeries: weights must be a non-empty array.");
  }

  // 1. Verify weights sum to 1 within 1e-9 tolerance
  let weightSum = 0;
  for (let i = 0; i < weights.length; i += 1) {
    weightSum += weights[i];
  }
  const weightsAreValid = Math.abs(weightSum - 1.0) < 1e-9;
  if (weightsAreValid === false) {
    throw new Error(`Weights do not sum to 1 within 1e-9 (actual sum: ${weightSum}). Invalid weights cannot produce portfolio series.`);
  }

  // 2. Validate tickers and lengths
  const isTickersArray = Array.isArray(tickers) === true;
  const n = isTickersArray === true ? tickers.length : 0;
  const hasTickers = n > 0;
  if (hasTickers === false) {
    throw new Error("computePortfolioSeries: tickers must be a non-empty array.");
  }
  const lengthsMatch = weights.length === n;
  if (lengthsMatch === false) {
    throw new Error(`Length mismatch: weights length (${weights.length}) does not match tickers length (${n}).`);
  }

  // 3. Validate return series alignment
  const hasReturns = returnSeriesByTicker !== null && typeof returnSeriesByTicker === "object";
  if (hasReturns === false) {
    throw new Error("computePortfolioSeries: returnSeriesByTicker must be a valid object.");
  }
  const t0 = tickers[0];
  const s0 = returnSeriesByTicker[t0];
  const hasS0 = Array.isArray(s0) === true && s0.length > 0;
  if (hasS0 === false) {
    throw new Error(`Return series for ${t0} is missing or empty.`);
  }
  const T = s0.length;
  for (let i = 1; i < n; i += 1) {
    const sym = tickers[i];
    const s = returnSeriesByTicker[sym];
    const hasS = Array.isArray(s) === true;
    const sMatches = hasS === true && s.length === T;
    if (sMatches === false) {
      throw new Error(`Return series length mismatch for ${sym}: expected ${T}, got ${hasS ? s.length : 0}.`);
    }
  }

  // 4. Compute daily portfolio return series: weighted sum of survivor returns on each date
  const dailySeries = new Array(T);
  let sumDailyReturns = 0;
  for (let d = 0; d < T; d += 1) {
    let dayRet = 0;
    for (let i = 0; i < n; i += 1) {
      dayRet += weights[i] * returnSeriesByTicker[tickers[i]][d];
    }
    dailySeries[d] = dayRet;
    sumDailyReturns += dayRet;
  }

  // 5. Annualized return: arithmetic mean of daily returns times 252
  const meanDailyReturn = sumDailyReturns / T;
  const annualizedReturn = meanDailyReturn * 252;

  // 6. Annualized volatility: sample standard deviation (divide by n - 1) times sqrt(252)
  let sumSqDiff = 0;
  for (let d = 0; d < T; d += 1) {
    const diff = dailySeries[d] - meanDailyReturn;
    sumSqDiff += diff * diff;
  }
  const hasDf = T >= 2;
  const sampleVariance = hasDf === true ? sumSqDiff / (T - 1) : 0;
  const dailyStd = Math.sqrt(sampleVariance);
  const annualizedVolatility = dailyStd * Math.sqrt(252);

  // 7. Sharpe ratio: (annualizedReturn - riskFreeRate) / annualizedVolatility
  let effectiveRf = 0.0391;
  const hasRfParam = typeof riskFreeRate === "number" && isNaN(riskFreeRate) === false;
  if (hasRfParam === true) {
    effectiveRf = riskFreeRate;
  } else {
    const hasSettingsRf = appState.settings !== null && typeof appState.settings.riskFreeRate === "number";
    if (hasSettingsRf === true) {
      effectiveRf = appState.settings.riskFreeRate;
    }
  }
  const hasVol = annualizedVolatility > 1e-12;
  const sharpe = hasVol === true ? (annualizedReturn - effectiveRf) / annualizedVolatility : 0;

  return {
    annualizedReturn,
    annualizedVolatility,
    sharpe,
    dailySeries
  };
}

/**
 * Computes dollar allocations: weight * investmentAmount, rounded to whole dollars,
 * with the rounding residual assigned to the largest position so allocations sum to investmentAmount exactly.
 * Asserts no negative dollar allocation.
 *
 * @param {number[]} weights
 * @param {number} [investmentAmount]
 * @returns {number[]} Whole dollar allocations summing exactly to investmentAmount
 */
export function computeDollarAllocations(weights, investmentAmount) {
  const isArray = Array.isArray(weights) === true;
  if (isArray === false || weights.length === 0) {
    return [];
  }

  let amt = 1000000;
  const hasAmtParam = typeof investmentAmount === "number" && isNaN(investmentAmount) === false && investmentAmount > 0;
  if (hasAmtParam === true) {
    amt = investmentAmount;
  } else {
    const hasSettingsAmt = appState.settings !== null && typeof appState.settings.investmentAmount === "number";
    if (hasSettingsAmt === true) {
      amt = appState.settings.investmentAmount;
    }
  }

  const n = weights.length;
  const allocations = new Array(n);
  let totalAlloc = 0;
  let maxWeight = -Infinity;
  let maxIdx = 0;

  for (let i = 0; i < n; i += 1) {
    const rawDollar = weights[i] * amt;
    const rounded = Math.round(rawDollar);
    allocations[i] = rounded;
    totalAlloc += rounded;

    const isLarger = weights[i] > maxWeight;
    if (isLarger === true) {
      maxWeight = weights[i];
      maxIdx = i;
    }
  }

  // Assign rounding residual to the largest position
  const residual = amt - totalAlloc;
  allocations[maxIdx] += residual;

  // Assert no negative allocation and exact sum
  let verifiedSum = 0;
  for (let i = 0; i < n; i += 1) {
    const isNegative = allocations[i] < 0;
    if (isNegative === true) {
      throw new Error(`Negative dollar allocation at index ${i}: ${allocations[i]}`);
    }
    verifiedSum += allocations[i];
  }

  const sumMatches = verifiedSum === amt;
  if (sumMatches === false) {
    throw new Error(`Dollar allocations sum (${verifiedSum}) does not match investment amount (${amt}).`);
  }

  return allocations;
}

/**
 * Computes inverse volatility weights for tickers: 1/vol, normalized to sum to 1.
 *
 * @param {string[]} tickers
 * @param {Record<string, number[]>} [returnSeriesByTicker]
 * @returns {number[]}
 */
export function computeInverseVolWeights(tickers, returnSeriesByTicker) {
  const n = Array.isArray(tickers) === true ? tickers.length : 0;
  if (n === 0) {
    return [];
  }

  const raw = new Array(n);
  let sumRaw = 0;

  for (let i = 0; i < n; i += 1) {
    const sym = tickers[i];
    let vol = 0;
    const hasIndicators = appState.indicatorSeries !== null && typeof appState.indicatorSeries === "object";
    const hasAnnVol = hasIndicators === true && appState.indicatorSeries.annualizedVol !== null && typeof appState.indicatorSeries.annualizedVol === "object";
    if (hasAnnVol === true && typeof appState.indicatorSeries.annualizedVol[sym] === "number") {
      vol = appState.indicatorSeries.annualizedVol[sym];
    } else if (returnSeriesByTicker && Array.isArray(returnSeriesByTicker[sym]) === true) {
      vol = computeAnnualizedVol(computeDailyStd(returnSeriesByTicker[sym]));
    }
    const effectiveVol = vol > 1e-12 ? vol : 1e-12;
    const inv = 1 / effectiveVol;
    raw[i] = inv;
    sumRaw += inv;
  }

  const weights = new Array(n);
  for (let i = 0; i < n; i += 1) {
    weights[i] = sumRaw > 0 ? raw[i] / sumRaw : 1 / n;
  }

  return weights;
}

/**
 * Computes Equal Weight and Inverse Volatility reference benchmarks,
 * their feasibility, portfolio metrics, and dollar allocations.
 *
 * @param {string[]} tickers
 * @param {Record<string, number[]>} returnSeriesByTicker
 * @param {number} effectiveCap
 * @param {Record<string, number[]>} sectorGroups
 * @param {number} riskFreeRate
 * @param {number} investmentAmount
 * @returns {{ equalWeight: object, inverseVolatility: object }}
 */
export function computeBenchmarks(tickers, returnSeriesByTicker, effectiveCap, sectorGroups, riskFreeRate, investmentAmount) {
  const n = Array.isArray(tickers) === true ? tickers.length : 0;
  if (n === 0) {
    return {
      equalWeight: { weights: [], allocations: [], feasible: false, isReference: true },
      inverseVolatility: { weights: [], allocations: [], feasible: false, isReference: true }
    };
  }

  // 1. Equal Weight (1/n)
  const ewWeights = new Array(n).fill(1 / n);
  const isEWFeasible = validateWeights(ewWeights, effectiveCap, sectorGroups);
  const metricsEW = computePortfolioSeries(ewWeights, returnSeriesByTicker, tickers, riskFreeRate);
  const allocEW = computeDollarAllocations(ewWeights, investmentAmount);

  // 2. Inverse Volatility (1/vol, normalized)
  const ivWeights = computeInverseVolWeights(tickers, returnSeriesByTicker);
  const isIVFeasible = validateWeights(ivWeights, effectiveCap, sectorGroups);
  const metricsIV = computePortfolioSeries(ivWeights, returnSeriesByTicker, tickers, riskFreeRate);
  const allocIV = computeDollarAllocations(ivWeights, investmentAmount);

  return {
    equalWeight: {
      weights: ewWeights,
      allocations: allocEW,
      annualizedReturn: metricsEW.annualizedReturn,
      annualizedVolatility: metricsEW.annualizedVolatility,
      sharpe: metricsEW.sharpe,
      dailySeries: metricsEW.dailySeries,
      feasible: isEWFeasible,
      label: "Equal Weight",
      isReference: true
    },
    inverseVolatility: {
      weights: ivWeights,
      allocations: allocIV,
      annualizedReturn: metricsIV.annualizedReturn,
      annualizedVolatility: metricsIV.annualizedVolatility,
      sharpe: metricsIV.sharpe,
      dailySeries: metricsIV.dailySeries,
      feasible: isIVFeasible,
      label: "Inverse Volatility",
      isReference: true
    }
  };
}

/**
 * Consistency check:
 * Annualized volatility of minimum variance <= feasible benchmarks volatility (tolerance 1e-6).
 * Benchmarks that breach the cap or the sector limit are outside the feasible set and excluded from the check.
 * If breached, flags an upstream error naming the three volatilities.
 *
 * @param {object|number} metricsMV
 * @param {object|number} metricsEW
 * @param {object|number} metricsIV
 * @param {boolean} [isEWFeasible]
 * @param {boolean} [isIVFeasible]
 * @returns {{ passed: boolean, error: string|null, volatilities: { minVariance: number, equalWeight: number, inverseVolatility: number } }}
 */
export function checkConsistency(metricsMV, metricsEW, metricsIV, isEWFeasible, isIVFeasible) {
  const volMV = typeof metricsMV === "number" ? metricsMV : (metricsMV && typeof metricsMV.annualizedVolatility === "number" ? metricsMV.annualizedVolatility : 0);
  const volEW = typeof metricsEW === "number" ? metricsEW : (metricsEW && typeof metricsEW.annualizedVolatility === "number" ? metricsEW.annualizedVolatility : 0);
  const volIV = typeof metricsIV === "number" ? metricsIV : (metricsIV && typeof metricsIV.annualizedVolatility === "number" ? metricsIV.annualizedVolatility : 0);

  const ewFeas = typeof isEWFeasible === "boolean" ? isEWFeasible : (metricsEW && metricsEW.feasible === true);
  const ivFeas = typeof isIVFeasible === "boolean" ? isIVFeasible : (metricsIV && metricsIV.feasible === true);

  const mvExceedsEW = (ewFeas === true) && (volMV > volEW + 1e-6);
  const mvExceedsIV = (ivFeas === true) && (volMV > volIV + 1e-6);

  const passed = (mvExceedsEW === false) && (mvExceedsIV === false);
  const volMVStr = (volMV * 100).toFixed(4) + "%";
  const volEWStr = (volEW * 100).toFixed(4) + "%";
  const volIVStr = (volIV * 100).toFixed(4) + "%";

  if (passed === false) {
    const errorMsg = `Upstream error: Minimum variance annualized volatility (${volMVStr}) exceeds feasible benchmark volatility. Minimum Variance: ${volMVStr}, Equal Weight: ${volEWStr}, Inverse Volatility: ${volIVStr}.`;
    return {
      passed: false,
      error: errorMsg,
      volatilities: {
        minVariance: volMV,
        equalWeight: volEW,
        inverseVolatility: volIV
      }
    };
  }

  return {
    passed: true,
    error: null,
    volatilities: {
      minVariance: volMV,
      equalWeight: volEW,
      inverseVolatility: volIV
    }
  };
}

/**
 * Updates dollar allocations when investment capital setting changes.
 * Changes every dollar figure and no weight, volatility, return, or Sharpe.
 *
 * @param {number} investmentAmount
 */
export function updateStage6InvestmentAmount(investmentAmount) {
  const hasWeights = appState.weights !== null && typeof appState.weights === "object";
  if (hasWeights === false) {
    return;
  }

  const amt = typeof investmentAmount === "number" && isNaN(investmentAmount) === false && investmentAmount > 0
    ? investmentAmount
    : ((appState.settings && typeof appState.settings.investmentAmount === "number") ? appState.settings.investmentAmount : 1000000);

  if (!appState.weights.allocations || typeof appState.weights.allocations !== "object") {
    appState.weights.allocations = {};
  }

  if (Array.isArray(appState.weights.minVariance) === true) {
    const allocMV = computeDollarAllocations(appState.weights.minVariance, amt);
    appState.weights.allocations.minVariance = allocMV;
    appState.weights.minVarianceAllocations = allocMV;
    if (appState.metrics && appState.metrics.minVariance) {
      appState.metrics.minVariance.allocations = allocMV;
    }
  }

  if (Array.isArray(appState.weights.equalWeight) === true) {
    const allocEW = computeDollarAllocations(appState.weights.equalWeight, amt);
    appState.weights.allocations.equalWeight = allocEW;
    appState.weights.equalWeightAllocations = allocEW;
    if (appState.metrics && appState.metrics.equalWeight) {
      appState.metrics.equalWeight.allocations = allocEW;
    }
  }

  if (Array.isArray(appState.weights.inverseVolatility) === true) {
    const allocIV = computeDollarAllocations(appState.weights.inverseVolatility, amt);
    appState.weights.allocations.inverseVolatility = allocIV;
    appState.weights.inverseVolatilityAllocations = allocIV;
    if (appState.metrics && appState.metrics.inverseVolatility) {
      appState.metrics.inverseVolatility.allocations = allocIV;
    }
  }

  appState.allocations = appState.weights.allocations;
  renderStage6UI();
}

/**
 * Updates Sharpe ratio when riskFreeRate setting changes.
 * Affects only Sharpe ratio and no weight, return, volatility, or dollar allocation.
 *
 * @param {number} riskFreeRate
 */
export function updateStage6RiskFreeRate(riskFreeRate) {
  const hasMetrics = appState.metrics !== null && typeof appState.metrics === "object";
  if (hasMetrics === false) {
    return;
  }

  const rf = typeof riskFreeRate === "number" && isNaN(riskFreeRate) === false
    ? riskFreeRate
    : ((appState.settings && typeof appState.settings.riskFreeRate === "number") ? appState.settings.riskFreeRate : 0.0391);

  if (appState.metrics.minVariance && typeof appState.metrics.minVariance.annualizedVolatility === "number") {
    const vol = appState.metrics.minVariance.annualizedVolatility;
    const ret = appState.metrics.minVariance.annualizedReturn;
    appState.metrics.minVariance.sharpe = vol > 1e-12 ? (ret - rf) / vol : 0;
  }

  if (appState.metrics.equalWeight && typeof appState.metrics.equalWeight.annualizedVolatility === "number") {
    const vol = appState.metrics.equalWeight.annualizedVolatility;
    const ret = appState.metrics.equalWeight.annualizedReturn;
    appState.metrics.equalWeight.sharpe = vol > 1e-12 ? (ret - rf) / vol : 0;
  }

  if (appState.metrics.inverseVolatility && typeof appState.metrics.inverseVolatility.annualizedVolatility === "number") {
    const vol = appState.metrics.inverseVolatility.annualizedVolatility;
    const ret = appState.metrics.inverseVolatility.annualizedReturn;
    appState.metrics.inverseVolatility.sharpe = vol > 1e-12 ? (ret - rf) / vol : 0;
  }

  renderStage6UI();
}

/**
 * Runs the complete Stage 6 minimum variance optimization and benchmark evaluation.
 * Stores weights, metrics, allocations, and feasibility flags in appState.weights and appState.metrics.
 * Sets stage 6 to done (or blocked if infeasible).
 */
export function runStage6Optimization() {
  removeGlobalBanner("stage-6-blocked");
  removeGlobalBanner("stage-6-consistency-error");

  const survivors = Array.isArray(appState.gatedSurvivors) === true ? appState.gatedSurvivors : [];
  const n = survivors.length;
  if (n === 0) {
    setStageStatus(6, "idle");
    renderStage6UI();
    return;
  }

  const effectiveCap = typeof appState.settings.weightCap === "number" ? appState.settings.weightCap : 0.25;
  const effectiveRf = typeof appState.settings.riskFreeRate === "number" ? appState.settings.riskFreeRate : 0.0391;
  const effectiveAmt = typeof appState.settings.investmentAmount === "number" ? appState.settings.investmentAmount : 1000000;

  // 1. Sector groups & Feasibility check
  const sectorGroups = getGatedSectorGroups();
  const feasResult = checkFeasibility(survivors, null, effectiveCap);

  if (feasResult.feasible === false) {
    const causeMsg = feasResult.cause || "Portfolio optimization problem is infeasible under current constraints.";
    setStageStatus(6, "blocked");
    appState.weights = {
      minVariance: null,
      equalWeight: null,
      inverseVolatility: null,
      allocations: null,
      feasibility: {
        minVariance: false,
        equalWeight: false,
        inverseVolatility: false
      }
    };
    appState.metrics = {
      blocked: true,
      cause: causeMsg
    };
    addGlobalBanner("stage-6-blocked", causeMsg, "error");
    renderStage6UI();
    return;
  }

  // 2. Sliced covariance matrix
  const hasIndicators = appState.indicatorSeries !== null && typeof appState.indicatorSeries === "object" && Array.isArray(appState.indicatorSeries.covarianceMatrix) === true;
  if (hasIndicators === false) {
    return;
  }
  const sigma = sliceCovariance(survivors);

  // 3. Solve Minimum Variance by projected gradient descent
  const solverRes = solveMinimumVariance(sigma, effectiveCap, sectorGroups);
  if (solverRes.feasible === false) {
    const causeMsg = solverRes.cause || solverRes.message || "Optimization solver failed to find feasible weights.";
    setStageStatus(6, "blocked");
    appState.weights = {
      minVariance: null,
      equalWeight: null,
      inverseVolatility: null,
      allocations: null,
      feasibility: {
        minVariance: false,
        equalWeight: false,
        inverseVolatility: false
      }
    };
    appState.metrics = {
      blocked: true,
      cause: causeMsg
    };
    addGlobalBanner("stage-6-blocked", causeMsg, "error");
    renderStage6UI();
    return;
  }

  // 4. Compute metrics for Minimum Variance
  const returnSeries = appState.indicatorSeries && appState.indicatorSeries.returns ? appState.indicatorSeries.returns : null;
  if (!returnSeries) {
    throw new Error("Missing indicatorSeries.returns for survivor tickers.");
  }
  const metricsMV = computePortfolioSeries(solverRes.weights, returnSeries, survivors, effectiveRf);
  const allocMV = computeDollarAllocations(solverRes.weights, effectiveAmt);

  // Volatility alignment check: sqrt(solver objective * 252) within 1e-6
  const solverVol = Math.sqrt(solverRes.objective * 252);
  const volDiff = Math.abs(metricsMV.annualizedVolatility - solverVol);
  if (volDiff > 1e-6) {
    console.warn(`Annualized volatility alignment check: metricsMV=${metricsMV.annualizedVolatility}, solverVol=${solverVol}, diff=${volDiff}`);
  }

  // 5. Benchmarks
  const bench = computeBenchmarks(survivors, returnSeries, effectiveCap, sectorGroups, effectiveRf, effectiveAmt);

  // 6. Consistency Check
  const consistencyResult = checkConsistency(
    metricsMV,
    bench.equalWeight,
    bench.inverseVolatility,
    bench.equalWeight.feasible,
    bench.inverseVolatility.feasible
  );

  if (consistencyResult.passed === false) {
    addGlobalBanner("stage-6-consistency-error", consistencyResult.error, "error");
  }

  // 7. Store state
  appState.weights = {
    minVariance: solverRes.weights,
    equalWeight: bench.equalWeight.weights,
    inverseVolatility: bench.inverseVolatility.weights,
    tickers: [...survivors],
    allocations: {
      minVariance: allocMV,
      equalWeight: bench.equalWeight.allocations,
      inverseVolatility: bench.inverseVolatility.allocations
    },
    feasibility: {
      minVariance: true,
      equalWeight: bench.equalWeight.feasible,
      inverseVolatility: bench.inverseVolatility.feasible
    },
    minVarianceAllocations: allocMV,
    equalWeightAllocations: bench.equalWeight.allocations,
    inverseVolatilityAllocations: bench.inverseVolatility.allocations,
    isMinVarianceFeasible: true,
    isEqualWeightFeasible: bench.equalWeight.feasible,
    isInverseVolatilityFeasible: bench.inverseVolatility.feasible
  };
  appState.allocations = appState.weights.allocations;

  appState.metrics = {
    minVariance: {
      weights: solverRes.weights,
      allocations: allocMV,
      annualizedReturn: metricsMV.annualizedReturn,
      annualizedVolatility: metricsMV.annualizedVolatility,
      sharpe: metricsMV.sharpe,
      dailySeries: metricsMV.dailySeries,
      feasible: true,
      converged: solverRes.converged,
      iterations: solverRes.iterations,
      objective: solverRes.objective,
      label: "Candidate Portfolio",
      isReference: false
    },
    equalWeight: bench.equalWeight,
    inverseVolatility: bench.inverseVolatility,
    consistencyCheck: consistencyResult,
    tickers: [...survivors]
  };

  if (consistencyResult.passed === false) {
    appState.metrics.error = consistencyResult.error;
    appState.metrics.consistencyError = consistencyResult.error;
  }

  // 8. Rolling 60-day beta of the minimum variance portfolio against SPY (prompt 15)
  recomputeRollingBeta();

  setStageStatus(6, "done");
  renderStage6UI();
}

/**
 * Normalizes a date value (Date object, string, or number) into a standard key string.
 *
 * @param {string|number|Date} val - Raw date input
 * @returns {string|null} - Normalized date string or null if invalid
 */
function normalizeRollingBetaDateKey(val) {
  const isDateObj = val instanceof Date;
  if (isDateObj === true) {
    return val.toISOString().slice(0, 10);
  }
  const isString = typeof val === "string";
  const isNumber = typeof val === "number";
  const isValidPrimitive = isString === true || isNumber === true;
  if (isValidPrimitive === true) {
    return String(val);
  }
  return null;
}

/**
 * Computes rolling window beta of portfolio return series against SPY.
 * Uses sample covariance and sample variance formulas over each rolling window.
 *
 * @param {number[]} portfolioSeries - Array of portfolio simple daily returns
 * @param {string[]} portfolioDates - Array of portfolio return dates (YYYY-MM-DD)
 * @param {number[]} spySeries - Array of SPY simple daily returns
 * @param {string[]} spyDates - Array of SPY return dates (YYYY-MM-DD)
 * @param {number} [window=60] - Rolling window size in sessions (defaults to 60)
 * @returns {{ available: boolean, reason?: string, window?: number, series?: Array<{ date: string, beta: number }>, current?: number }}
 */
export function computeRollingBeta(portfolioSeries, portfolioDates, spySeries, spyDates, window = 60) {
  const isWindowNum = typeof window === "number" && isNaN(window) === false && window > 0;
  let win = 60;
  if (isWindowNum === true) {
    win = Math.floor(window);
  }

  // 1. Check if SPY data is present
  const hasSpySeries = Array.isArray(spySeries) === true && spySeries.length > 0;
  const hasSpyDates = Array.isArray(spyDates) === true && spyDates.length > 0;
  const isSpyAvailable = hasSpySeries === true && hasSpyDates === true;
  if (isSpyAvailable === false) {
    const res = { available: false, reason: "SPY unavailable" };
    const hasAppState = appState !== null && typeof appState === "object";
    if (hasAppState === true) {
      appState.beta = res;
    }
    const hasWindow = typeof window !== "undefined" && window.state !== null && typeof window.state === "object";
    if (hasWindow === true) {
      window.state.beta = res;
    }
    return res;
  }

  // Build SPY return lookup by date
  const spyMap = new Map();
  const spyLen = Math.min(spySeries.length, spyDates.length);
  for (let i = 0; i < spyLen; i += 1) {
    const rawDate = spyDates[i];
    const r = spySeries[i];
    const d = normalizeRollingBetaDateKey(rawDate);
    const isDateValid = d !== null && d.length > 0;
    const isReturnValid = typeof r === "number" && isNaN(r) === false;
    const isEntryValid = isDateValid === true && isReturnValid === true;
    if (isEntryValid === true) {
      spyMap.set(d, r);
    }
  }

  const hasUsableSpyEntries = spyMap.size > 0;
  if (hasUsableSpyEntries === false) {
    const res = { available: false, reason: "SPY unavailable" };
    const hasAppState = appState !== null && typeof appState === "object";
    if (hasAppState === true) {
      appState.beta = res;
    }
    const hasWindow = typeof window !== "undefined" && window.state !== null && typeof window.state === "object";
    if (hasWindow === true) {
      window.state.beta = res;
    }
    return res;
  }

  // Check if portfolio series is present
  const hasPortSeries = Array.isArray(portfolioSeries) === true && portfolioSeries.length > 0;
  const hasPortDates = Array.isArray(portfolioDates) === true && portfolioDates.length > 0;
  const isPortAvailable = hasPortSeries === true && hasPortDates === true;
  if (isPortAvailable === false) {
    const reasonMsg = win === 60 ? "fewer than 60 usable sessions" : `fewer than ${win} usable sessions`;
    const res = { available: false, reason: reasonMsg };
    const hasAppState = appState !== null && typeof appState === "object";
    if (hasAppState === true) {
      appState.beta = res;
    }
    const hasWindow = typeof window !== "undefined" && window.state !== null && typeof window.state === "object";
    if (hasWindow === true) {
      window.state.beta = res;
    }
    return res;
  }

  // Join the two series on dates: keep only the dates for which SPY has a return
  const joinedDates = [];
  const joinedPort = [];
  const joinedSpy = [];
  const portLen = Math.min(portfolioSeries.length, portfolioDates.length);

  for (let i = 0; i < portLen; i += 1) {
    const rawDate = portfolioDates[i];
    const d = normalizeRollingBetaDateKey(rawDate);
    const p = portfolioSeries[i];
    const isDateValid = d !== null && d.length > 0;
    const hasSpyForDate = isDateValid === true && spyMap.has(d);
    const isPortNum = typeof p === "number" && isNaN(p) === false;
    const isUsableSession = hasSpyForDate === true && isPortNum === true;
    if (isUsableSession === true) {
      joinedDates.push(d);
      joinedPort.push(p);
      joinedSpy.push(spyMap.get(d));
    }
  }

  // 2. Check if fewer than window joined sessions exist
  const joinedCount = joinedDates.length;
  const hasEnoughSessions = joinedCount >= win;
  if (hasEnoughSessions === false) {
    const reasonMsg = win === 60 ? "fewer than 60 usable sessions" : `fewer than ${win} usable sessions`;
    const res = { available: false, reason: reasonMsg };
    const hasAppState = appState !== null && typeof appState === "object";
    if (hasAppState === true) {
      appState.beta = res;
    }
    const hasWindow = typeof window !== "undefined" && window.state !== null && typeof window.state === "object";
    if (hasWindow === true) {
      window.state.beta = res;
    }
    return res;
  }

  // 3. For every window of consecutive joined sessions, compute beta = cov(portfolio, SPY) / var(SPY)
  // using sample formulas (divide by n minus 1 in both; the ratio is unaffected).
  const numWindows = joinedCount - win + 1;
  const series = [];
  const df = win - 1;

  for (let i = 0; i < numWindows; i += 1) {
    let sumPort = 0;
    let sumSpy = 0;
    for (let j = 0; j < win; j += 1) {
      sumPort += joinedPort[i + j];
      sumSpy += joinedSpy[i + j];
    }
    const meanPort = sumPort / win;
    const meanSpy = sumSpy / win;

    let sumCross = 0;
    let sumSqSpy = 0;
    for (let j = 0; j < win; j += 1) {
      const pDiff = joinedPort[i + j] - meanPort;
      const sDiff = joinedSpy[i + j] - meanSpy;
      sumCross += pDiff * sDiff;
      sumSqSpy += sDiff * sDiff;
    }

    const sampleCov = sumCross / df;
    const sampleVarSpy = sumSqSpy / df;
    const hasVariance = sampleVarSpy > 1e-14;
    let beta = 0;
    if (hasVariance === true) {
      beta = sampleCov / sampleVarSpy;
    } else {
      beta = 0;
    }

    const endDate = joinedDates[i + win - 1];
    series.push({
      date: endDate,
      beta: beta
    });
  }

  // 4. Current beta is the value of the last window
  const current = series[series.length - 1].beta;

  // 5. Result
  const result = {
    available: true,
    window: win,
    series: series,
    current: current
  };

  const hasAppState = appState !== null && typeof appState === "object";
  if (hasAppState === true) {
    appState.beta = result;
  }
  const hasWindow = typeof window !== "undefined" && window.state !== null && typeof window.state === "object";
  if (hasWindow === true) {
    window.state.beta = result;
  }

  return result;
}

/**
 * Recomputes the rolling 60-day beta of the minimum variance portfolio against SPY
 * using current appState and stores the result in appState.beta.
 *
 * @returns {{ available: boolean, reason?: string, window?: number, series?: Array<{ date: string, beta: number }>, current?: number }}
 */
export function recomputeRollingBeta() {
  const hasMV = appState.metrics !== null &&
    typeof appState.metrics === "object" &&
    appState.metrics.minVariance !== null &&
    typeof appState.metrics.minVariance === "object" &&
    Array.isArray(appState.metrics.minVariance.dailySeries) === true;

  const hasDates = appState.indicatorSeries !== null &&
    typeof appState.indicatorSeries === "object" &&
    Array.isArray(appState.indicatorSeries.dates) === true;

  if (hasMV === false || hasDates === false) {
    const unavailableRes = { available: false, reason: "fewer than 60 usable sessions" };
    appState.beta = unavailableRes;
    const hasWindow = typeof window !== "undefined" && window.state !== null && typeof window.state === "object";
    if (hasWindow === true) {
      window.state.beta = unavailableRes;
    }
    return unavailableRes;
  }

  const pSeries = appState.metrics.minVariance.dailySeries;
  const pDates = appState.indicatorSeries.dates;

  let sSeries = null;
  let sDates = null;

  const hasSpyData = appState.indicatorSeries !== null &&
    typeof appState.indicatorSeries === "object" &&
    appState.indicatorSeries.spy !== null &&
    typeof appState.indicatorSeries.spy === "object" &&
    Array.isArray(appState.indicatorSeries.spy.returns) === true &&
    Array.isArray(appState.indicatorSeries.spy.dates) === true;

  if (hasSpyData === true) {
    sSeries = appState.indicatorSeries.spy.returns;
    sDates = appState.indicatorSeries.spy.dates;
  } else {
    // Fallback check in priceCache for SPY
    const hasPriceCacheSpy = appState.priceCache !== null &&
      typeof appState.priceCache === "object" &&
      Array.isArray(appState.priceCache["SPY"]) === true &&
      appState.priceCache["SPY"].length > 1;

    if (hasPriceCacheSpy === true) {
      const rawSpy = appState.priceCache["SPY"];
      const rawPrices = [];
      const rawDates = [];
      for (let i = 0; i < rawSpy.length; i += 1) {
        const item = rawSpy[i];
        const isValidItem = item !== null && typeof item === "object" && typeof item.datetime === "string" && typeof item.close === "number";
        if (isValidItem === true) {
          rawDates.push(item.datetime);
          rawPrices.push(item.close);
        }
      }
      const hasEnoughPrices = rawPrices.length > 1;
      if (hasEnoughPrices === true) {
        sSeries = computeDailyReturns(rawPrices);
        sDates = rawDates.slice(1);
      }
    }
  }

  const betaRes = computeRollingBeta(pSeries, pDates, sSeries, sDates, 60);
  appState.beta = betaRes;
  const hasWindow = typeof window !== "undefined" && window.state !== null && typeof window.state === "object";
  if (hasWindow === true) {
    window.state.beta = betaRes;
  }
  return betaRes;
}

/**
 * Renders the Stage 6 user interface into #stage-content-6.
 */
export function renderStage6UI() {
  const hasDoc = typeof document !== "undefined";
  if (hasDoc === false) {
    return;
  }
  const container = document.getElementById("stage-content-6");
  if (container === null) {
    return;
  }

  const currentStatus = appState.stageStatus[6] || "idle";
  const survivors = Array.isArray(appState.gatedSurvivors) === true ? appState.gatedSurvivors : [];
  const n = survivors.length;

  if (currentStatus === "idle") {
    container.innerHTML = `
      <div class="stage-placeholder">
        <p class="placeholder-text">
          Stage 6 will run automatically after Stage 5 text gating passes survivors, or you can trigger optimization below.
        </p>
        <button type="button" class="btn-primary" id="btn-reoptimize-stage6" style="margin-top: 12px;" ${n === 0 ? "disabled" : ""}>
          Run Minimum Variance Optimizer
        </button>
      </div>
    `;
    setupStage6Events();
    return;
  }

  if (currentStatus === "blocked") {
    const causeText = (appState.metrics && appState.metrics.cause) || "Optimization problem is infeasible under current constraints.";
    container.innerHTML = `
      <div class="stage-6-container">
        <div class="stage-6-alert-blocked">
          <div class="stage-6-alert-blocked-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            Stage 6 Blocked: Portfolio Optimization Infeasible
          </div>
          <p class="stage-6-alert-blocked-text">
            ${escapeHtml(causeText)}
          </p>
          <div class="stage-6-alert-blocked-actions">
            <button type="button" class="btn-primary" id="btn-stage6-open-settings" style="font-size: 12px; padding: 6px 14px;">
              Open Settings
            </button>
            <button type="button" class="btn-secondary" id="btn-reoptimize-stage6" style="font-size: 12px; padding: 6px 14px;">
              Re-check Feasibility
            </button>
          </div>
        </div>
      </div>
    `;
    setupStage6Events();
    return;
  }

  // Done status
  const metrics = appState.metrics || {};
  const weights = appState.weights || {};
  const mv = metrics.minVariance || {};
  const ew = metrics.equalWeight || {};
  const iv = metrics.inverseVolatility || {};
  const consistency = metrics.consistencyCheck || { passed: true };

  const effectiveCap = typeof appState.settings.weightCap === "number" ? appState.settings.weightCap : 0.25;
  const effectiveRf = typeof appState.settings.riskFreeRate === "number" ? appState.settings.riskFreeRate : 0.0391;
  const effectiveAmt = typeof appState.settings.investmentAmount === "number" ? appState.settings.investmentAmount : 1000000;

  const volMV = typeof mv.annualizedVolatility === "number" ? (mv.annualizedVolatility * 100).toFixed(2) + "%" : "0.00%";
  const retMV = typeof mv.annualizedReturn === "number" ? (mv.annualizedReturn * 100).toFixed(2) + "%" : "0.00%";
  const sharpeMV = typeof mv.sharpe === "number" ? mv.sharpe.toFixed(2) : "0.00";

  const volEW = typeof ew.annualizedVolatility === "number" ? (ew.annualizedVolatility * 100).toFixed(2) + "%" : "0.00%";
  const retEW = typeof ew.annualizedReturn === "number" ? (ew.annualizedReturn * 100).toFixed(2) + "%" : "0.00%";
  const sharpeEW = typeof ew.sharpe === "number" ? ew.sharpe.toFixed(2) : "0.00";

  const volIV = typeof iv.annualizedVolatility === "number" ? (iv.annualizedVolatility * 100).toFixed(2) + "%" : "0.00%";
  const retIV = typeof iv.annualizedReturn === "number" ? (iv.annualizedReturn * 100).toFixed(2) + "%" : "0.00%";
  const sharpeIV = typeof iv.sharpe === "number" ? iv.sharpe.toFixed(2) : "0.00";

  // Rolling 60-day beta formatting (prompt 15)
  let betaValueDisplay = "Unavailable";
  let betaSubtextDisplay = "SPY unavailable";
  const hasBetaState = appState.beta !== null && typeof appState.beta === "object";
  if (hasBetaState === true) {
    const isBetaAvailable = appState.beta.available === true;
    if (isBetaAvailable === true) {
      const curBeta = typeof appState.beta.current === "number" ? appState.beta.current : null;
      if (curBeta !== null) {
        betaValueDisplay = curBeta.toFixed(2);
        const winNum = appState.beta.window || 60;
        const totalPoints = Array.isArray(appState.beta.series) === true ? appState.beta.series.length : 0;
        betaSubtextDisplay = `Current ${winNum}-session window (${totalPoints} rolling points)`;
      }
    } else {
      betaValueDisplay = "Unavailable";
      betaSubtextDisplay = appState.beta.reason || "SPY unavailable";
    }
  }

  // Consistency error banner
  let consistencyHtml = "";
  if (consistency.passed === false && consistency.error) {
    consistencyHtml = `
      <div class="stage-6-alert-error" style="margin-bottom: 16px;">
        <div class="stage-6-alert-error-title">Consistency Check Warning</div>
        <p class="stage-6-alert-error-text">${escapeHtml(consistency.error)}</p>
      </div>
    `;
  }

  // Constituent table rows
  let constituentRowsHtml = "";
  let totalMVDollars = 0;
  let totalEWDollars = 0;
  let totalIVDollars = 0;
  let totalMVWeight = 0;

  const sectorTotals = {};

  for (let i = 0; i < n; i += 1) {
    const sym = survivors[i];
    const item = appState.universe.find((u) => u.ticker === sym) || { name: sym, sector: "Unknown" };
    const labelEntry = appState.labels && appState.labels[sym] ? appState.labels[sym] : { label: "Unclassified" };

    const wMV = Array.isArray(mv.weights) === true ? mv.weights[i] : 0;
    const dMV = Array.isArray(mv.allocations) === true ? mv.allocations[i] : 0;
    const wEW = Array.isArray(ew.weights) === true ? ew.weights[i] : 0;
    const dEW = Array.isArray(ew.allocations) === true ? ew.allocations[i] : 0;
    const wIV = Array.isArray(iv.weights) === true ? iv.weights[i] : 0;
    const dIV = Array.isArray(iv.allocations) === true ? iv.allocations[i] : 0;

    totalMVWeight += wMV;
    totalMVDollars += dMV;
    totalEWDollars += dEW;
    totalIVDollars += dIV;

    const sectorName = item.sector || "Unknown";
    if (!sectorTotals[sectorName]) {
      sectorTotals[sectorName] = { weight: 0, dollars: 0, count: 0 };
    }
    sectorTotals[sectorName].weight += wMV;
    sectorTotals[sectorName].dollars += dMV;
    sectorTotals[sectorName].count += 1;

    const wMVPercent = (wMV * 100).toFixed(2);
    const barWidth = Math.min(100, Math.round((wMV / effectiveCap) * 100));

    constituentRowsHtml += `
      <tr>
        <td style="color: #64748b; font-size: 11px;">${i + 1}</td>
        <td>
          <span style="font-weight: 700; color: #0f172a;">${escapeHtml(sym)}</span>
        </td>
        <td>
          <div style="font-weight: 500;">${escapeHtml(item.name)}</div>
          <div style="font-size: 11px; color: #64748b;">${escapeHtml(item.sector)}</div>
        </td>
        <td>
          <span class="badge-status-neutral" style="font-size: 11px;">${escapeHtml(labelEntry.label || "Survivor")}</span>
        </td>
        <td>
          <div class="stage-6-weight-bar-container">
            <span style="font-weight: 600; min-width: 48px;">${wMVPercent}%</span>
            <div class="stage-6-weight-bar-bg">
              <div class="stage-6-weight-bar-fill" style="width: ${barWidth}%;"></div>
            </div>
          </div>
        </td>
        <td style="font-weight: 600; color: #0f172a;">
          ${formatWholeDollars(dMV)}
        </td>
        <td style="color: #475569;">
          <span>${(wEW * 100).toFixed(2)}%</span>
          <span style="font-size: 11.5px; color: #64748b; margin-left: 4px;">(${formatWholeDollars(dEW)})</span>
        </td>
        <td style="color: #475569;">
          <span>${(wIV * 100).toFixed(2)}%</span>
          <span style="font-size: 11.5px; color: #64748b; margin-left: 4px;">(${formatWholeDollars(dIV)})</span>
        </td>
      </tr>
    `;
  }

  // Sector breakdown cards
  let sectorCardsHtml = "";
  const sectorKeys = Object.keys(sectorTotals);
  for (let s = 0; s < sectorKeys.length; s += 1) {
    const sName = sectorKeys[s];
    const sData = sectorTotals[sName];
    const sWeightPct = (sData.weight * 100).toFixed(1);
    const sPass = sData.weight <= 0.500001;
    sectorCardsHtml += `
      <div class="stage-6-sector-card">
        <div class="stage-6-sector-header">
          <span class="stage-6-sector-name">${escapeHtml(sName)}</span>
          <span class="${sPass ? "stage-6-badge-feasible" : "stage-6-badge-infeasible"}">
            ${sPass ? "Limit Met" : "Exceeded"}
          </span>
        </div>
        <div style="display: flex; align-items: baseline; justify-content: space-between; margin-top: 4px;">
          <span class="stage-6-sector-stat">${sWeightPct}%</span>
          <span style="font-size: 12px; color: #64748b;">${formatWholeDollars(sData.dollars)}</span>
        </div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
          ${sData.count} constituent${sData.count === 1 ? "" : "s"} &bull; max 50%
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="stage-6-container">
      ${consistencyHtml}

      <div class="stage-6-header-actions">
        <div class="stage-6-header-info">
          <h3 class="stage-6-title">Minimum Variance Portfolio & Reference Benchmarks</h3>
          <p class="stage-6-subtitle">
            Optimized across ${n} gated survivors with ${(effectiveCap * 100).toFixed(0)}% position cap and 50% GICS sector ceiling.
          </p>
        </div>
        <button type="button" class="btn-secondary" id="btn-reoptimize-stage6" style="font-size: 12px; padding: 6px 14px;">
          Re-optimize
        </button>
      </div>

      <!-- KPI Summary Cards -->
      <div class="stage-6-metrics-grid">
        <div class="stage-6-metric-card">
          <div class="stage-6-metric-header">
            <span class="stage-6-metric-label">Annualized Volatility</span>
            <span class="stage-6-metric-badge">Min Variance</span>
          </div>
          <div class="stage-6-metric-value">${volMV}</div>
          <div class="stage-6-metric-subtext">Minimized target objective</div>
        </div>

        <div class="stage-6-metric-card">
          <div class="stage-6-metric-header">
            <span class="stage-6-metric-label">Annualized Return</span>
            <span class="stage-6-metric-badge">In-sample</span>
          </div>
          <div class="stage-6-metric-value">${retMV}</div>
          <div class="stage-6-metric-subtext">Trailing 1-year arithmetic mean</div>
        </div>

        <div class="stage-6-metric-card">
          <div class="stage-6-metric-header">
            <span class="stage-6-metric-label">Sharpe Ratio</span>
            <span class="stage-6-metric-badge">Rf = ${(effectiveRf * 100).toFixed(2)}%</span>
          </div>
          <div class="stage-6-metric-value">${sharpeMV}</div>
          <div class="stage-6-metric-subtext">Excess return / Volatility</div>
        </div>

        <div class="stage-6-metric-card">
          <div class="stage-6-metric-header">
            <span class="stage-6-metric-label">Capital Allocated</span>
            <span class="stage-6-metric-badge">${n} positions</span>
          </div>
          <div class="stage-6-metric-value">${formatWholeDollars(effectiveAmt)}</div>
          <div class="stage-6-metric-subtext">Rounding residual assigned to top name</div>
        </div>

        <div class="stage-6-metric-card">
          <div class="stage-6-metric-header">
            <span class="stage-6-metric-label">Optimizer Status</span>
            <span class="stage-6-metric-badge">${mv.converged ? "Converged" : "Completed"}</span>
          </div>
          <div class="stage-6-metric-value" style="font-size: 19px; padding-top: 4px;">
            ${mv.iterations || 0} iterations
          </div>
          <div class="stage-6-metric-subtext">Obj: ${(mv.objective || 0).toExponential(3)}</div>
        </div>

        <div class="stage-6-metric-card" id="stage-6-card-beta">
          <div class="stage-6-metric-header">
            <span class="stage-6-metric-label">Rolling 60d Beta</span>
            <span class="stage-6-metric-badge">vs SPY</span>
          </div>
          <div class="stage-6-metric-value" style="font-size: 20px; padding-top: 3px;">
            ${betaValueDisplay}
          </div>
          <div class="stage-6-metric-subtext">${betaSubtextDisplay}</div>
        </div>
      </div>

      <!-- Portfolio Comparison Table -->
      <div class="stage-6-card">
        <div class="stage-6-card-header">
          <div>
            <h4 class="stage-6-card-title">Portfolio Comparison (Candidate vs References)</h4>
            <p class="stage-6-card-desc">
              Equal Weight and Inverse Volatility serve as reference benchmarks evaluated on the identical survivor universe.
            </p>
          </div>
        </div>

        <div class="stage-6-table-wrapper">
          <table class="stage-6-table">
            <thead>
              <tr>
                <th>Portfolio Method</th>
                <th>Role</th>
                <th>Constraint Feasibility</th>
                <th>Ann. Volatility</th>
                <th>Ann. Return</th>
                <th>Sharpe Ratio</th>
                <th>Total Allocated</th>
              </tr>
            </thead>
            <tbody>
              <tr class="stage-6-row-candidate">
                <td>
                  <span style="font-weight: 700; color: #0f172a;">Minimum Variance</span>
                </td>
                <td>
                  <span class="stage-6-badge-candidate">Candidate Portfolio</span>
                </td>
                <td>
                  <span class="stage-6-badge-feasible">Feasible</span>
                </td>
                <td style="font-weight: 700; color: #0f172a;">${volMV}</td>
                <td>${retMV}</td>
                <td style="font-weight: 600;">${sharpeMV}</td>
                <td style="font-weight: 600;">${formatWholeDollars(totalMVDollars)}</td>
              </tr>
              <tr>
                <td>
                  <span style="font-weight: 600; color: #1e293b;">Equal Weight (1/n)</span>
                </td>
                <td>
                  <span class="stage-6-badge-reference">Reference</span>
                </td>
                <td>
                  <span class="${ew.feasible ? "stage-6-badge-feasible" : "stage-6-badge-infeasible"}">
                    ${ew.feasible ? "Feasible" : "Infeasible"}
                  </span>
                </td>
                <td>${volEW}</td>
                <td>${retEW}</td>
                <td>${sharpeEW}</td>
                <td>${formatWholeDollars(totalEWDollars)}</td>
              </tr>
              <tr>
                <td>
                  <span style="font-weight: 600; color: #1e293b;">Inverse Volatility (1/vol)</span>
                </td>
                <td>
                  <span class="stage-6-badge-reference">Reference</span>
                </td>
                <td>
                  <span class="${iv.feasible ? "stage-6-badge-feasible" : "stage-6-badge-infeasible"}">
                    ${iv.feasible ? "Feasible" : "Infeasible (Breaches Cap/Sector)"}
                  </span>
                </td>
                <td>${volIV}</td>
                <td>${retIV}</td>
                <td>${sharpeIV}</td>
                <td>${formatWholeDollars(totalIVDollars)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Constituent Weights and Dollar Allocations Table -->
      <div class="stage-6-card">
        <div class="stage-6-card-header">
          <div>
            <h4 class="stage-6-card-title">Constituent Weights & Capital Allocations</h4>
            <p class="stage-6-card-desc">
              All weights sum to 100.0%. Dollar allocations sum to exactly ${formatWholeDollars(effectiveAmt)} with no fractional residual.
            </p>
          </div>
        </div>

        <div class="stage-6-table-wrapper">
          <table class="stage-6-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Ticker</th>
                <th>Company & Sector</th>
                <th>Text Gate</th>
                <th>Min Variance Weight</th>
                <th>Min Variance Dollar</th>
                <th>Equal Weight</th>
                <th>Inverse Volatility</th>
              </tr>
            </thead>
            <tbody>
              ${constituentRowsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4" style="text-align: right; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; color: #64748b;">
                  Portfolio Total:
                </td>
                <td style="font-weight: 700; color: #0f172a;">
                  ${(totalMVWeight * 100).toFixed(2)}%
                </td>
                <td style="font-weight: 700; color: #0f172a;">
                  ${formatWholeDollars(totalMVDollars)}
                </td>
                <td style="color: #475569; font-weight: 600;">
                  100.00% (${formatWholeDollars(totalEWDollars)})
                </td>
                <td style="color: #475569; font-weight: 600;">
                  100.00% (${formatWholeDollars(totalIVDollars)})
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- Sector Breakdown Card -->
      <div class="stage-6-card">
        <div class="stage-6-card-header">
          <div>
            <h4 class="stage-6-card-title">GICS Sector Allocation & 50% Limit Check</h4>
            <p class="stage-6-card-desc">
              Verifies that no single GICS sector exceeds the 50.0% half-space constraint.
            </p>
          </div>
        </div>

        <div class="stage-6-sector-grid">
          ${sectorCardsHtml}
        </div>
      </div>
    </div>
  `;

  setupStage6Events();
}

/**
 * Binds event listeners for Stage 6 interactive elements.
 */
function setupStage6Events() {
  const btnReoptimize = document.getElementById("btn-reoptimize-stage6");
  if (btnReoptimize !== null) {
    btnReoptimize.onclick = () => {
      runStage6Optimization();
    };
  }

  const btnOpenSettings = document.getElementById("btn-stage6-open-settings");
  if (btnOpenSettings !== null) {
    btnOpenSettings.onclick = () => {
      const settingsToggle = document.getElementById("btn-toggle-settings");
      if (settingsToggle !== null) {
        settingsToggle.click();
      }
    };
  }
}

/**
 * Initializes Stage 6.
 */
export function setupStage6() {
  renderStage6UI();
}

/**
 * Resets the review confirmation state, unchecks the review box,
 * and disables the portfolio export buttons.
 * Called whenever a setting, universe, selection, investment amount,
 * label, relaxation, or regenerated note changes.
 */
export function clearReview() {
  appState.reviewed = false;
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === true) {
    const chk = document.getElementById("guardrail-reviewed-checkbox");
    if (chk !== null) {
      chk.checked = false;
    }
    const statusBadge = document.getElementById("guardrail-review-status");
    if (statusBadge !== null) {
      statusBadge.textContent = "Unreviewed";
      statusBadge.className = "badge";
    }
    const exportBtn = document.getElementById("btn-export-portfolio");
    if (exportBtn !== null) {
      exportBtn.disabled = true;
    }
    const stage8ExportBtn = document.getElementById("btn-stage-8-export-portfolio");
    if (stage8ExportBtn !== null) {
      stage8ExportBtn.disabled = true;
    }
  }
}

/**
 * Re-computes pure JavaScript pipeline stages live without network requests.
 * Runs in order: screen -> gate from stored labels -> weights -> beta -> guardrails.
 *
 * @param {number} [fromStage=4] - First stage to recompute
 */
export function recomputePureStages(fromStage = 4) {
  clearReview();

  if (fromStage <= 4) {
    const hasIndicators = appState.indicatorSeries !== null && typeof appState.indicatorSeries === "object";
    if (hasIndicators === true) {
      runStage4Screen();
    }
  }

  if (fromStage <= 5) {
    const hasLabels = appState.labels !== null && typeof appState.labels === "object";
    if (hasLabels === true) {
      applyTextGate();
    }
  }

  if (fromStage <= 6) {
    const hasGated = Array.isArray(appState.gatedSurvivors) === true && appState.gatedSurvivors.length > 0;
    if (hasGated === true) {
      runStage6Optimization();
      recomputeRollingBeta();
    }
  }

  evaluateGuardrails();

  if (appState.note !== null && typeof appState.note === "object") {
    if (appState.note.investmentAmount !== appState.settings.investmentAmount) {
      appState.note.isStale = true;
      setStageStatus(8, "stale");
    }
  }

  renderStage4UI();
  renderStage5UI();
  renderStage6UI();
  renderStage7UI();
  renderStage8UI();
}

/**
 * Evaluates all quantitative and internal guardrails.
 * Returns a list of failure objects, each containing an id, cause, fix, and action button if applicable.
 *
 * @param {object} [state=appState] - Application state
 * @returns {Array<{id: string, cause: string, fix: string, actionText?: string, actionFn?: function, actions?: Array<{text: string, actionFn: function}>}>}
 */
export function evaluateGuardrails(state = appState) {
  const failures = [];

  // 1. Aligned sessions fewer than 200
  const hasAligned = state.alignedData !== null && typeof state.alignedData === "object";
  const sessionCount = hasAligned === true && typeof state.alignedData.sessionCount === "number"
    ? state.alignedData.sessionCount
    : (hasAligned === true && Array.isArray(state.alignedData.dates) ? state.alignedData.dates.length : 0);

  if (hasAligned === true && sessionCount < 200) {
    let shortestTicker = "";
    let minSessions = Infinity;
    const selected = Array.isArray(state.selectedTickers) ? state.selectedTickers : [];
    for (let i = 0; i < selected.length; i += 1) {
      const sym = selected[i];
      const series = state.priceCache && state.priceCache[sym] ? state.priceCache[sym] : [];
      if (series.length < minSessions) {
        minSessions = series.length;
        shortestTicker = sym;
      }
    }
    const shortestName = shortestTicker.length > 0 ? shortestTicker : "the shortest history constituent";
    failures.push({
      id: "aligned-sessions-count",
      cause: `aligned sessions fewer than 200 (${sessionCount} sessions)`,
      fix: `deselect the ticker with the shortest history, naming it from the raw data view: deselect ${shortestName}`,
      actionText: shortestTicker.length > 0 ? `Deselect ${shortestTicker}` : null,
      actionFn: shortestTicker.length > 0 ? () => toggleConstituentTicker(shortestTicker) : null
    });
  }

  // 2. Gated survivors fewer than minimumBreadth after any relaxation
  const hasScreen = state.screenResult !== null && typeof state.screenResult === "object";
  const gatedList = Array.isArray(state.gatedSurvivors) ? state.gatedSurvivors : [];
  const minBreadth = state.settings.minimumBreadth || 5;
  const relaxCount = state.settings.rsiRelaxCount || 0;

  if (hasScreen === true && gatedList.length < minBreadth) {
    failures.push({
      id: "minimum-breadth",
      cause: `survivors fewer than minimumBreadth after any relaxation (${gatedList.length} < ${minBreadth}, relaxed ${relaxCount} time(s))`,
      fix: "lower the minimum breadth, or press Relax RSI",
      actionText: state.settings.rsiThreshold < 50 ? "Relax RSI" : null,
      actionFn: state.settings.rsiThreshold < 50 ? () => relaxRsiThreshold() : null
    });
  }

  // 3. Infeasible problem for the survivor set
  const cap = state.settings.weightCap || 0.25;
  const isCapFeasible = (gatedList.length * cap) >= (1.0 - 1e-9);
  const isMetricFeasible = state.metrics && state.metrics.feasible !== undefined ? state.metrics.feasible : true;
  if (hasScreen === true && gatedList.length >= minBreadth && (isCapFeasible === false || isMetricFeasible === false)) {
    failures.push({
      id: "optimization-infeasible",
      cause: "infeasible problem for the survivor set",
      fix: "raise the cap, relax the screen, or select a name in another sector",
      actionText: state.settings.rsiThreshold < 50 ? "Relax RSI" : null,
      actionFn: state.settings.rsiThreshold < 50 ? () => relaxRsiThreshold() : null
    });
  }

  // 4. Any survivor malformed in exclude mode
  const gateMode = state.settings.gateMode || "exclude";
  if (gateMode === "exclude" && state.labels !== null && typeof state.labels === "object") {
    const screenSurvivors = state.screenResult && Array.isArray(state.screenResult.survivors) ? state.screenResult.survivors : [];
    let hasMalformedSurvivor = false;
    for (let i = 0; i < screenSurvivors.length; i += 1) {
      const sym = screenSurvivors[i];
      const entry = state.labels[sym];
      if (entry !== null && entry !== undefined && (entry.isMalformed === true || entry.label === "Malformed")) {
        hasMalformedSurvivor = true;
        break;
      }
    }
    if (hasMalformedSurvivor === true) {
      failures.push({
        id: "malformed-in-exclude-mode",
        cause: "any survivor malformed in exclude mode",
        fix: "regenerate labels, or switch the gate to warn",
        actions: [
          { text: "Regenerate labels", actionFn: () => regenerateLabels() },
          { text: "Switch gate to warn", actionFn: () => validateAndSetGateMode("warn") }
        ]
      });
    }
  }

  // 5. Any survivor without a text label after a live re-screen
  if (state.screenResult !== null && Array.isArray(state.screenResult.survivors) === true) {
    const survivors = state.screenResult.survivors;
    const hasUnlabelled = survivors.some((sym) => {
      if (state.labels === null || typeof state.labels !== "object") {
        return true;
      }
      const entry = state.labels[sym];
      if (entry === null || entry === undefined) {
        return true;
      }
      const hasValid = entry.isMalformed === false && entry.label !== "Malformed" && typeof entry.label === "string" && entry.label.length > 0;
      return hasValid === false;
    });

    if (hasUnlabelled === true) {
      failures.push({
        id: "survivor-unlabelled",
        cause: "any survivor without a text label after a live re-screen",
        fix: "run Label new survivors",
        actionText: "Label new survivors",
        actionFn: () => labelNewSurvivors()
      });
    }
  }

  // 6. Gated survivor list does not match survivors that should have passed the active gate mode
  if (state.screenResult !== null && Array.isArray(state.screenResult.survivors) === true && state.labels !== null && typeof state.labels === "object") {
    const survivors = state.screenResult.survivors;
    const expectedGated = [];
    for (let i = 0; i < survivors.length; i += 1) {
      const sym = survivors[i];
      const entry = state.labels[sym];
      if (entry !== null && entry !== undefined) {
        if (gateMode === "exclude") {
          if (entry.isMalformed !== true && entry.label !== "Malformed" && entry.label !== "Headwind") {
            expectedGated.push(sym);
          }
        } else {
          // warn mode: all pass
          expectedGated.push(sym);
        }
      }
    }

    const actualGated = Array.isArray(state.gatedSurvivors) ? state.gatedSurvivors : [];
    const setsMatch = expectedGated.length === actualGated.length && expectedGated.every((sym, idx) => actualGated[idx] === sym);
    if (setsMatch === false) {
      failures.push({
        id: "gated-consistency-check",
        cause: "the gated survivor list does not match the survivors that should have passed the active gate mode",
        fix: "run the pipeline again; this is an internal consistency check",
        actionText: "Run pipeline",
        actionFn: () => handleRunPipeline()
      });
    }
  }

  // Benchmark consistency check
  if (state.metrics && state.metrics.consistencyCheck && state.metrics.consistencyCheck.passed === false) {
    failures.push({
      id: "consistency-check-failed",
      cause: `Minimum variance failed benchmark consistency check: ${state.metrics.consistencyError || "volatility exceeds benchmark"}.`,
      fix: "Inspect the covariance drill-down.",
      actionText: "Inspect Covariance",
      actionFn: () => {
        const sec3 = document.getElementById("stage-section-3");
        if (sec3 !== null) {
          sec3.scrollIntoView({ behavior: "smooth" });
        }
      }
    });
  }

  // 7. Internal validation 1: Weight vector validation (sum outside 1 +/- 1e-4, negative, above cap, or sector > 50%)
  if (state.weights !== null && Array.isArray(state.weights.minVariance) === true && state.weights.minVariance.length > 0) {
    let weightSum = 0;
    let hasNegativeWeight = false;
    let hasAboveCap = false;
    const currentCap = state.settings.weightCap || 0.25;

    for (let i = 0; i < state.weights.minVariance.length; i += 1) {
      const w = state.weights.minVariance[i];
      weightSum += w;
      if (w < -1e-6) {
        hasNegativeWeight = true;
      }
      if (w > currentCap + 1e-6) {
        hasAboveCap = true;
      }
    }

    const sumIsInvalid = Math.abs(weightSum - 1.0) > 1e-4;

    let sectorMax = 0;
    const gatedListForSec = Array.isArray(state.gatedSurvivors) ? state.gatedSurvivors : [];
    if (gatedListForSec.length === state.weights.minVariance.length) {
      const secTotals = {};
      for (let i = 0; i < gatedListForSec.length; i += 1) {
        const sym = gatedListForSec[i];
        const sec = getConstituentSector(sym);
        secTotals[sec] = (secTotals[sec] || 0) + state.weights.minVariance[i];
        if (secTotals[sec] > sectorMax) {
          sectorMax = secTotals[sec];
        }
      }
    }
    const sectorIsInvalid = sectorMax > 0.50 + 1e-9;

    if (sumIsInvalid === true || hasNegativeWeight === true || hasAboveCap === true || sectorIsInvalid === true) {
      failures.push({
        id: "internal-weights-validation",
        cause: "the weight vector does not sum to one within 1e-4, has an entry below zero, has an entry above weightCap, or has a sector sum above 50%",
        fix: "run the pipeline again; this is an internal weights validation",
        actionText: "Run pipeline",
        actionFn: () => handleRunPipeline()
      });
    }
  }

  // 8. Internal validation 2: Dollar allocations sum and non-negativity
  const allocObj = (state.allocations !== null && state.allocations !== undefined && typeof state.allocations === "object")
    ? state.allocations
    : ((state.weights !== null && state.weights !== undefined && typeof state.weights === "object") ? state.weights.allocations : null);
  const minVarAllocs = (allocObj !== null && allocObj !== undefined && typeof allocObj === "object") ? allocObj.minVariance : null;
  if (Array.isArray(minVarAllocs) === true && minVarAllocs.length > 0) {
    let dollarSum = 0;
    let hasNegativeDollar = false;
    for (let i = 0; i < minVarAllocs.length; i += 1) {
      const d = minVarAllocs[i];
      dollarSum += d;
      if (d < 0) {
        hasNegativeDollar = true;
      }
    }
    const invAmount = state.settings.investmentAmount || 1000000;
    const dollarExceeds = dollarSum > invAmount;
    if (dollarExceeds === true || hasNegativeDollar === true) {
      failures.push({
        id: "internal-dollars-validation",
        cause: "any dollar allocation is negative, or dollar allocations sum to more than investmentAmount",
        fix: "run the pipeline again; this is an internal dollars validation",
        actionText: "Run pipeline",
        actionFn: () => handleRunPipeline()
      });
    }
  }

  const guardrailsPass = failures.length === 0;
  state.guardrailResult = {
    passed: guardrailsPass,
    failures: failures,
    evaluatedAt: new Date().toISOString()
  };

  if (guardrailsPass === false) {
    setStageStatus(7, "blocked");
    setStageStatus(8, "blocked");
  } else {
    setStageStatus(7, "done");
    if (state.stageStatus[8] === "blocked") {
      setStageStatus(8, state.note !== null ? (state.note.isStale ? "stale" : "done") : "idle");
    }
  }

  return failures;
}

/**
 * Returns a dated export file name in the format: oversold_turn_YYYY-MM-DD_HHMM.json
 *
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function getExportFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `oversold_turn_${year}-${month}-${day}_${hours}${minutes}.json`;
}

/**
 * Unit test verifying that getExportFileName matches pattern oversold_turn_\d{4}-\d{2}-\d{2}_\d{4}\.json
 * and produces distinct names for different times on the same day.
 *
 * @returns {boolean}
 */
export function testExportFileNamePattern() {
  const d1 = new Date(2026, 8, 6, 9, 5);
  const d2 = new Date(2026, 8, 6, 9, 6);
  const name1 = getExportFileName(d1);
  const name2 = getExportFileName(d2);
  const pattern = /^oversold_turn_\d{4}-\d{2}-\d{2}_\d{4}\.json$/;
  const match1 = pattern.test(name1);
  const match2 = pattern.test(name2);
  const distinct = name1 !== name2;
  return match1 === true && match2 === true && distinct === true;
}

/**
 * Unit test verifying that a mocked weight vector summing to 1.01 produces
 * the internal validation message that the app is at fault.
 *
 * @returns {boolean}
 */
export function testMockedWeightValidation() {
  const mockState = {
    ...appState,
    weights: {
      minVariance: [0.50, 0.51]
    }
  };
  const failures = evaluateGuardrails(mockState);
  const found = failures.find((f) => f.id === "internal-weights-validation");
  const hasAppAtFault = found !== undefined && typeof found.fix === "string" && found.fix.includes("The app, not the input, is at fault");
  return hasAppAtFault === true;
}

/**
 * Compiles the JSON export structure, excluding keys, raw price arrays,
 * raw model responses, and full descriptions.
 *
 * @param {object} [state=appState]
 * @returns {object}
 */
export function generateExportData(state = appState) {
  const cleanLabels = {};
  if (state.labels !== null && typeof state.labels === "object") {
    const keys = Object.keys(state.labels);
    for (let i = 0; i < keys.length; i += 1) {
      const sym = keys[i];
      if (sym === "gatedSurvivors" || sym === "passedSurvivors") {
        continue;
      }
      const entry = state.labels[sym];
      if (entry !== null && typeof entry === "object") {
        const cleanReason = typeof entry.reason === "string"
          ? entry.reason.replace(/[0-9]/g, "").trim()
          : "";
        cleanLabels[sym] = {
          label: entry.label || "Unclassified",
          reason: cleanReason,
          alerts_cited: Array.isArray(entry.alerts_cited) ? [...entry.alerts_cited] : []
        };
      }
    }
  }

  const cleanSignals = {};
  if (state.screenResult !== null && typeof state.screenResult.byTicker === "object") {
    const syms = Object.keys(state.screenResult.byTicker);
    for (let i = 0; i < syms.length; i += 1) {
      const s = syms[i];
      const r = state.screenResult.byTicker[s];
      cleanSignals[s] = {
        ticker: s,
        isOversold: r.isOversold,
        isTurning: r.isTurning,
        passesScreen: r.passesScreen,
        rsi: r.rsi,
        rsiThreshold: r.rsiThreshold,
        histogramCurrent: r.histogramCurrent,
        histogramLagged: r.histogramLagged,
        histogramLookback: r.histogramLookback
      };
    }
  }

  const startDate = state.alignedData && state.alignedData.dates && state.alignedData.dates.length > 0
    ? state.alignedData.dates[0]
    : null;
  const endDate = state.alignedData && state.alignedData.dates && state.alignedData.dates.length > 0
    ? state.alignedData.dates[state.alignedData.dates.length - 1]
    : null;
  const sessionCount = state.alignedData && typeof state.alignedData.sessionCount === "number"
    ? state.alignedData.sessionCount
    : (state.alignedData && state.alignedData.dates ? state.alignedData.dates.length : 0);

  const exportAllocs = (state.allocations !== null && typeof state.allocations === "object")
    ? state.allocations
    : ((state.weights !== null && typeof state.weights === "object") ? state.weights.allocations : null);
  const minVarAllocs = (exportAllocs && Array.isArray(exportAllocs.minVariance))
    ? [...exportAllocs.minVariance]
    : (state.dollarAllocations && Array.isArray(state.dollarAllocations.minVariance) ? [...state.dollarAllocations.minVariance] : []);
  const eqWAllocs = (exportAllocs && Array.isArray(exportAllocs.equalWeight))
    ? [...exportAllocs.equalWeight]
    : (state.dollarAllocations && Array.isArray(state.dollarAllocations.equalWeight) ? [...state.dollarAllocations.equalWeight] : []);
  const invVolAllocs = (exportAllocs && Array.isArray(exportAllocs.inverseVolatility))
    ? [...exportAllocs.inverseVolatility]
    : (state.dollarAllocations && Array.isArray(state.dollarAllocations.inverseVolatility) ? [...state.dollarAllocations.inverseVolatility] : []);

  const exportObj = {
    runTimestamp: new Date().toISOString(),
    modelIdentifier: state.settings.openRouterModel || DEFAULT_OPENROUTER_MODEL,
    openRouterModel: state.settings.openRouterModel || DEFAULT_OPENROUTER_MODEL,
    creditsSetting: state.settings.creditsPerMinute || 144,
    creditsPerMinute: state.settings.creditsPerMinute || 144,
    settings: {
      rsiThreshold: state.settings.baseRsiThreshold || state.settings.rsiThreshold,
      rsiCurrent: state.settings.rsiThreshold,
      rsiRelaxCount: state.settings.rsiRelaxCount || 0,
      gateMode: state.settings.gateMode,
      weightCap: state.settings.weightCap,
      minimumBreadth: state.settings.minimumBreadth,
      histogramLookback: state.settings.histogramLookback,
      riskFreeRate: state.settings.riskFreeRate,
      riskFreeRateDate: getTodayNYDateString()
    },
    alignedPriceHistory: {
      startDate: startDate,
      endDate: endDate,
      sessionCount: sessionCount
    },
    screenSignals: cleanSignals,
    textLabels: cleanLabels,
    investmentAmount: state.settings.investmentAmount,
    weights: {
      minVariance: {
        weights: state.weights && state.weights.minVariance ? [...state.weights.minVariance] : [],
        dollarAllocations: minVarAllocs,
        feasible: state.metrics && state.metrics.feasible !== undefined ? state.metrics.feasible : true
      },
      equalWeight: {
        weights: state.weights && state.weights.equalWeight ? [...state.weights.equalWeight] : [],
        dollarAllocations: eqWAllocs,
        feasible: true
      },
      inverseVolatility: {
        weights: state.weights && state.weights.inverseVolatility ? [...state.weights.inverseVolatility] : [],
        dollarAllocations: invVolAllocs,
        feasible: true
      }
    },
    metrics: {
      minVariance: state.metrics && state.metrics.minVariance ? {
        annualizedReturn: state.metrics.minVariance.annualizedReturn,
        annualizedVolatility: state.metrics.minVariance.annualizedVolatility,
        sharpe: state.metrics.minVariance.sharpe
      } : null,
      equalWeight: state.metrics && state.metrics.equalWeight ? {
        annualizedReturn: state.metrics.equalWeight.annualizedReturn,
        annualizedVolatility: state.metrics.equalWeight.annualizedVolatility,
        sharpe: state.metrics.equalWeight.sharpe
      } : null,
      inverseVolatility: state.metrics && state.metrics.inverseVolatility ? {
        annualizedReturn: state.metrics.inverseVolatility.annualizedReturn,
        annualizedVolatility: state.metrics.inverseVolatility.annualizedVolatility,
        sharpe: state.metrics.inverseVolatility.sharpe
      } : null
    },
    rollingBeta: {
      series: state.beta && Array.isArray(state.beta.series) ? state.beta.series : [],
      currentBeta: state.beta && typeof state.beta.currentBeta === "number" ? state.beta.currentBeta : null,
      window: 60
    },
    guardrailCheckPassed: state.guardrailResult && state.guardrailResult.passed === true,
    guardrails: {
      passed: state.guardrailResult && state.guardrailResult.passed === true,
      evaluatedAt: state.guardrailResult ? state.guardrailResult.evaluatedAt : new Date().toISOString()
    },
    note: (() => {
      const hasNote = state.note && typeof state.note.text === "string" && state.note.text.trim().length > 0;
      if (hasNote === true) {
        if (!state.notePostCheck) {
          const payload = state.notePayload || buildNotePayload(state);
          state.notePostCheck = postCheckNote(state.note.text, payload);
        }
        return state.note.text;
      }
      return "Note unavailable";
    })(),
    notePostCheck: state.notePostCheck ? {
      passed: state.notePostCheck.passed === true,
      problems: Array.isArray(state.notePostCheck.problems) ? state.notePostCheck.problems : [],
      failures: Array.isArray(state.notePostCheck.failures) ? state.notePostCheck.failures : [],
      wordCount: typeof state.notePostCheck.wordCount === "number" ? state.notePostCheck.wordCount : 0
    } : null,
    backtest: state.backtest !== null ? state.backtest : null
  };

  return exportObj;
}

/**
 * Exports the run output as a dated JSON file.
 * Allowed only when guardrails pass and the review checkbox is checked.
 *
 * @param {object} [state=appState]
 * @returns {{fileName: string, data: object}|null}
 */
export function exportPortfolio(state = appState) {
  const failures = evaluateGuardrails(state);
  const guardrailsPass = failures.length === 0;
  const isReviewed = state.reviewed === true;
  const exportIsAllowed = guardrailsPass === true && isReviewed === true;

  if (exportIsAllowed === false) {
    return null;
  }

  const exportData = generateExportData(state);
  const jsonStr = JSON.stringify(exportData, null, 2);
  const fileName = getExportFileName();

  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { fileName, data: exportData };
}

/**
 * Renders the Stage 7 guardrails checklist and blocked card.
 */
export function renderStage7UI() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  const placeholder = document.getElementById("stage-7-placeholder");
  const container = document.getElementById("stage-7-container");
  const hasWeights = appState.weights !== null && Array.isArray(appState.weights.minVariance) === true;

  if (hasWeights === false) {
    if (placeholder !== null) {
      placeholder.classList.remove("hidden");
    }
    if (container !== null) {
      container.classList.add("hidden");
    }
    return;
  }

  if (placeholder !== null) {
    placeholder.classList.add("hidden");
  }
  if (container !== null) {
    container.classList.remove("hidden");
  }

  const failures = evaluateGuardrails(appState);
  const guardrailsPass = failures.length === 0;

  const blockedCard = document.getElementById("stage-7-blocked-card");
  const failuresList = document.getElementById("stage-7-blocked-failures");
  const checksList = document.getElementById("stage-7-checks-list");
  const overallBadge = document.getElementById("guardrail-overall-status-badge");
  const exportBtn = document.getElementById("btn-export-portfolio");
  const stage8ExportBtn = document.getElementById("btn-stage-8-export-portfolio");

  if (guardrailsPass === false) {
    if (blockedCard !== null) {
      blockedCard.classList.remove("hidden");
    }
    if (failuresList !== null) {
      failuresList.innerHTML = failures.map((f, idx) => {
        let actionHtml = "";
        if (f.actions && Array.isArray(f.actions) === true) {
          actionHtml = f.actions.map((act, aIdx) => {
            return `<button type="button" class="btn btn-secondary blocked-action-btn" id="btn-blocked-act-${idx}-${aIdx}">${act.text}</button>`;
          }).join(" ");
        } else if (f.actionText) {
          actionHtml = `<button type="button" class="btn btn-secondary blocked-action-btn" id="btn-blocked-act-${idx}">${f.actionText}</button>`;
        }
        return `
          <div class="blocked-failure-item" id="blocked-failure-${idx}">
            <div class="blocked-failure-content">
              <span class="blocked-failure-cause">Failure: ${f.cause}</span>
              <span class="blocked-failure-fix">Fix: ${f.fix}</span>
            </div>
            ${actionHtml.length > 0 ? `<div class="blocked-failure-action">${actionHtml}</div>` : ""}
          </div>
        `;
      }).join("");

      failures.forEach((f, idx) => {
        if (f.actions && Array.isArray(f.actions) === true) {
          f.actions.forEach((act, aIdx) => {
            const btn = document.getElementById(`btn-blocked-act-${idx}-${aIdx}`);
            if (btn !== null && typeof act.actionFn === "function") {
              btn.onclick = act.actionFn;
            }
          });
        } else if (f.actionText && typeof f.actionFn === "function") {
          const btn = document.getElementById(`btn-blocked-act-${idx}`);
          if (btn !== null) {
            btn.onclick = f.actionFn;
          }
        }
      });
    }

    if (overallBadge !== null) {
      overallBadge.textContent = "Blocked";
      overallBadge.className = "badge status-blocked";
    }

    if (exportBtn !== null) {
      exportBtn.classList.add("hidden");
      exportBtn.disabled = true;
    }
    if (stage8ExportBtn !== null) {
      stage8ExportBtn.classList.add("hidden");
      stage8ExportBtn.disabled = true;
    }
  } else {
    if (blockedCard !== null) {
      blockedCard.classList.add("hidden");
    }
    if (overallBadge !== null) {
      overallBadge.textContent = "Passed";
      overallBadge.className = "badge badge-status-pass";
    }

    if (checksList !== null) {
      const minBreadth = appState.settings.minimumBreadth || 5;
      const passItems = [
        { label: "Price History Sessions", desc: "Aligned history contains at least 200 sessions" },
        { label: "Minimum Breadth", desc: `Gated survivor count meets or exceeds minimum breadth (${minBreadth})` },
        { label: "Optimization Feasibility", desc: "Minimum variance quadratic solver found feasible constrained solution" },
        { label: "Gate Mode Consistency", desc: "Constituent text labels satisfy qualitative gate rules" },
        { label: "Label Completeness", desc: "Every technical survivor has a valid categorical text label" },
        { label: "Benchmark Consistency", desc: "Minimum variance annualized volatility is lower than equal-weight and SPY" },
        { label: "Weight Vector Validation", desc: "Weights sum strictly to 1.0 (within ±0.001), non-negative, <= cap, sectors <= 50%" },
        { label: "Dollar Allocations Validation", desc: "Allocations sum to total investment capital with zero negative amounts" }
      ];

      checksList.innerHTML = passItems.map((item, i) => `
        <div class="guardrail-item" id="guardrail-check-${i}">
          <div class="guardrail-item-info">
            <svg class="guardrail-check-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <div>
              <span class="guardrail-name">${item.label}</span>
              <p class="guardrail-desc">${item.desc}</p>
            </div>
          </div>
          <span class="badge badge-status-pass">Pass</span>
        </div>
      `).join("");
    }

    const isReviewed = appState.reviewed === true;
    if (exportBtn !== null) {
      exportBtn.classList.remove("hidden");
      exportBtn.disabled = isReviewed === false;
    }
    if (stage8ExportBtn !== null) {
      stage8ExportBtn.classList.remove("hidden");
      stage8ExportBtn.disabled = isReviewed === false;
    }
  }

  const chk = document.getElementById("guardrail-reviewed-checkbox");
  if (chk !== null) {
    chk.checked = appState.reviewed === true;
  }
  const statusBadge = document.getElementById("guardrail-review-status");
  if (statusBadge !== null) {
    if (appState.reviewed === true) {
      statusBadge.textContent = "Reviewed";
      statusBadge.className = "badge badge-status-pass";
    } else {
      statusBadge.textContent = "Unreviewed";
      statusBadge.className = "badge";
    }
  }
}

/**
 * Wires up Stage 7 interactive elements.
 */
export function setupStage7() {
  renderStage7UI();

  const chk = document.getElementById("guardrail-reviewed-checkbox");
  if (chk !== null) {
    chk.onchange = (e) => {
      appState.reviewed = e.target.checked === true;
      const statusBadge = document.getElementById("guardrail-review-status");
      if (statusBadge !== null) {
        if (appState.reviewed === true) {
          statusBadge.textContent = "Reviewed";
          statusBadge.className = "badge badge-status-pass";
        } else {
          statusBadge.textContent = "Unreviewed";
          statusBadge.className = "badge";
        }
      }

      const guardrailsPass = appState.guardrailResult !== null && appState.guardrailResult.passed === true;
      const exportIsAllowed = guardrailsPass === true && appState.reviewed === true;
      const exportBtn = document.getElementById("btn-export-portfolio");
      if (exportBtn !== null) {
        exportBtn.disabled = exportIsAllowed === false;
      }
      const stage8ExportBtn = document.getElementById("btn-stage-8-export-portfolio");
      if (stage8ExportBtn !== null) {
        stage8ExportBtn.disabled = exportIsAllowed === false;
      }
    };
  }

  const exportBtn = document.getElementById("btn-export-portfolio");
  if (exportBtn !== null) {
    exportBtn.onclick = () => {
      exportPortfolio();
    };
  }

  const stage8ExportBtn = document.getElementById("btn-stage-8-export-portfolio");
  if (stage8ExportBtn !== null) {
    stage8ExportBtn.onclick = () => {
      exportPortfolio();
    };
  }
}

/**
 * Thesis statement constant supplied verbatim.
 * Defines the core qualitative mean-reversion recovery thesis for oversold S&P 500 constituents.
 */
export const THESIS_STATEMENT = "Large-cap S&P 500 names that are oversold (RSI below 40) but show an early momentum turn (MACD histogram higher than three sessions ago) and are not facing a flagged macro headwind (text signal) are candidates for a mean-reversion recovery. Holding them as a minimum variance portfolio captures the rebound while limiting the drawdown risk that comes with buying weakness.";

/**
 * System prompt instructing the language model to act as a concise financial analyst
 * producing continuous prose without recomputing or inventing any figure.
 */
export const NOTE_SYSTEM_PROMPT = `You are a concise financial analyst writing a one-page plain English investment committee note.
You explain the finished portfolio in plain language without recomputing or inventing any number.
Every figure mentioned must appear verbatim in the input payload.
The settings used govern wherever they differ from the thresholds named in the thesis statement.
Every number must be written exactly as given, not rounded, not rescaled ("1,000,000", never "1 million"), and not spelled out in words.

The note follows a fixed structure written in continuous prose mirroring the investor's screens:
Part 1: Which names were kept and, in exclude mode, which Headwind names were dropped and why, or, in warn mode, which Headwind names were kept with a warning and why.
Part 2: How weight was distributed, stating the investment amount and the largest dollar positions.
Part 3: How minimum variance compares with the two benchmarks.
Part 4: The two largest risks.
When backtest figures are present in the payload, state whether the walk-forward evidence supports the thesis (naming the screen effect and optimizer effect from the payload) and include the two limitations; when backtest figures are absent, state that the backtest was omitted.

Constraints:
- Under 400 words total.
- No bullet points, headings, or lists. Write continuous prose paragraphs.`;

/**
 * Builds the committee note data payload from application state using the shared display formatters.
 * Every figure is formatted exactly as displayed on screen.
 *
 * @param {object} [state=appState]
 * @returns {object} Note payload
 */
export function buildNotePayload(state = appState) {
  const inv = typeof state.settings.investmentAmount === "number" ? state.settings.investmentAmount : 1000000;
  const cap = typeof state.settings.weightCap === "number" ? state.settings.weightCap : 0.25;
  const rf = typeof state.settings.riskFreeRate === "number" ? state.settings.riskFreeRate : 0.0391;
  const gateMode = state.settings.gateMode || "exclude";

  const settingsUsed = {
    rsiThreshold: String(state.settings.baseRsiThreshold || state.settings.rsiThreshold || 40),
    rsiCurrent: String(state.settings.rsiThreshold || 40),
    rsiRelaxed: (state.settings.rsiRelaxCount || 0) > 0 ? "Yes" : "No",
    rsiRelaxCount: String(state.settings.rsiRelaxCount || 0),
    rsiRelaxationSummary: (state.settings.rsiRelaxCount || 0) > 0
      ? `relaxed ${state.settings.rsiRelaxCount} time(s)`
      : "not relaxed",
    lookback: `${state.settings.histogramLookback || 3} sessions`,
    histogramLookback: `${state.settings.histogramLookback || 3} sessions`,
    cap: formatPercentage(cap),
    weightCap: formatPercentage(cap),
    sectorLimit: "50.00%",
    gateMode: gateMode,
    riskFreeRate: formatPercentage(rf)
  };

  const hasAligned = state.alignedData !== null && typeof state.alignedData === "object";
  const sessionCount = hasAligned === true && typeof state.alignedData.sessionCount === "number"
    ? state.alignedData.sessionCount
    : (hasAligned === true && Array.isArray(state.alignedData.dates) ? state.alignedData.dates.length : 250);

  const alignedHistory = {
    startDate: hasAligned === true && state.alignedData.startDate ? state.alignedData.startDate : "",
    endDate: hasAligned === true && state.alignedData.endDate ? state.alignedData.endDate : "",
    sessionCount: `${sessionCount} sessions`,
    dateRange: (hasAligned === true && state.alignedData.startDate && state.alignedData.endDate)
      ? `${state.alignedData.startDate} to ${state.alignedData.endDate}`
      : ""
  };

  const signals = [];
  const byTicker = state.screenResult && state.screenResult.byTicker ? state.screenResult.byTicker : {};
  const screenTickers = Object.keys(byTicker);
  for (let i = 0; i < screenTickers.length; i += 1) {
    const sym = screenTickers[i];
    const r = byTicker[sym];
    const lbl = state.labels && state.labels[sym] ? state.labels[sym] : null;
    const isGated = Array.isArray(state.gatedSurvivors) && state.gatedSurvivors.includes(sym);
    const cleanReason = lbl && typeof lbl.reason === "string" ? lbl.reason.replace(/[0-9]/g, "").trim() : "";

    signals.push({
      ticker: sym,
      oversold: r.isOversold === true ? "Pass" : "Fail",
      rsi: typeof r.rsi === "number" ? formatTwoDecimals(r.rsi) : "N/A",
      momentum: r.isMomentumTurn === true ? "Pass" : "Fail",
      technicalScreen: r.passed === true ? "Pass" : "Fail",
      textLabel: lbl ? lbl.label : "Unclassified",
      textReason: cleanReason,
      gateOutcome: isGated ? "Kept" : "Dropped"
    });
  }

  const textLabels = [];
  const headwindNames = [];
  const screenSurvivors = state.screenResult && Array.isArray(state.screenResult.survivors)
    ? state.screenResult.survivors
    : (Array.isArray(state.gatedSurvivors) ? state.gatedSurvivors : []);

  for (let i = 0; i < screenSurvivors.length; i += 1) {
    const sym = screenSurvivors[i];
    const lbl = state.labels && state.labels[sym] ? state.labels[sym] : null;
    const labelVal = lbl ? lbl.label : "Unclassified";
    const reasonVal = lbl && typeof lbl.reason === "string" ? lbl.reason.replace(/[0-9]/g, "").trim() : "";
    const isGated = Array.isArray(state.gatedSurvivors) && state.gatedSurvivors.includes(sym);

    let disposition = "";
    if (labelVal === "Headwind") {
      if (gateMode === "exclude") {
        disposition = `Dropped due to flagged macro headwind: ${reasonVal}`;
        headwindNames.push({ ticker: sym, status: "Dropped", reason: reasonVal });
      } else {
        disposition = `Kept with warning (warn mode active): ${reasonVal}`;
        headwindNames.push({ ticker: sym, status: "Kept with warning", reason: reasonVal });
      }
    } else {
      disposition = isGated ? "Kept in candidate portfolio" : "Excluded by gate";
    }

    textLabels.push({
      ticker: sym,
      label: labelVal,
      reason: reasonVal,
      gateMode: gateMode,
      disposition: disposition
    });
  }

  const methodKeys = ["minVariance", "equalWeight", "inverseVolatility"];
  const weightsAndAllocations = {};
  const survivors = Array.isArray(state.gatedSurvivors) ? state.gatedSurvivors : [];

  for (let m = 0; m < methodKeys.length; m += 1) {
    const mKey = methodKeys[m];
    const wList = state.weights && Array.isArray(state.weights[mKey]) ? state.weights[mKey] : [];
    const aList = state.weights && state.weights.allocations && Array.isArray(state.weights.allocations[mKey])
      ? state.weights.allocations[mKey]
      : (state.dollarAllocations && Array.isArray(state.dollarAllocations[mKey]) ? state.dollarAllocations[mKey] : []);

    const positions = [];
    let largestWeight = 0;
    let largestDollar = 0;
    let largestTicker = "";

    for (let i = 0; i < survivors.length; i += 1) {
      const sym = survivors[i];
      const w = typeof wList[i] === "number" ? wList[i] : 0;
      const a = typeof aList[i] === "number" ? aList[i] : Math.round(w * inv);
      const uObj = Array.isArray(state.universe) ? state.universe.find((u) => u.ticker === sym) : null;
      const sector = uObj ? uObj.sector : "Unknown Sector";

      positions.push({
        ticker: sym,
        sector: sector,
        weight: formatPercentage(w),
        dollarAllocation: formatWholeDollars(a),
        weightNum: w,
        allocNum: a
      });

      if (w > largestWeight) {
        largestWeight = w;
        largestDollar = a;
        largestTicker = sym;
      }
    }

    positions.sort((a, b) => b.weightNum - a.weightNum);

    weightsAndAllocations[mKey] = {
      positions: positions.map((p) => ({
        ticker: p.ticker,
        sector: p.sector,
        weight: p.weight,
        dollarAllocation: p.dollarAllocation
      })),
      largestWeight: formatPercentage(largestWeight),
      largestDollarPosition: formatWholeDollars(largestDollar),
      largestPositionSummary: largestTicker ? `${largestTicker} at ${formatWholeDollars(largestDollar)} (${formatPercentage(largestWeight)})` : "None"
    };
  }

  const portfolioMetrics = {};
  for (let m = 0; m < methodKeys.length; m += 1) {
    const mKey = methodKeys[m];
    const met = state.metrics && state.metrics[mKey] ? state.metrics[mKey] : null;
    portfolioMetrics[mKey] = {
      methodName: mKey === "minVariance" ? "Minimum Variance (Candidate)" : (mKey === "equalWeight" ? "Equal Weight (Reference Benchmark)" : "Inverse Volatility (Reference Benchmark)"),
      annualizedReturn: met && typeof met.annualizedReturn === "number" ? formatPercentage(met.annualizedReturn) : "N/A",
      annualizedVolatility: met && typeof met.annualizedVolatility === "number" ? formatPercentage(met.annualizedVolatility) : "N/A",
      sharpe: met && typeof met.sharpe === "number" ? formatSharpe(met.sharpe) : "N/A",
      feasible: met && met.feasible !== undefined ? (met.feasible === true ? "Yes" : "No") : "Yes"
    };
  }

  const sectorSummary = {};
  const mvWeights = state.weights && Array.isArray(state.weights.minVariance) ? state.weights.minVariance : [];
  const mvAllocs = state.weights && state.weights.allocations && Array.isArray(state.weights.allocations.minVariance)
    ? state.weights.allocations.minVariance
    : [];

  for (let i = 0; i < survivors.length; i += 1) {
    const sym = survivors[i];
    const w = typeof mvWeights[i] === "number" ? mvWeights[i] : 0;
    const a = typeof mvAllocs[i] === "number" ? mvAllocs[i] : Math.round(w * inv);
    const uObj = Array.isArray(state.universe) ? state.universe.find((u) => u.ticker === sym) : null;
    const sector = uObj ? uObj.sector : "Unknown Sector";

    if (!sectorSummary[sector]) {
      sectorSummary[sector] = { weight: 0, alloc: 0, tickers: [] };
    }
    sectorSummary[sector].weight += w;
    sectorSummary[sector].alloc += a;
    sectorSummary[sector].tickers.push(sym);
  }

  const sectorExposures = Object.keys(sectorSummary).map((sec) => ({
    sector: sec,
    totalWeight: formatPercentage(sectorSummary[sec].weight),
    totalAllocation: formatWholeDollars(sectorSummary[sec].alloc),
    within50PctLimit: sectorSummary[sec].weight <= 0.50 ? "Yes" : "No",
    constituents: sectorSummary[sec].tickers.join(", ")
  })).sort((a, b) => parseFloat(b.totalWeight) - parseFloat(a.totalWeight));

  const betaObj = state.beta;
  const isBetaAvail = betaObj !== null && typeof betaObj === "object" && betaObj.available === true && typeof betaObj.current === "number";
  const betaCurrentStr = isBetaAvail === true
    ? formatBeta(betaObj.current)
    : (betaObj && typeof betaObj.currentBeta === "number" ? formatBeta(betaObj.currentBeta) : "Unavailable");
  const betaWindowStr = `${betaObj && betaObj.window ? betaObj.window : 60}-session window`;
  const betaStatusStr = (betaObj && betaObj.available === false) ? (betaObj.reason || "SPY unavailable") : "Available";

  const rollingBeta = {
    currentBeta: betaCurrentStr,
    window: betaWindowStr,
    benchmark: "SPY",
    status: betaStatusStr
  };

  let backtestPayload = null;
  const hasBacktest = state.backtest !== null && typeof state.backtest === "object";
  if (hasBacktest === true) {
    backtestPayload = {
      verdict: state.backtest.verdict,
      holdingPeriod: `${state.backtest.settings.holdingPeriod} sessions`,
      exitThreshold: `${state.backtest.settings.exitThreshold}`,
      cadence: `${state.backtest.settings.cadence} sessions`,
      screenEffectMean: formatPercentage(state.backtest.attribution.screenEffect.mean),
      screenEffectHitRate: formatPercentage(state.backtest.attribution.screenEffect.hitRate),
      optimizerEffectMean: formatPercentage(state.backtest.attribution.optimizerEffect.mean),
      optimizerEffectHitRate: formatPercentage(state.backtest.attribution.optimizerEffect.hitRate),
      limitations: [
        "Survivorship bias: Evaluated using current index constituents rather than point-in-time membership.",
        "Single-regime risk: Three-year backtest window covers a limited set of macroeconomic regimes."
      ]
    };
  }

  const payload = {
    thesisStatement: THESIS_STATEMENT,
    investmentAmount: formatWholeDollars(inv),
    investmentAmountPlain: inv.toLocaleString("en-US"),
    investmentAmountRaw: `${inv.toLocaleString("en-US")} USD`,
    settingsUsed: settingsUsed,
    alignedDateRange: alignedHistory,
    perTickerSignals: signals,
    textLabels: textLabels,
    headwindNames: headwindNames,
    weightsAndAllocations: weightsAndAllocations,
    portfolioMetrics: portfolioMetrics,
    sectorConcentration: sectorExposures,
    rollingBeta: rollingBeta,
    backtest: backtestPayload
  };

  state.notePayload = payload;
  return payload;
}

/**
 * Normalizes a number token extracted from note text or payload.
 * Strips leading currency symbols ($ € £ ¥), trailing percent signs (%),
 * and thousands separators (,).
 *
 * @param {string} token
 * @returns {string}
 */
export function normalizeNumberToken(token) {
  const isString = typeof token === "string";
  if (isString === false) {
    return "";
  }
  return token
    .replace(/^[\$€£¥]/, "")
    .replace(/%$/, "")
    .replace(/,/g, "")
    .trim();
}

/**
 * Builds the set of normalized payload numbers from every numeric field of the stored payload,
 * including date components and the beta window (60).
 *
 * @param {object} payload
 * @returns {Set<string>}
 */
export function buildPayloadNumberSet(payload) {
  const payloadNumberSet = new Set();

  const addToken = (raw) => {
    if (raw === null || raw === undefined) {
      return;
    }
    const isNum = typeof raw === "number";
    if (isNum === true) {
      payloadNumberSet.add(String(raw));
      return;
    }
    const isStr = typeof raw === "string";
    if (isStr === true) {
      const tokens = raw.match(/(?:[\$€£¥])?\b\d[\d,]*(?:\.\d+)?%?/g);
      const hasTokens = tokens !== null && Array.isArray(tokens) === true;
      if (hasTokens === true) {
        for (let i = 0; i < tokens.length; i += 1) {
          const norm = normalizeNumberToken(tokens[i]);
          const normNotEmpty = norm.length > 0;
          if (normNotEmpty === true) {
            payloadNumberSet.add(norm);
          }
        }
      }
    }
  };

  const traverse = (item) => {
    if (item === null || item === undefined) {
      return;
    }
    const isPrimitive = typeof item === "number" || typeof item === "string";
    if (isPrimitive === true) {
      addToken(item);
      return;
    }
    const isArr = Array.isArray(item) === true;
    if (isArr === true) {
      for (let i = 0; i < item.length; i += 1) {
        traverse(item[i]);
      }
      return;
    }
    const isObj = typeof item === "object";
    if (isObj === true) {
      const keys = Object.keys(item);
      for (let i = 0; i < keys.length; i += 1) {
        traverse(item[keys[i]]);
      }
    }
  };

  const hasPayload = payload !== null && typeof payload === "object";
  if (hasPayload === true) {
    traverse(payload);
  }

  // Explicit beta window (60)
  payloadNumberSet.add("60");

  // Explicit aligned date range components (year, month, and day parts treated as numbers as they appear)
  const hasDateRange = hasPayload === true && payload.alignedDateRange !== null && typeof payload.alignedDateRange === "object";
  if (hasDateRange === true) {
    const dates = [payload.alignedDateRange.startDate, payload.alignedDateRange.endDate];
    for (let d = 0; d < dates.length; d += 1) {
      const dateStr = dates[d];
      const isDateStr = typeof dateStr === "string";
      if (isDateStr === true) {
        const parts = dateStr.split(/[-/]/);
        for (let p = 0; p < parts.length; p += 1) {
          const part = parts[p].trim();
          const isDigitsOnly = /^\d+$/.test(part) === true;
          if (isDigitsOnly === true) {
            payloadNumberSet.add(part);
            const parsedInt = parseInt(part, 10);
            const isValidInt = Number.isNaN(parsedInt) === false;
            if (isValidInt === true) {
              payloadNumberSet.add(String(parsedInt));
            }
          }
        }
      }
    }
  }

  return payloadNumberSet;
}

/**
 * Prompt 20: Note post-check in JavaScript.
 * Verifies that the note quotes only the app's own numbers and follows the required shape.
 * Warns if any problem is found. Never moves a number from the note into state and never blocks export.
 *
 * @param {string} noteText - Prose note text returned by the model
 * @param {object} [payload=appState.notePayload] - Stored payload from buildNotePayload
 * @returns {{passed: boolean, problems: Array<{type: string, detail: string}>, failures: string[], wordCount: number, evaluatedAt: string}}
 */
export function postCheckNote(noteText, payload = appState.notePayload) {
  const problems = [];

  const isString = typeof noteText === "string";
  const isEmptyOrUnavailable = isString === false || noteText.trim().length === 0 || noteText === "Note unavailable";
  if (isEmptyOrUnavailable === true) {
    const emptyResult = {
      passed: false,
      problems: [
        {
          type: "empty-note",
          detail: "Note is unavailable or empty."
        }
      ],
      failures: ["Note is unavailable or empty."],
      wordCount: 0,
      evaluatedAt: new Date().toISOString()
    };
    if (typeof appState !== "undefined" && appState !== null) {
      appState.notePostCheck = emptyResult;
    }
    return emptyResult;
  }

  const trimmed = noteText.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // 1. Verify word count is below 350; flag the count if not
  const isBelow350 = wordCount < 350;
  if (isBelow350 === false) {
    problems.push({
      type: "word-count",
      detail: `Note exceeds word limit of 350 words (${wordCount} words detected).`
    });
  }

  // 2. Verify absence of bullet characters and lines starting with a dash
  // 3. Verify absence of heading-like lines: at most eight words with no terminal punctuation, or starting with #
  const lines = trimmed.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    const isLineEmpty = line.length === 0;
    if (isLineEmpty === true) {
      continue;
    }

    const startsWithBulletOrDash = /^\s*[-–—*•]/.test(rawLine) === true;
    if (startsWithBulletOrDash === true) {
      problems.push({
        type: "prohibited-bullet-or-dash",
        detail: `Line starting with bullet or dash detected: "${rawLine}"`
      });
    }

    const startsWithHash = /^\s*#/.test(rawLine) === true;
    if (startsWithHash === true) {
      problems.push({
        type: "heading-hash",
        detail: `Line starting with # detected: "${rawLine}"`
      });
    }

    const lineWords = line.split(/\s+/).filter(Boolean);
    const lineWordCount = lineWords.length;
    const isAtMostEightWords = lineWordCount > 0 && lineWordCount <= 8;
    const hasTerminalPunctuation = /[.!?]["']?$/.test(line) === true;

    const isHeadingWithoutPunctuation = isAtMostEightWords === true && hasTerminalPunctuation === false && startsWithHash === false && startsWithBulletOrDash === false;
    if (isHeadingWithoutPunctuation === true) {
      problems.push({
        type: "heading-no-terminal-punctuation",
        detail: `Heading-like line with no terminal punctuation detected: "${line}"`
      });
    }
  }

  // 4. Flag written-out or rescaled forms: "million", "thousand", "billion", "k" after a number
  const rescaledPattern = /\b\d[\d,]*(?:\.\d+)?\s*(?:million|thousand|billion|k)\b/gi;
  let rescaledMatch = rescaledPattern.exec(trimmed);
  while (rescaledMatch !== null) {
    problems.push({
      type: "rescaled-number",
      detail: `Rescaled figure "${rescaledMatch[0].trim()}" detected. Figures must be written as exact unscaled digits.`
    });
    rescaledMatch = rescaledPattern.exec(trimmed);
  }

  // 5. Flag number words (one to ten, hundred) adjacent to a currency or percent context
  const numberWords = "one|two|three|four|five|six|seven|eight|nine|ten|hundred";
  const writtenAdjacentPatterns = [
    new RegExp(`(?:[\\$€£¥]|USD|dollars?)\\s+(?:${numberWords})\\b`, "gi"),
    new RegExp(`\\b(?:${numberWords})\\s+(?:%|percent|pct|dollars?|USD|million|thousand|billion)\\b`, "gi"),
    new RegExp(`\\b(?:${numberWords})\\s*[\\$€£¥]`, "gi")
  ];

  for (let p = 0; p < writtenAdjacentPatterns.length; p += 1) {
    const pat = writtenAdjacentPatterns[p];
    let writtenMatch = pat.exec(trimmed);
    while (writtenMatch !== null) {
      problems.push({
        type: "written-out-number",
        detail: `Written-out number form "${writtenMatch[0].trim()}" detected. Figures must be written as digits.`
      });
      writtenMatch = pat.exec(trimmed);
    }
  }

  // 6. Tokenize every number from note and verify against payloadNumberSet (whole token match)
  const payloadNumberSet = buildPayloadNumberSet(payload);
  const rawNumberTokens = trimmed.match(/(?:[\$€£¥])?\b\d[\d,]*(?:\.\d+)?%?/g) || [];
  const flaggedUnverified = new Set();

  for (let i = 0; i < rawNumberTokens.length; i += 1) {
    const rawToken = rawNumberTokens[i];
    const normalizedNumber = normalizeNumberToken(rawToken);
    const hasNorm = normalizedNumber.length > 0;
    if (hasNorm === false) {
      continue;
    }

    const numberIsInPayload = payloadNumberSet.has(normalizedNumber);
    if (numberIsInPayload === true) {
      // accepted
    } else {
      const alreadyFlagged = flaggedUnverified.has(normalizedNumber);
      if (alreadyFlagged === false) {
        flaggedUnverified.add(normalizedNumber);
        problems.push({
          type: "unverified-number",
          detail: `Figure "${rawToken}" (${normalizedNumber}) does not appear in payload.`
        });
      }
    }
  }

  const passed = problems.length === 0;
  const result = {
    passed: passed,
    problems: problems,
    failures: problems.map((p) => p.detail),
    wordCount: wordCount,
    evaluatedAt: new Date().toISOString()
  };

  if (typeof appState !== "undefined" && appState !== null) {
    appState.notePostCheck = result;
  }

  return result;
}

export const runNotePostCheck = postCheckNote;

/**
 * Generates executive committee note for Stage 8 using OpenRouter call 2.
 * Temperature 0, 30s timeout, 1 retry, following a strict four-part continuous prose structure.
 *
 * @param {object} [state=appState]
 * @param {boolean} [isRegenerate=false]
 * @returns {Promise<boolean>}
 */
export async function generateNote(state = appState, isRegenerate = false) {
  clearReview();

  // Guardrail check: Note is NEVER generated while the guardrail stage reports any failure
  const failures = evaluateGuardrails(state);
  const guardrailsPass = failures.length === 0;
  if (guardrailsPass === false) {
    console.warn("generateNote aborted: guardrails failing.", failures);
    setStageStatus(8, "blocked");
    renderStage8UI();
    return false;
  }

  const hasWeights = state.weights !== null && Array.isArray(state.weights.minVariance) === true && state.weights.minVariance.length > 0;
  if (hasWeights === false) {
    setStageStatus(8, "idle");
    renderStage8UI();
    return false;
  }

  // Build payload and store in state
  const payload = buildNotePayload(state);

  const apiKey = (state.keys.openRouter || "").trim();
  const hasApiKey = apiKey.length > 0;
  if (hasApiKey === false) {
    state.note = {
      text: "Note unavailable",
      error: "OpenRouter API Key field in Settings is missing. Please enter your API key in Settings.",
      investmentAmount: state.settings.investmentAmount || 1000000,
      isStale: false,
      timestamp: new Date().toISOString()
    };
    state.notePostCheck = {
      passed: false,
      reason: "OpenRouter API key missing",
      failures: ["OpenRouter API key missing"],
      wordCount: 0,
      evaluatedAt: new Date().toISOString()
    };
    setStageStatus(8, "done");
    renderStage8UI();
    return false;
  }

  setStageStatus(8, "running");
  renderStage8UI();

  const modelId = (state.settings.openRouterModel || DEFAULT_OPENROUTER_MODEL).trim();
  const userContent = `${THESIS_STATEMENT}\n\nPORTFOLIO DATA PAYLOAD:\n${JSON.stringify(payload, null, 2)}`;

  const requestPayload = {
    model: modelId,
    temperature: 0,
    messages: [
      { role: "system", content: NOTE_SYSTEM_PROMPT },
      { role: "user", content: userContent }
    ]
  };

  const fetchOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://ai.studio/",
      "X-Title": "Momentum Value Asset Allocation"
    },
    body: JSON.stringify(requestPayload)
  };

  const attemptFetch = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        ...fetchOptions,
        signal: controller.signal
      });
      clearTimeout(timer);
      return resp;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  };

  let response;
  let fetchFailed = false;
  let failureMessage = "";

  try {
    try {
      response = await attemptFetch();
      const isOk = response.ok === true;
      if (isOk === false) {
        throw new Error(`OpenRouter returned HTTP ${response.status}`);
      }
    } catch (firstErr) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      response = await attemptFetch();
      const retryOk = response.ok === true;
      if (retryOk === false) {
        throw new Error(`OpenRouter returned HTTP ${response.status} on retry`);
      }
    }
  } catch (err) {
    fetchFailed = true;
    failureMessage = err.message || String(err);
  }

  if (fetchFailed === true) {
    state.note = {
      text: "Note unavailable",
      error: failureMessage,
      investmentAmount: state.settings.investmentAmount || 1000000,
      isStale: false,
      timestamp: new Date().toISOString()
    };
    state.notePostCheck = {
      passed: false,
      reason: failureMessage,
      failures: [failureMessage],
      wordCount: 0,
      evaluatedAt: new Date().toISOString()
    };
    setStageStatus(8, "done");
    renderStage8UI();
    return false;
  }

  try {
    const data = await response.json();
    const hasChoices = data && Array.isArray(data.choices) === true && data.choices.length > 0;
    const choice = hasChoices === true ? data.choices[0] : null;
    const noteContent = choice && choice.message && typeof choice.message.content === "string"
      ? choice.message.content.trim()
      : "";

    const hasContent = noteContent.length > 0;
    if (hasContent === false) {
      throw new Error("OpenRouter returned empty note content");
    }

    state.note = {
      text: noteContent,
      error: null,
      investmentAmount: state.settings.investmentAmount || 1000000,
      isStale: false,
      timestamp: new Date().toISOString()
    };

    const postCheckResult = runNotePostCheck(noteContent, payload);
    state.notePostCheck = postCheckResult;

    setStageStatus(8, "done");
    renderStage8UI();
    return true;
  } catch (parseErr) {
    state.note = {
      text: "Note unavailable",
      error: parseErr.message || String(parseErr),
      investmentAmount: state.settings.investmentAmount || 1000000,
      isStale: false,
      timestamp: new Date().toISOString()
    };
    state.notePostCheck = {
      passed: false,
      reason: parseErr.message || String(parseErr),
      failures: [parseErr.message || String(parseErr)],
      wordCount: 0,
      evaluatedAt: new Date().toISOString()
    };
    setStageStatus(8, "done");
    renderStage8UI();
    return false;
  }
}

/**
 * Regenerates the investment note with the latest parameters.
 * Clears review and performs a single network request to OpenRouter.
 *
 * @param {object} [state=appState]
 * @returns {Promise<boolean>}
 */
export async function regenerateNote(state = appState) {
  clearReview();
  return generateNote(state, true);
}

/**
 * Renders the Stage 8 Portfolio & Note user interface.
 */
/**
 * Generates the SVG markup for the rolling 60-day beta line chart.
 *
 * @param {Array<{ date: string, beta: number }>} series
 * @param {number} winNum
 * @returns {string} SVG HTML string
 */
export function generateBetaSvgChart(series, winNum) {
  const isSeriesArray = Array.isArray(series) === true;
  const count = isSeriesArray === true ? series.length : 0;
  const hasSufficientPoints = count >= 2;
  if (hasSufficientPoints === false) {
    return `
      <div class="stage-8-beta-unavailable">
        <span class="unavailable-reason">Insufficient rolling series data (${count} points).</span>
      </div>
    `;
  }

  const svgWidth = 720;
  const svgHeight = 200;
  const padLeft = 55;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 35;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  let minBeta = Infinity;
  let maxBeta = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const b = series[i].beta;
    const isSmaller = b < minBeta;
    if (isSmaller === true) {
      minBeta = b;
    }
    const isLarger = b > maxBeta;
    if (isLarger === true) {
      maxBeta = b;
    }
  }

  const yMin = Math.min(0, Math.floor((minBeta - 0.15) * 10) / 10);
  const yMax = Math.max(1.5, Math.ceil((maxBeta + 0.15) * 10) / 10);
  const yRange = yMax - yMin > 0 ? yMax - yMin : 1.0;

  const points = [];
  for (let i = 0; i < count; i += 1) {
    const x = padLeft + (i / (count - 1)) * plotW;
    const y = padTop + plotH - ((series[i].beta - yMin) / yRange) * plotH;
    points.push({ x, y, date: series[i].date, beta: series[i].beta });
  }

  let linePath = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < count; i += 1) {
    linePath += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
  }

  const areaPath = `${linePath} L ${points[count - 1].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`;

  const yBench = padTop + plotH - ((1.0 - yMin) / yRange) * plotH;
  const benchInRange = yBench >= padTop && yBench <= padTop + plotH;

  const firstDate = series[0].date || "";
  const midDate = series[Math.floor(count / 2)].date || "";
  const lastDate = series[count - 1].date || "";
  const lastPt = points[count - 1];

  let benchLineHtml = "";
  if (benchInRange === true) {
    benchLineHtml = `
      <line x1="${padLeft}" y1="${yBench.toFixed(1)}" x2="${padLeft + plotW}" y2="${yBench.toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4,4" />
      <text x="${padLeft + plotW - 6}" y="${(yBench - 5).toFixed(1)}" text-anchor="end" font-size="11" font-weight="600" fill="#64748b">SPY beta = 1.00</text>
    `;
  }

  return `
    <svg class="stage-8-beta-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Rolling 60-day beta to SPY over time">
      <defs>
        <linearGradient id="betaAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.0" />
        </linearGradient>
      </defs>

      <rect x="${padLeft}" y="${padTop}" width="${plotW}" height="${plotH}" fill="#ffffff" stroke="#e2e8f0" stroke-width="1" />
      <line x1="${padLeft}" y1="${padTop}" x2="${padLeft + plotW}" y2="${padTop}" stroke="#f1f5f9" stroke-width="1" />
      <line x1="${padLeft}" y1="${padTop + plotH / 2}" x2="${padLeft + plotW}" y2="${padTop + plotH / 2}" stroke="#f1f5f9" stroke-width="1" />
      <line x1="${padLeft}" y1="${padTop + plotH}" x2="${padLeft + plotW}" y2="${padTop + plotH}" stroke="#e2e8f0" stroke-width="1" />

      ${benchLineHtml}

      <path d="${areaPath}" fill="url(#betaAreaGrad)" />
      <path d="${linePath}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

      <circle cx="${lastPt.x.toFixed(1)}" cy="${lastPt.y.toFixed(1)}" r="4.5" fill="#2563eb" stroke="#ffffff" stroke-width="2" />
      <text x="${lastPt.x.toFixed(1)}" y="${(lastPt.y - 8).toFixed(1)}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#1d4ed8">${lastPt.beta.toFixed(2)}</text>

      <text x="${padLeft - 8}" y="${padTop + 4}" text-anchor="end" font-size="11" font-weight="500" fill="#64748b">${yMax.toFixed(1)}</text>
      <text x="${padLeft - 8}" y="${padTop + plotH / 2 + 4}" text-anchor="end" font-size="11" font-weight="500" fill="#64748b">${((yMax + yMin) / 2).toFixed(1)}</text>
      <text x="${padLeft - 8}" y="${padTop + plotH}" text-anchor="end" font-size="11" font-weight="500" fill="#64748b">${yMin.toFixed(1)}</text>

      <text x="${padLeft}" y="${svgHeight - 10}" text-anchor="start" font-size="11" font-weight="500" fill="#64748b">${escapeHtml(firstDate)}</text>
      <text x="${padLeft + plotW / 2}" y="${svgHeight - 10}" text-anchor="middle" font-size="11" font-weight="500" fill="#64748b">${escapeHtml(midDate)}</text>
      <text x="${padLeft + plotW}" y="${svgHeight - 10}" text-anchor="end" font-size="11" font-weight="500" fill="#64748b">${escapeHtml(lastDate)}</text>
    </svg>
  `;
}

/**
 * Renders the Stage 8 Portfolio & Note user interface.
 */
export function renderStage8UI() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  const placeholder = document.getElementById("stage-8-placeholder");
  const container = document.getElementById("stage-8-container");
  const hasWeights = appState.weights !== null && typeof appState.weights === "object" && Array.isArray(appState.weights.minVariance) === true;

  if (hasWeights === false) {
    if (placeholder !== null) {
      placeholder.classList.remove("hidden");
    }
    if (container !== null) {
      container.classList.add("hidden");
    }
    return;
  }

  if (placeholder !== null) {
    placeholder.classList.add("hidden");
  }
  if (container !== null) {
    container.classList.remove("hidden");
  }

  const amt = typeof appState.settings.investmentAmount === "number" ? appState.settings.investmentAmount : 1000000;
  const formattedAmt = amt.toLocaleString("en-US");

  // 1. Investment Amount input and active capital displays
  const inputAmount = document.getElementById("stage-8-investment-amount");
  const isInputFocused = inputAmount !== null && document.activeElement === inputAmount;
  if (inputAmount !== null && isInputFocused === false) {
    inputAmount.value = formattedAmt;
  }

  const badgeCapital = document.getElementById("stage-8-capital-display");
  if (badgeCapital !== null) {
    badgeCapital.textContent = "$" + formattedAmt;
  }
  const badgeTotalCapital = document.getElementById("stage-8-total-capital");
  if (badgeTotalCapital !== null) {
    badgeTotalCapital.textContent = "$" + formattedAmt;
  }

  // 2. Horizontal Bar Chart of Minimum Variance Allocation
  const chartTitle = document.getElementById("stage-8-chart-title");
  if (chartTitle !== null) {
    chartTitle.textContent = "Minimum variance allocation of " + formattedAmt + " USD";
  }

  const survivors = Array.isArray(appState.gatedSurvivors) === true
    ? appState.gatedSurvivors
    : (appState.screenResult && Array.isArray(appState.screenResult.survivors) ? appState.screenResult.survivors : []);
  const mvWeights = appState.weights.minVariance || [];
  const mvAllocs = (appState.weights.allocations && appState.weights.allocations.minVariance) || (appState.allocations && appState.allocations.minVariance) || [];
  const numSurvivors = survivors.length;

  const barItems = [];
  for (let i = 0; i < numSurvivors; i += 1) {
    const sym = survivors[i];
    const info = appState.universe.find((u) => u.ticker === sym) || { name: sym, sector: "Unknown" };
    const w = typeof mvWeights[i] === "number" ? mvWeights[i] : 0;
    const d = typeof mvAllocs[i] === "number" ? mvAllocs[i] : 0;
    barItems.push({
      ticker: sym,
      name: info.name || sym,
      sector: info.sector || "Unknown",
      weight: w,
      dollars: d
    });
  }

  // Sort from largest to smallest weight
  barItems.sort((a, b) => b.weight - a.weight);

  // Determine max weight for relative track scaling (from unrounded weights)
  let maxWeight = 0.0001;
  for (let i = 0; i < barItems.length; i += 1) {
    const isLarger = barItems[i].weight > maxWeight;
    if (isLarger === true) {
      maxWeight = barItems[i].weight;
    }
  }

  const barsContainer = document.getElementById("stage-8-allocation-bars");
  if (barsContainer !== null) {
    let barsHtml = "";
    for (let i = 0; i < barItems.length; i += 1) {
      const it = barItems[i];
      const widthPct = Math.max(2, (it.weight / maxWeight) * 100);
      barsHtml += `
        <div class="stage-8-bar-row" id="stage-8-bar-${escapeHtml(it.ticker)}">
          <div class="stage-8-bar-header">
            <div class="stage-8-bar-entity">
              <span class="stage-8-bar-ticker">${escapeHtml(it.ticker)}</span>
              <span class="stage-8-bar-name">${escapeHtml(it.name)}</span>
              <span class="stage-8-bar-sector">(${escapeHtml(it.sector)})</span>
            </div>
            <div class="stage-8-bar-metrics">
              <span class="stage-8-bar-dollars">${formatWholeDollars(it.dollars)}</span>
              <span class="stage-8-bar-pct">${formatPercentage(it.weight)}</span>
            </div>
          </div>
          <div class="stage-8-bar-track">
            <div class="stage-8-bar-fill" style="width: ${widthPct}%;">
              <span class="stage-8-bar-fill-text">${formatWholeDollars(it.dollars)}</span>
            </div>
          </div>
        </div>
      `;
    }
    barsContainer.innerHTML = barsHtml;
  }

  // 3. Comparison Table: Candidate vs Reference Benchmarks
  const comparisonTbody = document.getElementById("stage-8-comparison-tbody");
  if (comparisonTbody !== null) {
    const metrics = appState.metrics || {};
    const mv = metrics.minVariance || {};
    const ew = metrics.equalWeight || {};
    const iv = metrics.inverseVolatility || {};

    const mvWeightsArr = Array.isArray(mv.weights) === true ? mv.weights : [];
    const mvAllocsArr = Array.isArray(mv.allocations) === true ? mv.allocations : [];
    const maxWeightMV = mvWeightsArr.length > 0 ? Math.max(...mvWeightsArr) : 0;
    const maxDollarsMV = mvAllocsArr.length > 0 ? Math.max(...mvAllocsArr) : 0;
    const isMVFeasible = mv.feasible === true;

    const ewWeightsArr = Array.isArray(ew.weights) === true ? ew.weights : [];
    const ewAllocsArr = Array.isArray(ew.allocations) === true ? ew.allocations : [];
    const maxWeightEW = ewWeightsArr.length > 0 ? Math.max(...ewWeightsArr) : 0;
    const maxDollarsEW = ewAllocsArr.length > 0 ? Math.max(...ewAllocsArr) : 0;
    const isEWFeasible = ew.feasible === true;

    const ivWeightsArr = Array.isArray(iv.weights) === true ? iv.weights : [];
    const ivAllocsArr = Array.isArray(iv.allocations) === true ? iv.allocations : [];
    const maxWeightIV = ivWeightsArr.length > 0 ? Math.max(...ivWeightsArr) : 0;
    const maxDollarsIV = ivAllocsArr.length > 0 ? Math.max(...ivAllocsArr) : 0;
    const isIVFeasible = iv.feasible === true;

    // Compute in-sample metrics for SPY over the aligned window
    let spyISRet = 0;
    let spyISVol = 0;
    let spyISSharpe = 0;
    const hasAlignedSpyPrices = appState.alignedData && appState.alignedData.spy && Array.isArray(appState.alignedData.spy.prices) && appState.alignedData.spy.prices.length >= 2;
    if (hasAlignedSpyPrices === true) {
      const sp = appState.alignedData.spy.prices;
      const rets = [];
      for (let i = 1; i < sp.length; i += 1) {
        if (sp[i - 1] > 0) {
          rets.push((sp[i] - sp[i - 1]) / sp[i - 1]);
        }
      }
      if (rets.length > 0) {
        const meanR = rets.reduce((a, b) => a + b, 0) / rets.length;
        spyISRet = meanR * 252;
        const varR = rets.reduce((a, b) => a + Math.pow(b - meanR, 2), 0) / (rets.length - 1 || 1);
        spyISVol = Math.sqrt(varR) * Math.sqrt(252);
        const rf = typeof appState.settings.riskFreeRate === "number" ? appState.settings.riskFreeRate : 0.0391;
        spyISSharpe = spyISVol > 0 ? (spyISRet - rf) / spyISVol : 0;
      }
    }

    // Compute in-sample metrics for unscreened basket over aligned window
    let basketISRet = 0;
    let basketISVol = 0;
    let basketISSharpe = 0;
    let basketMaxWeight = 0;
    let basketMaxDollars = 0;
    const hasAlignedConstituentPrices = appState.alignedData && appState.alignedData.prices && typeof appState.alignedData.prices === "object";
    if (hasAlignedConstituentPrices === true) {
      const symbols = Object.keys(appState.alignedData.prices);
      const dateCount = appState.alignedData.dates ? appState.alignedData.dates.length : 0;
      if (symbols.length > 0 && dateCount >= 2) {
        const basketDailyRets = [];
        for (let d = 1; d < dateCount; d += 1) {
          let sumDayRet = 0;
          let validCount = 0;
          for (let s = 0; s < symbols.length; s += 1) {
            const sym = symbols[s];
            const pArr = appState.alignedData.prices[sym];
            if (pArr && pArr[d - 1] > 0) {
              sumDayRet += (pArr[d] - pArr[d - 1]) / pArr[d - 1];
              validCount += 1;
            }
          }
          if (validCount > 0) {
            basketDailyRets.push(sumDayRet / validCount);
          }
        }
        if (basketDailyRets.length > 0) {
          const meanBR = basketDailyRets.reduce((a, b) => a + b, 0) / basketDailyRets.length;
          basketISRet = meanBR * 252;
          const varBR = basketDailyRets.reduce((a, b) => a + Math.pow(b - meanBR, 2), 0) / (basketDailyRets.length - 1 || 1);
          basketISVol = Math.sqrt(varBR) * Math.sqrt(252);
          const rf = typeof appState.settings.riskFreeRate === "number" ? appState.settings.riskFreeRate : 0.0391;
          basketISSharpe = basketISVol > 0 ? (basketISRet - rf) / basketISVol : 0;
          basketMaxWeight = 1 / symbols.length;
          const inv = typeof appState.settings.investmentAmount === "number" ? appState.settings.investmentAmount : 1000000;
          basketMaxDollars = inv / symbols.length;
        }
      }
    }

    // Out-of-sample columns state
    const hasBacktest = appState.backtest !== null && typeof appState.backtest === "object";
    const isStage9Stale = appState.stageStatus[9] === "stale";
    const btSummary = hasBacktest === true ? appState.backtest.summary : null;

    const thOosRet = document.getElementById("col-header-oos-ret");
    const thOosHit = document.getElementById("col-header-oos-hit");
    if (thOosRet !== null && thOosHit !== null) {
      if (hasBacktest === true) {
        thOosRet.classList.remove("hidden");
        thOosHit.classList.remove("hidden");
        if (isStage9Stale === true) {
          thOosRet.innerHTML = `Mean Forward Return (out-of-sample) <span class="badge-stale">Stale</span>`;
          thOosHit.innerHTML = `Hit Rate vs SPY (out-of-sample) <span class="badge-stale">Stale</span>`;
        } else {
          thOosRet.textContent = "Mean Forward Return (out-of-sample)";
          thOosHit.textContent = "Hit Rate vs SPY (out-of-sample)";
        }
      } else {
        thOosRet.classList.add("hidden");
        thOosHit.classList.add("hidden");
      }
    }

    const staleCellClass = isStage9Stale === true ? ' class="oos-cell cell-stale"' : ' class="oos-cell"';

    comparisonTbody.innerHTML = `
      <tr id="stage-8-row-min-variance">
        <td>
          <div style="font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
            Minimum variance
            <span class="badge-candidate">Candidate</span>
          </div>
        </td>
        <td>${formatPercentage(mv.annualizedReturn)}</td>
        <td>${formatPercentage(mv.annualizedVolatility)}</td>
        <td>${formatSharpe(mv.sharpe)}</td>
        <td>
          <span class="${isMVFeasible === true ? "feasible-yes" : "feasible-no"}">
            ${isMVFeasible === true ? "Yes" : "No"}
          </span>
        </td>
        <td>${formatPercentage(maxWeightMV)}</td>
        <td style="font-weight: 600; color: #0f172a;">${formatWholeDollars(maxDollarsMV)}</td>
        ${hasBacktest === true ? `
          <td${staleCellClass}>${formatPercentage(btSummary.minVariance.meanReturn)}</td>
          <td${staleCellClass}>${formatPercentage(btSummary.minVariance.hitRateVsSpy)}</td>
        ` : ""}
      </tr>
      <tr id="stage-8-row-equal-weight">
        <td>
          <div style="font-weight: 500; color: #334155; display: flex; align-items: center; gap: 8px;">
            Equal weight
            <span class="badge-reference">Reference</span>
          </div>
        </td>
        <td>${formatPercentage(ew.annualizedReturn)}</td>
        <td>${formatPercentage(ew.annualizedVolatility)}</td>
        <td>${formatSharpe(ew.sharpe)}</td>
        <td>
          <span class="${isEWFeasible === true ? "feasible-yes" : "feasible-no"}">
            ${isEWFeasible === true ? "Yes" : "No"}
          </span>
        </td>
        <td>${formatPercentage(maxWeightEW)}</td>
        <td style="font-weight: 600; color: #0f172a;">${formatWholeDollars(maxDollarsEW)}</td>
        ${hasBacktest === true ? `
          <td${staleCellClass}>${formatPercentage(btSummary.equalWeight.meanReturn)}</td>
          <td${staleCellClass}>${formatPercentage(btSummary.equalWeight.hitRateVsSpy)}</td>
        ` : ""}
      </tr>
      <tr id="stage-8-row-inverse-volatility">
        <td>
          <div style="font-weight: 500; color: #334155; display: flex; align-items: center; gap: 8px;">
            Inverse volatility
            <span class="badge-reference">Reference</span>
          </div>
        </td>
        <td>${formatPercentage(iv.annualizedReturn)}</td>
        <td>${formatPercentage(iv.annualizedVolatility)}</td>
        <td>${formatSharpe(iv.sharpe)}</td>
        <td>
          <span class="${isIVFeasible === true ? "feasible-yes" : "feasible-no"}">
            ${isIVFeasible === true ? "Yes" : "No"}
          </span>
        </td>
        <td>${formatPercentage(maxWeightIV)}</td>
        <td style="font-weight: 600; color: #0f172a;">${formatWholeDollars(maxDollarsIV)}</td>
        ${hasBacktest === true ? `
          <td${staleCellClass}>${formatPercentage(btSummary.inverseVolatility.meanReturn)}</td>
          <td${staleCellClass}>${formatPercentage(btSummary.inverseVolatility.hitRateVsSpy)}</td>
        ` : ""}
      </tr>
      <tr id="stage-8-row-spy">
        <td>
          <div style="font-weight: 500; color: #334155; display: flex; align-items: center; gap: 8px;">
            SPY
            <span class="badge-not-candidate">Not a candidate</span>
          </div>
        </td>
        <td>${formatPercentage(spyISRet)}</td>
        <td>${formatPercentage(spyISVol)}</td>
        <td>${formatSharpe(spyISSharpe)}</td>
        <td><span class="feasible-na">—</span></td>
        <td>—</td>
        <td>—</td>
        ${hasBacktest === true ? `
          <td${staleCellClass}>${formatPercentage(btSummary.spy.meanReturn)}</td>
          <td${staleCellClass}>—</td>
        ` : ""}
      </tr>
      <tr id="stage-8-row-unscreened">
        <td>
          <div style="font-weight: 500; color: #334155; display: flex; align-items: center; gap: 8px;">
            Unscreened basket
            <span class="badge-not-candidate">Not a candidate</span>
          </div>
        </td>
        <td>${formatPercentage(basketISRet)}</td>
        <td>${formatPercentage(basketISVol)}</td>
        <td>${formatSharpe(basketISSharpe)}</td>
        <td><span class="feasible-na">—</span></td>
        <td>${formatPercentage(basketMaxWeight)}</td>
        <td>${formatWholeDollars(basketMaxDollars)}</td>
        ${hasBacktest === true ? `
          <td${staleCellClass}>${formatPercentage(btSummary.unscreenedBasket.meanReturn)}</td>
          <td${staleCellClass}>${formatPercentage(btSummary.unscreenedBasket.hitRateVsSpy)}</td>
        ` : ""}
      </tr>
    `;
  }

  // 4. Sector Concentration Summary
  const sectorContainer = document.getElementById("stage-8-sector-grid");
  if (sectorContainer !== null) {
    const sectorMap = {};
    for (let i = 0; i < numSurvivors; i += 1) {
      const sym = survivors[i];
      const info = appState.universe.find((u) => u.ticker === sym) || { sector: "Unknown" };
      const secName = info.sector || "Unknown";
      const w = typeof mvWeights[i] === "number" ? mvWeights[i] : 0;
      const d = typeof mvAllocs[i] === "number" ? mvAllocs[i] : 0;

      const hasSec = sectorMap[secName] !== undefined;
      if (hasSec === false) {
        sectorMap[secName] = { name: secName, weight: 0, dollars: 0, count: 0, tickers: [] };
      }
      sectorMap[secName].weight += w;
      sectorMap[secName].dollars += d;
      sectorMap[secName].count += 1;
      sectorMap[secName].tickers.push(sym);
    }

    const sectorList = Object.values(sectorMap);
    sectorList.sort((a, b) => b.weight - a.weight);

    let sectorHtml = "";
    for (let s = 0; s < sectorList.length; s += 1) {
      const sec = sectorList[s];
      const barFillPct = Math.min(100, (sec.weight / 0.50) * 100);
      const isWithinLimit = sec.weight <= 0.500001;
      const barClass = isWithinLimit === true ? (sec.weight > 0.45 ? "warning" : "") : "exceeded";

      sectorHtml += `
        <div class="stage-8-sector-item" id="stage-8-sector-${escapeHtml(sec.name.replace(/\s+/g, '-').toLowerCase())}">
          <div class="stage-8-sector-item-header">
            <div class="stage-8-sector-title-group">
              <span class="stage-8-sector-name">${escapeHtml(sec.name)}</span>
              <span class="stage-8-sector-count">${sec.count} constituent${sec.count === 1 ? "" : "s"} (${escapeHtml(sec.tickers.join(", "))})</span>
            </div>
            <span class="badge ${isWithinLimit === true ? "badge-status-pass" : "badge-status-fail"}">
              ${isWithinLimit === true ? "Compliant (<= 50%)" : "Exceeded (> 50%)"}
            </span>
          </div>
          <div class="stage-8-sector-values">
            <span class="stage-8-sector-ratio">${formatPercentage(sec.weight)} of 50.00%</span>
            <span class="stage-8-sector-dollars">${formatWholeDollars(sec.dollars)}</span>
          </div>
          <div class="stage-8-sector-bar-track">
            <div class="stage-8-sector-bar-fill ${barClass}" style="width: ${barFillPct}%;"></div>
          </div>
        </div>
      `;
    }
    sectorContainer.innerHTML = sectorHtml;
  }

  // 5. Rolling 60-Day Beta Display
  const betaObj = appState.beta;
  const hasBetaObj = betaObj !== null && typeof betaObj === "object";
  const isBetaAvailable = hasBetaObj === true && betaObj.available === true;

  const betaValEl = document.getElementById("stage-8-beta-val");
  const betaWindowLabel = document.getElementById("stage-8-beta-window-label");
  const betaDisplayContainer = document.getElementById("stage-8-beta-display-container");

  if (betaWindowLabel !== null) {
    const win = hasBetaObj === true && typeof betaObj.window === "number" ? betaObj.window : 60;
    betaWindowLabel.textContent = win + "-session window";
  }

  if (isBetaAvailable === true) {
    const curBeta = typeof betaObj.current === "number"
      ? betaObj.current
      : (Array.isArray(betaObj.series) === true && betaObj.series.length > 0 ? betaObj.series[betaObj.series.length - 1].beta : null);

    if (betaValEl !== null) {
      betaValEl.textContent = curBeta !== null ? formatBeta(curBeta) : "N/A";
    }

    if (betaDisplayContainer !== null) {
      const series = Array.isArray(betaObj.series) === true ? betaObj.series : [];
      betaDisplayContainer.innerHTML = generateBetaSvgChart(series, betaObj.window || 60);
    }
  } else {
    if (betaValEl !== null) {
      betaValEl.textContent = "Unavailable";
    }

    if (betaDisplayContainer !== null) {
      const reasonStr = (hasBetaObj === true && typeof betaObj.reason === "string" && betaObj.reason.length > 0)
        ? betaObj.reason
        : "SPY unavailable";
      betaDisplayContainer.innerHTML = `
        <div class="stage-8-beta-unavailable" id="stage-8-beta-unavailable">
          <span class="unavailable-reason">${escapeHtml(reasonStr)}</span>
        </div>
      `;
    }
  }

  // 6. Note stale alert & body
  const staleAlert = document.getElementById("stage-8-note-stale-alert");
  const noteBody = document.getElementById("stage-8-note-body");
  const noteBadge = document.getElementById("stage-8-note-status-badge");

  const noteIsStale = appState.note !== null && (appState.note.isStale === true || appState.note.investmentAmount !== appState.settings.investmentAmount);

  if (staleAlert !== null) {
    if (noteIsStale === true) {
      staleAlert.classList.remove("hidden");
    } else {
      staleAlert.classList.add("hidden");
    }
  }

  if (noteBody !== null) {
    if (appState.note !== null && typeof appState.note.text === "string") {
      const isUnavailable = appState.note.text === "Note unavailable";
      if (isUnavailable === true) {
        const errorDetail = appState.note.error
          ? `<div class="stage-8-note-error-msg font-medium mb-2 text-danger" id="stage-8-note-error-msg">Call failure: ${escapeHtml(appState.note.error)}</div>`
          : "";
        noteBody.innerHTML = `
          ${errorDetail}
          <p class="stage-8-note-unavailable-msg text-secondary" id="stage-8-note-unavailable-msg">Note unavailable. Press "Regenerate note" to attempt another call.</p>
        `;
        if (noteBadge !== null) {
          noteBadge.textContent = "Unavailable";
          noteBadge.className = "badge status-blocked";
        }
      } else {
        const paragraphs = appState.note.text.split(/\n\n+/).filter(Boolean);
        if (paragraphs.length > 1) {
          noteBody.innerHTML = paragraphs.map((p, idx) => `<p class="stage-8-note-paragraph mb-3" id="stage-8-note-p-${idx}">${escapeHtml(p.trim())}</p>`).join("");
        } else {
          noteBody.textContent = appState.note.text;
        }
        if (noteBadge !== null) {
          noteBadge.textContent = "Ready";
          noteBadge.className = "badge badge-status-pass";
        }
      }
    } else {
      noteBody.innerHTML = `<p class="stage-8-note-placeholder-msg text-secondary">Stage 8: Portfolio allocations and investment note will be rendered here.</p>`;
      if (noteBadge !== null) {
        noteBadge.textContent = "Pending";
        noteBadge.className = "badge";
      }
    }
  }

  // 6b. Post-check warning & results rendering (Prompt 20)
  const postCheckContainer = document.getElementById("stage-8-postcheck-container");
  const postCheckActionBanner = document.getElementById("stage-8-postcheck-warning-banner");

  const hasValidNote = appState.note !== null && typeof appState.note.text === "string" && appState.note.text.trim().length > 0 && appState.note.text !== "Note unavailable";
  const postCheck = appState.notePostCheck;

  if (postCheckContainer !== null) {
    if (hasValidNote === true && postCheck !== null) {
      const hasProblems = postCheck.passed === false && Array.isArray(postCheck.problems) === true && postCheck.problems.length > 0;
      if (hasProblems === true) {
        postCheckContainer.innerHTML = `
          <div class="stage-8-postcheck-alert" id="stage-8-postcheck-alert" role="alert">
            <div class="stage-8-postcheck-alert-header">
              <svg class="stage-8-postcheck-alert-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
              </svg>
              <span>Note Post-Check Warning (${postCheck.problems.length} issue${postCheck.problems.length === 1 ? "" : "s"} flagged)</span>
            </div>
            <ul class="stage-8-postcheck-problem-list" id="stage-8-postcheck-problem-list">
              ${postCheck.problems.map((p, idx) => `
                <li class="stage-8-postcheck-problem-item" id="stage-8-postcheck-item-${idx}">
                  <strong>[${escapeHtml(p.type)}]:</strong> ${escapeHtml(p.detail)}
                </li>
              `).join("")}
            </ul>
            <p class="stage-8-postcheck-note-tip">
              The post-check warns you before presenting or exporting. It never edits the note and never blocks export.
            </p>
          </div>
        `;
      } else {
        postCheckContainer.innerHTML = `
          <div class="stage-8-postcheck-passed-box" id="stage-8-postcheck-passed">
            <svg class="stage-8-postcheck-passed-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            <span>All figures verified against portfolio data verbatim (${postCheck.wordCount} words, plain continuous prose).</span>
          </div>
        `;
      }
    } else {
      postCheckContainer.innerHTML = "";
    }
  }

  if (postCheckActionBanner !== null) {
    if (hasValidNote === true && postCheck !== null && postCheck.passed === false && Array.isArray(postCheck.problems) === true && postCheck.problems.length > 0) {
      const summaryTooltip = postCheck.problems.map((p) => p.detail).join("; ");
      const firstProblem = postCheck.problems[0].detail;
      postCheckActionBanner.innerHTML = `
        <div class="stage-8-postcheck-action-pill" id="stage-8-postcheck-action-pill" title="${escapeHtml(summaryTooltip)}">
          <span class="pill-icon" aria-hidden="true">⚠️</span>
          <span>Warning: ${escapeHtml(firstProblem)}${postCheck.problems.length > 1 ? ` (+${postCheck.problems.length - 1} more)` : ""}</span>
        </div>
      `;
    } else {
      postCheckActionBanner.innerHTML = "";
    }
  }

  // 7. Export button synchronization
  const btnExport = document.getElementById("btn-stage-8-export-portfolio");
  if (btnExport !== null) {
    const canExport = appState.reviewed === true && appState.guardrailPassed === true;
    btnExport.disabled = canExport === false;
  }
}

/**
 * Wires up Stage 8 interactive controls.
 */
export function setupStage8() {
  renderStage8UI();

  const stage8AmountInput = document.getElementById("stage-8-investment-amount");
  if (stage8AmountInput !== null) {
    const handleAmountChange = (e) => {
      const ok = validateAndSetInvestmentAmount(e.target.value);
      if (ok === true) {
        renderStage8UI();
      }
    };
    stage8AmountInput.onchange = handleAmountChange;
    stage8AmountInput.onblur = handleAmountChange;
    stage8AmountInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        handleAmountChange(e);
        stage8AmountInput.blur();
      }
    };
  }

  const btnRegenNote = document.getElementById("btn-regenerate-note");
  if (btnRegenNote !== null) {
    btnRegenNote.onclick = async () => {
      await regenerateNote();
    };
  }

  const btnCopyNote = document.getElementById("btn-copy-note");
  if (btnCopyNote !== null) {
    btnCopyNote.onclick = async () => {
      const noteText = appState.note && typeof appState.note.text === "string" ? appState.note.text : "";
      const canCopy = noteText.length > 0 && noteText !== "Note unavailable";
      if (canCopy === true) {
        try {
          if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(noteText);
          } else {
            const ta = document.createElement("textarea");
            ta.value = noteText;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
          }
          const prev = btnCopyNote.textContent;
          btnCopyNote.textContent = "Copied!";
          setTimeout(() => {
            btnCopyNote.textContent = prev;
          }, 2000);
        } catch (copyErr) {
          console.error("Failed to copy note text:", copyErr);
        }
      }
    };
  }

  const btnStage8Export = document.getElementById("btn-stage-8-export-portfolio");
  if (btnStage8Export !== null) {
    btnStage8Export.onclick = () => {
      exportPortfolio();
    };
  }
}

/**
 * Formats a signed decimal return as a percentage (e.g., +2.45% or -1.10%).
 *
 * @param {number} val
 * @returns {string}
 */
export function formatSignedPercent(val) {
  if (typeof val !== "number" || isNaN(val) === true) {
    return "—";
  }
  const pct = (val * 100).toFixed(2);
  return (val > 0 ? "+" : "") + pct + "%";
}

/**
 * Displays an alert banner in Stage 9.
 *
 * @param {string} message
 * @param {"error"|"warning"|"info"|"success"} [type="error"]
 */
export function showStage9Alert(message, type = "error") {
  const alertEl = document.getElementById("stage-9-alert");
  if (alertEl !== null) {
    alertEl.textContent = message;
    alertEl.className = `alert alert-${type}`;
    alertEl.classList.remove("hidden");
  }
}

/**
 * Clears the Stage 9 alert banner.
 */
export function clearStage9Alert() {
  const alertEl = document.getElementById("stage-9-alert");
  if (alertEl !== null) {
    alertEl.textContent = "";
    alertEl.classList.add("hidden");
  }
}

let backtestWorkerInstance = null;

/**
 * Cleans up worker instance and resets UI progress elements.
 */
function cleanUpBacktestWorker() {
  if (backtestWorkerInstance !== null) {
    backtestWorkerInstance.terminate();
    backtestWorkerInstance = null;
  }
  const progressContainer = document.getElementById("backtest-progress-container");
  if (progressContainer !== null) {
    progressContainer.classList.add("hidden");
  }
  const runBtn = document.getElementById("btn-run-backtest");
  if (runBtn !== null) {
    runBtn.classList.remove("hidden");
  }
  const cancelBtn = document.getElementById("btn-cancel-backtest");
  if (cancelBtn !== null) {
    cancelBtn.classList.add("hidden");
  }
}

/**
 * Cancels active backtest execution.
 */
export function cancelBacktest() {
  cleanUpBacktestWorker();
  setStageStatus(9, appState.backtest !== null ? "done" : "idle");
  showStage9Alert("Backtest simulation cancelled by user.", "warning");
}

/**
 * Starts the walk-forward backtest by spawning the dedicated Web Worker.
 */
export function startBacktest() {
  const isStage2Done = appState.stageStatus[2] === "done";
  if (isStage2Done === false) {
    showStage9Alert("Stage 2 price alignment must complete before running backtest.", "error");
    return;
  }

  const spySeries = appState.priceCache["SPY"] || [];
  const isSpySufficient = Array.isArray(spySeries) === true && spySeries.length >= 500;
  if (isSpySufficient === false) {
    showStage9Alert(`SPY has ${spySeries.length} sessions. At least 500 sessions are required for the backtest benchmark.`, "error");
    return;
  }

  const eligibleConstituents = (appState.selectedTickers || []).filter((t) => {
    return t !== "SPY" && Array.isArray(appState.priceCache[t]) === true && appState.priceCache[t].length >= 500;
  });
  const minBreadth = appState.settings.minimumBreadth || 5;
  if (eligibleConstituents.length < minBreadth) {
    showStage9Alert(`Fewer than minimum breadth (${minBreadth}) constituents have at least 500 sessions (${eligibleConstituents.length} eligible).`, "error");
    return;
  }

  clearStage9Alert();
  setStageStatus(9, "running");

  const runBtn = document.getElementById("btn-run-backtest");
  if (runBtn !== null) {
    runBtn.classList.add("hidden");
  }
  const cancelBtn = document.getElementById("btn-cancel-backtest");
  if (cancelBtn !== null) {
    cancelBtn.classList.remove("hidden");
  }
  const progressContainer = document.getElementById("backtest-progress-container");
  if (progressContainer !== null) {
    progressContainer.classList.remove("hidden");
  }
  const fill = document.getElementById("backtest-progress-fill");
  if (fill !== null) {
    fill.style.width = "0%";
  }
  const pText = document.getElementById("backtest-progress-text");
  if (pText !== null) {
    pText.textContent = "0% (evaluating entry dates...)";
  }

  try {
    backtestWorkerInstance = new Worker(new URL("./backtestWorker.js", import.meta.url), { type: "module" });
  } catch (workerErr) {
    cleanUpBacktestWorker();
    setStageStatus(9, appState.backtest !== null ? "done" : "idle");
    showStage9Alert(`Failed to initialize Web Worker: ${workerErr.message || String(workerErr)}`, "error");
    return;
  }

  backtestWorkerInstance.onmessage = (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") {
      return;
    }

    if (msg.type === "PROGRESS") {
      const fillEl = document.getElementById("backtest-progress-fill");
      const textEl = document.getElementById("backtest-progress-text");
      if (fillEl !== null) {
        fillEl.style.width = `${msg.data.percent}%`;
      }
      if (textEl !== null) {
        textEl.textContent = `${msg.data.percent}% (${msg.data.current}/${msg.data.total} dates)`;
      }
    } else if (msg.type === "DONE") {
      appState.backtest = msg.data;
      setStageStatus(9, "done");
      cleanUpBacktestWorker();
      renderStage8UI();
      renderStage9UI();

      // Expand stage 9 section
      const body9 = document.getElementById("stage-body-9");
      const header9 = document.getElementById("stage-header-9");
      if (body9 !== null && body9.classList.contains("collapsed") === true) {
        body9.classList.remove("collapsed");
        if (header9 !== null) {
          header9.setAttribute("aria-expanded", "true");
        }
      }
    } else if (msg.type === "ERROR") {
      cleanUpBacktestWorker();
      setStageStatus(9, appState.backtest !== null ? "done" : "idle");
      showStage9Alert(`Backtest simulation failed: ${msg.error}`, "error");
    }
  };

  backtestWorkerInstance.onerror = (err) => {
    cleanUpBacktestWorker();
    setStageStatus(9, appState.backtest !== null ? "done" : "idle");
    showStage9Alert(`Worker execution error: ${err.message || String(err)}`, "error");
  };

  backtestWorkerInstance.postMessage({
    type: "RUN_BACKTEST",
    data: {
      priceCache: appState.priceCache,
      selectedTickers: appState.selectedTickers,
      universe: appState.universe,
      settings: {
        rsiThreshold: appState.settings.rsiThreshold,
        histogramLookback: appState.settings.histogramLookback,
        weightCap: appState.settings.weightCap,
        minimumBreadth: appState.settings.minimumBreadth,
        holdingPeriod: appState.settings.holdingPeriod || 20,
        exitThreshold: appState.settings.exitThreshold || 60,
        cadence: appState.settings.cadence || 5
      }
    }
  });
}

/**
 * Renders the Stage 9 Walk-Forward Backtest user interface.
 */
export function renderStage9UI() {
  const hasDocument = typeof document !== "undefined";
  if (hasDocument === false) {
    return;
  }

  // Synchronize pre-flight conditions on Run button
  const runBtn = document.getElementById("btn-run-backtest");
  const isStage2Done = appState.stageStatus[2] === "done";
  const spySeries = appState.priceCache["SPY"] || [];
  const isSpySufficient = Array.isArray(spySeries) === true && spySeries.length >= 500;

  if (runBtn !== null) {
    if (isStage2Done === false) {
      runBtn.disabled = true;
      runBtn.title = "Stage 2 price alignment must complete before running backtest.";
    } else if (isSpySufficient === false) {
      runBtn.disabled = true;
      runBtn.title = `SPY has ${spySeries.length} sessions (minimum 500 required for backtest benchmark).`;
    } else {
      runBtn.disabled = false;
      runBtn.title = "Run walk-forward backtest simulation";
    }
  }

  const placeholder = document.getElementById("stage-9-placeholder");
  const container = document.getElementById("stage-9-container");

  const hasBacktest = appState.backtest !== null && typeof appState.backtest === "object";
  if (hasBacktest === false) {
    if (placeholder !== null) {
      placeholder.classList.remove("hidden");
    }
    if (container !== null) {
      container.classList.add("hidden");
    }
    return;
  }

  if (placeholder !== null) {
    placeholder.classList.add("hidden");
  }
  if (container !== null) {
    container.classList.remove("hidden");
  }

  const bt = appState.backtest;

  // 1. Verdict card
  const verdictBadge = document.getElementById("stage-9-verdict-badge");
  const verdictDesc = document.getElementById("stage-9-verdict-desc");
  if (verdictBadge !== null) {
    const isSup = bt.isSupported === true;
    verdictBadge.textContent = isSup === true ? "supported" : "not supported";
    verdictBadge.className = `badge ${isSup === true ? "badge-status-pass" : "badge-status-fail"}`;
  }
  if (verdictDesc !== null) {
    verdictDesc.textContent = bt.verdictExplanation || "";
  }

  // 2. Parameters card
  const paramH = document.getElementById("stage-9-param-h");
  if (paramH !== null) {
    paramH.textContent = `${bt.settings.holdingPeriod} sessions`;
  }
  const paramExit = document.getElementById("stage-9-param-exit");
  if (paramExit !== null) {
    paramExit.textContent = `${bt.settings.exitThreshold} RSI`;
  }
  const paramCadence = document.getElementById("stage-9-param-cadence");
  if (paramCadence !== null) {
    paramCadence.textContent = `${bt.settings.cadence} sessions`;
  }
  const paramWindow = document.getElementById("stage-9-param-window");
  if (paramWindow !== null) {
    const w = bt.window || bt.lookbackWindow || {};
    paramWindow.textContent = `${w.startDate || "--"} → ${w.endDate || "--"}`;
  }
  const paramSessions = document.getElementById("stage-9-param-sessions");
  if (paramSessions !== null) {
    const w = bt.window || bt.lookbackWindow || {};
    paramSessions.textContent = `${w.sessionCount || 0} sessions`;
  }
  const paramConstraining = document.getElementById("stage-9-param-constraining");
  if (paramConstraining !== null) {
    const c = bt.constrainingTickers || (bt.window && bt.window.constrainingTickers) || {};
    const startStr = Array.isArray(c.start) && c.start.length > 0 ? c.start.join(", ") : "None";
    const endStr = Array.isArray(c.end) && c.end.length > 0 ? c.end.join(", ") : "None";
    paramConstraining.textContent = `Start: ${startStr} | End: ${endStr}`;
  }

  // 3. Execution counts
  const countEval = document.getElementById("stage-9-count-evaluated");
  if (countEval !== null) {
    countEval.textContent = String(bt.counts.entryDatesCount || bt.counts.evaluatedEntryDates || 0);
  }
  const countNonOver = document.getElementById("stage-9-count-nonoverlapping");
  if (countNonOver !== null) {
    countNonOver.textContent = String(bt.counts.nonOverlappingCount || bt.counts.nonOverlappingEntryDates || 0);
  }
  const countTraded = document.getElementById("stage-9-count-traded");
  if (countTraded !== null) {
    countTraded.textContent = String(bt.counts.tradedDatesCount || bt.counts.tradedDates || 0);
  }
  const countNoTrade = document.getElementById("stage-9-count-notrade");
  if (countNoTrade !== null) {
    countNoTrade.textContent = String(bt.counts.noTradeDatesCount || bt.counts.noTradeDates || 0);
  }

  // 4. Attribution
  const attr = bt.attributions || bt.attribution || {};
  const screenMean = document.getElementById("stage-9-screen-mean");
  if (screenMean !== null && attr.screenEffect) {
    screenMean.textContent = formatSignedPercent(attr.screenEffect.mean);
  }
  const screenHit = document.getElementById("stage-9-screen-hitrate");
  if (screenHit !== null && attr.screenEffect) {
    screenHit.textContent = formatPercentage(attr.screenEffect.hitRate);
  }
  const optMean = document.getElementById("stage-9-optimizer-mean");
  if (optMean !== null && attr.optimizerEffect) {
    optMean.textContent = formatSignedPercent(attr.optimizerEffect.mean);
  }
  const optHit = document.getElementById("stage-9-optimizer-hitrate");
  if (optHit !== null && attr.optimizerEffect) {
    optHit.textContent = formatPercentage(attr.optimizerEffect.hitRate);
  }

  // 5. Summary Table
  const summaryTbody = document.getElementById("stage-9-summary-tbody");
  if (summaryTbody !== null && bt.summary) {
    const rows = [
      { key: "minVariance", label: "Minimum variance", badge: '<span class="badge-candidate">Candidate</span>' },
      { key: "equalWeight", label: "Equal weight", badge: '<span class="badge-reference">Reference</span>' },
      { key: "inverseVolatility", label: "Inverse volatility", badge: '<span class="badge-reference">Reference</span>' },
      { key: "spy", label: "SPY", badge: '<span class="badge-not-candidate">Benchmark</span>' },
      { key: "unscreened", label: "Unscreened basket", badge: '<span class="badge-not-candidate">Not a candidate</span>' }
    ];

    summaryTbody.innerHTML = rows.map((r) => {
      const item = bt.summary[r.key] || {};
      const hitStr = item.hitRateVsSpy !== null && item.hitRateVsSpy !== undefined
        ? formatPercentage(item.hitRateVsSpy)
        : "—";
      return `
        <tr id="stage-9-summary-row-${r.key}">
          <td>
            <div style="font-weight: 600; color: #0f172a; display: flex; align-items: center; gap: 8px;">
              ${escapeHtml(r.label)}
              ${r.badge}
            </div>
          </td>
          <td>${item.tradeCount || 0}</td>
          <td>${formatSignedPercent(item.meanForwardReturn)}</td>
          <td>${formatSignedPercent(item.medianForwardReturn)}</td>
          <td>${hitStr}</td>
          <td>${formatSignedPercent(item.worstForwardReturn)}</td>
          <td>${formatSignedPercent(item.meanMaxDrawdown)}</td>
        </tr>
      `;
    }).join("");
  }

  // 6. Trades Table
  const tradesBadge = document.getElementById("stage-9-trades-count-badge");
  const tradesTbody = document.getElementById("stage-9-trades-tbody");
  const tradesList = bt.trades || bt.tradesTable || [];

  if (tradesBadge !== null) {
    tradesBadge.textContent = `${tradesList.length} dates (${bt.counts.tradedDatesCount || 0} traded)`;
  }

  if (tradesTbody !== null) {
    tradesTbody.innerHTML = tradesList.map((t, idx) => {
      const statusBadge = t.isTraded === true
        ? '<span class="badge badge-status-pass">Traded</span>'
        : '<span class="badge badge-status-fail">No Trade</span>';

      const survivorsStr = t.survivorsCount > 0
        ? `${t.survivorsCount} (${escapeHtml((t.survivors || []).join(", "))})`
        : "0";

      let exitSummary = "—";
      if (t.isTraded === true && t.exits) {
        const exitItems = Object.entries(t.exits).map(([sym, ex]) => {
          return `${sym}: +${ex.exitOffset}d (${ex.exitDate})`;
        });
        exitSummary = escapeHtml(exitItems.join("; "));
      }

      const mvRet = t.isTraded === true && t.forwardReturns && t.forwardReturns.minVariance !== null
        ? formatSignedPercent(t.forwardReturns.minVariance)
        : "—";

      const ewRet = t.isTraded === true && t.forwardReturns && t.forwardReturns.equalWeight !== null
        ? formatSignedPercent(t.forwardReturns.equalWeight)
        : "—";

      const spyRet = t.forwardReturns && t.forwardReturns.spy !== null
        ? formatSignedPercent(t.forwardReturns.spy)
        : "—";

      const reasonDesc = t.reason || "Traded to exit threshold or holding limit";

      return `
        <tr id="stage-9-trade-row-${idx}">
          <td style="font-weight: 600;">${escapeHtml(t.date)}</td>
          <td>${statusBadge}</td>
          <td>${survivorsStr}</td>
          <td style="font-size: 11px; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${exitSummary}">
            ${exitSummary}
          </td>
          <td>${mvRet}</td>
          <td>${ewRet}</td>
          <td>${spyRet}</td>
          <td style="font-size: 11.5px; color: #64748b;">${escapeHtml(reasonDesc)}</td>
        </tr>
      `;
    }).join("");
  }
}

/**
 * Wires up Stage 9 interactive controls.
 */
export function setupStage9() {
  renderStage9UI();

  const runBtn = document.getElementById("btn-run-backtest");
  if (runBtn !== null) {
    runBtn.onclick = () => {
      startBacktest();
    };
  }

  const cancelBtn = document.getElementById("btn-cancel-backtest");
  if (cancelBtn !== null) {
    cancelBtn.onclick = () => {
      cancelBacktest();
    };
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
  window.buildClassificationRequest = buildClassificationRequest;
  window.setSurvivorLabel = setSurvivorLabel;
  window.parseClassifierResponse = parseClassifierResponse;
  window.callOpenRouterClassifier = callOpenRouterClassifier;
  window.applyTextGate = applyTextGate;
  window.regenerateLabels = regenerateLabels;
  window.labelNewSurvivors = labelNewSurvivors;
  window.ALLOWED_GATE_LABELS = ALLOWED_GATE_LABELS;
  window.buildSectorGroups = buildSectorGroups;
  window.getGatedSectorGroups = getGatedSectorGroups;
  window.checkFeasibility = checkFeasibility;
  window.projectCappedSimplex = projectCappedSimplex;
  window.projectSectorHalfSpace = projectSectorHalfSpace;
  window.validateWeights = validateWeights;
  window.projectFeasible = projectFeasible;
  window.solveMinimumVariance = solveMinimumVariance;
  window.formatWholeDollars = formatWholeDollars;
  window.computePortfolioSeries = computePortfolioSeries;
  window.computeDollarAllocations = computeDollarAllocations;
  window.computeInverseVolWeights = computeInverseVolWeights;
  window.computeBenchmarks = computeBenchmarks;
  window.checkConsistency = checkConsistency;
  window.updateStage6InvestmentAmount = updateStage6InvestmentAmount;
  window.updateStage6RiskFreeRate = updateStage6RiskFreeRate;
  window.runStage6Optimization = runStage6Optimization;
  window.renderStage6UI = renderStage6UI;
  window.setupStage6 = setupStage6;
  window.computeRollingBeta = computeRollingBeta;
  window.recomputeRollingBeta = recomputeRollingBeta;
  window.formatPercentage = formatPercentage;
  window.formatSharpe = formatSharpe;
  window.formatBeta = formatBeta;
  window.displayFormatters = displayFormatters;
  window.generateBetaSvgChart = generateBetaSvgChart;
  window.renderStage8UI = renderStage8UI;
  window.setupStage8 = setupStage8;
  window.THESIS_STATEMENT = THESIS_STATEMENT;
  window.NOTE_SYSTEM_PROMPT = NOTE_SYSTEM_PROMPT;
  window.buildNotePayload = buildNotePayload;
  window.runNotePostCheck = runNotePostCheck;
  window.postCheckNote = postCheckNote;
  window.buildPayloadNumberSet = buildPayloadNumberSet;
  window.normalizeNumberToken = normalizeNumberToken;
  window.generateNote = generateNote;
  window.regenerateNote = regenerateNote;
  window.appState = appState;
  window.state = appState;
}

if (typeof globalThis !== "undefined") {
  globalThis.appState = appState;
  globalThis.state = appState;
  globalThis.computeRollingBeta = computeRollingBeta;
  globalThis.recomputeRollingBeta = recomputeRollingBeta;
  globalThis.formatPercentage = formatPercentage;
  globalThis.formatSharpe = formatSharpe;
  globalThis.formatBeta = formatBeta;
  globalThis.displayFormatters = displayFormatters;
  globalThis.generateBetaSvgChart = generateBetaSvgChart;
  globalThis.renderStage8UI = renderStage8UI;
  globalThis.setupStage8 = setupStage8;
  globalThis.THESIS_STATEMENT = THESIS_STATEMENT;
  globalThis.NOTE_SYSTEM_PROMPT = NOTE_SYSTEM_PROMPT;
  globalThis.buildNotePayload = buildNotePayload;
  globalThis.runNotePostCheck = runNotePostCheck;
  globalThis.postCheckNote = postCheckNote;
  globalThis.buildPayloadNumberSet = buildPayloadNumberSet;
  globalThis.normalizeNumberToken = normalizeNumberToken;
  globalThis.generateNote = generateNote;
  globalThis.regenerateNote = regenerateNote;
  globalThis.formatSignedPercent = formatSignedPercent;
  globalThis.showStage9Alert = showStage9Alert;
  globalThis.clearStage9Alert = clearStage9Alert;
  globalThis.startBacktest = startBacktest;
  globalThis.cancelBacktest = cancelBacktest;
  globalThis.renderStage9UI = renderStage9UI;
  globalThis.setupStage9 = setupStage9;
}

export { appState as state };

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
  setupStage6();
  setupStage7();
  setupStage8();
  setupStage9();
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

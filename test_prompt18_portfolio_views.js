import {
  appState,
  formatPercentage,
  formatWholeDollars,
  formatTwoDecimals,
  formatSharpe,
  formatBeta,
  displayFormatters,
  generateBetaSvgChart,
  renderStage8UI,
  setupStage8,
  validateAndSetInvestmentAmount
} from "./main.js";

console.log("=== RUNNING PROMPT 18 PORTFOLIO VIEWS VERIFICATION TESTS ===");

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests += 1;
  if (!condition) {
    console.error(`FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    passedTests += 1;
    console.log(`PASS: ${message}`);
  }
}

// 1. Test Formatters
assert(formatPercentage(0.1234) === "12.34%", "formatPercentage converts decimal to 2-decimal percentage string");
assert(formatPercentage(0) === "0.00%", "formatPercentage handles 0%");
assert(formatPercentage(null) === "0.00%", "formatPercentage handles null gracefully");
assert(formatWholeDollars(1000000) === "$1,000,000", "formatWholeDollars formats millions with commas and no decimals");
assert(formatWholeDollars(250000.4) === "$250,000", "formatWholeDollars rounds to nearest integer");
assert(formatWholeDollars(null) === "$0", "formatWholeDollars handles null gracefully");
assert(formatSharpe(1.234) === "1.23", "formatSharpe formats to two decimals");
assert(formatBeta(0.854) === "0.85", "formatBeta formats to two decimals");
assert(displayFormatters.percentage === formatPercentage, "displayFormatters suite exports percentage");
assert(displayFormatters.dollars === formatWholeDollars, "displayFormatters suite exports dollars");
assert(displayFormatters.sharpe === formatSharpe, "displayFormatters suite exports sharpe");
assert(displayFormatters.beta === formatBeta, "displayFormatters suite exports beta");

// 2. Mock DOM Environment for Stage 8 testing
const mockElements = {};
function createMockElement(id, tag = "div") {
  const el = {
    id,
    tagName: tag.toUpperCase(),
    textContent: "",
    value: "",
    innerHTML: "",
    classList: {
      classes: new Set(),
      add(cls) { this.classes.add(cls); },
      remove(cls) { this.classes.delete(cls); },
      contains(cls) { return this.classes.has(cls); }
    },
    style: {},
    disabled: false
  };
  mockElements[id] = el;
  return el;
}

const elementIds = [
  "stage-8-placeholder",
  "stage-8-container",
  "stage-8-investment-amount",
  "stage-8-capital-display",
  "stage-8-total-capital",
  "stage-8-chart-title",
  "stage-8-allocation-bars",
  "stage-8-comparison-tbody",
  "stage-8-sector-grid",
  "stage-8-beta-val",
  "stage-8-beta-window-label",
  "stage-8-beta-display-container",
  "stage-8-note-stale-alert",
  "stage-8-note-body",
  "btn-stage-8-export-portfolio",
  "btn-regenerate-note"
];

for (const id of elementIds) {
  createMockElement(id, id.includes("btn") ? "button" : (id.includes("amount") ? "input" : "div"));
}

globalThis.document = {
  activeElement: null,
  getElementById(id) {
    if (mockElements[id]) return mockElements[id];
    return createMockElement(id);
  }
};

// 3. Populate appState with realistic portfolio data
appState.universe = [
  { ticker: "AAPL", name: "Apple Inc.", sector: "Information Technology" },
  { ticker: "MSFT", name: "Microsoft Corp.", sector: "Information Technology" },
  { ticker: "JPM", name: "JPMorgan Chase & Co.", sector: "Financials" },
  { ticker: "JNJ", name: "Johnson & Johnson", sector: "Health Care" }
];

appState.gatedSurvivors = ["AAPL", "MSFT", "JPM", "JNJ"];
appState.settings.investmentAmount = 1000000;
appState.settings.weightCap = 0.40;

const initialWeights = [0.35, 0.25, 0.20, 0.20];
const initialAllocs = [350000, 250000, 200000, 200000];

appState.weights = {
  minVariance: initialWeights,
  equalWeight: [0.25, 0.25, 0.25, 0.25],
  inverseVolatility: [0.28, 0.24, 0.24, 0.24],
  allocations: {
    minVariance: initialAllocs,
    equalWeight: [250000, 250000, 250000, 250000],
    inverseVolatility: [280000, 240000, 240000, 240000]
  }
};
appState.allocations = appState.weights.allocations;

appState.metrics = {
  minVariance: {
    annualizedReturn: 0.1542,
    annualizedVolatility: 0.1281,
    sharpe: 1.2037,
    feasible: true,
    weights: initialWeights,
    allocations: initialAllocs
  },
  equalWeight: {
    annualizedReturn: 0.1412,
    annualizedVolatility: 0.1624,
    sharpe: 0.8694,
    feasible: true,
    weights: [0.25, 0.25, 0.25, 0.25],
    allocations: [250000, 250000, 250000, 250000]
  },
  inverseVolatility: {
    annualizedReturn: 0.1481,
    annualizedVolatility: 0.1452,
    sharpe: 1.0199,
    feasible: true,
    weights: [0.28, 0.24, 0.24, 0.24],
    allocations: [280000, 240000, 240000, 240000]
  }
};

appState.beta = {
  available: true,
  current: 0.854,
  window: 60,
  series: [
    { date: "2025-01-02", beta: 0.812 },
    { date: "2025-02-15", beta: 0.835 },
    { date: "2025-04-01", beta: 0.854 }
  ]
};

// 4. Test renderStage8UI
renderStage8UI();

// Verify visibility
assert(!mockElements["stage-8-container"].classList.contains("hidden"), "Stage 8 container is shown when weights exist");
assert(mockElements["stage-8-placeholder"].classList.contains("hidden"), "Stage 8 placeholder is hidden when weights exist");

// Verify Investment Amount & Active Capital display
assert(mockElements["stage-8-investment-amount"].value === "1,000,000", "Investment amount input shows 1,000,000");
assert(mockElements["stage-8-capital-display"].textContent === "$1,000,000", "Capital display shows $1,000,000");

// Verify Chart Title
assert(
  mockElements["stage-8-chart-title"].textContent === "Minimum variance allocation of 1,000,000 USD",
  "Chart title contains exact investment amount: " + mockElements["stage-8-chart-title"].textContent
);

// Verify Allocation Bars are sorted descending and have dollar allocations
const barsHtml = mockElements["stage-8-allocation-bars"].innerHTML;
assert(barsHtml.includes("AAPL"), "Bars include AAPL");
assert(barsHtml.includes("$350,000"), "AAPL bar shows $350,000");
assert(barsHtml.includes("35.00%"), "AAPL bar shows 35.00%");
assert(barsHtml.indexOf("AAPL") < barsHtml.indexOf("MSFT"), "Bars are sorted descending: AAPL before MSFT");
assert(barsHtml.indexOf("MSFT") < barsHtml.indexOf("JPM"), "Bars are sorted descending: MSFT before JPM");

// Verify Comparison Table
const tableHtml = mockElements["stage-8-comparison-tbody"].innerHTML;
assert(tableHtml.includes("Candidate"), "Comparison table marks Minimum variance as Candidate");
assert(tableHtml.includes("Reference"), "Comparison table marks benchmarks as Reference");
assert(tableHtml.includes("15.42%"), "Comparison table shows MV annualized return 15.42%");
assert(tableHtml.includes("12.81%"), "Comparison table shows MV annualized volatility 12.81%");
assert(tableHtml.includes("1.20"), "Comparison table shows MV Sharpe 1.20");
assert(tableHtml.includes("35.00%"), "Comparison table shows MV largest weight 35.00%");
assert(tableHtml.includes("$350,000"), "Comparison table shows MV largest position $350,000");
assert(tableHtml.includes("$250,000"), "Comparison table shows EW largest position $250,000");
assert(tableHtml.includes("$280,000"), "Comparison table shows IV largest position $280,000");

// Verify Sector Concentration Summary
const sectorHtml = mockElements["stage-8-sector-grid"].innerHTML;
assert(sectorHtml.includes("Information Technology"), "Sector summary lists Information Technology");
assert(sectorHtml.includes("Financials"), "Sector summary lists Financials");
assert(sectorHtml.includes("Health Care"), "Sector summary lists Health Care");
assert(sectorHtml.includes("of 50.00%"), "Sector summary compares against 50% limit");

// Verify Rolling Beta Display (Available)
assert(mockElements["stage-8-beta-val"].textContent === "0.85", "Current beta displays 0.85 (two decimals)");
assert(mockElements["stage-8-beta-window-label"].textContent === "60-session window", "Beta window displays '60-session window'");
const betaChartHtml = mockElements["stage-8-beta-display-container"].innerHTML;
assert(betaChartHtml.includes("<svg"), "Beta chart renders an SVG line chart");
assert(betaChartHtml.includes("SPY beta = 1.00"), "Beta chart contains SPY beta = 1.00 benchmark line");

// 5. Test Editing Investment Amount to 250,000
console.log("--- Testing Live Investment Amount Update to 250,000 USD ---");
validateAndSetInvestmentAmount(250000);
renderStage8UI();

// Title must update
assert(
  mockElements["stage-8-chart-title"].textContent === "Minimum variance allocation of 250,000 USD",
  "Editing amount to 250,000 updates chart title: " + mockElements["stage-8-chart-title"].textContent
);

// Bar labels must update to new dollars
const updatedBarsHtml = mockElements["stage-8-allocation-bars"].innerHTML;
assert(updatedBarsHtml.includes("$87,500"), "AAPL bar updated to $87,500");
assert(updatedBarsHtml.includes("$62,500"), "MSFT bar updated to $62,500");
assert(updatedBarsHtml.includes("$50,000"), "JPM bar updated to $50,000");
// Percentages must remain unchanged
assert(updatedBarsHtml.includes("35.00%"), "AAPL percentage remains 35.00%");
assert(updatedBarsHtml.includes("25.00%"), "MSFT percentage remains 25.00%");

// Comparison table USD columns must update, metrics remain unchanged
const updatedTableHtml = mockElements["stage-8-comparison-tbody"].innerHTML;
assert(updatedTableHtml.includes("$87,500"), "Comparison table MV largest position updated to $87,500");
assert(updatedTableHtml.includes("$62,500"), "Comparison table EW largest position updated to $62,500");
assert(updatedTableHtml.includes("$70,000"), "Comparison table IV largest position updated to $70,000");
assert(updatedTableHtml.includes("15.42%"), "Comparison table MV return unchanged at 15.42%");
assert(updatedTableHtml.includes("12.81%"), "Comparison table MV vol unchanged at 12.81%");
assert(updatedTableHtml.includes("1.20"), "Comparison table MV Sharpe unchanged at 1.20");

// Beta must remain unchanged
assert(mockElements["stage-8-beta-val"].textContent === "0.85", "Beta remains 0.85 after amount edit");

// 6. Test Rolling Beta Unavailable (SPY unavailable)
console.log("--- Testing SPY Mocked as Failed (Beta Unavailable) ---");
appState.beta = {
  available: false,
  current: null,
  window: 60,
  series: [],
  reason: "SPY unavailable"
};

renderStage8UI();

assert(mockElements["stage-8-beta-val"].textContent === "Unavailable", "Beta value shows 'Unavailable'");
assert(mockElements["stage-8-beta-window-label"].textContent === "60-session window", "Window label still shows '60-session window'");
const unavailableArea = mockElements["stage-8-beta-display-container"].innerHTML;
assert(unavailableArea.includes("SPY unavailable"), "Area shows 'SPY unavailable' in place of chart: " + unavailableArea);

console.log(`\n========================================`);
console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED!`);
console.log(`========================================\n`);

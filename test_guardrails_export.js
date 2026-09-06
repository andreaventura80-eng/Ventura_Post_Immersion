import {
  appState,
  evaluateGuardrails,
  clearReview,
  generateExportData,
  getExportFileName,
  validateAndSetWeightCap,
  validateAndSetMinimumBreadth,
  validateAndSetInvestmentAmount,
  validateAndSetRsiThreshold,
  validateAndSetHistogramLookback,
  validateAndSetRiskFreeRate,
  validateAndSetGateMode,
  setSurvivorLabel
} from "./main.js";

console.log("=== RUNNING PROMPT 16 & 17 VERIFICATION TESTS ===");

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

// 1. Test getExportFileName
const testDate = new Date("2026-09-06T14:35:00Z");
const fname = getExportFileName(testDate);
assert(fname.startsWith("oversold_turn_") && fname.endsWith(".json"), `Export filename format valid: ${fname}`);

// 2. Test evaluateGuardrails failure conditions
// Test A: Aligned sessions < 200
appState.alignedData = { dates: new Array(150).fill("2025-01-01"), returns: {} };
appState.screenResult = { survivors: ["AAPL", "MSFT", "GOOGL"] };
appState.settings.minimumBreadth = 3;
appState.settings.weightCap = 0.4;
appState.labels = {
  AAPL: { label: "Tailwind", isMalformed: false },
  MSFT: { label: "Neutral", isMalformed: false },
  GOOGL: { label: "Tailwind", isMalformed: false }
};
appState.gatedSurvivors = ["AAPL", "MSFT", "GOOGL"];
appState.weights = {
  minVariance: [0.33, 0.33, 0.34],
  equalWeight: [0.333, 0.333, 0.334]
};
appState.allocations = {
  minVariance: [33000, 33000, 34000]
};

let failures = evaluateGuardrails(appState);
assert(failures.some(f => f.cause.includes("aligned sessions fewer than 200")), "Catches aligned sessions < 200 failure");

// Fix sessions
appState.alignedData = { dates: new Array(250).fill("2025-01-01"), returns: {} };

// Test B: Breadth < minimumBreadth
appState.gatedSurvivors = ["AAPL"];
appState.settings.minimumBreadth = 3;
failures = evaluateGuardrails(appState);
assert(failures.some(f => f.cause.includes("survivors fewer than minimumBreadth")), "Catches Breadth < minimumBreadth");

// Fix breadth
appState.gatedSurvivors = ["AAPL", "MSFT", "GOOGL"];

// Test C: Feasibility survivors.length * weightCap < 1.0
appState.settings.weightCap = 0.2; // 3 * 0.2 = 0.6 < 1.0
failures = evaluateGuardrails(appState);
assert(failures.some(f => f.cause.includes("infeasible problem for the survivor set")), "Catches Infeasible problem failure");

// Fix cap
appState.settings.weightCap = 0.4;

// Test D: Malformed label in exclude mode
appState.settings.gateMode = "exclude";
appState.labels.AAPL = { label: "Malformed", isMalformed: true };
failures = evaluateGuardrails(appState);
assert(failures.some(f => f.cause.includes("any survivor malformed in exclude mode")), "Catches malformed label in exclude mode");

// Fix malformed
appState.labels.AAPL = { label: "Tailwind", isMalformed: false };

// Test E: Unlabelled survivor
delete appState.labels.GOOGL;
failures = evaluateGuardrails(appState);
assert(failures.some(f => f.cause.includes("any survivor without a text label")), "Catches unlabelled survivor");

// Fix unlabelled
appState.labels.GOOGL = { label: "Tailwind", isMalformed: false };

// Test F: Gated consistency check
appState.gatedSurvivors = ["AAPL", "MSFT"]; // Missing GOOGL which is Tailwind and should pass
failures = evaluateGuardrails(appState);
assert(failures.some(f => f.cause.includes("gated survivor list does not match")), "Catches gate consistency mismatch");

// Fix gated
appState.gatedSurvivors = ["AAPL", "MSFT", "GOOGL"];

// Test G: Weight sum !== 1.0 or weight > cap
appState.weights.minVariance = [0.5, 0.4, 0.2]; // sum = 1.1, weight 0.5 > cap 0.4
failures = evaluateGuardrails(appState);
assert(failures.some(f => f.cause.includes("weight vector does not sum to one")), "Catches invalid weight vector");

// Fix weights
appState.weights.minVariance = [0.33, 0.33, 0.34];

// Test H: Allocations negative or sum > investmentAmount
appState.settings.investmentAmount = 100000;
appState.allocations.minVariance = [50000, 50000, 20000]; // sum = 120000 > 100000
failures = evaluateGuardrails(appState);
assert(failures.some(f => f.cause.includes("dollar allocations sum to more than investmentAmount")), "Catches dollar allocations invalid");

// Fix allocations
appState.allocations.minVariance = [33000, 33000, 34000];

// Test I: Passed guardrails
appState.screenResult.survivors = ["AAPL", "JNJ", "JPM"];
appState.gatedSurvivors = ["AAPL", "JNJ", "JPM"];
appState.labels = {
  AAPL: { label: "Tailwind", isMalformed: false },
  JNJ: { label: "Neutral", isMalformed: false },
  JPM: { label: "Tailwind", isMalformed: false }
};
appState.weights.minVariance = [0.33, 0.33, 0.34];
appState.allocations.minVariance = [33000, 33000, 34000];

failures = evaluateGuardrails(appState);
if (failures.length > 0) {
  console.log("Remaining failure in Test I:", failures);
}
assert(failures.length === 0, `All guardrails pass when conditions are valid (count: ${failures.length})`);

// 3. Test generateExportData sanitization
appState.keys.twelveData = "SECRET_TWELVE_KEY";
appState.keys.openRouter = "SECRET_OPENROUTER_KEY";
appState.priceCache = { AAPL: [{ close: 150 }] };
appState.rawPrices = { AAPL: [{ close: 150 }] };

const exportData = generateExportData(appState);
const exportJsonStr = JSON.stringify(exportData);

assert(!exportJsonStr.includes("SECRET_TWELVE_KEY"), "Twelve Data API key NOT in export");
assert(!exportJsonStr.includes("SECRET_OPENROUTER_KEY"), "OpenRouter API key NOT in export");
assert(!exportJsonStr.includes("priceCache"), "Price cache NOT in export");
assert(!exportJsonStr.includes("rawPrices"), "Raw prices NOT in export");
assert(exportData.modelIdentifier === appState.settings.openRouterModel, "Model identifier present in export");
assert(exportData.creditsSetting === appState.settings.creditsPerMinute, "Credits setting present in export");
assert(exportData.guardrailCheckPassed === true, "Guardrail check passed flag is true in export");

// 4. Test review checkbox clearing on setting change
appState.reviewed = true;
clearReview();
assert(appState.reviewed === false, "clearReview resets appState.reviewed to false");

appState.reviewed = true;
validateAndSetWeightCap(0.35);
assert(appState.reviewed === false, "validateAndSetWeightCap resets reviewed status");

appState.reviewed = true;
validateAndSetMinimumBreadth(3);
assert(appState.reviewed === false, "validateAndSetMinimumBreadth resets reviewed status");

appState.reviewed = true;
validateAndSetInvestmentAmount(50000);
assert(appState.reviewed === false, "validateAndSetInvestmentAmount resets reviewed status");

appState.reviewed = true;
validateAndSetRsiThreshold(40);
assert(appState.reviewed === false, "validateAndSetRsiThreshold resets reviewed status");

appState.reviewed = true;
validateAndSetHistogramLookback(4);
assert(appState.reviewed === false, "validateAndSetHistogramLookback resets reviewed status");

appState.reviewed = true;
validateAndSetRiskFreeRate(4.5);
assert(appState.reviewed === false, "validateAndSetRiskFreeRate resets reviewed status");

appState.reviewed = true;
validateAndSetGateMode("warn");
assert(appState.reviewed === false, "validateAndSetGateMode resets reviewed status");

console.log(`\nALL ${passedTests} / ${totalTests} TESTS PASSED SUCCESSFULLY!`);

/**
 * Walk-Forward Backtest Engine
 * Pure mathematical computation module with no network and no randomness.
 * Reuses existing indicator, screen, covariance, and solver functions.
 */

import {
  computeRsi,
  computeMacd,
  histogramPair,
  screenTickers,
  computeDailyReturns,
  computeDailyStd,
  computeAnnualizedVol,
  computeSampleCovariance,
  solveMinimumVariance,
  computeInverseVolWeights,
  checkFeasibility,
  buildSectorGroups
} from "./main.js";

/**
 * Aligns backtest-eligible constituents and SPY on the intersection of their dates.
 * Records which ticker(s) constrain the intersection.
 *
 * @param {Record<string, Array<{ datetime: string, close: number }>>} priceCache
 * @param {string[]} eligibleTickers
 * @param {Record<string, string>} sectorMap
 * @returns {{ alignedDates: string[], closes: Record<string, number[]>, spyCloses: number[], constrainingTickers: string[] }}
 */
export function alignForBacktest(priceCache, eligibleTickers, sectorMap = {}) {
  const isCacheValid = priceCache !== null && typeof priceCache === "object";
  if (isCacheValid === false || Array.isArray(eligibleTickers) === false || eligibleTickers.length === 0) {
    return {
      alignedDates: [],
      closes: {},
      spyCloses: [],
      constrainingTickers: []
    };
  }

  const datesByTicker = {};
  const priceMapByTicker = {};
  const sessionCountByTicker = {};

  for (let i = 0; i < eligibleTickers.length; i += 1) {
    const t = eligibleTickers[i];
    const series = priceCache[t];
    const hasSeries = Array.isArray(series) === true && series.length > 0;
    if (hasSeries === true) {
      datesByTicker[t] = series.map((b) => b.datetime);
      priceMapByTicker[t] = new Map(series.map((b) => [b.datetime, b.close]));
      sessionCountByTicker[t] = series.length;
    }
  }

  const validTickers = eligibleTickers.filter((t) => datesByTicker[t] !== undefined);
  if (validTickers.length === 0) {
    return {
      alignedDates: [],
      closes: {},
      spyCloses: [],
      constrainingTickers: []
    };
  }

  // Intersect dates across all valid eligible constituents
  let commonDatesSet = new Set(datesByTicker[validTickers[0]]);
  for (let i = 1; i < validTickers.length; i += 1) {
    const t = validTickers[i];
    const tSet = new Set(datesByTicker[t]);
    const nextSet = new Set();
    commonDatesSet.forEach((d) => {
      if (tSet.has(d) === true) {
        nextSet.add(d);
      }
    });
    commonDatesSet = nextSet;
  }

  // Also intersect with SPY dates if SPY is available
  const spySeries = priceCache["SPY"];
  const hasSpy = Array.isArray(spySeries) === true && spySeries.length > 0;
  let spyPriceMap = new Map();
  if (hasSpy === true) {
    spyPriceMap = new Map(spySeries.map((b) => [b.datetime, b.close]));
    const nextSet = new Set();
    commonDatesSet.forEach((d) => {
      if (spyPriceMap.has(d) === true) {
        nextSet.add(d);
      }
    });
    commonDatesSet = nextSet;
  }

  const alignedDates = Array.from(commonDatesSet).sort();
  if (alignedDates.length === 0) {
    return {
      alignedDates: [],
      closes: {},
      spyCloses: [],
      constrainingTickers: []
    };
  }

  // Find constraining ticker(s): smallest session counts or bounds
  let minSessions = Infinity;
  for (let i = 0; i < validTickers.length; i += 1) {
    const t = validTickers[i];
    const c = sessionCountByTicker[t] || 0;
    if (c < minSessions) {
      minSessions = c;
    }
  }

  const firstDate = alignedDates[0];
  const lastDate = alignedDates[alignedDates.length - 1];
  const constrainingSet = new Set();

  for (let i = 0; i < validTickers.length; i += 1) {
    const t = validTickers[i];
    const tDates = datesByTicker[t];
    const tFirst = tDates[0];
    const tLast = tDates[tDates.length - 1];
    const c = sessionCountByTicker[t] || 0;
    if (c === minSessions || tFirst === firstDate || tLast === lastDate) {
      constrainingSet.add(t);
    }
  }

  const constrainingTickers = Array.from(constrainingSet);

  // Extract aligned closes for constituents and SPY
  const closes = {};
  for (let i = 0; i < validTickers.length; i += 1) {
    const t = validTickers[i];
    const pMap = priceMapByTicker[t];
    closes[t] = alignedDates.map((d) => pMap.get(d));
  }

  let spyCloses = [];
  if (hasSpy === true) {
    spyCloses = alignedDates.map((d) => spyPriceMap.get(d));
  }

  return {
    alignedDates,
    closes,
    spyCloses,
    constrainingTickers
  };
}

/**
 * Pure walk-forward backtest engine.
 *
 * @param {object} input
 * @param {Function} [onProgress]
 * @returns {object} Finished backtest result object
 */
export function runBacktest(input, onProgress = null, universeArg = null, settingsArg = null) {
  let normalizedInput = input;
  let progressCb = onProgress;

  if (input !== null && typeof input === "object" && !input.priceCache && Array.isArray(onProgress)) {
    normalizedInput = {
      priceCache: input,
      selectedTickers: onProgress,
      universe: universeArg,
      settings: settingsArg
    };
    progressCb = null;
  }
  onProgress = progressCb;

  const isInputValid = normalizedInput !== null && typeof normalizedInput === "object";
  if (isInputValid === false) {
    throw new Error("runBacktest: invalid input object.");
  }

  const settings = {
    rsiThreshold: normalizedInput.settings && typeof normalizedInput.settings.rsiThreshold === "number" ? normalizedInput.settings.rsiThreshold : 40,
    histogramLookback: normalizedInput.settings && typeof normalizedInput.settings.histogramLookback === "number" ? normalizedInput.settings.histogramLookback : 3,
    weightCap: normalizedInput.settings && typeof normalizedInput.settings.weightCap === "number" ? normalizedInput.settings.weightCap : 0.25,
    minimumBreadth: normalizedInput.settings && typeof normalizedInput.settings.minimumBreadth === "number" ? normalizedInput.settings.minimumBreadth : 5,
    holdingPeriod: normalizedInput.settings && typeof normalizedInput.settings.holdingPeriod === "number" ? normalizedInput.settings.holdingPeriod : 20,
    exitThreshold: normalizedInput.settings && typeof normalizedInput.settings.exitThreshold === "number" ? normalizedInput.settings.exitThreshold : 60,
    cadence: normalizedInput.settings && typeof normalizedInput.settings.cadence === "number" ? normalizedInput.settings.cadence : 5
  };

  const sectorMap = {};
  if (normalizedInput.sectorMap && typeof normalizedInput.sectorMap === "object") {
    Object.assign(sectorMap, normalizedInput.sectorMap);
  } else if (Array.isArray(normalizedInput.universe) === true) {
    for (let i = 0; i < normalizedInput.universe.length; i += 1) {
      const u = normalizedInput.universe[i];
      if (u) {
        const sym = u.symbol || u.ticker;
        if (typeof sym === "string") {
          sectorMap[sym] = u.sector || "Unknown";
        }
      }
    }
  }

  // Determine backtest alignment
  let alignedDates = [];
  let closes = {};
  let spyCloses = [];
  let constrainingTickers = [];

  const hasPrealigned = Array.isArray(input.alignedDates) === true &&
    input.alignedDates.length > 0 &&
    input.closes !== null &&
    typeof input.closes === "object";

  if (hasPrealigned === true) {
    alignedDates = [...input.alignedDates];
    closes = { ...input.closes };
    spyCloses = Array.isArray(input.spyCloses) === true ? [...input.spyCloses] : [];
    constrainingTickers = Array.isArray(input.constrainingTickers) === true ? [...input.constrainingTickers] : [];
  } else {
    // Perform backtest alignment from priceCache
    const priceCache = input.priceCache || {};
    const selectedTickers = (input.selectedTickers || []).filter((t) => t !== "SPY");
    // Constituents with at least 500 sessions are eligible for backtest
    const eligibleTickers = selectedTickers.filter((t) => {
      const series = priceCache[t];
      return Array.isArray(series) === true && series.length >= 500;
    });

    const alignment = alignForBacktest(priceCache, eligibleTickers, sectorMap);
    alignedDates = alignment.alignedDates;
    closes = alignment.closes;
    spyCloses = alignment.spyCloses;
    constrainingTickers = alignment.constrainingTickers;
  }

  const eligibleConstituents = Object.keys(closes);
  const totalSessions = alignedDates.length;
  const H = settings.holdingPeriod;
  const cadence = settings.cadence;
  const K = eligibleConstituents.length;

  const emptyResult = {
    settings,
    lookbackWindow: {
      startDate: alignedDates.length > 0 ? alignedDates[0] : "",
      endDate: alignedDates.length > 0 ? alignedDates[alignedDates.length - 1] : "",
      sessionCount: alignedDates.length
    },
    constrainingTickers,
    verdict: "not supported",
    verdictExplanation: "Backtest could not be evaluated due to insufficient aligned sessions.",
    counts: {
      entryDatesCount: 0,
      nonOverlappingCount: 0,
      tradedDatesCount: 0,
      noTradeDatesCount: 0,
      stride: Math.ceil(H / cadence),
      noTradeReasons: []
    },
    summary: {
      minVariance: { name: "Minimum variance", isCandidate: true, tradeCount: 0, meanForwardReturn: 0, medianForwardReturn: 0, hitRateVsSpy: 0, worstForwardReturn: 0, meanMaxDrawdown: 0 },
      equalWeight: { name: "Equal weight", isReference: true, tradeCount: 0, meanForwardReturn: 0, medianForwardReturn: 0, hitRateVsSpy: 0, worstForwardReturn: 0, meanMaxDrawdown: 0 },
      inverseVolatility: { name: "Inverse volatility", isReference: true, tradeCount: 0, meanForwardReturn: 0, medianForwardReturn: 0, hitRateVsSpy: 0, worstForwardReturn: 0, meanMaxDrawdown: 0 },
      spy: { name: "SPY", isReference: true, isBenchmark: true, tradeCount: 0, meanForwardReturn: 0, medianForwardReturn: 0, hitRateVsSpy: null, worstForwardReturn: 0, meanMaxDrawdown: 0 },
      unscreened: { name: "Unscreened basket", isReference: true, tradeCount: 0, meanForwardReturn: 0, medianForwardReturn: 0, hitRateVsSpy: 0, worstForwardReturn: 0, meanMaxDrawdown: 0 }
    },
    attributions: {
      screenEffect: { mean: 0, hitRate: 0 },
      optimizerEffect: { mean: 0, hitRate: 0 }
    },
    tradesTable: [],
    limitations: {
      survivorshipBias: "Survivorship bias: Evaluated using current index constituents rather than point-in-time membership.",
      singleRegimeRisk: "Single-regime risk: Three-year backtest window covers a limited set of macroeconomic regimes."
    }
  };

  // Ensure we have at least 252 sessions plus H
  const minRequiredSessions = 252 + H + 1;
  if (totalSessions < minRequiredSessions || K === 0) {
    return emptyResult;
  }

  // Step b: Entry dates are every cadence-th session from the first session that has 252 prior aligned sessions
  // to the last session that has H following sessions.
  // 252 prior sessions before t => t >= 252.
  // H following sessions after t => t + H <= totalSessions - 1 => t <= totalSessions - 1 - H.
  const entryIndices = [];
  for (let t = 252; t <= totalSessions - 1 - H; t += cadence) {
    entryIndices.push(t);
  }

  const numEntryDates = entryIndices.length;
  if (numEntryDates === 0) {
    return emptyResult;
  }

  const tradesTable = [];
  const tradedDates = [];
  const noTradeReasons = [];

  const forwardReturnsMV = [];
  const forwardReturnsEW = [];
  const forwardReturnsIV = [];
  const forwardReturnsSPY = [];
  const forwardReturnsUns = [];

  const maxDrawdownsMV = [];
  const maxDrawdownsEW = [];
  const maxDrawdownsIV = [];
  const maxDrawdownsSPY = [];
  const maxDrawdownsUns = [];

  for (let idx = 0; idx < numEntryDates; idx += 1) {
    const t = entryIndices[idx];
    const date = alignedDates[t];

    if (typeof onProgress === "function") {
      const pct = Math.round(((idx + 1) / numEntryDates) * 100);
      onProgress({ percent: pct, current: idx + 1, total: numEntryDates });
    }

    // Step d: On every entry date, traded or not, form two controls: SPY, and unscreened basket
    // Both exit at t + H
    let spyReturn = 0;
    if (spyCloses.length > t + H && spyCloses[t] > 0) {
      spyReturn = (spyCloses[t + H] - spyCloses[t]) / spyCloses[t];
    }

    let unscreenedReturn = 0;
    for (let k = 0; k < K; k += 1) {
      const sym = eligibleConstituents[k];
      const p0 = closes[sym][t];
      const pH = closes[sym][t + H];
      const rk = p0 > 0 ? (pH - p0) / p0 : 0;
      unscreenedReturn += (1 / K) * rk;
    }

    // Drawdowns for controls across [t, t + H]
    let peakSpy = 1.0;
    let ddSpy = 0.0;
    for (let s = t; s <= t + H; s += 1) {
      const vSpy = spyCloses[t] > 0 ? spyCloses[s] / spyCloses[t] : 1.0;
      if (vSpy > peakSpy) {
        peakSpy = vSpy;
      }
      const decline = peakSpy > 0 ? (peakSpy - vSpy) / peakSpy : 0;
      if (decline > ddSpy) {
        ddSpy = decline;
      }
    }

    let peakUns = 1.0;
    let ddUns = 0.0;
    for (let s = t; s <= t + H; s += 1) {
      let vUns = 0;
      for (let k = 0; k < K; k += 1) {
        const sym = eligibleConstituents[k];
        const p0 = closes[sym][t];
        const ps = closes[sym][s];
        const ratio = p0 > 0 ? ps / p0 : 1.0;
        vUns += (1 / K) * ratio;
      }
      if (vUns > peakUns) {
        peakUns = vUns;
      }
      const decline = peakUns > 0 ? (peakUns - vUns) / peakUns : 0;
      if (decline > ddUns) {
        ddUns = decline;
      }
    }

    // Step c: Technical screen using only closes up to and including t
    const indSeries = { rsi: {}, macd: {} };
    for (let k = 0; k < K; k += 1) {
      const sym = eligibleConstituents[k];
      const slice_t = closes[sym].slice(0, t + 1);
      indSeries.rsi[sym] = computeRsi(slice_t, 14);
      indSeries.macd[sym] = computeMacd(slice_t, 12, 26, 9);
    }

    const screenRes = screenTickers(indSeries, settings.rsiThreshold, settings.histogramLookback);
    const survivors = screenRes && Array.isArray(screenRes.survivors) ? screenRes.survivors : [];
    const numSurvivors = survivors.length;

    // Check minimum breadth
    if (numSurvivors < settings.minimumBreadth) {
      const reason = `Breadth below minimum (${numSurvivors} < ${settings.minimumBreadth})`;
      noTradeReasons.push({ date, reason });
      tradesTable.push({
        date,
        index: t,
        isTraded: false,
        reason,
        survivorsCount: numSurvivors,
        survivors: [...survivors],
        weights: { minVariance: {}, equalWeight: {}, inverseVolatility: {} },
        exits: {},
        forwardReturns: {
          minVariance: null,
          equalWeight: null,
          inverseVolatility: null,
          spy: spyReturn,
          unscreened: unscreenedReturn
        }
      });
      continue;
    }

    // Check feasibility: cap times survivor count at least 1
    const product = numSurvivors * settings.weightCap;
    if (product < 1.0 - 1e-9) {
      const reason = `Infeasible: cap times survivors < 1 (${product.toFixed(2)} < 1.0)`;
      noTradeReasons.push({ date, reason });
      tradesTable.push({
        date,
        index: t,
        isTraded: false,
        reason,
        survivorsCount: numSurvivors,
        survivors: [...survivors],
        weights: { minVariance: {}, equalWeight: {}, inverseVolatility: {} },
        exits: {},
        forwardReturns: {
          minVariance: null,
          equalWeight: null,
          inverseVolatility: null,
          spy: spyReturn,
          unscreened: unscreenedReturn
        }
      });
      continue;
    }

    // Check feasibility: survivors in at least two sectors
    const survivorSectors = new Set();
    const sectorCounts = {};
    for (let i = 0; i < numSurvivors; i += 1) {
      const sym = survivors[i];
      const sec = sectorMap[sym] || "Unknown";
      survivorSectors.add(sec);
      sectorCounts[sec] = (sectorCounts[sec] || 0) + 1;
    }
    if (survivorSectors.size < 2) {
      const reason = `Infeasible: survivors in fewer than 2 sectors (${survivorSectors.size} sector)`;
      noTradeReasons.push({ date, reason });
      tradesTable.push({
        date,
        index: t,
        isTraded: false,
        reason,
        survivorsCount: numSurvivors,
        survivors: [...survivors],
        weights: { minVariance: {}, equalWeight: {}, inverseVolatility: {} },
        exits: {},
        forwardReturns: {
          minVariance: null,
          equalWeight: null,
          inverseVolatility: null,
          spy: spyReturn,
          unscreened: unscreenedReturn
        }
      });
      continue;
    }

    // Check feasibility: can the sectors sum to 1.0 under 50% limit and per-asset cap?
    let maxSectorCapacitySum = 0;
    for (const sec in sectorCounts) {
      const secMax = Math.min(0.50, sectorCounts[sec] * settings.weightCap);
      maxSectorCapacitySum += secMax;
    }
    if (maxSectorCapacitySum < 1.0 - 1e-9) {
      const reason = `Infeasible: sector capacity sum < 1.0 (${maxSectorCapacitySum.toFixed(2)})`;
      noTradeReasons.push({ date, reason });
      tradesTable.push({
        date,
        index: t,
        isTraded: false,
        reason,
        survivorsCount: numSurvivors,
        survivors: [...survivors],
        weights: { minVariance: {}, equalWeight: {}, inverseVolatility: {} },
        exits: {},
        forwardReturns: {
          minVariance: null,
          equalWeight: null,
          inverseVolatility: null,
          spy: spyReturn,
          unscreened: unscreenedReturn
        }
      });
      continue;
    }

    // Compute sample covariance of the 252 sessions ending at t
    // Closes slice from t - 251 to t (252 sessions)
    const returnsByTicker = {};
    for (let i = 0; i < numSurvivors; i += 1) {
      const sym = survivors[i];
      const slice252 = closes[sym].slice(t - 251, t + 1);
      returnsByTicker[sym] = computeDailyReturns(slice252);
    }

    const sigma = new Array(numSurvivors);
    for (let i = 0; i < numSurvivors; i += 1) {
      sigma[i] = new Float64Array(numSurvivors);
      const retA = returnsByTicker[survivors[i]];
      for (let j = 0; j < numSurvivors; j += 1) {
        if (j >= i) {
          const cov = computeSampleCovariance(retA, returnsByTicker[survivors[j]]);
          sigma[i][j] = cov;
        } else {
          sigma[i][j] = sigma[j][i];
        }
      }
    }

    const sectorGroups = buildSectorGroups(survivors, survivors.map((s) => sectorMap[s]));
    let solverRes = null;
    try {
      solverRes = solveMinimumVariance(sigma, settings.weightCap, sectorGroups);
    } catch (optErr) {
      solverRes = { feasible: false, cause: optErr.message || String(optErr) };
    }
    if (solverRes.feasible === false || Array.isArray(solverRes.weights) === false || solverRes.weights.length !== numSurvivors) {
      const reason = `Optimization infeasible: ${solverRes.cause || "solver could not find feasible weights"}`;
      noTradeReasons.push({ date, reason });
      tradesTable.push({
        date,
        index: t,
        isTraded: false,
        reason,
        survivorsCount: numSurvivors,
        survivors: [...survivors],
        weights: { minVariance: {}, equalWeight: {}, inverseVolatility: {} },
        exits: {},
        forwardReturns: {
          minVariance: null,
          equalWeight: null,
          inverseVolatility: null,
          spy: spyReturn,
          unscreened: unscreenedReturn
        }
      });
      continue;
    }

    // Form three weightings: Minimum variance, Equal weight, Inverse volatility
    const weightsMV = solverRes.weights;
    const weightsEW = new Array(numSurvivors).fill(1 / numSurvivors);
    const weightsIV = computeInverseVolWeights(survivors, returnsByTicker);

    // Step e: Exit rule per name from session t+1 onward up to t+H
    // A name whose RSI(14) at a session's close is >= exitThreshold exits at that close,
    // earns zero afterwards, and its weight is not redistributed; every other name exits at close of t+H.
    const exitData = {};
    const returnToExit = {};

    for (let i = 0; i < numSurvivors; i += 1) {
      const sym = survivors[i];
      const p0 = closes[sym][t];
      let didExit = false;

      for (let offset = 1; offset <= H; offset += 1) {
        const s = t + offset;
        const rsiVal = computeRsi(closes[sym].slice(0, s + 1), 14).currentRsi;
        const isExitTriggered = typeof rsiVal === "number" && rsiVal >= settings.exitThreshold;
        if (isExitTriggered === true) {
          const pExit = closes[sym][s];
          const ret = p0 > 0 ? (pExit - p0) / p0 : 0;
          exitData[sym] = {
            exitSession: s,
            exitDate: alignedDates[s],
            exitOffset: offset,
            returnToExit: ret
          };
          returnToExit[sym] = ret;
          didExit = true;
          break;
        }
      }

      if (didExit === false) {
        const pExit = closes[sym][t + H];
        const ret = p0 > 0 ? (pExit - p0) / p0 : 0;
        exitData[sym] = {
          exitSession: t + H,
          exitDate: alignedDates[t + H],
          exitOffset: H,
          returnToExit: ret
        };
        returnToExit[sym] = ret;
      }
    }

    // Basket forward returns = sum over names of weight * return to exit
    let retMV = 0;
    let retEW = 0;
    let retIV = 0;

    const weightsMapMV = {};
    const weightsMapEW = {};
    const weightsMapIV = {};

    for (let i = 0; i < numSurvivors; i += 1) {
      const sym = survivors[i];
      const r = returnToExit[sym];
      retMV += weightsMV[i] * r;
      retEW += weightsEW[i] * r;
      retIV += weightsIV[i] * r;

      weightsMapMV[sym] = weightsMV[i];
      weightsMapEW[sym] = weightsEW[i];
      weightsMapIV[sym] = weightsIV[i];
    }

    // Largest peak-to-trough decline (drawdown) within [t, t + H] for each basket
    let peakMV = 1.0;
    let ddMV = 0.0;
    let peakEW = 1.0;
    let ddEW = 0.0;
    let peakIV = 1.0;
    let ddIV = 0.0;

    for (let offset = 0; offset <= H; offset += 1) {
      const s = t + offset;
      let vMV = 0;
      let vEW = 0;
      let vIV = 0;

      for (let i = 0; i < numSurvivors; i += 1) {
        const sym = survivors[i];
        const p0 = closes[sym][t];
        const exitS = exitData[sym].exitSession;
        // Price frozen at exit close if session >= exitSession
        const effectiveS = Math.min(s, exitS);
        const pEff = closes[sym][effectiveS];
        const assetValue = p0 > 0 ? pEff / p0 : 1.0;

        vMV += weightsMV[i] * assetValue;
        vEW += weightsEW[i] * assetValue;
        vIV += weightsIV[i] * assetValue;
      }

      if (vMV > peakMV) {
        peakMV = vMV;
      }
      const decMV = peakMV > 0 ? (peakMV - vMV) / peakMV : 0;
      if (decMV > ddMV) {
        ddMV = decMV;
      }

      if (vEW > peakEW) {
        peakEW = vEW;
      }
      const decEW = peakEW > 0 ? (peakEW - vEW) / peakEW : 0;
      if (decEW > ddEW) {
        ddEW = decEW;
      }

      if (vIV > peakIV) {
        peakIV = vIV;
      }
      const decIV = peakIV > 0 ? (peakIV - vIV) / peakIV : 0;
      if (decIV > ddIV) {
        ddIV = decIV;
      }
    }

    tradedDates.push(date);
    forwardReturnsMV.push(retMV);
    forwardReturnsEW.push(retEW);
    forwardReturnsIV.push(retIV);
    forwardReturnsSPY.push(spyReturn);
    forwardReturnsUns.push(unscreenedReturn);

    maxDrawdownsMV.push(ddMV);
    maxDrawdownsEW.push(ddEW);
    maxDrawdownsIV.push(ddIV);
    maxDrawdownsSPY.push(ddSpy);
    maxDrawdownsUns.push(ddUns);

    tradesTable.push({
      date,
      index: t,
      isTraded: true,
      reason: null,
      survivorsCount: numSurvivors,
      survivors: [...survivors],
      weights: {
        minVariance: weightsMapMV,
        equalWeight: weightsMapEW,
        inverseVolatility: weightsMapIV
      },
      exits: exitData,
      forwardReturns: {
        minVariance: retMV,
        equalWeight: retEW,
        inverseVolatility: retIV,
        spy: spyReturn,
        unscreened: unscreenedReturn
      }
    });
  }

  // Step f: Metrics per basket over traded dates
  const numTrades = tradedDates.length;

  const computeMetrics = (returns, drawdowns, isBenchmark = false) => {
    if (numTrades === 0) {
      return {
        tradeCount: 0,
        meanForwardReturn: 0,
        medianForwardReturn: 0,
        hitRateVsSpy: isBenchmark ? null : 0,
        worstForwardReturn: 0,
        meanMaxDrawdown: 0
      };
    }

    let sumRet = 0;
    for (let i = 0; i < numTrades; i += 1) {
      sumRet += returns[i];
    }
    const meanForwardReturn = sumRet / numTrades;

    const sorted = [...returns].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianForwardReturn = sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;

    let beatSpyCount = 0;
    for (let i = 0; i < numTrades; i += 1) {
      if (returns[i] > forwardReturnsSPY[i]) {
        beatSpyCount += 1;
      }
    }
    const hitRateVsSpy = isBenchmark === true ? null : beatSpyCount / numTrades;
    const worstForwardReturn = sorted[0];

    let sumDd = 0;
    for (let i = 0; i < numTrades; i += 1) {
      sumDd += drawdowns[i];
    }
    const meanMaxDrawdown = sumDd / numTrades;

    return {
      tradeCount: numTrades,
      meanForwardReturn,
      meanReturn: meanForwardReturn,
      medianForwardReturn,
      medianReturn: medianForwardReturn,
      hitRateVsSpy,
      worstForwardReturn,
      worstReturn: worstForwardReturn,
      meanMaxDrawdown
    };
  };

  const summary = {
    minVariance: {
      name: "Minimum variance",
      isCandidate: true,
      ...computeMetrics(forwardReturnsMV, maxDrawdownsMV)
    },
    equalWeight: {
      name: "Equal weight",
      isReference: true,
      ...computeMetrics(forwardReturnsEW, maxDrawdownsEW)
    },
    inverseVolatility: {
      name: "Inverse volatility",
      isReference: true,
      ...computeMetrics(forwardReturnsIV, maxDrawdownsIV)
    },
    spy: {
      name: "SPY",
      isReference: true,
      isBenchmark: true,
      ...computeMetrics(forwardReturnsSPY, maxDrawdownsSPY, true)
    },
    unscreened: {
      name: "Unscreened basket",
      isReference: true,
      ...computeMetrics(forwardReturnsUns, maxDrawdownsUns)
    }
  };
  summary.unscreenedBasket = summary.unscreened;

  // Step g: Two attributions over traded dates
  // screen effect = screened equal weight minus unscreened
  // optimizer effect = minimum variance minus screened equal weight
  let screenEffectSum = 0;
  let screenEffectHitCount = 0;
  let optimizerEffectSum = 0;
  let optimizerEffectHitCount = 0;

  for (let i = 0; i < numTrades; i += 1) {
    const sc = forwardReturnsEW[i] - forwardReturnsUns[i];
    const opt = forwardReturnsMV[i] - forwardReturnsEW[i];

    screenEffectSum += sc;
    if (sc > 0) {
      screenEffectHitCount += 1;
    }

    optimizerEffectSum += opt;
    if (opt > 0) {
      optimizerEffectHitCount += 1;
    }
  }

  const screenEffectMean = numTrades > 0 ? screenEffectSum / numTrades : 0;
  const screenEffectHitRate = numTrades > 0 ? screenEffectHitCount / numTrades : 0;
  const optimizerEffectMean = numTrades > 0 ? optimizerEffectSum / numTrades : 0;
  const optimizerEffectHitRate = numTrades > 0 ? optimizerEffectHitCount / numTrades : 0;

  const attributions = {
    screenEffect: {
      mean: screenEffectMean,
      hitRate: screenEffectHitRate
    },
    optimizerEffect: {
      mean: optimizerEffectMean,
      hitRate: optimizerEffectHitRate
    }
  };

  // Step h: Verdict: "supported" when the screen effect mean is positive and its hit rate is above 50%, otherwise "not supported"
  const isSupported = numTrades > 0 && screenEffectMean > 0 && screenEffectHitRate > 0.5;
  const verdict = isSupported === true ? "supported" : "not supported";

  const meanPctStr = (screenEffectMean * 100).toFixed(2);
  const hitPctStr = (screenEffectHitRate * 100).toFixed(2);
  const verdictExplanation = isSupported === true
    ? `Supported: The technical screen generated a positive mean excess return of +${meanPctStr}% with a ${hitPctStr}% win rate against the unscreened benchmark.`
    : `Not supported: The technical screen effect mean (${meanPctStr}%) or win rate (${hitPctStr}%) did not demonstrate positive persistence above 50%.`;

  // Step i: Counts
  const stride = Math.max(1, Math.ceil(H / cadence));
  const nonOverlappingCount = numTrades > 0 ? Math.ceil(numTrades / stride) : 0;
  const counts = {
    entryDatesCount: numEntryDates,
    nonOverlappingCount,
    tradedDatesCount: numTrades,
    noTradeDatesCount: numEntryDates - numTrades,
    stride,
    noTradeReasons
  };

  // Step j: Return complete result object
  return {
    settings,
    lookbackWindow: {
      startDate: alignedDates[0],
      endDate: alignedDates[alignedDates.length - 1],
      sessionCount: alignedDates.length
    },
    window: {
      startDate: alignedDates[0],
      endDate: alignedDates[alignedDates.length - 1],
      sessionCount: alignedDates.length,
      constrainingTickers
    },
    constrainingTickers,
    isSupported,
    verdict,
    verdictExplanation,
    counts,
    summary,
    attributions,
    attribution: attributions,
    tradesTable,
    trades: tradesTable,
    limitations: {
      survivorshipBias: "Survivorship bias: Evaluated using current index constituents rather than point-in-time membership.",
      singleRegimeRisk: "Single-regime risk: Three-year backtest window covers a limited set of macroeconomic regimes."
    }
  };
}

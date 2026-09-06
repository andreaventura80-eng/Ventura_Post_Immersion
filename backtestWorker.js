/**
 * Web Worker for Walk-Forward Backtest Engine
 * Runs purely on serializable input objects without blocking the main UI thread.
 */

import { runBacktest } from "./backtestEngine.js";

self.onmessage = function (event) {
  const data = event.data;
  const input = (data && (data.input || data.data)) || data;
  if (!input || typeof input !== "object" || !input.priceCache) {
    self.postMessage({ type: "ERROR", error: "Missing backtest priceCache input payload." });
    return;
  }

  try {
    const result = runBacktest(input, (progress) => {
      self.postMessage({
        type: "PROGRESS",
        data: progress,
        percent: progress.percent,
        current: progress.current,
        total: progress.total
      });
    });

    self.postMessage({
      type: "DONE",
      data: result,
      result: result
    });
  } catch (err) {
    self.postMessage({
      type: "ERROR",
      error: err && err.message ? err.message : String(err)
    });
  }
};

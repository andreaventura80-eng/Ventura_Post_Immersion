/**
 * Web Worker for Walk-Forward Backtest Engine
 * Runs purely on serializable input objects without blocking the main UI thread.
 */

import { runBacktest } from "./backtestEngine.js";

self.onmessage = function (event) {
  const data = event.data;
  if (!data || !data.input) {
    self.postMessage({ type: "error", error: "Missing backtest input payload." });
    return;
  }

  try {
    const result = runBacktest(data.input, (progress) => {
      self.postMessage({
        type: "progress",
        percent: progress.percent,
        current: progress.current,
        total: progress.total
      });
    });

    self.postMessage({
      type: "done",
      result: result
    });
  } catch (err) {
    self.postMessage({
      type: "error",
      error: err && err.message ? err.message : String(err)
    });
  }
};

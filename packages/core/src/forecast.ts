/**
 * Phase 2 forecasting seam. The Insights cashflow projection runs through a
 * `Forecaster` so the model is swappable. The roadmap's Prophet service (a
 * Python microservice) implements this same interface, trained on `history`;
 * it is NOT wired in this build (no Prophet service or keys), so the default is
 * a documented naive baseline. Swapping in Prophet is a drop-in replacement.
 */
export type MonthFlow = { month: string; incomeCents: bigint; expenseCents: bigint };

export interface Forecaster {
  readonly name: string;
  /** Project the given future `months` from historical monthly flows and the
   *  expected window totals (e.g. marketable-inventory value + obligations). */
  project(history: MonthFlow[], months: string[], windowIncomeCents: bigint, windowExpenseCents: bigint): MonthFlow[];
}

/** Baseline: spread the window totals evenly across the projected months.
 *  Prophet replaces this with a trend+seasonality fit over `history`. */
export const naiveForecaster: Forecaster = {
  name: "naive",
  project(_history, months, windowIncomeCents, windowExpenseCents) {
    const n = BigInt(months.length || 1);
    return months.map((month) => ({ month, incomeCents: windowIncomeCents / n, expenseCents: windowExpenseCents / n }));
  },
};

/**
 * In-process Holt-Winters (triple exponential smoothing) — a TS-native
 * alternative to a Prophet microservice for the same `Forecaster` seam. Unlike
 * the naive baseline, it learns level + trend (and yearly seasonality, once
 * there are ≥2 full seasons of history) from `history` rather than spreading the
 * known window totals. Additive model with optional trend damping.
 */
export type HoltWintersOptions = {
  /** Periods per season (12 = monthly→yearly). Seasonality is only fitted when
   *  history spans at least two full seasons; otherwise it backs off to a
   *  level+trend (Holt) fit. */
  seasonLength?: number;
  alpha?: number; // level smoothing   (0..1)
  beta?: number;  // trend smoothing   (0..1)
  gamma?: number; // seasonal smoothing (0..1)
  phi?: number;   // trend damping     (0..1]; 1 = undamped
};

const HW_DEFAULTS: Required<HoltWintersOptions> = { seasonLength: 12, alpha: 0.5, beta: 0.3, gamma: 0.4, phi: 1 };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

/** Forecast the next `horizon` values of one numeric series. */
function hwForecast(y: number[], horizon: number, o: Required<HoltWintersOptions>): number[] {
  const n = y.length;
  const m = o.seasonLength;

  // Additive seasonal model — needs at least two full seasons of history.
  // (Indices below are all provably in-range; `!` satisfies noUncheckedIndexedAccess.)
  if (n >= 2 * m) {
    const seasons = Math.floor(n / m);
    const seasonAvg = Array.from({ length: seasons }, (_, k) => mean(y.slice(k * m, k * m + m)));
    const s = new Array<number>(n).fill(0);
    for (let i = 0; i < m; i++) {
      let acc = 0;
      for (let k = 0; k < seasons; k++) acc += y[k * m + i]! - seasonAvg[k]!;
      s[i] = acc / seasons;
    }
    let level = seasonAvg[0]!;
    let trend = (seasonAvg[1]! - seasonAvg[0]!) / m;
    for (let t = m; t < n; t++) {
      const prev = level;
      level = o.alpha * (y[t]! - s[t - m]!) + (1 - o.alpha) * (level + o.phi * trend);
      trend = o.beta * (level - prev) + (1 - o.beta) * o.phi * trend;
      s[t] = o.gamma * (y[t]! - level) + (1 - o.gamma) * s[t - m]!;
    }
    const out: number[] = [];
    let damp = 0;
    for (let h = 1; h <= horizon; h++) {
      damp += Math.pow(o.phi, h); // Σ φ¹..φʰ
      out.push(level + damp * trend + s[n - m + ((h - 1) % m)]!);
    }
    return out;
  }

  // Level + trend (Holt), damped — the common case for a handful of months/years.
  let level = y[0]!;
  let trend = y[1]! - y[0]!;
  for (let t = 1; t < n; t++) {
    const prev = level;
    level = o.alpha * y[t]! + (1 - o.alpha) * (level + o.phi * trend);
    trend = o.beta * (level - prev) + (1 - o.beta) * o.phi * trend;
  }
  const out: number[] = [];
  let damp = 0;
  for (let h = 1; h <= horizon; h++) {
    damp += Math.pow(o.phi, h);
    out.push(level + damp * trend);
  }
  return out;
}

/** Build a Holt-Winters `Forecaster`. Income and expense are fitted as two
 *  independent series. Forecasts are clamped to ≥0 and rounded back to integer
 *  cents (Invariant 1). */
export function makeHoltWintersForecaster(options: HoltWintersOptions = {}): Forecaster {
  const o = { ...HW_DEFAULTS, ...options };
  return {
    name: "holt-winters",
    project(history, months, windowIncomeCents, windowExpenseCents) {
      // A trend needs ≥2 points; below that, fall back to the grounded even spread.
      if (history.length < 2) return naiveForecaster.project(history, months, windowIncomeCents, windowExpenseCents);
      const horizon = months.length;
      const fi = hwForecast(history.map((h) => Number(h.incomeCents)), horizon, o);
      const fe = hwForecast(history.map((h) => Number(h.expenseCents)), horizon, o);
      return months.map((month, i) => ({
        month,
        incomeCents: BigInt(Math.max(0, Math.round(fi[i]!))),
        expenseCents: BigInt(Math.max(0, Math.round(fe[i]!))),
      }));
    },
  };
}

/** Default Holt-Winters forecaster (monthly seasonality, undamped trend). */
export const holtWintersForecaster = makeHoltWintersForecaster();

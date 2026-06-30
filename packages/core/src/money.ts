/**
 * INVARIANT 1: money is integer minor units (cents), never floats.
 * Storage type is bigint. Format only at the display edge.
 */
export type Cents = bigint;

/** Parse a user dollar string/number into integer cents. Rejects junk. */
export function toCents(input: string | number): Cents {
  const s = typeof input === "number" ? input.toString() : input.trim().replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Invalid money value: ${input}`);
  const neg = s.startsWith("-");
  const [whole = "0", frac = ""] = s.replace("-", "").split(".");
  const cents = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  return neg ? -cents : cents;
}

/** Format integer cents as a display string, e.g. 2673065n -> "$26,730.65". */
export function formatCents(cents: Cents, opts: { sign?: boolean } = {}): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const dollars = abs / 100n;
  const rem = (abs % 100n).toString().padStart(2, "0");
  const grouped = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = `$${grouped}.${rem}`;
  if (opts.sign) return `${neg ? "-" : "+"}${body}`;
  return neg ? `-${body}` : body;
}

/**
 * Display formatter matching the original UI: omits the decimal part when the
 * value is a whole number of dollars (e.g. 465000n -> "$4,650"), otherwise
 * shows exactly two places (e.g. 2673065n -> "$26,730.65"). Never emits the
 * sub-cent artifacts the original float math produced.
 */
export function formatCentsDisplay(cents: Cents, opts: { sign?: boolean } = {}): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const dollars = abs / 100n;
  const rem = abs % 100n;
  const grouped = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = rem === 0n ? `$${grouped}` : `$${grouped}.${rem.toString().padStart(2, "0")}`;
  if (opts.sign) return `${neg ? "-" : "+"}${body}`;
  return neg ? `-${body}` : body;
}

/** Round integer cents to the nearest whole dollar (still in cents), half-up.
 *  Used only at the display edge for projected/estimate figures. */
export function roundCentsToDollar(cents: Cents): Cents {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const rem = abs % 100n;
  const rounded = rem >= 50n ? abs - rem + 100n : abs - rem;
  return neg ? -rounded : rounded;
}

/** Safe sum of cents. */
export function sumCents(values: Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0n);
}

/** JSON-safe serialization of bigint money (Invariant 1 crossing the wire). */
export function serializeCents(cents: Cents): string {
  return cents.toString();
}
export function deserializeCents(value: string): Cents {
  return BigInt(value);
}

import { describe, it, expect } from "vitest";
import { toCents, formatCents, formatCentsDisplay, roundCentsToDollar, sumCents } from "./money.js";

describe("money (integer cents, no floats)", () => {
  it("parses dollars to cents", () => {
    expect(toCents("26,730.65")).toBe(2673065n);
    expect(toCents("$4,650")).toBe(465000n);
    expect(toCents(-1263)).toBe(-126300n);
  });
  it("rejects junk and sub-cent precision", () => {
    expect(() => toCents("154365.325")).toThrow();
    expect(() => toCents("abc")).toThrow();
  });
  it("formats cents to display", () => {
    expect(formatCents(2673065n)).toBe("$26,730.65");
    expect(formatCents(-126300n)).toBe("-$1,263.00");
    expect(formatCents(673065n, { sign: true })).toBe("+$6,730.65");
  });
  it("sums without drift", () => {
    expect(sumCents([465000n, 50000n, 45000n])).toBe(560000n);
  });

  it("display formatter omits trailing .00 to match the original UI", () => {
    expect(formatCentsDisplay(465000n)).toBe("$4,650");      // whole -> no decimals
    expect(formatCentsDisplay(33100000n)).toBe("$331,000");
    expect(formatCentsDisplay(2673065n)).toBe("$26,730.65"); // fractional -> 2 places
    expect(formatCentsDisplay(-50000n, { sign: true })).toBe("-$500");
    expect(formatCentsDisplay(673065n, { sign: true })).toBe("+$6,730.65");
  });

  it("rounds estimate cents to whole dollars (half-up), no float artifacts", () => {
    // 150000.00 + 75000.00 carry @ 6.5% / 7.2% -> 126250 cents -> $1,263
    expect(roundCentsToDollar(126250n)).toBe(126300n);
    expect(formatCentsDisplay(-roundCentsToDollar(126250n))).toBe("-$1,263");
    expect(roundCentsToDollar(126249n)).toBe(126200n);
  });
});

/** UTC-safe date formatting. Seeded dates are stored at UTC midnight, so we
 *  format in UTC to avoid local-timezone off-by-one (e.g. "Nov 30" -> "Nov 29"). */
const toDate = (d: Date | string) => (typeof d === "string" ? new Date(d) : d);

export const fmtDate = (d: Date | string) =>
  toDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export const fmtMonthDay = (d: Date | string) =>
  toDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const fmtMonthYear = (d: Date | string) =>
  toDate(d).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export const utcYear = (d: Date | string) => toDate(d).getUTCFullYear();

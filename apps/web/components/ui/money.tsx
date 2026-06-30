import clsx from "clsx";
import { formatCentsDisplay } from "@fl/core";

/** Renders integer cents (as bigint or numeric string) to $, colored +/-.
 *  Uses the display formatter that omits trailing ".00" to match the original UI. */
export function Money({ cents, sign = false, className }: { cents: bigint | string; sign?: boolean; className?: string }) {
  const v = typeof cents === "string" ? BigInt(cents) : cents;
  return (
    <span className={clsx("font-serif tabular-nums", v < 0n ? "text-negative" : sign ? "text-positive" : "", className)}>
      {formatCentsDisplay(v, { sign })}
    </span>
  );
}

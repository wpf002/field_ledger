/** Acreflow logo mark — abstract "flowing acres": three flowing strokes on a
 *  forest-green tile, the top one Wheat Gold (harvest). Self-contained (the
 *  rounded tile is part of the SVG), so `<BrandMark size={N} />` is all you need. */
export function BrandMark({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className} role="img" aria-label="Acreflow">
      <rect width="512" height="512" rx="112" fill="#1F4D3B" />
      <g fill="none" strokeWidth={30} strokeLinecap="round">
        <path d="M116 196 C 168 162 209 162 256 196 C 303 230 344 230 396 196" stroke="#D4A437" />
        <path d="M116 256 C 168 222 209 222 256 256 C 303 290 344 290 396 256" stroke="#F4F1E6" />
        <path d="M116 316 C 168 282 209 282 256 316 C 303 350 344 350 396 316" stroke="#F4F1E6" />
      </g>
    </svg>
  );
}

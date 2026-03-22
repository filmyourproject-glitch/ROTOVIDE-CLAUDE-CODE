/**
 * SVG grain overlay for bw_film_grain grade.
 * Renders an invisible SVG filter definition + an overlay div.
 */
export function GrainOverlay({ opacity = 0.12 }: { opacity?: number }) {
  return (
    <>
      <svg style={{ display: "none" }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves={3} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feBlend in="SourceGraphic" mode="multiply" />
        </filter>
      </svg>
      <div
        className="absolute inset-0 rounded-lg pointer-events-none z-10"
        style={{ filter: "url(#grain)", opacity, mixBlendMode: "multiply", background: "rgba(128,128,128,0.3)" }}
      />
    </>
  );
}

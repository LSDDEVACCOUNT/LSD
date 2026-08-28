/**
 * The LSD brand mark: a gold coin with an arrow struck into its face.
 *
 * The coin is the £sd reading - librae, solidi, denarii, the money of
 * Sherwood's England - and the arrow struck across it is Loxley's. A
 * hammered gold penny: beaded rim, "LIQUID SUPPLY DOLLAR · £SD" around
 * the edge, the fletched arrow embossed in relief at the centre.
 *
 * The relief is drawn the classic way: the arrow three times, a dark copy
 * shifted toward the lower-right (the struck shadow), a pale copy toward
 * the upper-light, and the face-toned metal on top.
 *
 * Inline SVG so it needs no asset pipeline; `idPrefix` keeps gradient and
 * path ids unique when several marks share a page.
 */

const ARROW = {
  head: "M 160 100 L 128 85 L 137 100 L 128 115 Z",
  shaft: "M 50 96.8 H 132 V 103.2 H 50 Z",
  feathers: [
    "M 76 96.8 L 63 80 L 54 80 L 67 96.8 Z",
    "M 76 103.2 L 63 120 L 54 120 L 67 103.2 Z",
    "M 61 96.8 L 48 80 L 39 80 L 52 96.8 Z",
    "M 61 103.2 L 48 120 L 39 120 L 52 103.2 Z",
  ],
};

function ArrowPaths({ fill, stroke }: { fill: string; stroke?: string }) {
  const sw = stroke ? 1.2 : 0;
  return (
    <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round">
      <path d={ARROW.head} />
      <path d={ARROW.shaft} />
      {ARROW.feathers.map((d) => (
        <path key={d} d={d} />
      ))}
    </g>
  );
}

export function CoinMark({
  className = "",
  idPrefix = "coin",
}: {
  className?: string;
  idPrefix?: string;
}) {
  const face = `${idPrefix}-face`;
  const rim = `${idPrefix}-rim`;
  const glint = `${idPrefix}-glint`;
  const ring = `${idPrefix}-ring`;

  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label="LSD">
      <defs>
        {/* edge: deep bronze, so the disc reads as thick struck metal */}
        <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a5762a" />
          <stop offset="45%" stopColor="#5c3d0e" />
          <stop offset="100%" stopColor="#8a6120" />
        </linearGradient>
        {/* face: warm gold, lit from the upper left */}
        <radialGradient id={face} cx="38%" cy="30%" r="88%">
          <stop offset="0%" stopColor="#fbe491" />
          <stop offset="38%" stopColor="#efc45c" />
          <stop offset="68%" stopColor="#d29e35" />
          <stop offset="88%" stopColor="#b07c22" />
          <stop offset="100%" stopColor="#8f5f16" />
        </radialGradient>
        {/* a soft glint sweeping the upper face */}
        <linearGradient id={glint} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#fff7d6" stopOpacity="0.34" />
          <stop offset="35%" stopColor="#fff7d6" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#fff7d6" stopOpacity="0" />
        </linearGradient>
        {/* circle the legend sits on (drawn from the top, clockwise) */}
        <path id={ring} d="M 100 22 A 78 78 0 1 1 99.99 22" fill="none" />
      </defs>

      {/* edge + face */}
      <circle cx="100" cy="100" r="97" fill={`url(#${rim})`} />
      <circle cx="100" cy="100" r="89" fill={`url(#${face})`} />
      <circle cx="100" cy="100" r="89" fill="none" stroke="rgba(255,240,190,0.5)" strokeWidth="1.2" />

      {/* the legend, struck around the rim */}
      <text
        fontSize="12.5"
        fontFamily="ui-monospace, monospace"
        fontWeight="600"
        letterSpacing="2.5"
        fill="rgba(92,61,14,0.78)"
      >
        <textPath href={`#${ring}`} startOffset="0%">
          · LIQUID SUPPLY DOLLAR · £SD
        </textPath>
      </text>

      {/* beaded inner ring, like a milled penny */}
      <g fill="rgba(92,61,14,0.5)">
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * Math.PI * 2;
          // Fixed precision so the server and client render byte-identical
          // strings - a raw float can serialise differently on each side and
          // trip React's hydration check.
          const cx = (100 + 64 * Math.sin(a)).toFixed(3);
          const cy = (100 - 64 * Math.cos(a)).toFixed(3);
          return <circle key={i} cx={cx} cy={cy} r="1.7" />;
        })}
      </g>

      {/* the struck field the arrow sits in */}
      <circle cx="100" cy="100" r="55" fill="rgba(92,61,14,0.10)" />
      <circle cx="100" cy="100" r="55" fill="none" stroke="rgba(92,61,14,0.28)" strokeWidth="1" />

      {/* the arrow in relief: shadow, highlight, metal */}
      <g transform="rotate(-45 100 100) translate(100 100) scale(0.78) translate(-100 -100)">
        <g transform="translate(3 3)">
          <ArrowPaths fill="rgba(80,50,8,0.55)" />
        </g>
        <g transform="translate(-2.2 -2.2)">
          <ArrowPaths fill="rgba(255,240,190,0.85)" />
        </g>
        <ArrowPaths fill="#c8922a" stroke="rgba(96,62,12,0.55)" />
      </g>

      {/* glint over everything, clipped to the face */}
      <circle cx="100" cy="100" r="89" fill={`url(#${glint})`} />
    </svg>
  );
}

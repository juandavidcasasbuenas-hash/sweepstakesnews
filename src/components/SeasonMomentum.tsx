"use client";

// "SEASON MOMENTUM" — a spoof of the TV broadcast MATCH MOMENTUM graphic.
// Same anatomy as the telly: rainbow-edged navy card, purple→blue header band,
// two crests stacked on the left (you on top, your season rival below), and a
// yellow momentum waveform that swings into your half when you out-scored the
// rival that checkpoint and into theirs when you didn't. Minutes on the axis
// become the season's stages. Every peak is real data from the momentum engine.

import { useId } from "react";
import type { MomentumView } from "@/lib/momentum";

type Pt = { x: number; y: number };

// Catmull-Rom → cubic bezier, so the wave flows like the broadcast mountains
// while still passing exactly through every checkpoint value.
function smooth(points: Pt[], tension = 0.7) {
  if (points.length < 2) return "";
  const seg: string[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension;
    seg.push(`C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`);
  }
  return seg.join(" ");
}

// Crest labels sit in a narrow column; long team names get squeezed onto one
// line with textLength so they never spill under the wave.
function CrestLabel({ x, y, text, fill }: { x: number; y: number; text: string; fill: string }) {
  const maxWidth = 118;
  const estWidth = text.length * 7.4;
  const squeeze = estWidth > maxWidth;
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      className="mo-crest-name"
      fill={fill}
      {...(squeeze
        ? { textLength: maxWidth, lengthAdjust: "spacingAndGlyphs" as const }
        : {})}
    >
      {text}
    </text>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function Crest({
  cx,
  cy,
  r,
  avatar,
  name,
  color,
  clipId,
}: {
  cx: number;
  cy: number;
  r: number;
  avatar: string | null;
  name: string;
  color: string;
  clipId: string;
}) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 3} fill={color} opacity={0.9} />
      <circle cx={cx} cy={cy} r={r + 3} fill="none" stroke="#0b0e1c" strokeWidth={1.5} />
      <clipPath id={clipId}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <image
          href={avatar}
          x={cx - r}
          y={cy - r}
          width={r * 2}
          height={r * 2}
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <>
          <circle cx={cx} cy={cy} r={r} fill={color} />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={r * 0.8}
            fontWeight={800}
            fill="#0b0e1c"
          >
            {initials(name)}
          </text>
        </>
      )}
    </g>
  );
}

export default function SeasonMomentum({ view }: { view: MomentumView }) {
  const uid = useId().replace(/[:]/g, "");
  const { points } = view;

  // ── Frame geometry (viewBox space) ──
  const W = 720;
  const H = 420;
  const plotLeft = 150;
  const plotRight = 696;
  const centerY = 224;
  const amplitude = 120;
  const axisY = 360;

  const stepX =
    points.length > 1 ? (plotRight - plotLeft) / (points.length - 1) : 0;
  const wavePts: Pt[] = points.map((point, index) => ({
    x: plotLeft + stepX * index,
    y: centerY - point.value * amplitude,
  }));

  const line = smooth(wavePts);
  const firstX = wavePts[0]?.x ?? plotLeft;
  const lastX = wavePts[wavePts.length - 1]?.x ?? plotRight;
  // Fill the region between the wave and the centre baseline; where the wave
  // dips below centre the polygon self-crosses and non-zero winding fills the
  // lower lobe too — the mirrored broadcast look.
  const fill = `M ${firstX},${centerY} L ${wavePts[0].x},${wavePts[0].y} ${line} L ${lastX},${centerY} Z`;

  // Axis ticks: first, last, and a few evenly spaced between them.
  const tickIndices = new Set<number>([0, points.length - 1]);
  const desired = Math.min(points.length, 5);
  for (let i = 1; i < desired - 1; i += 1) {
    tickIndices.add(Math.round((i * (points.length - 1)) / (desired - 1)));
  }
  const ticks = Array.from(tickIndices)
    .sort((a, b) => a - b)
    .map((index) => ({ x: plotLeft + stepX * index, label: points[index].label }));

  const you = view.subject.displayName;
  const them = view.opponent.displayName;

  return (
    <svg
      className="mo-svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Season momentum for ${you} versus ${them}`}
    >
      <defs>
        <linearGradient id={`rim-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b3df0" />
          <stop offset="0.35" stopColor="#3b5bff" />
          <stop offset="0.6" stopColor="#00d4c8" />
          <stop offset="0.8" stopColor="#c8ff2f" />
          <stop offset="1" stopColor="#ff2e57" />
        </linearGradient>
        <linearGradient id={`hdr-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6a24b8" />
          <stop offset="1" stopColor="#2438d8" />
        </linearGradient>
        <linearGradient id={`strip-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b3df0" />
          <stop offset="0.4" stopColor="#3b5bff" />
          <stop offset="0.7" stopColor="#f2e85c" />
          <stop offset="1" stopColor="#ff2e57" />
        </linearGradient>
        <linearGradient id={`wave-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdf5a0" />
          <stop offset="0.5" stopColor="#f2e85c" />
          <stop offset="1" stopColor="#d8c520" />
        </linearGradient>
        <clipPath id={`plot-${uid}`}>
          <rect x={plotLeft - 6} y={72} width={plotRight - plotLeft + 12} height={axisY - 72} />
        </clipPath>
        <clipPath id={`reveal-${uid}`}>
          {/* Wiped left→right by CSS to draw the wave on. */}
          <rect
            className="mo-reveal"
            x={plotLeft - 6}
            y={72}
            width={plotRight - plotLeft + 12}
            height={axisY - 72}
          />
        </clipPath>
      </defs>

      {/* Card */}
      <rect x={3} y={3} width={W - 6} height={H - 6} rx={26} fill="#12162a" />
      <rect
        x={3}
        y={3}
        width={W - 6}
        height={H - 6}
        rx={26}
        fill="none"
        stroke={`url(#rim-${uid})`}
        strokeWidth={4}
      />

      {/* Header band */}
      <path
        d={`M 12,38 A 26,26 0 0 1 38,12 L 682,12 A 26,26 0 0 1 708,38 L 708,64 L 12,64 Z`}
        fill={`url(#hdr-${uid})`}
      />
      <path d="M 690,12 L 708,12 L 708,30 Z" fill="#f2e85c" />
      <text
        x={W / 2}
        y={45}
        textAnchor="middle"
        className="mo-title"
        fill="#ffffff"
      >
        SEASON MOMENTUM
      </text>

      {/* Left rainbow strip */}
      <rect x={16} y={80} width={7} height={axisY - 80} rx={3.5} fill={`url(#strip-${uid})`} />

      {/* Crests: you on top, rival below */}
      <Crest
        cx={82}
        cy={162}
        r={30}
        avatar={view.subject.avatar}
        name={you}
        color={view.subject.color}
        clipId={`c1-${uid}`}
      />
      <Crest
        cx={82}
        cy={286}
        r={30}
        avatar={view.opponent.avatar}
        name={them}
        color={view.opponent.color}
        clipId={`c2-${uid}`}
      />
      <CrestLabel x={82} y={206} text={you.toUpperCase()} fill="#e8ecff" />
      <CrestLabel x={82} y={330} text={them.toUpperCase()} fill="#9aa4d4" />

      {/* Plot */}
      <g clipPath={`url(#plot-${uid})`}>
        {/* faint centre baseline shading (static) */}
        <line x1={plotLeft} y1={centerY} x2={plotRight} y2={centerY} stroke="#ffffff" strokeOpacity={0.28} strokeWidth={1.5} />
        {/* wave, drawn on by the reveal wipe */}
        <g clipPath={`url(#reveal-${uid})`}>
          <path d={fill} fill={`url(#wave-${uid})`} fillOpacity={0.9} />
          <path
            className="mo-wave-line"
            d={`M ${wavePts[0].x},${wavePts[0].y} ${line}`}
            fill="none"
            stroke="#fff7b0"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>

      {/* Axis */}
      <line x1={plotLeft} y1={axisY} x2={plotRight} y2={axisY} stroke="#7d86ad" strokeWidth={1.5} />
      {ticks.map((tick) => (
        <g key={`${tick.label}-${tick.x.toFixed(0)}`}>
          <line x1={tick.x} y1={axisY} x2={tick.x} y2={axisY + 7} stroke="#7d86ad" strokeWidth={1.5} />
          <text x={tick.x} y={axisY + 22} textAnchor="middle" className="mo-axis-label" fill="#9aa4d4">
            {tick.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

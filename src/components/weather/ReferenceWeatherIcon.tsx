/**
 * Mini weather glyphs from HERMES Mini App.html `WeatherIcon` — matches ReferenceSkyCanvas keys.
 */

import type { ReactNode } from "react";
import type { ReferenceSkyCondition } from "@/lib/referenceSkyCondition";

interface Props {
  cond: ReferenceSkyCondition;
  size?: number;
}

export function ReferenceWeatherIcon({ cond, size = 28 }: Props) {
  const s = size;
  const ic: Record<ReferenceSkyCondition, ReactNode> = {
    SUNNY: (
      <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden>
        <circle cx="20" cy="20" r="8" fill="#ffd620" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line
            key={a}
            x1={20 + Math.cos((a * Math.PI) / 180) * 11}
            y1={20 + Math.sin((a * Math.PI) / 180) * 11}
            x2={20 + Math.cos((a * Math.PI) / 180) * 15}
            y2={20 + Math.sin((a * Math.PI) / 180) * 15}
            stroke="#ffd620"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ))}
      </svg>
    ),
    PARTLY_CLOUDY: (
      <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden>
        <circle cx="15" cy="16" r="7" fill="#ffd620" opacity=".85" />
        <ellipse cx="24" cy="24" rx="9" ry="6" fill="#7a9ab8" />
        <ellipse cx="18" cy="26" rx="7" ry="5.5" fill="#8aabcc" />
        <ellipse cx="28" cy="26" rx="5" ry="5" fill="#8aabcc" />
      </svg>
    ),
    CLOUDY: (
      <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden>
        <ellipse cx="20" cy="22" rx="12" ry="8" fill="#6a8aa8" />
        <ellipse cx="14" cy="20" rx="8" ry="7" fill="#7a9ab8" />
        <ellipse cx="26" cy="20" rx="7" ry="6.5" fill="#7a9ab8" />
      </svg>
    ),
    RAINY: (
      <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden>
        <ellipse cx="20" cy="16" rx="11" ry="7" fill="#607080" />
        <ellipse cx="14" cy="14" rx="7" ry="6" fill="#6a808e" />
        <ellipse cx="26" cy="14" rx="6" ry="5.5" fill="#6a808e" />
        {[
          [15, 26, 13, 34],
          [20, 25, 18, 33],
          [25, 26, 23, 34],
        ].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#60a0d0" strokeWidth="2" strokeLinecap="round" />
        ))}
      </svg>
    ),
    STORMY: (
      <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden>
        <ellipse cx="20" cy="14" rx="11" ry="7" fill="#4a4060" />
        <ellipse cx="14" cy="12" rx="7" ry="6" fill="#504870" />
        <ellipse cx="26" cy="12" rx="6" ry="5.5" fill="#504870" />
        <polygon points="22,22 18,30 21,30 17,38 25,28 21,28" fill="#e0a030" />
      </svg>
    ),
    SNOWY: (
      <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden>
        <ellipse cx="20" cy="16" rx="11" ry="7" fill="#8090a0" />
        <ellipse cx="14" cy="14" rx="7" ry="6" fill="#90a0b0" />
        {[
          [14, 26],
          [21, 28],
          [28, 26],
          [17, 32],
          [25, 32],
        ].map(([x, y], i) => (
          <g key={i}>
            <line x1={x} y1={y - 3} x2={x} y2={y + 3} stroke="#a8d4f0" strokeWidth="1.8" />
            <line x1={x - 3} y1={y} x2={x + 3} y2={y} stroke="#a8d4f0" strokeWidth="1.8" />
          </g>
        ))}
      </svg>
    ),
    WINDY: (
      <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden>
        <ellipse cx="24" cy="16" rx="9" ry="6" fill="#6a8090" />
        <ellipse cx="18" cy="14" rx="7" ry="5.5" fill="#7a9098" />
        {[
          [8, 22, 28, 22],
          [6, 27, 26, 27],
          [10, 32, 24, 32],
        ].map(([x1, y1, x2, y2], i) => (
          <path
            key={i}
            d={`M${x1},${y1} Q${(x1 + x2) / 2},${y1 - 4} ${x2},${y2}`}
            fill="none"
            stroke="rgba(110,200,180,.8)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ))}
      </svg>
    ),
    FOGGY: (
      <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden>
        {[14, 20, 26, 32].map((y, i) => (
          <rect key={i} x="6" y={y} width="28" height="3" rx="1.5" fill={`rgba(140,160,170,${0.6 - 0.1 * i})`} />
        ))}
      </svg>
    ),
  };
  return <>{ic[cond] ?? ic.CLOUDY}</>;
}

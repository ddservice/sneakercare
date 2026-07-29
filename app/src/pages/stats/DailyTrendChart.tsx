import { useState } from 'react';
import { fc0 } from '../../lib/format';

export interface DailyTrendDatum {
  date: string; // YYYY-MM-DD
  amount: number;
}

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = Math.pow(10, exp);
  const frac = max / base;
  const niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return niceFrac * base;
}

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

const fullDateTh = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

export default function DailyTrendChart({ data, emptyText }: { data: DailyTrendDatum[]; emptyText: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <p className="poc-note">{emptyText}</p>;

  const barW = 26;
  const gap = 12;
  const padL = 54;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const chartH = 220;
  const innerH = chartH - padT - padB;
  const max = niceMax(Math.max(...data.map((d) => d.amount), 1));
  const innerW = data.length * (barW + gap) - gap;
  const svgW = Math.max(padL + innerW + padR, 320);
  const tickCount = 4;
  const labelStep = Math.max(1, Math.ceil(data.length / 12));

  return (
    <div className="trend-chart-scroll">
      <svg width={svgW} height={chartH} viewBox={`0 0 ${svgW} ${chartH}`} role="img" aria-label="กราฟแท่งแนวโน้มรายวัน">
        {Array.from({ length: tickCount + 1 }, (_, i) => {
          const val = (max / tickCount) * i;
          const y = padT + innerH - (innerH * i) / tickCount;
          return (
            <g key={i}>
              <line x1={padL} x2={svgW - padR} y1={y} y2={y} stroke="var(--border)" strokeWidth={1} />
              <text x={padL - 8} y={y + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">{fc0(val)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const x = padL + i * (barW + gap);
          const h = max > 0 ? (d.amount / max) * innerH : 0;
          const y = padT + innerH - h;
          const active = hover === i;
          const tipY = Math.max(y - 36, 2);
          return (
            <g
              key={d.date}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(active ? null : i)}
              style={{ cursor: 'pointer' }}
            >
              <rect x={x} y={y} width={barW} height={Math.max(h, 1)} rx={4} fill={active ? 'var(--primary-hover)' : 'var(--primary)'} />
              {i % labelStep === 0 && (
                <text x={x + barW / 2} y={chartH - 10} textAnchor="middle" fontSize={10} fill="var(--muted)">
                  {shortDate(d.date)}
                </text>
              )}
              {active && (
                <g pointerEvents="none">
                  <rect x={x + barW / 2 - 48} y={tipY} width={96} height={30} rx={6} fill="var(--surface)" stroke="var(--border)" />
                  <text x={x + barW / 2} y={tipY + 13} textAnchor="middle" fontSize={9} fill="var(--muted)">{fullDateTh(d.date)}</text>
                  <text x={x + barW / 2} y={tipY + 25} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--text)">{fc0(d.amount)} ฿</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

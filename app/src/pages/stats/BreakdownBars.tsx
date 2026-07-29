export interface BarDatum {
  label: string;
  value: number;
  sublabel: string;
  color: string;
}

export default function BreakdownBars({ data, emptyText }: { data: BarDatum[]; emptyText: string }) {
  if (!data.length) return <p className="poc-note">{emptyText}</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((d, i) => {
        const pct = Math.round((d.value / max) * 100);
        return (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              <span>{d.label}</span>
              <span style={{ color: d.color }}>{d.sublabel}</span>
            </div>
            <div style={{ background: 'var(--border)', borderRadius: 99, height: 10, overflow: 'hidden' }}>
              <div style={{ background: d.color, width: pct + '%', height: '100%', borderRadius: 99 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

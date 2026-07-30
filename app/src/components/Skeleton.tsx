/** วาง placeholder ระหว่างรอโหลดข้อมูล แทนข้อความ "กำลังโหลด..." เฉยๆ — ใช้ className="skeleton"
 *  (นิยามใน index.css) เป็นตัวเดียวกันทุกจุด ปรับแค่ขนาด/รูปทรงตามบริบทที่ใช้ */

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="init-stock-fieldset">
          <span className="skeleton" style={{ display: 'block', width: '60%', height: 11, marginBottom: 10 }} />
          <span className="skeleton" style={{ display: 'block', width: '85%', height: 20 }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="skeleton" style={{ display: 'block', width: `${85 - i * 6}%`, height: 16 }} />
      ))}
    </div>
  );
}

import type { ComponentType, SVGProps } from 'react';

export interface SubTabDef<K extends string> {
  key: K;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/** แท็บย่อยภายในหน้า (ต่างจาก .tab ของเมนูหลักบน topbar) ใช้แยกหน้าที่มีหลายส่วนย่อยเรียงกันยาวเกินไป
 *  ให้เห็นทีละส่วน — โชว์แค่ส่วนที่เลือกจากฝั่ง caller (ไม่ mount ทุกส่วนพร้อมกัน) */
export default function SubTabs<K extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: SubTabDef<K>[];
  active: K;
  onChange: (key: K) => void;
}) {
  return (
    <div className="subtabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          className={'subtab' + (active === t.key ? ' on' : '')}
          onClick={() => onChange(t.key)}
        >
          <t.Icon className="subtab-icon" />
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

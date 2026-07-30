/** ไอคอนเส้น (stroke-based) แบบง่าย วาดเองด้วย primitive พื้นฐาน (rect/line/circle/polyline) ไม่ได้ก็อปปี้
 *  path มาจากไลบรารีไอคอนไหน — เพื่อไม่ต้องเพิ่ม dependency ใหม่ (ทั้งชุดมีแค่ไม่กี่ตัว ขนาดเล็กกว่าโหลด
 *  ไลบรารีไอคอนทั้งชุดมาก) ทุกตัวใช้ viewBox 24x24, stroke="currentColor" เพื่อรับสีจาก CSS ของจุดที่ใช้ */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IconOverview(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

export function IconSales(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 8h12l-1.2 12.2a1 1 0 0 1-1 .8H8.2a1 1 0 0 1-1-.8L6 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

export function IconStock(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <polygon points="12,3 21,7.5 21,16.5 12,21 3,16.5 3,7.5" />
      <polyline points="3,7.5 12,12 21,7.5" />
      <line x1="12" y1="12" x2="12" y2="21" />
    </svg>
  );
}

export function IconOpex(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M16 6V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2" />
      <circle cx="17" cy="12.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconStats(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <line x1="4" y1="20" x2="20" y2="20" />
      <rect x="6" y="12" width="3" height="8" />
      <rect x="11" y="7" width="3" height="13" />
      <rect x="16" y="4" width="3" height="16" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="18" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16,17 21,12 16,7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

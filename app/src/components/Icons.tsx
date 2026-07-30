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

export function IconUsers(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.5 2.4-6 5.5-6s5.5 2.5 5.5 6" />
      <circle cx="17.5" cy="9" r="2.4" />
      <path d="M14.8 20c0-2.6 1.5-4.3 3.6-4.6" />
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

export function IconHistory(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <polyline points="3,3 3,8 8,8" />
      <polyline points="12,7 12,12 16,14" />
    </svg>
  );
}

export function IconArrowDownTray(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v12" />
      <polyline points="7,10 12,15 17,10" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function IconArrowUpTray(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21V9" />
      <polyline points="7,14 12,9 17,14" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12,7 12,12 16,14" />
    </svg>
  );
}

export function IconTruck(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="1" y="7" width="13" height="10" rx="1" />
      <path d="M14 10h4l3 3v4h-7z" />
      <circle cx="6" cy="19" r="1.7" />
      <circle cx="17.5" cy="19" r="1.7" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <polyline points="3,6 5,6 21,6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.2" y2="16.2" />
    </svg>
  );
}

/** ลูกศรบอกทิศ sort ของหัวตาราง — หมุนด้วย CSS transform ตอน desc แทนที่จะวาดสองแบบ */
export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <polyline points="6,9 12,15 18,9" />
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

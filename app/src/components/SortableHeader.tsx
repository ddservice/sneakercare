import { IconChevronDown } from './Icons';

/** หัวตารางที่กดเรียงลำดับได้ ใช้ร่วมกันได้ทุกตารางในระบบ (ต้องมี key เป็น string เดียวกับที่ caller
 *  ใช้เทียบตอนเรียงข้อมูลเอง — component นี้แค่แสดงผล/ยิง event กลับ ไม่ได้เรียงข้อมูลให้) */
export default function SortableHeader<K extends string>({
  label,
  sortKey,
  active,
  dir,
  onClick,
}: {
  label: string;
  sortKey: K;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: (key: K) => void;
}) {
  return (
    <th>
      <button type="button" className={'sortable-th' + (active ? ' active ' + dir : '')} onClick={() => onClick(sortKey)}>
        {label}
        <IconChevronDown className="sort-icon" />
      </button>
    </th>
  );
}

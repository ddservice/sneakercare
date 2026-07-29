import SaleEntryForm from './sales/SaleEntryForm';
import SaleHistoryList from './sales/SaleHistoryList';

export default function Sales() {
  return (
    <div>
      <p className="poc-note">
        ยังไม่ได้ย้าย: บันทึกร่างอัตโนมัติระหว่างกรอก (draft autosave) และแคตตาล็อกบริการเสริมแบบเลือกจากรายการเดิม
        — ตอนนี้ต้องพิมพ์ชื่อ/ราคาบริการเสริมใหม่ทุกครั้ง — ยอดที่รับเพิ่มทีหลัง (รับชำระ) เปลี่ยนมาอ่าน/เขียนจาก
        Supabase โดยตรงแล้ว (ระบบเดิมใช้ localStorage เป็นหลักซึ่งไม่ sync ข้ามเครื่อง)
      </p>
      <SaleEntryForm />
      <SaleHistoryList />
    </div>
  );
}

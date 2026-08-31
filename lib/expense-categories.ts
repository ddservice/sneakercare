export type ExpenseCategoryKey =
  | "payroll"
  | "facility_utilities"
  | "supplies_cogs"
  | "marketing"
  | "tax_professional"
  | "admin_general";

export interface ExpenseCategoryMeta {
  key: ExpenseCategoryKey;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
  colorClass: {
    badge: string;
    border: string;
    bg: string;
    text: string;
    bar: string;
  };
  presets: string[];
}

export const EXPENSE_CATEGORIES: Record<ExpenseCategoryKey, ExpenseCategoryMeta> = {
  payroll: {
    key: "payroll",
    label: "ค่าแรงและเงินเดือนพนักงาน (Staff & Payroll)",
    shortLabel: "ค่าแรง & เงินเดือน",
    icon: "👥",
    description: "เงินเดือนประจำ, ค่าแรงรายวันทดลองงาน, เบี้ยขยัน, OT, คอมมิชชั่น, ปกส.",
    colorClass: {
      badge: "bg-teal-100 text-teal-800 border-teal-300",
      border: "border-teal-300",
      bg: "bg-teal-50/60",
      text: "text-teal-800",
      bar: "bg-teal-600",
    },
    presets: [
      "เงินเดือนพนักงานประจำ",
      "ค่าจ้างรายวันพนักงานทดลองงาน",
      "เบี้ยขยัน (Diligence)",
      "ค่าล่วงเวลา (OT)",
      "ค่าคอมมิชชั่นยอดขาย",
      "สมทบประกันสังคมนายจ้าง",
    ],
  },
  facility_utilities: {
    key: "facility_utilities",
    label: "สาธารณูปโภคและค่าเช่าร้าน (Utilities & Rent)",
    shortLabel: "สาธารณูปโภค & ค่าเช่า",
    icon: "🏢",
    description: "ค่าน้ำประปา, ค่าไฟฟ้า, ค่าอินเทอร์เน็ต & POS, ค่าเช่าร้าน, ค่าส่วนกลาง",
    colorClass: {
      badge: "bg-amber-100 text-amber-900 border-amber-300",
      border: "border-amber-300",
      bg: "bg-amber-50/60",
      text: "text-amber-900",
      bar: "bg-amber-500",
    },
    presets: [
      "ค่าน้ำประปาประจำเดือน",
      "ค่าไฟฟ้าประจำเดือน",
      "ค่าอินเทอร์เน็ตและโทรศัพท์",
      "ค่าเช่าสถานที่ / ค่าเช่าร้าน",
      "ค่าส่วนกลางและบำรุงรักษาอาคาร",
    ],
  },
  supplies_cogs: {
    key: "supplies_cogs",
    label: "ต้นทุนน้ำยาและวัสดุสิ้นเปลือง (Supplies & Chemicals)",
    shortLabel: "น้ำยา & วัสดุสิ้นเปลือง",
    icon: "🧪",
    description: "น้ำยาซักรองเท้า, สเปรย์กันน้ำ, น้ำยาแก้เหลือง, สีย้อม, กาวซ่อม, แปรง, กล่อง",
    colorClass: {
      badge: "bg-cyan-100 text-cyan-900 border-cyan-300",
      border: "border-cyan-300",
      bg: "bg-cyan-50/60",
      text: "text-cyan-900",
      bar: "bg-cyan-600",
    },
    presets: [
      "น้ำยาซักรองเท้าพรีเมียม / โฟม",
      "สเปรย์เคลือบกันน้ำ (Waterproof)",
      "น้ำยาฟอกแก้ขอบยางเหลือง",
      "สีย้อมหนังและอะคริลิกเพ้นท์",
      "กาวซ่อมพื้นรองเท้า (Shoe Glue)",
      "แปรงขนม้า / ฟองน้ำ / ผ้าไมโครไฟเบอร์",
      "กล่องรองเท้า / ดันทรง / ถุงซิปล็อก",
    ],
  },
  marketing: {
    key: "marketing",
    label: "การตลาดและส่งเสริมการขาย (Marketing & PR)",
    shortLabel: "การตลาด & โฆษณา",
    icon: "📢",
    description: "โฆษณา Facebook/TikTok, บรอดแคสต์ LINE OA, ป้ายไวนิล, สติกเกอร์แบรนด์",
    colorClass: {
      badge: "bg-rose-100 text-rose-800 border-rose-300",
      border: "border-rose-300",
      bg: "bg-rose-50/60",
      text: "text-rose-800",
      bar: "bg-rose-500",
    },
    presets: [
      "ค่าโฆษณา Facebook Ads / TikTok Ads",
      "ค่าแพ็กเกจบรอดแคสต์ LINE Official Account",
      "ค่าพิมพ์ป้ายไวนิล / โบรชัวร์ / สติกเกอร์",
      "ค่าโปรโมชั่นและกิจกรรมการตลาด",
    ],
  },
  tax_professional: {
    key: "tax_professional",
    label: "ภาษี ค่าธรรมเนียม และบัญชี (Taxes & Professional)",
    shortLabel: "ภาษี & ค่าวิชาชีพ",
    icon: "⚖️",
    description: "ภาษีหัก ณ ที่จ่าย (ภ.ง.ด.), ภาษีป้าย, ค่าทำบัญชี/สอบบัญชี, ค่าธรรมเนียม EDC",
    colorClass: {
      badge: "bg-purple-100 text-purple-900 border-purple-300",
      border: "border-purple-300",
      bg: "bg-purple-50/60",
      text: "text-purple-900",
      bar: "bg-purple-600",
    },
    presets: [
      "ภาษีเงินได้หัก ณ ที่จ่าย (ภ.ง.ด.3 / ภ.ง.ด.53)",
      "ภาษีป้ายและภาษีที่ดินสิ่งปลูกสร้าง",
      "ค่าบริการทำบัญชีและผู้สอบบัญชี",
      "ค่าธรรมเนียมธนาคาร / รูดบัตร EDC",
    ],
  },
  admin_general: {
    key: "admin_general",
    label: "ดำเนินงานทั่วไปและเบ็ดเตล็ด (General & Admin)",
    shortLabel: "ดำเนินงาน & เบ็ดเตล็ด",
    icon: "☕",
    description: "ค่าน้ำมันรับ-ส่งรองเท้า, อุปกรณ์สำนักงาน, สวัสดิการเครื่องดื่ม, อบรมช่าง, คืนเงิน",
    colorClass: {
      badge: "bg-slate-100 text-slate-800 border-slate-300",
      border: "border-slate-300",
      bg: "bg-slate-50/80",
      text: "text-slate-800",
      bar: "bg-slate-600",
    },
    presets: [
      "ค่าน้ำมันและค่าเดินทางรับ-ส่งรองเท้า",
      "อุปกรณ์สำนักงาน / สลิปพิมพ์ / หมึก",
      "สวัสดิการน้ำดื่มและของใช้ส่วนกลาง",
      "ค่าฝึกอบรมและพัฒนาทักษะช่าง",
      "ค่าชดเชย / คืนเงินลูกค้ากรณีเคลม",
      "ค่าใช้จ่ายเบ็ดเตล็ดทั่วไป",
    ],
  },
};

export const CATEGORY_LIST = Object.values(EXPENSE_CATEGORIES);

/**
 * Intelligent categorization of raw expense category or name into 1 of the 6 standard buckets
 */
export function classifyExpenseCategory(rawCategory: string = "", name: string = ""): ExpenseCategoryKey {
  const cat = (rawCategory || "").toLowerCase().trim();
  const title = (name || "").toLowerCase().trim();
  const combined = `${cat} ${title}`;

  // 1. Staff & Payroll
  if (
    cat.includes("ค่าแรง") ||
    cat.includes("เงินเดือน") ||
    cat.includes("payroll") ||
    cat.includes("staff") ||
    title.includes("เงินจ่ายพนักงาน") ||
    title.includes("เงินเดือน") ||
    title.includes("ค่าจ้าง") ||
    title.includes("เบี้ยขยัน") ||
    title.includes("ประกันสังคม") ||
    title.includes("ค่าแรง")
  ) {
    return "payroll";
  }

  // 2. Utilities & Rent
  if (
    cat.includes("ค่าเช่า") ||
    cat.includes("ค่าน้ำ") ||
    cat.includes("ค่าไฟ") ||
    cat.includes("อินเทอร์เน็ต") ||
    cat.includes("utilities") ||
    cat.includes("rent") ||
    title.includes("ค่าน้ำ") ||
    title.includes("ค่าไฟ") ||
    title.includes("ค่าเช่า") ||
    title.includes("เน็ต") ||
    title.includes("wifi") ||
    title.includes("3bb") ||
    title.includes("ais") ||
    title.includes("true") ||
    title.includes("ประปา") ||
    title.includes("ไฟฟ้า")
  ) {
    return "facility_utilities";
  }

  // 3. Supplies & Chemical COGS
  if (
    cat.includes("น้ำยา") ||
    cat.includes("เคมี") ||
    cat.includes("supplies") ||
    cat.includes("cogs") ||
    cat.includes("วัสดุ") ||
    title.includes("น้ำยา") ||
    title.includes("เคมี") ||
    title.includes("สเปรย์") ||
    title.includes("แปรง") ||
    title.includes("กาว") ||
    title.includes("สีย้อม") ||
    title.includes("กล่อง") ||
    title.includes("ดันทรง") ||
    title.includes("ผ้า") ||
    title.includes("โฟม") ||
    title.includes("shoe goo") ||
    title.includes("angelus") ||
    title.includes("crep") ||
    title.includes("reshoevn8r") ||
    title.includes("saphir") ||
    title.includes("tarrago")
  ) {
    return "supplies_cogs";
  }

  // 4. Marketing & PR
  if (
    cat.includes("การตลาด") ||
    cat.includes("โฆษณา") ||
    cat.includes("marketing") ||
    cat.includes("ads") ||
    title.includes("การตลาด") ||
    title.includes("โฆษณา") ||
    title.includes("facebook") ||
    title.includes("tiktok") ||
    title.includes("line oa") ||
    title.includes("บรอดแคสต์") ||
    title.includes("ยิงแอด") ||
    title.includes("ป้าย") ||
    title.includes("สติกเกอร์") ||
    title.includes("โบรชัวร์")
  ) {
    return "marketing";
  }

  // 5. Taxes & Professional
  if (
    cat.includes("ภาษี") ||
    cat.includes("tax") ||
    cat.includes("บัญชี") ||
    cat.includes("audit") ||
    cat.includes("ธรรมเนียม") ||
    title.includes("ภาษี") ||
    title.includes("ภ.ง.ด.") ||
    title.includes("ภาษีป้าย") ||
    title.includes("ภาษีที่ดิน") ||
    title.includes("ค่าสอบบัญชี") ||
    title.includes("ค่าทำบัญชี") ||
    title.includes("ธรรมเนียมธนาคาร") ||
    title.includes("edc")
  ) {
    return "tax_professional";
  }

  // 6. General & Admin (Default fallback)
  return "admin_general";
}

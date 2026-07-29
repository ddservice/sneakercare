export interface ExtraServiceCatalogEntry {
  name: string;
  price: number;
}

const KEY = 'sneaker_extra_services_catalog';

export function loadExtraServicesCatalog(): ExtraServiceCatalogEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveExtraServicesCatalog(catalog: ExtraServiceCatalogEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(catalog));
}

/** จำชื่อ+ราคาบริการเสริมที่เคยกรอกไว้ (ต่อเครื่อง/เบราว์เซอร์) เพื่อให้พิมพ์ครั้งถัดไปเลือกจาก
 *  รายการเดิมได้เร็วขึ้น ไม่ต้องพิมพ์ราคาซ้ำ */
export function rememberExtraService(name: string, price: number) {
  const catalog = loadExtraServicesCatalog();
  if (!catalog.some((s) => s.name === name)) {
    catalog.push({ name, price });
    saveExtraServicesCatalog(catalog);
  }
}

export function findExtraServicePrice(name: string): number | null {
  const match = loadExtraServicesCatalog().find((s) => s.name === name);
  return match ? match.price : null;
}

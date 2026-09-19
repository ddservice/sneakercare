/** ภาพผู้ขายตอนออกเอกสาร — หัวบิลไม่ตามการแก้ร้านภายหลัง */

export type SellerSnapshot = {
  v: 1;
  name: string;
  taxId: string;
  address: string;
  phone: string;
  signatoryName: string;
  branchName: string;
};

export type SellerSource = {
  name?: string | null;
  taxId?: string | null;
  address?: string | null;
  phone?: string | null;
  signatoryName?: string | null;
  vatBranchName?: string | null;
};

const MARK = "§SCSELLER§";
const END = "§";

export function planSellerSnapshot(source: SellerSource): SellerSnapshot {
  return {
    v: 1,
    name: String(source.name ?? "").trim(),
    taxId: String(source.taxId ?? "").trim(),
    address: String(source.address ?? "").trim(),
    phone: String(source.phone ?? "").trim(),
    signatoryName: String(source.signatoryName ?? "").trim(),
    branchName: String(source.vatBranchName ?? "").trim(),
  };
}

export function parseSellerSnapshot(notes: string | null | undefined): SellerSnapshot | null {
  const raw = String(notes ?? "");
  const start = raw.indexOf(MARK);
  if (start < 0) return null;
  const jsonStart = start + MARK.length;
  const end = raw.indexOf(END, jsonStart);
  if (end < 0) return null;
  try {
    const parsed = JSON.parse(raw.slice(jsonStart, end)) as Partial<SellerSnapshot>;
    if (!parsed || parsed.v !== 1) return null;
    return planSellerSnapshot({
      name: parsed.name,
      taxId: parsed.taxId,
      address: parsed.address,
      phone: parsed.phone,
      signatoryName: parsed.signatoryName,
      vatBranchName: parsed.branchName,
    });
  } catch {
    return null;
  }
}

export function visibleNotes(notes: string | null | undefined): string {
  const raw = String(notes ?? "");
  const start = raw.indexOf(MARK);
  if (start < 0) return raw.trim();
  return raw.slice(0, start).trim();
}

export function embedSellerSnapshot(
  notes: string | null | undefined,
  seller: SellerSnapshot
): string {
  const visible = visibleNotes(notes);
  const block = `${MARK}${JSON.stringify(seller)}${END}`;
  return visible ? `${visible}\n${block}` : block;
}

export function resolveDocumentSeller(
  notes: string | null | undefined,
  live: SellerSource
): { seller: SellerSnapshot; fromSnapshot: boolean } {
  const stored = parseSellerSnapshot(notes);
  if (stored && stored.name) {
    return { seller: stored, fromSnapshot: true };
  }
  return { seller: planSellerSnapshot(live), fromSnapshot: false };
}

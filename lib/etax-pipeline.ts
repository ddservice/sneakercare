/** ท่อ e-Tax — สร้าง XML/คิว sandbox ได้ แต่ห้ามบอกว่าส่งกรมสรรพากรสำเร็จถ้าไม่มีหลักฐานรับจากช่องทาง */

import { addMoney, moneyNumber } from "./money";

export type ETaxChannel = "unset" | "sandbox" | "live";

export type ETaxOutboxStatus =
  | "invalid"
  | "validated"
  | "queued_sandbox"
  | "needs_channel"
  | "failed"
  | "acknowledged";

export type ETaxSnapshot = {
  docId: string;
  docNumber: string;
  docTypeCode: string;
  sellerTaxId: string;
  sellerName: string;
  buyerTaxId: string;
  buyerName: string;
  subtotal: number;
  vatAmount: number;
  grandTotal: number;
  xml: string;
};

export type ETaxAdapterResult = {
  deliveredToRd: boolean;
  mode: "sandbox" | "live";
  httpStatus?: number;
  acknowledgmentId?: string;
  acknowledgmentProof?: string;
  message: string;
};

export type ETaxAdapter = {
  send: (snapshot: ETaxSnapshot) => ETaxAdapterResult;
};

export type ETaxOutboxItem = {
  id: string;
  snapshot: ETaxSnapshot;
  status: ETaxOutboxStatus;
  deliveredToRd: false | true;
  userStatus: string;
  attempts: number;
  lastMessage: string;
};

const SUCCESS_LABEL = "ส่งสำเร็จ";

/** ปิดช่องทาง live ทั้งระบบ — ต้องมีช่องทาง+credentials+หลักฐานรับก่อนเปิด */
export const LIVE_ETAX_SEND_ALLOWED = false;

export function digits13(value: string): boolean {
  return /^\d{13}$/.test(String(value || "").replace(/\D/g, ""));
}

export function validateETaxSnapshot(snapshot: ETaxSnapshot): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!String(snapshot.docNumber || "").trim()) errors.push("ไม่มีเลขที่เอกสาร");
  if (!String(snapshot.sellerName || "").trim()) errors.push("ไม่มีชื่อผู้ขาย");
  if (!digits13(snapshot.sellerTaxId)) errors.push("เลขผู้เสียภาษีผู้ขายต้อง 13 หลัก");
  if (String(snapshot.buyerTaxId || "").trim() && !digits13(snapshot.buyerTaxId)) {
    errors.push("เลขผู้เสียภาษีผู้ซื้อต้อง 13 หลักถ้าจะกรอก");
  }
  const expected = Number(addMoney(snapshot.subtotal, snapshot.vatAmount));
  if (Math.abs(expected - moneyNumber(Number(snapshot.grandTotal))) >= 0.01) {
    errors.push("ยอดรวมไม่เท่ากับฐานบวก VAT");
  }
  if (!String(snapshot.xml || "").trim()) errors.push("ยังไม่มี XML");
  return errors.length ? { ok: false, errors } : { ok: true };
}

export function userFacingETaxStatus(input: {
  xmlCreated?: boolean;
  httpStatus?: number;
  adapter?: ETaxAdapterResult | null;
}): string {
  if (input.adapter?.deliveredToRd && input.adapter.acknowledgmentId && input.adapter.acknowledgmentProof) {
    return "ช่องทางตอบรับแล้ว (มีหลักฐานรับ)";
  }
  if (input.adapter?.mode === "sandbox" || input.adapter?.deliveredToRd === false) {
    return "คิว sandbox — ไม่ได้ส่งกรมสรรพากร";
  }
  if (input.httpStatus && input.httpStatus >= 200 && input.httpStatus < 300) {
    return "ได้คำตอบ HTTP แต่ยังไม่ใช่หลักฐานรับจากช่องทาง";
  }
  if (input.xmlCreated) return "สร้าง XML แล้ว ยังไม่ได้ส่ง";
  return "ยังไม่พร้อมส่ง";
}

export function mockETaxAdapter(): ETaxAdapter {
  return {
    send(snapshot) {
      return {
        deliveredToRd: false,
        mode: "sandbox",
        httpStatus: 200,
        message: `sandbox queued ${snapshot.docNumber} — not submitted to RD`,
      };
    },
  };
}

export function enqueueETax(input: {
  id: string;
  snapshot: ETaxSnapshot;
  channel: ETaxChannel;
  adapter: ETaxAdapter;
  attempts?: number;
}): ETaxOutboxItem {
  const attempts = (input.attempts ?? 0) + 1;
  const valid = validateETaxSnapshot(input.snapshot);
  if (valid.ok === false) {
    return {
      id: input.id,
      snapshot: input.snapshot,
      status: "invalid",
      deliveredToRd: false,
      userStatus: `ยังไม่ผ่านการตรวจ: ${valid.errors.join(", ")}`,
      attempts,
      lastMessage: valid.errors.join("; "),
    };
  }
  if (input.channel === "unset") {
    return {
      id: input.id,
      snapshot: input.snapshot,
      status: "needs_channel",
      deliveredToRd: false,
      userStatus: "ยังไม่เลือกช่องทางส่ง — XML ถูกตรวจแล้วแต่ยังไม่ส่ง",
      attempts,
      lastMessage: "channel unset",
    };
  }
  if (input.channel === "live" && !LIVE_ETAX_SEND_ALLOWED) {
    return {
      id: input.id,
      snapshot: input.snapshot,
      status: "failed",
      deliveredToRd: false,
      userStatus: "ช่องทาง live ปิดฝั่งเซิร์ฟเวอร์ — ยังไม่ได้ส่งกรมสรรพากร",
      attempts,
      lastMessage: "live send blocked",
    };
  }
  const adapterResult = input.adapter.send(input.snapshot);
  const delivered =
    LIVE_ETAX_SEND_ALLOWED &&
    adapterResult.deliveredToRd === true &&
    Boolean(adapterResult.acknowledgmentId) &&
    Boolean(adapterResult.acknowledgmentProof);
  if (delivered) {
    return {
      id: input.id,
      snapshot: input.snapshot,
      status: "acknowledged",
      deliveredToRd: true,
      userStatus: userFacingETaxStatus({ adapter: adapterResult }),
      attempts,
      lastMessage: adapterResult.message,
    };
  }
  return {
    id: input.id,
    snapshot: input.snapshot,
    status: input.channel === "sandbox" ? "queued_sandbox" : "failed",
    deliveredToRd: false,
    userStatus: userFacingETaxStatus({
      xmlCreated: true,
      httpStatus: adapterResult.httpStatus,
      adapter: { ...adapterResult, deliveredToRd: false },
    }),
    lastMessage: adapterResult.message,
    attempts,
  };
}

export function canRetryETax(item: ETaxOutboxItem): boolean {
  return item.status === "failed" || item.status === "queued_sandbox";
}

export function retryETax(item: ETaxOutboxItem, channel: ETaxChannel, adapter: ETaxAdapter): ETaxOutboxItem {
  if (!canRetryETax(item)) return item;
  return enqueueETax({
    id: item.id,
    snapshot: item.snapshot,
    channel,
    adapter,
    attempts: item.attempts,
  });
}

export function claimsRealSend(statusText: string): boolean {
  return statusText.includes(SUCCESS_LABEL) || statusText === "ส่งแล้ว";
}

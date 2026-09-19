"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireModuleView, requireModuleWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { requireTenantId, tenantFilter } from "@/lib/tenant";
import { generateETaxXML } from "@/lib/smartacc/etax-generator";
import {
  enqueueETax,
  mockETaxAdapter,
  retryETax,
  type ETaxOutboxItem,
  type ETaxSnapshot,
} from "@/lib/etax-pipeline";
import { readETaxOutbox, upsertOutboxItem, writeETaxOutbox } from "@/lib/etax-outbox-store";

export type ETaxQueueInput = {
  docId: string;
  docNumber: string;
  docTypeCode: "380" | "388" | "80" | "T01";
  issueDate: string;
  sellerTaxId: string;
  sellerName: string;
  sellerAddress: string;
  buyerTaxId: string;
  buyerName: string;
  buyerAddress: string;
  subtotal: number;
  vatAmount: number;
  grandTotal: number;
};

function snapshotFromInput(input: ETaxQueueInput): ETaxSnapshot {
  const xml = generateETaxXML({
    docNumber: input.docNumber,
    docTypeCode: input.docTypeCode,
    issueDate: new Date(`${input.issueDate}T00:00:00+07:00`),
    seller: {
      taxId: input.sellerTaxId,
      branchCode: "00000",
      name: input.sellerName,
      address: input.sellerAddress,
    },
    buyer: {
      taxId: input.buyerTaxId,
      branchCode: "00000",
      name: input.buyerName,
      address: input.buyerAddress,
    },
    items: [
      {
        name: "รายการจากเอกสาร",
        quantity: 1,
        unitPrice: input.subtotal,
        lineTotal: input.subtotal,
      },
    ],
    subtotal: input.subtotal,
    vatAmount: input.vatAmount,
    grandTotal: input.grandTotal,
  });
  return {
    docId: input.docId,
    docNumber: input.docNumber,
    docTypeCode: input.docTypeCode,
    sellerTaxId: input.sellerTaxId,
    sellerName: input.sellerName,
    buyerTaxId: input.buyerTaxId,
    buyerName: input.buyerName,
    subtotal: input.subtotal,
    vatAmount: input.vatAmount,
    grandTotal: input.grandTotal,
    xml,
  };
}

export async function fetchETaxOutbox(): Promise<ETaxOutboxItem[]> {
  const profile = await requireProfile();
  requireModuleView(profile, "tax-filing");
  const tenantId = await tenantFilter(profile);
  if (!tenantId) return [];
  return readETaxOutbox(tenantId);
}

export async function queueETaxSandbox(
  input: ETaxQueueInput
): Promise<{ success: true; item: ETaxOutboxItem; outbox: ETaxOutboxItem[] } | { success: false; error: string }> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "tax-filing");
  const tenantId = await requireTenantId(profile);
  const snapshot = snapshotFromInput(input);
  const item = enqueueETax({
    id: input.docId || crypto.randomUUID(),
    snapshot,
    channel: "sandbox",
    adapter: mockETaxAdapter(),
  });
  if (item.deliveredToRd) {
    return { success: false, error: "คิว sandbox ห้ามบันทึกว่ากรมสรรพากรรับแล้ว" };
  }
  const current = await readETaxOutbox(tenantId);
  const next = upsertOutboxItem(current, item);
  const writeError = await writeETaxOutbox(tenantId, next);
  if (writeError) return { success: false, error: `บันทึกคิว e-Tax ไม่สำเร็จ: ${writeError}` };
  await logAudit({
    action: "UPDATE",
    entity: "settings",
    entity_id: `etax:${item.id}`,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: {
      setting: "etax_outbox",
      status: item.status,
      deliveredToRd: item.deliveredToRd,
      userStatus: item.userStatus,
    },
  });
  revalidatePath("/tax-filing");
  return { success: true, item, outbox: next };
}

export async function retryETaxSandbox(
  id: string
): Promise<{ success: true; item: ETaxOutboxItem; outbox: ETaxOutboxItem[] } | { success: false; error: string }> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "tax-filing");
  const tenantId = await requireTenantId(profile);
  const current = await readETaxOutbox(tenantId);
  const existing = current.find((row) => row.id === id);
  if (!existing) return { success: false, error: "ไม่พบรายการในคิว sandbox" };
  const item = retryETax(existing, "sandbox", mockETaxAdapter());
  if (item.deliveredToRd) {
    return { success: false, error: "คิว sandbox ห้ามบันทึกว่ากรมสรรพากรรับแล้ว" };
  }
  const next = upsertOutboxItem(current, item);
  const writeError = await writeETaxOutbox(tenantId, next);
  if (writeError) return { success: false, error: `บันทึกคิว e-Tax ไม่สำเร็จ: ${writeError}` };
  await logAudit({
    action: "UPDATE",
    entity: "settings",
    entity_id: `etax:${item.id}`,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: {
      setting: "etax_outbox",
      retry: true,
      status: item.status,
      deliveredToRd: item.deliveredToRd,
      attempts: item.attempts,
    },
  });
  revalidatePath("/tax-filing");
  return { success: true, item, outbox: next };
}

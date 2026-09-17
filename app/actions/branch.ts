"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ACTIVE_BRANCH_COOKIE } from "@/lib/branch";
import { requireProfile, requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/errors";

export async function setActiveBranch(branchId: string) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const id = branchId.trim();
  const cookieStore = await cookies();

  if (!id) {
    cookieStore.delete(ACTIVE_BRANCH_COOKIE);
  } else {
    const supabase = await createClient();
    const { data } = await supabase.from("branches").select("id").eq("id", id).maybeSingle();
    if (!data) {
      cookieStore.delete(ACTIVE_BRANCH_COOKIE);
    } else {
      cookieStore.set(ACTIVE_BRANCH_COOKIE, id, {
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  // บังคับให้ layout + ทุกหน้าที่อ่านคุกกี้นี้วาดใหม่ — ฝั่ง client ยังต้อง router.refresh()
  // ต่อด้วย เพราะ RSC ในรอบเดียวกับ Server Action มักยังเห็นคุกกี้ชุดเก่า
  revalidatePath("/", "layout");
}

export type ManagedBranch = {
  id: string;
  name: string;
  tenantId: string;
  tenantName: string;
  address: string;
  phone: string;
  openTime: string;
  closeTime: string;
  isActive: boolean;
};

export type ManagedTenant = {
  id: string;
  name: string;
};

function normalizeHm(value: string, fallback: string) {
  const v = value.trim();
  return /^\d{1,2}:\d{2}$/.test(v) ? v.slice(-5).padStart(5, "0") : fallback;
}

export async function fetchManagedBranches(): Promise<{
  branches: ManagedBranch[];
  tenants: ManagedTenant[];
}> {
  const profile = await requireProfile();
  requireAdmin(profile);
  const supabase = createAdminClient();

  const selectWithHours =
    "id, name, tenant_id, address, phone, is_active, open_time, close_time";
  let { data: rows, error } = await supabase
    .from("inv_branches")
    .select(selectWithHours)
    .order("name");

  if (error) {
    ({ data: rows, error } = await supabase
      .from("inv_branches")
      .select("id, name, tenant_id, address, phone, is_active")
      .order("name"));
  }
  if (error || !rows) return { branches: [], tenants: [] };

  const tenantIds = [...new Set(rows.map((r) => r.tenant_id).filter(Boolean))];
  const { data: tenantRows } = tenantIds.length
    ? await supabase.from("tenants").select("id, name").in("id", tenantIds)
    : { data: [] as { id: string; name: string }[] };
  const tenantNameById = new Map((tenantRows ?? []).map((t) => [t.id, t.name]));

  const mine =
    profile.role === "super_admin"
      ? rows
      : rows.filter((r) => r.tenant_id === profile.tenant_id);

  const branches: ManagedBranch[] = mine.map((r) => {
    const row = r as typeof r & { open_time?: string | null; close_time?: string | null };
    return {
      id: row.id,
      name: row.name,
      tenantId: row.tenant_id,
      tenantName: tenantNameById.get(row.tenant_id) ?? "—",
      address: row.address ?? "",
      phone: row.phone ?? "",
      openTime: row.open_time || "09:00",
      closeTime: row.close_time || "20:00",
      isActive: row.is_active !== false,
    };
  });

  const tenants: ManagedTenant[] =
    profile.role === "super_admin"
      ? ((await supabase.from("tenants").select("id, name").eq("is_active", true).order("name")).data ?? []).map(
          (t) => ({ id: t.id, name: t.name })
        )
      : profile.tenant_id
        ? [{ id: profile.tenant_id, name: tenantNameById.get(profile.tenant_id) ?? "กิจการนี้" }]
        : [];

  return { branches, tenants };
}

export async function createBranch(input: {
  name: string;
  tenantId?: string;
  address?: string;
  phone?: string;
  openTime?: string;
  closeTime?: string;
}) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const name = input.name.trim();
  if (!name) return { success: false as const, error: "กรุณาระบุชื่อสาขา" };

  let tenantId: string;
  try {
    tenantId =
      profile.role === "super_admin"
        ? (input.tenantId || "").trim()
        : await requireTenantId(profile);
  } catch (err) {
    return { success: false as const, error: errorMessage(err, "ไม่สามารถระบุกิจการได้") };
  }
  if (!tenantId) {
    return { success: false as const, error: "กรุณาเลือกกิจการที่จะเพิ่มสาขา" };
  }

  const supabase = createAdminClient();
  const payload = {
    name,
    tenant_id: tenantId,
    address: input.address?.trim() || null,
    phone: input.phone?.trim() || null,
    open_time: normalizeHm(input.openTime || "", "09:00"),
    close_time: normalizeHm(input.closeTime || "", "20:00"),
    is_active: true,
  };

  let { data, error } = await supabase.from("inv_branches").insert(payload).select("id, name").single();
  if (error && /open_time|close_time/.test(error.message)) {
    const withoutHours = {
      name: payload.name,
      tenant_id: payload.tenant_id,
      address: payload.address,
      phone: payload.phone,
      is_active: payload.is_active,
    };
    ({ data, error } = await supabase.from("inv_branches").insert(withoutHours).select("id, name").single());
  }
  if (error || !data) {
    return { success: false as const, error: error?.message ?? "เพิ่มสาขาไม่สำเร็จ" };
  }

  await logAudit({
    action: "CREATE",
    entity: "settings",
    entity_id: data.id,
    actor_id: profile.id,
    actor_name: profile.display_name,
    detail: { kind: "branch", name: data.name, tenant_id: tenantId },
  });
  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return { success: true as const, id: data.id };
}

export async function updateBranch(input: {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  openTime?: string;
  closeTime?: string;
  isActive?: boolean;
}) {
  const profile = await requireProfile();
  requireAdmin(profile);

  const name = input.name.trim();
  if (!name) return { success: false as const, error: "กรุณาระบุชื่อสาขา" };

  const supabase = createAdminClient();
  const { data: existing, error: findErr } = await supabase
    .from("inv_branches")
    .select("id, tenant_id, name")
    .eq("id", input.id)
    .maybeSingle();
  if (findErr || !existing) return { success: false as const, error: "ไม่พบสาขา" };
  if (profile.role !== "super_admin" && existing.tenant_id !== profile.tenant_id) {
    return { success: false as const, error: "ไม่มีสิทธิ์แก้สาขาของกิจการอื่น" };
  }

  const patch: Record<string, string | boolean | null> = {
    name,
    address: input.address?.trim() || null,
    phone: input.phone?.trim() || null,
    is_active: input.isActive ?? true,
    open_time: normalizeHm(input.openTime || "", "09:00"),
    close_time: normalizeHm(input.closeTime || "", "20:00"),
  };

  let { error } = await supabase.from("inv_branches").update(patch).eq("id", input.id);
  if (error && /open_time|close_time/.test(error.message)) {
    delete patch.open_time;
    delete patch.close_time;
    ({ error } = await supabase.from("inv_branches").update(patch).eq("id", input.id));
  }
  if (error) return { success: false as const, error: error.message };

  await logAudit({
    action: "UPDATE",
    entity: "settings",
    entity_id: input.id,
    actor_id: profile.id,
    actor_name: profile.display_name,
    detail: { kind: "branch", before: existing.name, after: name },
  });
  revalidatePath("/", "layout");
  revalidatePath("/settings");
  revalidatePath("/roster");
  return { success: true as const };
}

export async function createTenantWithBranch(input: {
  tenantName: string;
  branchName: string;
  openTime?: string;
  closeTime?: string;
}) {
  const profile = await requireProfile();
  requireAdmin(profile);
  if (profile.role !== "super_admin") {
    return { success: false as const, error: "มีแค่ Super Admin ที่เปิดกิจการใหม่ได้" };
  }

  const tenantName = input.tenantName.trim();
  const branchName = input.branchName.trim() || tenantName;
  if (!tenantName) return { success: false as const, error: "กรุณาระบุชื่อกิจการ" };
  if (/sneakercare/i.test(branchName) && !/sneakercare/i.test(tenantName)) {
    return {
      success: false as const,
      error: "อย่าตั้งชื่อสาขาว่า SneakerCare ให้กิจการอื่น — ชื่อนั้นเป็นของสาขาแรก",
    };
  }

  const supabase = createAdminClient();
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .insert({ name: tenantName, is_active: true })
    .select("id, name")
    .single();
  if (tenantErr || !tenant) {
    return { success: false as const, error: tenantErr?.message ?? "สร้างกิจการไม่สำเร็จ" };
  }

  const created = await createBranch({
    name: branchName,
    tenantId: tenant.id,
    openTime: input.openTime,
    closeTime: input.closeTime,
  });
  if (!created.success) {
    return { success: false as const, error: created.error };
  }

  await logAudit({
    action: "CREATE",
    entity: "settings",
    entity_id: tenant.id,
    actor_id: profile.id,
    actor_name: profile.display_name,
    detail: { kind: "tenant", name: tenantName, first_branch: branchName },
  });
  return { success: true as const, tenantId: tenant.id, branchId: created.id };
}

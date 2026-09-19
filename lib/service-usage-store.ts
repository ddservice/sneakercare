import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_USAGE_FLAGS,
  type UsageFlags,
  type UsageFormula,
} from "@/lib/service-usage";

export const SERVICE_USAGE_KEY = "service_usage";

export type ServiceUsageConfig = {
  flags: UsageFlags;
  formulas: UsageFormula[];
};

export function parseServiceUsageConfig(raw: string | null | undefined): ServiceUsageConfig {
  if (!raw || !String(raw).trim()) {
    return { flags: { ...DEFAULT_USAGE_FLAGS }, formulas: [] };
  }
  try {
    const parsed = JSON.parse(String(raw)) as Partial<ServiceUsageConfig>;
    const flags: UsageFlags = {
      autoIssueEnabled: false,
      cutPoint:
        parsed.flags?.cutPoint === "receive" ||
        parsed.flags?.cutPoint === "start" ||
        parsed.flags?.cutPoint === "complete"
          ? parsed.flags.cutPoint
          : null,
    };
    const formulas = Array.isArray(parsed.formulas) ? (parsed.formulas as UsageFormula[]) : [];
    return { flags, formulas };
  } catch {
    return { flags: { ...DEFAULT_USAGE_FLAGS }, formulas: [] };
  }
}

export async function readServiceUsageConfig(tenantId: string): Promise<ServiceUsageConfig> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sc_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", SERVICE_USAGE_KEY)
    .maybeSingle();
  return parseServiceUsageConfig(data?.value);
}

export async function writeServiceUsageConfig(
  tenantId: string,
  config: ServiceUsageConfig
): Promise<string | null> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("sc_settings").upsert(
    {
      key: SERVICE_USAGE_KEY,
      value: JSON.stringify({
        flags: { autoIssueEnabled: false, cutPoint: config.flags.cutPoint },
        formulas: config.formulas,
      }),
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,key" }
  );
  return error?.message ?? null;
}

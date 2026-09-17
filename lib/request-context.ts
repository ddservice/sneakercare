import "server-only";
import { headers } from "next/headers";

export type RequestAuditContext = {
  ip_address: string;
  user_agent: string;
  browser: string;
  device: string;
  page_path: string;
};

function parseBrowser(ua: string): string {
  if (!ua) return "unknown";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  return "other";
}

function parseDevice(ua: string): string {
  if (!ua) return "unknown";
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return "Android phone";
  if (/Android/i.test(ua)) return "Android tablet";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  return "other";
}

function firstIp(value: string | null): string {
  if (!value) return "";
  return value.split(",")[0]?.trim() ?? "";
}

/**
 * อ่าน IP / User-Agent / หน้า จาก request ปัจจุบัน
 * เรียกได้เฉพาะใน Server Action / RSC — นอก request จะคืนค่าว่าง ไม่ throw
 */
export async function getRequestAuditContext(): Promise<RequestAuditContext> {
  const empty: RequestAuditContext = {
    ip_address: "",
    user_agent: "",
    browser: "",
    device: "",
    page_path: "",
  };
  try {
    const h = await headers();
    const ua = h.get("user-agent") ?? "";
    const ip =
      firstIp(h.get("cf-connecting-ip")) ||
      firstIp(h.get("x-real-ip")) ||
      firstIp(h.get("x-forwarded-for")) ||
      "";
    const referer = h.get("referer") ?? "";
    let page_path = "";
    if (referer) {
      try {
        page_path = new URL(referer).pathname;
      } catch {
        page_path = referer.slice(0, 200);
      }
    }
    return {
      ip_address: ip.slice(0, 64) || "unknown",
      user_agent: ua.slice(0, 512),
      browser: parseBrowser(ua),
      device: parseDevice(ua),
      page_path: page_path.slice(0, 200),
    };
  } catch {
    return empty;
  }
}

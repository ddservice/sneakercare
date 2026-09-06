"use client";

import { useState, useTransition } from "react";
import { BellRing, BellOff, Loader2, AlertTriangle } from "lucide-react";
import { setBackupHeartbeatEnabled } from "@/app/actions/shop-settings";

/**
 * สวิตช์เปิด/ปิดข้อความ "สำรองข้อมูลสำเร็จ" ที่ยิงเข้ากลุ่ม Telegram ของร้านตอนตี 3 (DB)
 * และตี 4 (CSV รายเดือน)
 *
 * ปิดได้เฉพาะข้อความ "สำเร็จ" — ข้อความ "ล้มเหลว" ส่งเสมอ ปิดไม่ได้ทุกกรณี
 * (สคริปต์ backup ไม่เช็คสวิตช์นี้ตอนแจ้งความล้มเหลวเลย)
 */
export function BackupNotifyForm({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function toggle(next: boolean) {
    setMessage(null);
    startTransition(async () => {
      const result = await setBackupHeartbeatEnabled(next);
      if (result?.error) {
        setMessage(result.error);
        return;
      }
      setEnabled(next);
      setMessage(
        next
          ? "เปิดแล้ว — คืนนี้จะมีข้อความ “สำรองข้อมูลสำเร็จ” เข้ากลุ่มตามปกติ"
          : "ปิดแล้ว — คืนนี้จะไม่มีข้อความตอนสำเร็จเข้ากลุ่มอีก (ข้อความตอนล้มเหลวยังส่งอยู่)"
      );
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex items-start gap-3">
          {enabled ? (
            <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
          ) : (
            <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          )}
          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-slate-900">
              ข้อความ “สำรองข้อมูลสำเร็จ” ตอนตี 3
            </div>
            <div className="text-xs text-slate-600">
              {enabled
                ? "เปิดอยู่ — ส่งเข้ากลุ่มพนักงานทุกคืนแบบไม่สั่นไม่ดัง (silent)"
                : "ปิดอยู่ — ไม่ส่งข้อความตอนสำเร็จเข้ากลุ่ม"}
            </div>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="เปิดปิดแจ้งเตือนสำรองข้อมูลสำเร็จ"
          disabled={pending}
          onClick={() => toggle(!enabled)}
          className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            enabled ? "bg-teal-600" : "bg-slate-300"
          }`}
        >
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-8" : "translate-x-1"
            }`}
          >
            {pending && <Loader2 className="h-3 w-3 animate-spin text-slate-500" />}
          </span>
        </button>
      </div>

      {message && (
        <p className="text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md px-3 py-2">
          {message}
        </p>
      )}

      <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p>
            <strong>ข้อความ “สำรองข้อมูลล้มเหลว” ปิดไม่ได้</strong> และจะยังส่งเข้ากลุ่มแบบดังปกติเสมอ
            เพราะเป็นเรื่องด่วนจริงที่ต้องมีคนรู้ทันที
          </p>
          <p>
            เมื่อปิดสวิตช์นี้ ระบบยังบันทึกผลการสำรองข้อมูลลงไฟล์ล็อกบนเซิร์ฟเวอร์
            (<code className="font-mono">/var/log/rrs-backup.log</code>) ทุกคืนเหมือนเดิม ตรวจย้อนหลังได้
            แต่จะ<strong>ไม่มีสัญญาณเตือนถ้า cron หยุดทำงานทั้งตัว</strong> เพราะ “ไม่มีข้อความ”
            กลายเป็นสภาพปกติไปแล้ว — แนะนำให้เปิดกลับเป็นระยะเพื่อยืนยันว่าระบบสำรองข้อมูลยังมีชีวิตอยู่
          </p>
        </div>
      </div>
    </div>
  );
}

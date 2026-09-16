"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * กล่องพื้นหลังมาตรฐานของ modal ที่เขียนเองในโปรเจกต์นี้ (ที่ไม่ได้ใช้ Radix Dialog)
 *
 * ทำไมต้องมี — บทเรียนจาก 2026-09-16: modal สลิปเงินเดือนที่ /expenses สูงกว่าหน้าจอ
 * แล้วแถบปุ่ม "พิมพ์/ปิด" ถูกตัดหลุดจอไป ผู้ใช้จึง **ติดอยู่ในหน้านั้นโดยไม่มีทางออกเลย**
 * เพราะ modal ที่เขียนมือทั้ง 11 ตัวในระบบ ไม่มีตัวไหนปิดด้วย Esc หรือกดพื้นหลังได้
 * ⇒ บั๊กเรื่องตำแหน่งปุ่มกลายเป็นทางตัน แทนที่จะเป็นแค่เรื่องน่ารำคาญ
 *
 * ตัวนี้จึงรวม 3 อย่างที่ modal ทุกตัวควรมีเหมือนกันไว้ที่เดียว:
 *   1. กด Esc แล้วปิด
 *   2. กดพื้นหลังนอกกล่องแล้วปิด (ปิดได้ด้วย dismissOnBackdrop={false})
 *   3. ล็อกไม่ให้หน้าข้างหลังเลื่อนตามขณะ modal เปิดอยู่
 * และคุมคลาสของ backdrop ให้เป็นสูตรเดียวกันทั้งระบบ: `items-start` + `overflow-y-auto`
 * (คู่กับ `my-auto` ที่กล่องเนื้อหา) — **ห้ามกลับไปใช้ `items-center` เดี่ยวๆ**
 * เพราะเมื่อเนื้อหาสูงกว่า viewport ส่วนที่ล้นด้านบนจะเลื่อนไปดูไม่ได้ตลอดกาล
 * (scrollTop ติดลบไม่ได้) — มี `npm run test:modals` กันไว้ไม่ให้ย้อนกลับไปเป็นแบบเดิม
 *
 * ⚠️ จงใจไม่ใช้ Radix `Dialog` กับ modal กลุ่มที่ต้องพิมพ์ (สลิปเงินเดือน/ใบกำกับภาษี/
 * หนังสือรับรองหัก ณ ที่จ่าย) เพราะ Radix มี Portal + overlay ของตัวเอง ซึ่งจะทำให้
 * โครง DOM ที่ `app/globals.css` ใช้เช็คตอนพิมพ์ (`body:has(#print-portal-root) #app-shell`)
 * เปลี่ยนไป แล้วบั๊ก "พิมพ์ซ้ำหลายหน้า" ที่ปิดไปเมื่อ 2026-09-02 จะกลับมาทันที
 */

/** นับจำนวน modal ที่เปิดอยู่ กันกรณีซ้อนกัน — ตัวที่ปิดทีหลังต้องไม่ปลดล็อกให้ตัวที่ยังเปิดอยู่ */
let openModalCount = 0;

export function useModalDismiss(onClose: () => void, { enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return;

    // ผูก listener ใหม่ทุกครั้งที่ onClose เปลี่ยน (ปกติมักเป็น arrow function inline
    // ที่สร้างใหม่ทุก render) — ห้ามเก็บ onClose ลง ref แล้วอ่านผ่าน .current ในนี้
    // เพราะ react-hooks/refs ห้ามอ่าน/เขียน ref.current ระหว่าง render (ตัว assignment
    // เองก็นับว่าเป็นการ "อัปเดตระหว่าง render") ผูก/ถอด listener ใหม่ราคาถูกกว่าที่คิด
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);

    // ล็อกสกรอลล์ด้วย "คลาส" ไม่ใช่ inline style เพราะต้องปลดล็อกตอนพิมพ์
    // (body ที่ overflow:hidden ทำให้เบราว์เซอร์บางตัวตัดเนื้อหาที่เกิน 1 หน้ากระดาษทิ้ง)
    openModalCount += 1;
    document.body.classList.add("modal-scroll-lock");

    return () => {
      window.removeEventListener("keydown", handleKey);
      openModalCount -= 1;
      if (openModalCount <= 0) {
        openModalCount = 0;
        document.body.classList.remove("modal-scroll-lock");
      }
    };
  }, [enabled, onClose]);
}

export function ModalBackdrop({
  onClose,
  className,
  children,
  dismissOnBackdrop = true,
  labelledBy,
}: {
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
  dismissOnBackdrop?: boolean;
  labelledBy?: string;
}) {
  useModalDismiss(onClose);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      // ใช้ onMouseDown ไม่ใช่ onClick: ถ้าผู้ใช้ลากเมาส์เริ่มจากในกล่อง (เช่นเลือกข้อความ)
      // แล้วปล่อยนอกกล่อง onClick จะยิงที่ backdrop แล้วปิด modal ทิ้งทั้งที่ไม่ได้ตั้งใจ
      onMouseDown={(e) => {
        if (!dismissOnBackdrop) return;
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

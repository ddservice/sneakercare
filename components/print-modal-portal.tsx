"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * ห่อ modal ที่ต้องพิมพ์ (backdrop + .printable-area) ให้ portal ไปที่ document.body ตรงๆ
 * แทนที่จะ render อยู่ในตำแหน่งเดิมของ DOM tree
 *
 * ทำไม: ถ้า modal ยังเป็นลูกของ ancestor ที่มี backdrop-blur/filter/transform (เช่น <header>
 * ที่ใช้ backdrop-blur-sm) CSS spec จะสร้าง containing block ใหม่ให้ลูกที่เป็น position:fixed
 * ทุกตัว — .printable-area ข้างในจะไปยึด "inset:0" กับกรอบของ ancestor นั้นแทนที่จะยึดกับทั้งหน้า
 * กระดาษ ทำให้พิมพ์ออกมาผิดตำแหน่ง/ผิดขนาด หรือปนกับเนื้อหาอื่นบนหน้า — เจอบั๊กคลาสเดียวกันนี้แล้ว
 * ครั้งหนึ่งกับ MobileNav drawer (ดู CLAUDE.md 2026-09-01) modal พิมพ์เอกสารเองก็มี
 * backdrop-blur-xs อยู่ที่ตัว backdrop ด้วย จึงเข้าข่ายเดียวกัน
 */
export function PrintModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  // ต้องรอ mount ก่อนถึงจะเรียก document.body ได้ (ไม่มีตอน SSR และกัน hydration mismatch)
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}

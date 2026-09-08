"use client";

import { useSyncExternalStore } from "react";

// ไม่มีอะไรให้ subscribe จริง — ค่านี้เปลี่ยนครั้งเดียวตอน hydrate เสร็จ
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * คืน `false` ตอน SSR และตอน hydrate รอบแรก · คืน `true` หลังจากนั้น
 *
 * ใช้กับคอมโพเนนต์ที่ต้องรอ `document`/`window` (เช่น createPortal) หรือค่าที่เซิร์ฟเวอร์
 * ไม่มีทางรู้ (ธีมของผู้ใช้) เพื่อกัน hydration mismatch
 *
 * ⚠️ ทำไมไม่ใช้ `useState(false)` + `useEffect(() => setMounted(true), [])` แบบเดิม:
 * เป็นการ setState ใน effect ซึ่งทำให้ render สองรอบทุกครั้ง และ `react-hooks/set-state-in-effect`
 * ก็ฟ้องเป็น error จริง (CI แดง) — `useSyncExternalStore` ให้ผลเหมือนกันเป๊ะแต่เป็นวิธีที่
 * React ออกแบบมาสำหรับกรณีนี้โดยตรง
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

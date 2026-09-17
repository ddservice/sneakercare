/**
 * ดาวน์โหลดไฟล์จากฝั่งเบราว์เซอร์
 *
 * `a.click()` โดยไม่แปะ `<a>` เข้า DOM จะไม่มีไฟล์ใน Safari / บาง Chrome
 * (อาการ: กดแล้วไม่มีอะไรเกิดขึ้น)
 */
export function downloadTextFile(
  content: string,
  filename: string,
  mime = "text/plain;charset=utf-8"
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

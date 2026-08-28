import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  hasNext,
  hasPrev,
  rangeLabel,
  totalPages,
  type PageInfo,
} from "@/lib/pagination";

type PaginationProps = {
  info: PageInfo;
  /** path ของหน้านั้น เช่น "/history" */
  basePath: string;
  /**
   * query param อื่นที่ต้องคงไว้ตอนเปลี่ยนหน้า (ตัวกรองวันที่ ฯลฯ)
   * ค่า undefined/ว่าง จะถูกตัดทิ้งเพื่อไม่ให้ URL รก
   */
  params?: Record<string, string | undefined>;
};

function hrefFor(basePath: string, page: number, params?: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) search.set(key, value);
  }
  // หน้า 1 ไม่ต้องใส่ ?page=1 ให้ URL สะอาดและ share ได้สวย
  if (page > 1) search.set("page", String(page));
  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({ info, basePath, params }: PaginationProps) {
  const prev = hasPrev(info);
  const next = hasNext(info);
  const pages = totalPages(info);

  // ไม่มีอะไรให้กดและอยู่หน้าแรก = ไม่ต้องแสดงแถบนี้ให้เกะกะ
  if (!prev && !next && info.page === 1) {
    return <p className="mt-3 text-sm text-muted-foreground">{rangeLabel(info)}</p>;
  }

  const linkClass = cn(buttonVariants({ variant: "outline", size: "sm" }));
  const disabledClass = cn(linkClass, "pointer-events-none opacity-50");

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {rangeLabel(info)}
        {pages !== null && pages > 1 ? ` · หน้า ${info.page} จาก ${pages}` : ""}
      </p>
      <div className="flex items-center gap-2">
        {prev ? (
          <Link href={hrefFor(basePath, info.page - 1, params)} className={linkClass} rel="prev">
            ← ก่อนหน้า
          </Link>
        ) : (
          <span className={disabledClass} aria-disabled="true">
            ← ก่อนหน้า
          </span>
        )}
        {next ? (
          <Link href={hrefFor(basePath, info.page + 1, params)} className={linkClass} rel="next">
            ถัดไป →
          </Link>
        ) : (
          <span className={disabledClass} aria-disabled="true">
            ถัดไป →
          </span>
        )}
      </div>
    </div>
  );
}

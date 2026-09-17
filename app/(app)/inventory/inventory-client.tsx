"use client";

import { useState, useTransition, useMemo } from "react";
import {
  updateInventoryItem,
  createInventoryItem,
  deleteInventoryItem,
  toggleItemAlertMute,
} from "@/app/actions/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  PackagePlus,
  AlertTriangle,
  Search,
  Edit2,
  Trash2,
  X,
  Check,
  Download,
  Bell,
  BellOff,
} from "lucide-react";
import { ModalBackdrop } from "@/components/modal-shell";
import { InventoryShell } from "@/components/inventory-shell";
import type { Role } from "@/lib/permissions";

export type InventoryRow = {
  id: string;
  item_id: string;
  name: string;
  item_type: string;
  category: string;
  base_unit: string;
  purchase_unit: string;
  current_qty: number;
  min_stock_level: number;
  avg_unit_cost: number;
  total_value: number;
  is_low_stock: boolean;
  is_active: boolean;
  /** ปิดแจ้งเตือนสต๊อกต่ำเฉพาะรายการนี้ — เช่น ของใช้ภายในร้านที่ไม่ต้องเติมตามรอบ
   * หรือของที่ตั้งใจสั่งทีละน้อยจนติดขั้นต่ำเป็นปกติ ไม่ใช่ของหมดจริง */
  alert_muted: boolean;
};

export function InventoryClient({
  initialItems,
  isCostVisible,
  canEdit,
  role,
}: {
  initialItems: InventoryRow[];
  isCostVisible: boolean;
  canEdit: boolean;
  role: Role;
}) {
  const [items, setItems] = useState<InventoryRow[]>(initialItems);
  const [isPending, startTransition] = useTransition();

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<InventoryRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editQty, setEditQty] = useState<number>(0);
  const [editCost, setEditCost] = useState<number>(0);
  const [editMin, setEditMin] = useState<number>(1);
  const [editMuted, setEditMuted] = useState<boolean>(false);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("น้ำยาทำความสะอาด");
  const [newUnit, setNewUnit] = useState("ขวด");
  const [newQty, setNewQty] = useState<number>(0);
  const [newCost, setNewCost] = useState<number>(0);
  const [newMin, setNewMin] = useState<number>(5);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return Array.from(set);
  }, [items]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchCat = categoryFilter === "all" || item.category === categoryFilter;
      const matchLow = !filterLowStockOnly || item.is_low_stock;
      return matchSearch && matchCat && matchLow;
    });
  }, [items, searchTerm, categoryFilter, filterLowStockOnly]);

  // Summary Metrics
  const lowStockCount = items.filter((i) => i.is_low_stock).length;
  const totalValuation = items.reduce((acc, row) => acc + (row.total_value || 0), 0);

  // Open Edit Modal
  function handleOpenEdit(item: InventoryRow) {
    setEditingItem(item);
    setEditName(item.name);
    setEditCategory(item.category || "ทั่วไป");
    setEditUnit(item.base_unit || "ชิ้น");
    setEditQty(item.current_qty);
    setEditCost(item.avg_unit_cost);
    setEditMin(item.min_stock_level);
    setEditMuted(item.alert_muted);
  }

  // สลับสถานะ "ปิดแจ้งเตือน" แบบเร็ว — ไม่ต้องเปิด modal แก้ไขทั้งหมดถ้าแค่จะปิด/เปิดแจ้งเตือน
  function handleToggleMute(item: InventoryRow) {
    const nextMuted = !item.alert_muted;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, alert_muted: nextMuted } : i))
    );
    startTransition(async () => {
      const res = await toggleItemAlertMute(item.item_id, nextMuted);
      if (res.success) {
        toast.success(
          nextMuted
            ? `ปิดแจ้งเตือนสต๊อกต่ำของ "${item.name}" แล้ว`
            : `เปิดแจ้งเตือนสต๊อกต่ำของ "${item.name}" อีกครั้ง`
        );
      } else {
        // ย้อนกลับถ้าบันทึกไม่สำเร็จ ไม่ให้ UI ค้างสถานะที่ยังไม่ได้บันทึกจริง
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, alert_muted: item.alert_muted } : i))
        );
        toast.error(res.error || "เปลี่ยนสถานะการแจ้งเตือนไม่สำเร็จ");
      }
    });
  }

  function handleCloseEdit() {
    setEditingItem(null);
  }

  // Save Edit
  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem) return;
    if (!editName.trim()) {
      toast.error("กรุณาระบุชื่อสินค้า");
      return;
    }

    startTransition(async () => {
      const res = await updateInventoryItem({
        id: editingItem.id,
        name: editName.trim(),
        category: editCategory.trim(),
        base_unit: editUnit.trim(),
        current_qty: editQty,
        ...(isCostVisible ? { avg_unit_cost: editCost } : {}),
        min_stock_level: editMin,
      });

      if (!res.success) {
        toast.error(res.error || "เกิดข้อผิดพลาดในการแก้ไข");
        return;
      }

      // สถานะแจ้งเตือนบันทึกแยกจากฟิลด์อื่น (คนละตาราง/action) — ยิงต่อเมื่อค่าเปลี่ยนจริงเท่านั้น
      let muteError: string | undefined;
      if (editMuted !== editingItem.alert_muted) {
        const muteRes = await toggleItemAlertMute(editingItem.item_id, editMuted);
        if (!muteRes.success) muteError = muteRes.error;
      }

      if (!muteError) {
        toast.success(`แก้ไขข้อมูล "${editName}" สำเร็จเรียบร้อย`);
        setItems((prev) =>
          prev.map((i) =>
            i.id === editingItem.id
              ? {
                  ...i,
                  name: editName.trim(),
                  category: editCategory.trim(),
                  base_unit: editUnit.trim(),
                  current_qty: editQty,
                  avg_unit_cost: isCostVisible ? editCost : i.avg_unit_cost,
                  min_stock_level: editMin,
                  total_value: editQty * (isCostVisible ? editCost : i.avg_unit_cost),
                  is_low_stock: editQty <= editMin,
                  alert_muted: editMuted,
                }
              : i
          )
        );
        handleCloseEdit();
      } else {
        // ข้อมูลสินค้าหลักบันทึกไปแล้ว แค่สถานะแจ้งเตือนล้มเหลว — บอกให้ชัดว่าอันไหนติด
        toast.error(muteError || "บันทึกข้อมูลสินค้าสำเร็จ แต่ตั้งค่าแจ้งเตือนไม่สำเร็จ");
      }
    });
  }

  // Save Create
  function handleSaveCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error("กรุณาระบุชื่อสินค้า");
      return;
    }

    startTransition(async () => {
      const res = await createInventoryItem({
        name: newName.trim(),
        category: newCategory.trim(),
        base_unit: newUnit.trim(),
        current_qty: newQty,
        ...(isCostVisible ? { avg_unit_cost: newCost } : {}),
        min_stock_level: newMin,
      });

      // id มาจาก view จึงเป็น nullable — ถ้าไม่มี id จะใช้เป็น key ของแถวไม่ได้
      if (res.success && res.item?.id) {
        // เก็บ id ใส่ตัวแปรก่อน: TypeScript narrow ค่าข้าม closure ของ setItems ให้ไม่ได้
        const newItemId = res.item.id;
        toast.success(`เพิ่มสินค้า "${newName}" เรียบร้อย`);
        setItems((prev) => [
          {
            id: newItemId,
            item_id: newItemId,
            name: newName.trim(),
            category: newCategory.trim(),
            item_type: "inventory",
            base_unit: newUnit.trim(),
            purchase_unit: newUnit.trim(),
            current_qty: newQty,
            min_stock_level: newMin,
            avg_unit_cost: newCost,
            total_value: newQty * newCost,
            is_low_stock: newQty <= newMin,
            is_active: true,
            alert_muted: false,
          },
          ...prev,
        ]);
        setIsCreateOpen(false);
        setNewName("");
        setNewQty(0);
        setNewCost(0);
      } else {
        toast.error(res.error || "เกิดข้อผิดพลาดในการสร้างสินค้า");
      }
    });
  }

  // Delete Item
  function handleDeleteItem(item: InventoryRow) {
    if (!confirm(`คุณต้องการลบ/ปิดการใช้งาน "${item.name}" ใช่หรือไม่?`)) return;

    startTransition(async () => {
      const res = await deleteInventoryItem(item.id);
      if (res.success) {
        toast.success(`ลบรายการ "${item.name}" เรียบร้อย`);
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      } else {
        toast.error("ไม่สามารถลบรายการได้");
      }
    });
  }

  // Export to Excel
  function exportToExcel() {
    const data = items.map((i, idx) => {
      const row: Record<string, string | number> = {
        ลำดับ: idx + 1,
        รายการสินค้า: i.name,
        หมวดหมู่: i.category || "ทั่วไป",
        หน่วยนับ: i.base_unit,
        จำนวนคงเหลือ: i.current_qty,
        จุดสั่งซื้อขั้นต่ำ: i.min_stock_level,
        สถานะ: i.is_low_stock ? "ใกล้หมด" : "ปกติ",
      };
      if (isCostVisible) {
        row["ราคาต้นทุนต่อหน่วย"] = i.avg_unit_cost;
        row["มูลค่าสต๊อกรวม"] = i.total_value;
      }
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    XLSX.writeFile(wb, `DD-Management_Inventory_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("ดาวน์โหลดไฟล์ Excel คลังสินค้าเรียบร้อย");
  }

  return (
    <InventoryShell
      title="คลังสินค้า"
      description={
        isCostVisible
          ? "ดูยอดคงเหลือ จุดสั่งซื้อขั้นต่ำ และต้นทุนถัวเฉลี่ยของสาขาที่เลือก"
          : "ดูยอดคงเหลือและจุดสั่งซื้อขั้นต่ำของสาขาที่เลือก"
      }
      role={role}
      actions={
        <>
          {canEdit && (
            <Button onClick={() => setIsCreateOpen(true)} className="h-9 gap-1.5 text-sm">
              <PackagePlus className="h-4 w-4" /> เพิ่มสินค้า
            </Button>
          )}
          <Button variant="outline" onClick={exportToExcel} className="h-9 gap-1.5 text-sm">
            <Download className="h-4 w-4" /> ส่งออก Excel
          </Button>
        </>
      }
    >
      <div className="space-y-5">

      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => {
            setFilterLowStockOnly(false);
            setCategoryFilter("all");
            setSearchTerm("");
          }}
          className={`rounded-2xl border bg-white p-4 text-left transition-colors dark:bg-slate-900 ${
            !filterLowStockOnly && categoryFilter === "all" && !searchTerm
              ? "border-emerald-300 ring-1 ring-emerald-200 dark:border-emerald-700"
              : "border-slate-200 hover:border-slate-300 dark:border-slate-800"
          }`}
        >
          <p className="text-xs text-slate-500">รายการทั้งหมด</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
            {items.length}
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            const nextState = !filterLowStockOnly;
            setFilterLowStockOnly(nextState);
            if (nextState) {
              setCategoryFilter("all");
              setSearchTerm("");
            }
          }}
          className={`rounded-2xl border bg-white p-4 text-left transition-colors dark:bg-slate-900 ${
            filterLowStockOnly
              ? "border-rose-300 ring-1 ring-rose-200 dark:border-rose-800"
              : "border-slate-200 hover:border-slate-300 dark:border-slate-800"
          }`}
        >
          <p className="text-xs text-slate-500">ใกล้หมด</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${lowStockCount > 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {lowStockCount}
          </p>
        </button>

        {isCostVisible ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs text-slate-500">มูลค่าคลัง (ต้นทุน)</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
              ฿{totalValuation.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </p>
          </div>
        ) : (
          <div className="hidden sm:block" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            placeholder="ค้นหาชื่อหรือหมวดหมู่"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 bg-white pl-9 dark:bg-slate-900"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <option value="all">ทุกหมวดหมู่</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant={filterLowStockOnly ? "default" : "outline"}
          onClick={() => {
            const nextState = !filterLowStockOnly;
            setFilterLowStockOnly(nextState);
            if (nextState) {
              setCategoryFilter("all");
              setSearchTerm("");
            }
          }}
          className={`h-10 gap-1.5 text-sm ${filterLowStockOnly ? "bg-rose-600 hover:bg-rose-500" : ""}`}
        >
          <AlertTriangle className="h-4 w-4" />
          ใกล้หมด
        </Button>
      </div>

      {filterLowStockOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <span>แสดงเฉพาะรายการใกล้หมด · {filteredItems.length} รายการ</span>
          <button
            type="button"
            onClick={() => {
              setFilterLowStockOnly(false);
              setCategoryFilter("all");
              setSearchTerm("");
            }}
            className="font-medium underline-offset-2 hover:underline"
          >
            แสดงทั้งหมด
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:border-slate-800">
                <th className="px-4 py-3 font-medium">สินค้า</th>
                <th className="px-3 py-3 font-medium">หมวดหมู่</th>
                <th className="px-3 py-3 text-right font-medium">คงเหลือ</th>
                <th className="px-3 py-3 text-right font-medium">ขั้นต่ำ</th>
                {isCostVisible && <th className="px-3 py-3 text-right font-medium">ต้นทุน/หน่วย</th>}
                {isCostVisible && <th className="px-3 py-3 text-right font-medium">มูลค่ารวม</th>}
                <th className="px-3 py-3 text-center font-medium">สถานะ</th>
                <th className="px-4 py-3 text-right font-medium"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                    item.is_low_stock && !item.alert_muted ? "bg-rose-50/40 dark:bg-rose-950/20" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{item.name}</div>
                    <div className="text-xs text-slate-400">{item.base_unit}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-400">{item.category || "ทั่วไป"}</td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums ${
                      item.is_low_stock ? "font-semibold text-rose-600" : "text-slate-900 dark:text-slate-100"
                    }`}
                  >
                    {item.current_qty.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-500">{item.min_stock_level}</td>
                  {isCostVisible && (
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                      {item.avg_unit_cost.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                  )}
                  {isCostVisible && (
                    <td className="px-3 py-3 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {item.total_value.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                  )}
                  <td className="px-3 py-3 text-center">
                    {item.is_low_stock ? (
                      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                        ใกล้หมด
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        ปกติ
                      </span>
                    )}
                    {item.alert_muted && (
                      <span className="mt-1 flex items-center justify-center gap-0.5 text-[11px] text-slate-400">
                        <BellOff className="h-3 w-3" /> ปิดแจ้ง
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleMute(item)}
                          className={`h-8 w-8 p-0 ${
                            item.alert_muted ? "text-amber-500 hover:bg-amber-50" : "text-slate-400"
                          }`}
                          title={
                            item.alert_muted
                              ? "เปิดแจ้งเตือนสต๊อกต่ำอีกครั้ง"
                              : "ปิดแจ้งเตือนสต๊อกต่ำ (เช่น ของใช้ในร้าน หรือของที่ตั้งใจสั่งทีละน้อย)"
                          }
                        >
                          {item.alert_muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEdit(item)}
                          className="h-8 gap-1 px-2 text-slate-600"
                        >
                          <Edit2 className="h-3.5 w-3.5" /> แก้ไข
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteItem(item)}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600"
                          title="ลบรายการ"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={isCostVisible ? 8 : 6} className="px-4 py-12 text-center text-slate-400">
                    ไม่พบรายการที่ตรงกับคำค้นหา
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {editingItem && (
        <ModalBackdrop
          onClose={() => handleCloseEdit()}
          dismissOnBackdrop={false}
          className="bg-black/50 backdrop-blur-xs"
        >
          <div className="my-auto w-full max-w-lg space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">แก้ไขสินค้า</h3>
                <p className="mt-0.5 text-sm text-slate-500">{editingItem.name}</p>
              </div>
              <button
                type="button"
                onClick={handleCloseEdit}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  ชื่อสินค้า <span className="text-rose-500">*</span>
                </Label>
                <Input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-10 text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">หมวดหมู่</Label>
                  <Input
                    type="text"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="h-10 text-sm"
                    placeholder="เช่น น้ำยาซัก, อะไหล่"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    หน่วยนับ <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    className="h-10 text-sm"
                    placeholder="ขวด, มล., ชิ้น"
                    required
                  />
                </div>
              </div>

              <div className={`grid gap-3 ${isCostVisible ? "grid-cols-3" : "grid-cols-2"}`}>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    จำนวนคงเหลือ <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    step="any"
                    value={editQty}
                    onChange={(e) => setEditQty(parseFloat(e.target.value) || 0)}
                    className="h-10 text-sm tabular-nums"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">จุดสั่งซื้อขั้นต่ำ</Label>
                  <Input
                    type="number"
                    step="any"
                    value={editMin}
                    onChange={(e) => setEditMin(parseFloat(e.target.value) || 0)}
                    className="h-10 text-sm tabular-nums"
                  />
                </div>
                {isCostVisible && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">ต้นทุน/หน่วย (฿)</Label>
                    <Input
                      type="number"
                      step="any"
                      value={editCost}
                      onChange={(e) => setEditCost(parseFloat(e.target.value) || 0)}
                      className="h-10 text-sm tabular-nums"
                    />
                  </div>
                )}
              </div>

              <label
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm transition-colors ${
                  editMuted
                    ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={editMuted}
                  onChange={(e) => setEditMuted(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 accent-amber-500"
                />
                <span>
                  <span className="flex items-center gap-1 font-medium">
                    {editMuted ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                    ปิดแจ้งเตือนสต๊อกต่ำสำหรับรายการนี้
                  </span>
                  <span className="mt-0.5 block text-xs opacity-80">
                    ใช้เมื่อของชิ้นนี้ตั้งใจสั่งทีละน้อย หรือใช้ในร้านเอง — จะไม่ส่ง Telegram
                    แต่ตารางยังแสดงสถานะใกล้หมดตามปกติ
                  </span>
                </span>
              </label>

              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                ถ้าแก้จำนวนคงเหลือ ระบบจะบันทึกเป็นรายการตรวจนับในประวัติคลังให้อัตโนมัติ
              </p>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={handleCloseEdit} className="h-10">
                  ยกเลิก
                </Button>
                <Button type="submit" disabled={isPending} className="h-10 gap-1.5">
                  {isPending ? "กำลังบันทึก..." : <><Check className="h-4 w-4" /> บันทึก</>}
                </Button>
              </div>
            </form>
          </div>
        </ModalBackdrop>
      )}

      {isCreateOpen && (
        <ModalBackdrop
          onClose={() => setIsCreateOpen(false)}
          dismissOnBackdrop={false}
          className="bg-black/50 backdrop-blur-xs"
        >
          <div className="my-auto w-full max-w-lg space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">เพิ่มสินค้า</h3>
                <p className="mt-0.5 text-sm text-slate-500">บันทึกเข้าแคตตาล็อกของสาขาที่เลือก</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  ชื่อสินค้า <span className="text-rose-500">*</span>
                </Label>
                <Input
                  type="text"
                  placeholder="เช่น น้ำยาขจัดคราบ 500 มล."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-10 text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">หมวดหมู่</Label>
                  <Input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="h-10 text-sm"
                    placeholder="น้ำยา, อะไหล่, บรรจุภัณฑ์"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    หน่วยนับ <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="h-10 text-sm"
                    placeholder="ขวด, มล., ชิ้น"
                    required
                  />
                </div>
              </div>

              <div className={`grid gap-3 ${isCostVisible ? "grid-cols-3" : "grid-cols-2"}`}>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">ยอดยกมาเริ่มต้น</Label>
                  <Input
                    type="number"
                    step="any"
                    value={newQty}
                    onChange={(e) => setNewQty(parseFloat(e.target.value) || 0)}
                    className="h-10 text-sm tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">จุดสั่งซื้อขั้นต่ำ</Label>
                  <Input
                    type="number"
                    step="any"
                    value={newMin}
                    onChange={(e) => setNewMin(parseFloat(e.target.value) || 0)}
                    className="h-10 text-sm tabular-nums"
                  />
                </div>
                {isCostVisible && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">ต้นทุน/หน่วย (฿)</Label>
                    <Input
                      type="number"
                      step="any"
                      value={newCost}
                      onChange={(e) => setNewCost(parseFloat(e.target.value) || 0)}
                      className="h-10 text-sm tabular-nums"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} className="h-10">
                  ยกเลิก
                </Button>
                <Button type="submit" disabled={isPending} className="h-10 gap-1.5">
                  {isPending ? "กำลังบันทึก..." : <><Check className="h-4 w-4" /> เพิ่มสินค้า</>}
                </Button>
              </div>
            </form>
          </div>
        </ModalBackdrop>
      )}
    </InventoryShell>
  );
}

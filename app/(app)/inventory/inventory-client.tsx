"use client";

import { useState, useTransition, useMemo } from "react";
import {
  updateInventoryItem,
  createInventoryItem,
  deleteInventoryItem,
  type InventoryItemInput,
} from "@/app/actions/inventory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  Scale,
  History,
  FileSpreadsheet,
  PackagePlus,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Search,
  Edit2,
  Trash2,
  X,
  Check,
  Download,
  Upload,
  Layers,
  Filter,
} from "lucide-react";
import Link from "next/link";

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
};

export function InventoryClient({
  initialItems,
  isCostVisible,
  canEdit,
}: {
  initialItems: InventoryRow[];
  isCostVisible: boolean;
  canEdit: boolean;
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
        avg_unit_cost: editCost,
        min_stock_level: editMin,
      });

      if (res.success) {
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
                  avg_unit_cost: editCost,
                  min_stock_level: editMin,
                  total_value: editQty * editCost,
                  is_low_stock: editQty <= editMin,
                }
              : i
          )
        );
        handleCloseEdit();
      } else {
        toast.error(res.error || "เกิดข้อผิดพลาดในการแก้ไข");
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
        avg_unit_cost: newCost,
        min_stock_level: newMin,
      });

      if (res.success && res.item) {
        toast.success(`เพิ่มสินค้า "${newName}" เรียบร้อย`);
        setItems((prev) => [
          {
            id: res.item.id,
            item_id: res.item.id,
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
    const data = items.map((i, idx) => ({
      ลำดับ: idx + 1,
      รายการสินค้า: i.name,
      หมวดหมู่: i.category || "ทั่วไป",
      หน่วยนับ: i.base_unit,
      จำนวนคงเหลือ: i.current_qty,
      จุดสั่งซื้อขั้นต่ำ: i.min_stock_level,
      ราคาต้นทุนต่อหน่วย: i.avg_unit_cost,
      มูลค่าสต๊อกรวม: i.total_value,
      สถานะ: i.is_low_stock ? "ใกล้หมด (Low Stock)" : "ปกติ",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    XLSX.writeFile(wb, `SneakerCare_Inventory_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("ดาวน์โหลดไฟล์ Excel คลังสินค้าเรียบร้อย");
  }

  return (
    <div className="space-y-8">
      {/* ── Header Banner ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 p-6 text-white shadow-md">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/30">
            <Boxes className="h-3.5 w-3.5" />
            Inventory & Stock Management
          </div>
          <h2 className="text-2xl font-bold tracking-tight">ระบบบริหารจัดการคลังสินค้า & สต๊อกน้ำยา</h2>
          <p className="text-xs sm:text-sm text-teal-100/80">
            แก้ไขรายการวัสดุ ปรับยอดคงเหลือ ตรวจสอบจุดสั่งซื้อขั้นต่ำ และควบคุมต้นทุนถัวเฉลี่ย
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="bg-emerald-600 font-bold hover:bg-emerald-500 text-white gap-2 shadow-xs text-xs h-9"
            >
              <PackagePlus className="h-4 w-4" /> เพิ่มสินค้าใหม่
            </Button>
          )}
          <Button
            variant="outline"
            onClick={exportToExcel}
            className="bg-white/10 text-white hover:bg-white/20 border-white/20 text-xs gap-1.5 h-9"
          >
            <Download className="h-4 w-4" /> Export Excel
          </Button>
          <Link href="/stock-out">
            <Button className="bg-teal-600 font-bold hover:bg-teal-500 text-white gap-2 shadow-xs text-xs h-9">
              <ArrowUpFromLine className="h-4 w-4" /> เบิกใช้งาน
            </Button>
          </Link>
          <Link href="/stock-in">
            <Button variant="outline" className="bg-white/10 text-white hover:bg-white/20 border-white/20 text-xs gap-1.5 h-9">
              <ArrowDownToLine className="h-4 w-4" /> รับของเข้า
            </Button>
          </Link>
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          onClick={() => {
            setFilterLowStockOnly(false);
            setCategoryFilter("all");
            setSearchTerm("");
          }}
          className={`border-slate-200 shadow-xs cursor-pointer transition-all ${
            !filterLowStockOnly && categoryFilter === "all" && !searchTerm
              ? "ring-2 ring-teal-500 bg-teal-50/40 border-teal-300 shadow-md"
              : "hover:border-teal-300 hover:shadow-xs"
          }`}
          title="คลิกเพื่อแสดงสินค้าทั้งหมด"
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">จำนวนรายการสินค้าทั้งหมด</span>
              <div className="text-2xl font-bold text-slate-900">{items.length} รายการ</div>
              <div className="text-[11px] text-slate-400">ครอบคลุมน้ำยาและอะไหล่ทั้งหมด</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-slate-700">
              <Boxes className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card
          onClick={() => {
            const nextState = !filterLowStockOnly;
            setFilterLowStockOnly(nextState);
            if (nextState) {
              setCategoryFilter("all");
              setSearchTerm("");
            }
          }}
          className={`border-slate-200 shadow-xs cursor-pointer transition-all ${
            filterLowStockOnly
              ? "ring-2 ring-rose-500 bg-rose-50/50 border-rose-300 shadow-md"
              : "hover:border-rose-300 hover:shadow-xs"
          }`}
          title={filterLowStockOnly ? "คลิกเพื่อยกเลิกการกรอง" : "คลิกเพื่อดูเฉพาะรายการใกล้หมด"}
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                สินค้าใกล้หมด (ต่ำกว่า Min Alert)
                {filterLowStockOnly && (
                  <Badge variant="outline" className="text-[10px] bg-rose-600 text-white font-bold px-1.5 py-0 border-rose-700">
                    กำลังแสดงผล
                  </Badge>
                )}
              </span>
              <div className="text-2xl font-bold">
                {lowStockCount > 0 ? (
                  <span className="text-rose-600">{lowStockCount} รายการ</span>
                ) : (
                  <span className="text-emerald-600">พร้อมใช้งานทุกรายการ</span>
                )}
              </div>
              <div className="text-[11px] text-slate-400">
                {filterLowStockOnly ? "คลิกเพื่อยกเลิกการกรอง" : "คลิกเพื่อดูเฉพาะรายการใกล้หมด"}
              </div>
            </div>
            <div
              className={`rounded-xl p-3 ${
                lowStockCount > 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
              }`}
            >
              <AlertTriangle className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {isCostVisible && (
          <Card className="border-slate-200 shadow-xs sm:col-span-2 lg:col-span-1">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">มูลค่าคลังสินค้าคงเหลือ (ต้นทุน)</span>
                <div className="text-2xl font-black text-teal-800 font-mono">
                  ฿{totalValuation.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-slate-400">คำนวณตามต้นทุนถัวเฉลี่ยจริง</div>
              </div>
              <div className="sc-icon-badge sc-icon-badge-primary rounded-xl">
                <TrendingDown className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Search & Filter Toolbar ── */}
      <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative w-64">
              <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-400" />
              <Input
                type="text"
                placeholder="ค้นหาชื่อสินค้า / หมวดหมู่..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 text-xs h-8.5 bg-white"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-8.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-700 focus:outline-none"
            >
              <option value="all">ทุกหมวดหมู่ ({items.length})</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <Button
              type="button"
              variant={filterLowStockOnly ? "default" : "outline"}
              size="sm"
              onClick={() => {
                const nextState = !filterLowStockOnly;
                setFilterLowStockOnly(nextState);
                if (nextState) {
                  setCategoryFilter("all");
                  setSearchTerm("");
                }
              }}
              className={`h-8.5 text-xs font-bold gap-1.5 ${
                filterLowStockOnly ? "bg-rose-600 text-white shadow-xs" : "bg-white text-rose-800 border-rose-200 hover:bg-rose-50"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" /> เฉพาะใกล้หมด ({lowStockCount})
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/history">
              <Button variant="outline" size="sm" className="h-8.5 text-xs gap-1">
                <History className="h-3.5 w-3.5" /> ดูประวัติเบิก-รับ
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* ── Active Low Stock Filter Banner ── */}
      {filterLowStockOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-900 font-medium shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>
              กำลังแสดงเฉพาะสินค้าที่สต๊อกต่ำกว่าหรือเท่ากับเกณฑ์ Min Alert (พบ <strong>{filteredItems.length}</strong> รายการ)
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFilterLowStockOnly(false);
              setCategoryFilter("all");
              setSearchTerm("");
            }}
            className="h-7 text-xs bg-white text-rose-800 border-rose-300 hover:bg-rose-100 font-bold"
          >
            ✕ ล้างตัวกรอง (แสดงทั้งหมด {items.length} รายการ)
          </Button>
        </div>
      )}

      {/* ── Inventory Items Table with Edit Actions ── */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left">รายการสินค้า / วัสดุ</th>
                <th className="px-3 py-3 text-left">หมวดหมู่</th>
                <th className="px-3 py-3 text-right">คงเหลือจริง</th>
                <th className="px-3 py-3 text-right">เกณฑ์ขั้นต่ำ (Min)</th>
                {isCostVisible && <th className="px-3 py-3 text-right">ต้นทุน/หน่วย (฿)</th>}
                {isCostVisible && <th className="px-3 py-3 text-right">มูลค่ารวม (฿)</th>}
                <th className="px-3 py-3 text-center">สถานะ</th>
                <th className="px-4 py-3 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className={`hover:bg-slate-50/80 transition-colors ${
                    item.is_low_stock ? "bg-rose-50/20" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-bold text-slate-900">
                    <div>{item.name}</div>
                    <div className="text-[10px] text-slate-400 font-normal">
                      หน่วยนับ: {item.base_unit}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {item.category || "ทั่วไป"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-sm">
                    <span
                      className={
                        item.is_low_stock
                          ? "text-rose-600 font-black"
                          : "text-slate-900"
                      }
                    >
                      {item.current_qty.toLocaleString()} {item.base_unit}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-slate-500">
                    {item.min_stock_level} {item.base_unit}
                  </td>
                  {isCostVisible && (
                    <td className="px-3 py-3 text-right font-mono text-slate-700">
                      ฿{item.avg_unit_cost.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                  )}
                  {isCostVisible && (
                    <td className="px-3 py-3 text-right font-mono font-bold text-teal-800">
                      ฿{item.total_value.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                  )}
                  <td className="px-3 py-3 text-center">
                    {item.is_low_stock ? (
                      <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-[10px] font-bold">
                        ⚠️ ใกล้หมด
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                        ✓ ปกติ
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(item)}
                        className="h-7 text-xs px-2.5 text-teal-800 hover:bg-teal-50 border-teal-200 font-bold gap-1"
                      >
                        <Edit2 className="h-3 w-3" /> แก้ไข
                      </Button>
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteItem(item)}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                          title="ลบรายการ"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={isCostVisible ? 8 : 6} className="px-4 py-8 text-center text-slate-400">
                    ไม่พบรายการสินค้าที่ตรงกับคำค้นหา
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Edit Item Modal ── */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                  <Edit2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">แก้ไขข้อมูลสินค้า / แก้ไขข้อมูลผิด</h3>
                  <p className="text-xs text-slate-500">รหัสอ้างอิง: {editingItem.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseEdit}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">ชื่อสินค้า / วัสดุ *</Label>
                <Input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-9 text-xs font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">หมวดหมู่</Label>
                  <Input
                    type="text"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="h-9 text-xs"
                    placeholder="เช่น น้ำยาซัก, สี, อะไหล่"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">หน่วยนับ *</Label>
                  <Input
                    type="text"
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    className="h-9 text-xs"
                    placeholder="เช่น ขวด, ml, คู่, ชิ้น"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-teal-900">จำนวนคงเหลือจริง *</Label>
                  <Input
                    type="number"
                    step="any"
                    value={editQty}
                    onChange={(e) => setEditQty(parseFloat(e.target.value) || 0)}
                    className="h-9 text-xs font-mono font-bold text-teal-950 bg-teal-50/50 border-teal-300"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">เกณฑ์ขั้นต่ำ (Min Alert)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={editMin}
                    onChange={(e) => setEditMin(parseFloat(e.target.value) || 0)}
                    className="h-9 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">ต้นทุน/หน่วย (฿)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={editCost}
                    onChange={(e) => setEditCost(parseFloat(e.target.value) || 0)}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 border border-slate-200">
                💡 การแก้ไขยอดคงเหลือจะถูกบันทึกลงในสมุดบัญชีสต๊อก (Stock Ledger Adjustment) โดยอัตโนมัติ เพื่อให้ยอดตัวเลขสอดคล้องกับการตรวจนับจริง
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCloseEdit}
                  className="text-xs h-9"
                >
                  ยกเลิก
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  size="sm"
                  className="bg-teal-700 hover:bg-emerald-600 text-white font-bold text-xs h-9 px-4 gap-1.5"
                >
                  {isPending ? "กำลังบันทึก..." : <><Check className="h-4 w-4" /> บันทึกการแก้ไข</>}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Create New Item Modal ── */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <PackagePlus className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">เพิ่มรายการสินค้า / วัสดุใหม่</h3>
                  <p className="text-xs text-slate-500">บันทึกสินค้าใหม่เข้าสู่ระบบคลังสินค้า</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCreate} className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">ชื่อสินค้า / วัสดุ *</Label>
                <Input
                  type="text"
                  placeholder="เช่น น้ำยาซักแห้งพรีเมียม 500ml"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-9 text-xs font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">หมวดหมู่</Label>
                  <Input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="h-9 text-xs"
                    placeholder="เช่น น้ำยา, อะไหล่, บรรจุภัณฑ์"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">หน่วยนับ *</Label>
                  <Input
                    type="text"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="h-9 text-xs"
                    placeholder="เช่น ขวด, ml, คู่, ชิ้น"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">จำนวนยอดยกมาเริ่มต้น</Label>
                  <Input
                    type="number"
                    step="any"
                    value={newQty}
                    onChange={(e) => setNewQty(parseFloat(e.target.value) || 0)}
                    className="h-9 text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">จุดสั่งซื้อขั้นต่ำ (Min)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={newMin}
                    onChange={(e) => setNewMin(parseFloat(e.target.value) || 0)}
                    className="h-9 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-700">ต้นทุนต่อหน่วย (฿)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={newCost}
                    onChange={(e) => setNewCost(parseFloat(e.target.value) || 0)}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreateOpen(false)}
                  className="text-xs h-9"
                >
                  ยกเลิก
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-4 gap-1.5"
                >
                  {isPending ? "กำลังบันทึก..." : <><Check className="h-4 w-4" /> สร้างรายการสินค้า</>}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

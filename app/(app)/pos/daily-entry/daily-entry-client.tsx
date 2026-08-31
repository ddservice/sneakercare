"use client";

import { useState, useTransition } from "react";
import { saveDailySale, deleteDailySale, type DailySaleInput } from "@/app/actions/daily-sales";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Footprints,
  Calendar,
  Wallet,
  Smartphone,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Receipt,
} from "lucide-react";
import Link from "next/link";

type DailySaleRow = {
  id: number;
  date: string;
  size_s: number;
  size_m: number;
  size_l: number;
  size_xl: number;
  cash_amount: number;
  transfer_amount: number;
  discount: number;
  grand_total: number;
  extra_items?: string;
  recorded_by?: string;
};

// Size price presets based on SneakerCare standard
const SIZE_PRICES = {
  s: 350,
  m: 450,
  l: 550,
  xl: 650,
};

export function DailyEntryClient({ initialRecords }: { initialRecords: DailySaleRow[] }) {
  const [records, setRecords] = useState<DailySaleRow[]>(initialRecords);
  const [isPending, startTransition] = useTransition();

  // Form State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sizeS, setSizeS] = useState(0);
  const [sizeM, setSizeM] = useState(0);
  const [sizeL, setSizeL] = useState(0);
  const [sizeXL, setSizeXL] = useState(0);
  const [cashAmount, setCashAmount] = useState(0);
  const [transferAmount, setTransferAmount] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [extraItems, setExtraItems] = useState("");
  const [isManualGrandTotal, setIsManualGrandTotal] = useState(false);
  const [manualGrandTotal, setManualGrandTotal] = useState(0);

  // Auto Estimated Total
  const totalPairs = Number(sizeS) + Number(sizeM) + Number(sizeL) + Number(sizeXL);
  const estimatedSizeTotal =
    Number(sizeS) * SIZE_PRICES.s +
    Number(sizeM) * SIZE_PRICES.m +
    Number(sizeL) * SIZE_PRICES.l +
    Number(sizeXL) * SIZE_PRICES.xl;

  const paymentSplitTotal = Number(cashAmount) + Number(transferAmount);
  const calculatedGrandTotal = isManualGrandTotal
    ? manualGrandTotal
    : paymentSplitTotal > 0
    ? paymentSplitTotal
    : Math.max(0, estimatedSizeTotal - Number(discount));

  // Preset size helper
  function adjustSize(size: "s" | "m" | "l" | "xl", delta: number) {
    if (size === "s") setSizeS((prev) => Math.max(0, prev + delta));
    if (size === "m") setSizeM((prev) => Math.max(0, prev + delta));
    if (size === "l") setSizeL((prev) => Math.max(0, prev + delta));
    if (size === "xl") setSizeXL((prev) => Math.max(0, prev + delta));
  }

  function handleEdit(record: DailySaleRow) {
    setEditingId(record.id);
    setDate(record.date);
    setSizeS(record.size_s || 0);
    setSizeM(record.size_m || 0);
    setSizeL(record.size_l || 0);
    setSizeXL(record.size_xl || 0);
    setCashAmount(Number(record.cash_amount || 0));
    setTransferAmount(Number(record.transfer_amount || 0));
    setDiscount(Number(record.discount || 0));
    setExtraItems(record.extra_items || "");
    setManualGrandTotal(Number(record.grand_total || 0));
    setIsManualGrandTotal(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleReset() {
    setEditingId(null);
    setDate(new Date().toISOString().slice(0, 10));
    setSizeS(0);
    setSizeM(0);
    setSizeL(0);
    setSizeXL(0);
    setCashAmount(0);
    setTransferAmount(0);
    setDiscount(0);
    setExtraItems("");
    setIsManualGrandTotal(false);
    setManualGrandTotal(0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (totalPairs === 0 && calculatedGrandTotal === 0) {
      toast.error("กรุณาระบุจำนวนรองเท้าหรือยอดเงินที่รับชำระ");
      return;
    }

    startTransition(async () => {
      const payload: DailySaleInput = {
        id: editingId || undefined,
        date,
        size_s: sizeS,
        size_m: sizeM,
        size_l: sizeL,
        size_xl: sizeXL,
        cash_amount: cashAmount,
        transfer_amount: transferAmount,
        discount: discount,
        grand_total: calculatedGrandTotal,
        extra_items: extraItems,
      };

      const res = await saveDailySale(payload);
      if (res.success) {
        toast.success(editingId ? "อัปเดตยอดขายรายวันสำเร็จ" : "บันทึกยอดขายรายวันสำเร็จ");
        handleReset();
        // Update local list
        setRecords((prev) => {
          if (editingId) {
            return prev.map((r) =>
              r.id === editingId ? { ...r, ...payload, id: editingId, grand_total: calculatedGrandTotal } : r
            );
          } else {
            return [
              {
                id: Date.now(),
                ...payload,
                grand_total: calculatedGrandTotal,
                recorded_by: "คุณ",
              } as DailySaleRow,
              ...prev,
            ];
          }
        });
      } else {
        toast.error(res.error || "เกิดข้อผิดพลาดในการบันทึก");
      }
    });
  }

  async function handleDelete(id: number) {
    if (!confirm("คุณต้องการลบบันทึกยอดขายของวันนี้ใช่หรือไม่?")) return;

    startTransition(async () => {
      const res = await deleteDailySale(id);
      if (res.success) {
        toast.success("ลบบันทึกเรียบร้อย");
        setRecords((prev) => prev.filter((r) => r.id !== id));
      } else {
        toast.error(res.error || "ไม่สามารถลบรายการได้");
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* ── Header Banner ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 p-6 text-white shadow-md">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/30">
            <Footprints className="h-3.5 w-3.5" />
            SneakerCare Daily Sales Entry
          </div>
          <h2 className="text-2xl font-bold tracking-tight">บันทึกยอดขายประจำวัน (Daily Summary)</h2>
          <p className="text-sm text-teal-100/80">
            กรอกสรุปยอดขายรายวัน จำนวนรองเท้าแต่ละไซส์ (S/M/L/XL) และยอดเงินสด/เงินโอน เชื่อมต่อสถิติอัตโนมัติ
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/statistics">
            <Button variant="outline" className="bg-white/10 text-white hover:bg-white/20 border-white/20 text-xs gap-1.5">
              <TrendingUp className="h-4 w-4" /> ดูสถิติย้อนหลัง
            </Button>
          </Link>
          <Link href="/pos">
            <Button variant="outline" className="bg-white/10 text-white hover:bg-white/20 border-white/20 text-xs gap-1.5">
              <Receipt className="h-4 w-4" /> หน้า POS รายบิล
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* ── Left Form Column (5 Cols) ── */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="border-teal-200/80 shadow-md">
            <CardHeader className="bg-teal-50/70 border-b border-teal-100 p-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold text-teal-950 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-teal-700" />
                  {editingId ? "แก้ไขบันทึกยอดขาย" : "แบบฟอร์มบันทึกยอดขายรายวัน"}
                </CardTitle>
                {editingId && (
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                    กำลังแก้ไข #{editingId}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs text-teal-800/80">
                ระบบคำนวณและอัปเดตไปยัง Dashboard & สถิติร้านทันที
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-5">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* 1. Date */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-teal-700" /> วันที่ทำรายการ
                  </Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="text-xs h-9 font-medium"
                    required
                  />
                </div>

                {/* 2. Shoe Sizes Grid */}
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Footprints className="h-3.5 w-3.5 text-teal-700" /> จำนวนรองเท้าตามขนาด (ไซส์)
                    </Label>
                    <span className="text-xs font-black text-teal-800">รวม {totalPairs} คู่</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    {/* Size S */}
                    <div className="rounded-lg bg-white p-2.5 border border-slate-200 shadow-2xs space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-teal-800">
                        <span>Size S (350฿)</span>
                        <span>{sizeS * SIZE_PRICES.s}฿</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-600"
                          onClick={() => adjustSize("s", -1)}
                        >
                          -
                        </Button>
                        <Input
                          type="number"
                          min="0"
                          value={sizeS}
                          onChange={(e) => setSizeS(Math.max(0, parseInt(e.target.value) || 0))}
                          className="h-7 text-center font-mono font-bold text-xs"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 text-teal-700 font-bold"
                          onClick={() => adjustSize("s", 1)}
                        >
                          +
                        </Button>
                      </div>
                    </div>

                    {/* Size M */}
                    <div className="rounded-lg bg-white p-2.5 border border-slate-200 shadow-2xs space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-teal-800">
                        <span>Size M (450฿)</span>
                        <span>{sizeM * SIZE_PRICES.m}฿</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-600"
                          onClick={() => adjustSize("m", -1)}
                        >
                          -
                        </Button>
                        <Input
                          type="number"
                          min="0"
                          value={sizeM}
                          onChange={(e) => setSizeM(Math.max(0, parseInt(e.target.value) || 0))}
                          className="h-7 text-center font-mono font-bold text-xs"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 text-teal-700 font-bold"
                          onClick={() => adjustSize("m", 1)}
                        >
                          +
                        </Button>
                      </div>
                    </div>

                    {/* Size L */}
                    <div className="rounded-lg bg-white p-2.5 border border-slate-200 shadow-2xs space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-teal-800">
                        <span>Size L (550฿)</span>
                        <span>{sizeL * SIZE_PRICES.l}฿</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-600"
                          onClick={() => adjustSize("l", -1)}
                        >
                          -
                        </Button>
                        <Input
                          type="number"
                          min="0"
                          value={sizeL}
                          onChange={(e) => setSizeL(Math.max(0, parseInt(e.target.value) || 0))}
                          className="h-7 text-center font-mono font-bold text-xs"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 text-teal-700 font-bold"
                          onClick={() => adjustSize("l", 1)}
                        >
                          +
                        </Button>
                      </div>
                    </div>

                    {/* Size XL */}
                    <div className="rounded-lg bg-white p-2.5 border border-slate-200 shadow-2xs space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-teal-800">
                        <span>Size XL (650฿)</span>
                        <span>{sizeXL * SIZE_PRICES.xl}฿</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-600"
                          onClick={() => adjustSize("xl", -1)}
                        >
                          -
                        </Button>
                        <Input
                          type="number"
                          min="0"
                          value={sizeXL}
                          onChange={(e) => setSizeXL(Math.max(0, parseInt(e.target.value) || 0))}
                          className="h-7 text-center font-mono font-bold text-xs"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 text-teal-700 font-bold"
                          onClick={() => adjustSize("xl", 1)}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Payment Method Breakdown */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <Wallet className="h-3.5 w-3.5 text-emerald-600" /> ยอดเงินสด (บาท)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={cashAmount || ""}
                      placeholder="0.00"
                      onChange={(e) => setCashAmount(parseFloat(e.target.value) || 0)}
                      className="text-xs h-9 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <Smartphone className="h-3.5 w-3.5 text-blue-600" /> ยอดเงินโอน (บาท)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={transferAmount || ""}
                      placeholder="0.00"
                      onChange={(e) => setTransferAmount(parseFloat(e.target.value) || 0)}
                      className="text-xs h-9 font-mono"
                    />
                  </div>
                </div>

                {/* 4. Discount & Notes */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">ส่วนลด (ถ้ามี)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={discount || ""}
                      placeholder="0.00"
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                      className="text-xs h-9 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">รายการพิเศษ / หมายเหตุ</Label>
                    <Input
                      value={extraItems}
                      placeholder="เช่น ซักด่วน, ลูกค้า VIP"
                      onChange={(e) => setExtraItems(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                </div>

                {/* 5. Total Grand Summary */}
                <div className="rounded-xl bg-teal-900 p-4 text-white space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-xs text-teal-200">
                    <span>ยอดขายรวมสุทธิประจำวัน</span>
                    <span>{totalPairs} คู่</span>
                  </div>
                  <div className="text-2xl font-black text-white">
                    ฿{calculatedGrandTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  {editingId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReset}
                      className="w-1/3 text-xs"
                    >
                      ยกเลิก
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs h-10 shadow-sm"
                  >
                    {isPending ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "บันทึกยอดขายรายวัน"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* ── Right Column: Recent Daily Records Table (7 Cols) ── */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 p-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">
                  ประวัติบันทึกยอดขายรายวันล่าสุด ({records.length} รายการ)
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  ข้อมูลจริงจากระบบ SneakerCare ที่บันทึกรายวัน
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5">วันที่</th>
                      <th className="px-3 py-2.5 text-center">ขนาด (S/M/L/XL)</th>
                      <th className="px-3 py-2.5 text-right">เงินสด</th>
                      <th className="px-3 py-2.5 text-right">โอนเงิน</th>
                      <th className="px-3 py-2.5 text-right">ยอดสุทธิ</th>
                      <th className="px-3 py-2.5 text-center">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map((r) => {
                      const totalPairsRow =
                        Number(r.size_s || 0) +
                        Number(r.size_m || 0) +
                        Number(r.size_l || 0) +
                        Number(r.size_xl || 0);

                      return (
                        <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3 py-2.5 font-mono font-bold text-teal-900">
                            {r.date}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="font-mono text-slate-700">
                              S:{r.size_s || 0} M:{r.size_m || 0} L:{r.size_l || 0} XL:{r.size_xl || 0}
                            </span>
                            <span className="text-[10px] text-slate-400 block">({totalPairsRow} คู่)</span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-600">
                            ฿{Number(r.cash_amount || 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-600">
                            ฿{Number(r.transfer_amount || 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-black text-teal-800">
                            ฿{Number(r.grand_total || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleEdit(r)}
                                className="p-1 rounded text-slate-500 hover:text-teal-700 hover:bg-teal-50"
                                title="แก้ไข"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(r.id)}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                title="ลบ"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

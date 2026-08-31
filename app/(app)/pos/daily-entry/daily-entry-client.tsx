"use client";

import { useState, useTransition, useMemo } from "react";
import {
  saveDailySale,
  deleteDailySale,
  recordArPayment,
  deleteArPayment,
  type DailySaleInput,
  type DailySaleWithPayments,
  type ArPaymentRecord,
} from "@/app/actions/daily-sales";
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
  Clock,
  AlertCircle,
  Sparkles,
  Zap,
  TrendingUp,
  Receipt,
  RotateCcw,
  Tag,
  Layers,
  Search,
  Check,
  ChevronDown,
  ChevronUp,
  X,
  CreditCard,
  DollarSign,
} from "lucide-react";
import Link from "next/link";

// Size price presets based on official SneakerCare package standards
export const SIZE_PRICES = {
  s: 200,
  m: 400,
  l: 600,
  xl: 800,
};

// Standard preset add-on options
export const PRESET_OPTIONS = [
  { id: "opt_express", name: "ซักด่วน", price: 100, icon: "⚡", tag: "+100฿" },
  { id: "opt_unyellow", name: "แก้เหลือง", price: 150, icon: "✨", tag: "+150฿" },
  { id: "opt_deepclean", name: "ซักละเอียด+ฆ่าเชื้อ", price: 100, icon: "🧼", tag: "+100฿" },
  { id: "opt_waterproof", name: "เคลือบกันน้ำนาโน", price: 100, icon: "🛡️", tag: "+100฿" },
  { id: "opt_sole_repair", name: "ซ่อมพื้น/ติดกาว", price: 200, icon: "🩹", tag: "+200฿" },
  { id: "opt_repaint", name: "ทำสี/Repaint", price: 350, icon: "🎨", tag: "+350฿" },
];

type ExtraLine = {
  id: string;
  name: string;
  price: number;
  qty: number;
};

export function DailyEntryClient({ initialRecords }: { initialRecords: DailySaleWithPayments[] }) {
  const [records, setRecords] = useState<DailySaleWithPayments[]>(initialRecords);
  const [isPending, startTransition] = useTransition();

  // Form State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sizeS, setSizeS] = useState<number>(0);
  const [sizeM, setSizeM] = useState<number>(0);
  const [sizeL, setSizeL] = useState<number>(0);
  const [sizeXL, setSizeXL] = useState<number>(0);

  // Extra add-on services list
  const [extraLines, setExtraLines] = useState<ExtraLine[]>([]);
  const [customExtraName, setCustomExtraName] = useState("");
  const [customExtraPrice, setCustomExtraPrice] = useState<number | "">("");

  // Payment Breakdown
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [transferAmount, setTransferAmount] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [paymentStatusManual, setPaymentStatusManual] = useState<string | null>(null);

  // AR Payment Modal State
  const [collectTarget, setCollectTarget] = useState<DailySaleWithPayments | null>(null);
  const [collectDate, setCollectDate] = useState(new Date().toISOString().slice(0, 10));
  const [collectAmount, setCollectAmount] = useState<number>(0);
  const [collectMethod, setCollectMethod] = useState<"โอน" | "เงินสด" | "อื่นๆ">("โอน");
  const [collectNotes, setCollectNotes] = useState("");

  // Filters & Search for history
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "outstanding" | "completed">("all");
  const [expandedRecordId, setExpandedRecordId] = useState<number | null>(null);

  // Calculations
  const totalPairs = Number(sizeS || 0) + Number(sizeM || 0) + Number(sizeL || 0) + Number(sizeXL || 0);
  const sizeGross =
    Number(sizeS || 0) * SIZE_PRICES.s +
    Number(sizeM || 0) * SIZE_PRICES.m +
    Number(sizeL || 0) * SIZE_PRICES.l +
    Number(sizeXL || 0) * SIZE_PRICES.xl;

  const extraServicesTotal = extraLines.reduce((sum, line) => sum + line.price * line.qty, 0);
  const grossTotal = sizeGross + extraServicesTotal;
  const netTotal = Math.max(0, grossTotal - Number(discount || 0));

  const actualReceived = Number(cashAmount || 0) + Number(transferAmount || 0);
  const outstandingAmount = Math.max(0, netTotal - actualReceived);

  // Auto payment status
  const currentPaymentStatus = useMemo(() => {
    if (paymentStatusManual) return paymentStatusManual;
    if (netTotal === 0 && actualReceived === 0) return "ชำระครบ";
    if (actualReceived >= netTotal && netTotal > 0) return "ชำระครบ";
    if (actualReceived > 0) return "ชำระบางส่วน";
    return "ค้างชำระ";
  }, [paymentStatusManual, actualReceived, netTotal]);

  // Adjust size count
  function adjustSize(size: "s" | "m" | "l" | "xl", delta: number) {
    if (size === "s") setSizeS((prev) => Math.max(0, prev + delta));
    if (size === "m") setSizeM((prev) => Math.max(0, prev + delta));
    if (size === "l") setSizeL((prev) => Math.max(0, prev + delta));
    if (size === "xl") setSizeXL((prev) => Math.max(0, prev + delta));
  }

  // Quick Preset Add-on
  function addPresetOption(preset: (typeof PRESET_OPTIONS)[0]) {
    setExtraLines((prev) => {
      const existing = prev.find((item) => item.name === preset.name);
      if (existing) {
        return prev.map((item) =>
          item.name === preset.name ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { id: `preset-${Date.now()}-${Math.random()}`, name: preset.name, price: preset.price, qty: 1 }];
    });
    toast.success(`เพิ่มบริการเสริม: ${preset.name} (+${preset.price}฿)`);
  }

  // Add Custom Service
  function addCustomExtra() {
    if (!customExtraName.trim()) {
      toast.error("กรุณาระบุชื่อบริการเสริม");
      return;
    }
    const priceNum = Number(customExtraPrice) || 0;
    if (priceNum <= 0) {
      toast.error("กรุณาระบุราคาบริการ");
      return;
    }

    setExtraLines((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        name: customExtraName.trim(),
        price: priceNum,
        qty: 1,
      },
    ]);
    setCustomExtraName("");
    setCustomExtraPrice("");
    toast.success(`เพิ่มรายการ: ${customExtraName.trim()} (+${priceNum}฿)`);
  }

  function removeExtraLine(id: string) {
    setExtraLines((prev) => prev.filter((item) => item.id !== id));
  }

  function updateExtraQty(id: string, delta: number) {
    setExtraLines((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, qty: Math.max(0, item.qty + delta) } : item))
        .filter((item) => item.qty > 0)
    );
  }

  // Payment quick helpers
  function autoFillTransferAll() {
    setTransferAmount(netTotal);
    setCashAmount(0);
    setPaymentStatusManual("ชำระครบ");
    toast.info("ตั้งค่ายอดโอนเต็มจำนวนเรียบร้อย");
  }

  function autoFillCashAll() {
    setCashAmount(netTotal);
    setTransferAmount(0);
    setPaymentStatusManual("ชำระครบ");
    toast.info("ตั้งค่ายอดเงินสดเต็มจำนวนเรียบร้อย");
  }

  function autoFillHalfSplit() {
    const half = Math.round((netTotal / 2) * 100) / 100;
    setCashAmount(half);
    setTransferAmount(netTotal - half);
    setPaymentStatusManual("ชำระครบ");
    toast.info("แบ่งยอดเงินสดและเงินโอน 50/50 เรียบร้อย");
  }

  function autoFillPendingAll() {
    setCashAmount(0);
    setTransferAmount(0);
    setPaymentStatusManual("ค้างชำระ");
    toast.warning("ตั้งค่าเป็นยอดค้างชำระทั้งหมด");
  }

  // Open AR Collect Payment Modal
  function openCollectModal(record: DailySaleWithPayments) {
    setCollectTarget(record);
    setCollectDate(new Date().toISOString().slice(0, 10));
    setCollectAmount(record.outstanding > 0 ? record.outstanding : 0);
    setCollectMethod("โอน");
    setCollectNotes("");
  }

  function closeCollectModal() {
    setCollectTarget(null);
  }

  // Handle AR payment submit
  async function handleCollectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!collectTarget) return;
    if (collectAmount <= 0) {
      toast.error("กรุณาระบุจำนวนเงินที่รับชำระ");
      return;
    }

    startTransition(async () => {
      const res = await recordArPayment({
        sale_date: collectTarget.date,
        received_date: collectDate,
        amount: collectAmount,
        pay_method: collectMethod,
        notes: collectNotes,
      });

      if (res.success) {
        toast.success(`บันทึกการรับชำระยอดค้าง ${collectAmount.toLocaleString()} ฿ เรียบร้อย`);
        // Update local state
        setRecords((prev) =>
          prev.map((r) => {
            if (r.date === collectTarget.date) {
              const newPayments: ArPaymentRecord[] = [
                {
                  id: Date.now(),
                  sale_date: collectTarget.date,
                  received_date: collectDate,
                  amount: collectAmount,
                  pay_method: collectMethod,
                  notes: collectNotes,
                  recorded_by: "คุณ",
                  created_at: new Date().toISOString(),
                },
                ...(r.payments || []),
              ];
              const newArPaid = r.total_ar_paid + collectAmount;
              const newTotalPaid = r.amount_paid + newArPaid;
              const newOutstanding = Math.max(0, r.total_revenue - newTotalPaid);
              const newStatus = newOutstanding <= 0 ? "ชำระครบ" : "ชำระบางส่วน";

              return {
                ...r,
                payments: newPayments,
                total_ar_paid: newArPaid,
                total_paid: newTotalPaid,
                outstanding: newOutstanding,
                payment_status: newStatus,
              };
            }
            return r;
          })
        );
        closeCollectModal();
      } else {
        toast.error(res.error || "เกิดข้อผิดพลาดในการบันทึกการรับชำระ");
      }
    });
  }

  // Delete AR payment
  async function handleDeleteArPayment(paymentId: number, saleDate: string, amount: number) {
    if (!confirm(`คุณต้องการลบประวัติการรับชำระ ${amount.toLocaleString()} ฿ ใช่หรือไม่?`)) return;

    startTransition(async () => {
      const res = await deleteArPayment(paymentId, saleDate);
      if (res.success) {
        toast.success("ลบประวัติการรับชำระเงินเรียบร้อย");
        setRecords((prev) =>
          prev.map((r) => {
            if (r.date === saleDate) {
              const newPayments = (r.payments || []).filter((p) => p.id !== paymentId);
              const newArPaid = Math.max(0, r.total_ar_paid - amount);
              const newTotalPaid = r.amount_paid + newArPaid;
              const newOutstanding = Math.max(0, r.total_revenue - newTotalPaid);
              const newStatus = newOutstanding <= 0 ? "ชำระครบ" : (newTotalPaid > 0 ? "ชำระบางส่วน" : "ค้างชำระ");

              return {
                ...r,
                payments: newPayments,
                total_ar_paid: newArPaid,
                total_paid: newTotalPaid,
                outstanding: newOutstanding,
                payment_status: newStatus,
              };
            }
            return r;
          })
        );
      } else {
        toast.error(res.error || "ไม่สามารถลบรายการได้");
      }
    });
  }

  // Edit record
  function handleEdit(record: DailySaleWithPayments) {
    setEditingId(record.id);
    setDate(record.date);
    setSizeS(Number(record.size_s || 0));
    setSizeM(Number(record.size_m || 0));
    setSizeL(Number(record.size_l || 0));
    setSizeXL(Number(record.size_xl || 0));
    setCashAmount(Number(record.cash_amount || 0));
    setTransferAmount(Number(record.transfer_amount || 0));
    setDiscount(Number(record.discount || 0));
    setPaymentStatusManual(record.payment_status || null);

    // Parse extra items string if present
    if (record.extra_items && record.extra_items.trim()) {
      try {
        if (record.extra_items.startsWith("[")) {
          setExtraLines(JSON.parse(record.extra_items));
        } else {
          setExtraLines([
            {
              id: `parsed-${Date.now()}`,
              name: record.extra_items,
              price: 0,
              qty: 1,
            },
          ]);
        }
      } catch {
        setExtraLines([]);
      }
    } else {
      setExtraLines([]);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Reset form
  function handleReset() {
    setEditingId(null);
    setDate(new Date().toISOString().slice(0, 10));
    setSizeS(0);
    setSizeM(0);
    setSizeL(0);
    setSizeXL(0);
    setExtraLines([]);
    setCustomExtraName("");
    setCustomExtraPrice("");
    setCashAmount(0);
    setTransferAmount(0);
    setDiscount(0);
    setPaymentStatusManual(null);
  }

  // Submit Handler
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (totalPairs === 0 && grossTotal === 0 && actualReceived === 0) {
      toast.error("กรุณาระบุจำนวนรองเท้า บริการเสริม หรือยอดเงินที่รับชำระ");
      return;
    }

    const extraSummaryStr = extraLines.length > 0
      ? extraLines.map((item) => `${item.name} x${item.qty} (${item.price * item.qty}฿)`).join(", ")
      : "";

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
        amount_paid: actualReceived,
        discount,
        gross_amount: grossTotal,
        grand_total: netTotal,
        payment_status: currentPaymentStatus,
        extra_items: extraSummaryStr,
      };

      const res = await saveDailySale(payload);
      if (res.success) {
        toast.success(editingId ? "อัปเดตบันทึกยอดขายรายวันสำเร็จ" : "บันทึกยอดขายประจำวันสำเร็จ");
        handleReset();

        setRecords((prev) => {
          if (editingId) {
            return prev.map((r) =>
              r.id === editingId
                ? {
                    ...r,
                    ...payload,
                    id: editingId,
                    total_revenue: netTotal,
                    amount_paid: actualReceived,
                    grand_total: grossTotal,
                    total_paid: actualReceived + (r.total_ar_paid || 0),
                    outstanding: Math.max(0, netTotal - (actualReceived + (r.total_ar_paid || 0))),
                    payment_status: currentPaymentStatus,
                  }
                : r
            );
          } else {
            return [
              {
                id: Date.now(),
                ...payload,
                total_revenue: netTotal,
                amount_paid: actualReceived,
                grand_total: grossTotal,
                payments: [],
                total_ar_paid: 0,
                total_paid: actualReceived,
                outstanding: Math.max(0, netTotal - actualReceived),
                payment_status: currentPaymentStatus,
                recorded_by: "คุณ",
              } as DailySaleWithPayments,
              ...prev,
            ];
          }
        });
      } else {
        toast.error(res.error || "เกิดข้อผิดพลาดในการบันทึกยอดขาย");
      }
    });
  }

  // Delete record
  async function handleDelete(id: number) {
    if (!confirm("คุณต้องการลบบันทึกยอดขายของวันนี้ใช่หรือไม่?")) return;

    startTransition(async () => {
      const res = await deleteDailySale(id);
      if (res.success) {
        toast.success("ลบบันทึกยอดขายเรียบร้อย");
        setRecords((prev) => prev.filter((r) => r.id !== id));
      } else {
        toast.error(res.error || "ไม่สามารถลบรายการได้");
      }
    });
  }

  // Filtered list
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const matchesSearch =
        r.date.includes(searchTerm) ||
        (r.extra_items && r.extra_items.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (r.recorded_by && r.recorded_by.toLowerCase().includes(searchTerm.toLowerCase()));

      let matchesTab = true;
      if (activeTab === "outstanding") {
        matchesTab = r.outstanding > 0 || r.payment_status === "ชำระบางส่วน" || r.payment_status === "ค้างชำระ";
      } else if (activeTab === "completed") {
        matchesTab = r.outstanding === 0 && r.payment_status === "ชำระครบ";
      }

      return matchesSearch && matchesTab;
    });
  }, [records, searchTerm, activeTab]);

  // Overall Statistics from all records
  const overallStats = useMemo(() => {
    return records.reduce(
      (acc, r) => {
        acc.pairs += (r.size_s || 0) + (r.size_m || 0) + (r.size_l || 0) + (r.size_xl || 0);
        acc.revenue += Number(r.total_revenue || r.grand_total || 0);
        acc.cash += Number(r.cash_amount || 0);
        acc.transfer += Number(r.transfer_amount || 0);
        acc.arPaid += Number(r.total_ar_paid || 0);
        acc.totalPaid += Number(r.total_paid || 0);
        acc.outstanding += Number(r.outstanding || 0);
        if (r.outstanding > 0) acc.outstandingCount += 1;
        return acc;
      },
      { pairs: 0, revenue: 0, cash: 0, transfer: 0, arPaid: 0, totalPaid: 0, outstanding: 0, outstandingCount: 0 }
    );
  }, [records]);

  return (
    <div className="space-y-8">
      {/* ── Header Banner ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 p-6 text-white shadow-md">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/30">
            <Footprints className="h-3.5 w-3.5" />
            SneakerCare POS & AR Management
          </div>
          <h2 className="text-2xl font-bold tracking-tight">บันทึกยอดขาย & ติดตามยอดค้างชำระ (AR)</h2>
          <p className="text-xs sm:text-sm text-teal-100/80">
            Package มาตรฐาน S 200฿ | M 400฿ | L 600฿ | XL 800฿, บริการเสริม, สรุปยอดเงินสด/โอน และระบบรับชำระยอดค้างครบถ้วน
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/statistics">
            <Button variant="outline" className="bg-white/10 text-white hover:bg-white/20 border-white/20 text-xs gap-1.5 h-9">
              <TrendingUp className="h-4 w-4" /> ดูสถิติสรุป
            </Button>
          </Link>
          <Link href="/pos">
            <Button variant="outline" className="bg-white/10 text-white hover:bg-white/20 border-white/20 text-xs gap-1.5 h-9">
              <Receipt className="h-4 w-4" /> เปิดบิลรับงาน (POS)
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Outstanding Receivables Quick Alert Banner ── */}
      {overallStats.outstanding > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold shrink-0">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <div className="font-extrabold text-sm text-amber-950">
                มียอดค้างชำระสะสมทั้งหมด {overallStats.outstanding.toLocaleString()} บาท ({overallStats.outstandingCount} รายการ)
              </div>
              <div className="text-xs text-amber-800">
                คุณสามารถกดดูเฉพาะรายการที่ค้างชำระ และกดปุ่ม <strong>[💰 รับชำระเงิน]</strong> เพื่อตัดยอดรับเงินได้ทันที
              </div>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => setActiveTab("outstanding")}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold gap-1.5 h-8.5 px-3.5 shadow-xs"
          >
            <Clock className="h-4 w-4" /> ดูรายการค้างชำระทั้งหมด
          </Button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-12">
        {/* ── LEFT COLUMN: Input Form (6 Cols) ── */}
        <div className="lg:col-span-6 space-y-6">
          <Card className="border-teal-200/80 shadow-md">
            <CardHeader className="bg-teal-50/70 border-b border-teal-100 p-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold text-teal-950 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-teal-700" />
                  {editingId ? "แก้ไขบันทึกยอดขายรายวัน" : "แบบฟอร์มบันทึกงานบริการ / ยอดขาย"}
                </CardTitle>
                {editingId && (
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                    กำลังแก้ไข #{editingId}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs text-teal-800/80">
                กรอกจำนวนคู่ตาม Package ไซส์, บริการเสริม, ยอดเงินสด/โอน และสถานะการชำระเงิน
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-5">
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* 1. Date */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-teal-700" /> วันที่ใช้บริการ / บันทึกยอดขาย
                  </Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="text-xs h-9 font-medium bg-white"
                    required
                  />
                </div>

                {/* 2. Shoe Package Sizes Grid (S: 200, M: 400, L: 600, XL: 800) */}
                <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Footprints className="h-3.5 w-3.5 text-teal-700" /> จำนวนคู่แยกตาม Size (Package ราคามาตรฐาน)
                    </Label>
                    <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-black text-teal-900">
                      รวม {totalPairs} คู่ ({sizeGross.toLocaleString()} ฿)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {/* Size S (200฿) */}
                    <div className="rounded-xl border-2 border-blue-400 bg-gradient-to-b from-blue-50/80 to-white p-3 shadow-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-blue-900">Size S</span>
                        <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          200 ฿/คู่
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 text-blue-700 hover:bg-blue-100 font-bold"
                          onClick={() => adjustSize("s", -1)}
                        >
                          -
                        </Button>
                        <Input
                          type="number"
                          min="0"
                          value={sizeS}
                          onChange={(e) => setSizeS(Math.max(0, parseInt(e.target.value) || 0))}
                          className="h-8 text-center font-mono font-bold text-sm bg-white border-blue-200 text-blue-900"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 text-blue-700 hover:bg-blue-100 font-bold"
                          onClick={() => adjustSize("s", 1)}
                        >
                          +
                        </Button>
                      </div>
                      <div className="text-right text-[11px] font-bold text-blue-700 border-t border-blue-100 pt-1">
                        = {(Number(sizeS || 0) * SIZE_PRICES.s).toLocaleString()} ฿
                      </div>
                    </div>

                    {/* Size M (400฿) */}
                    <div className="rounded-xl border-2 border-emerald-400 bg-gradient-to-b from-emerald-50/80 to-white p-3 shadow-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-emerald-900">Size M</span>
                        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          400 ฿/คู่
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 text-emerald-700 hover:bg-emerald-100 font-bold"
                          onClick={() => adjustSize("m", -1)}
                        >
                          -
                        </Button>
                        <Input
                          type="number"
                          min="0"
                          value={sizeM}
                          onChange={(e) => setSizeM(Math.max(0, parseInt(e.target.value) || 0))}
                          className="h-8 text-center font-mono font-bold text-sm bg-white border-emerald-200 text-emerald-900"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 text-emerald-700 hover:bg-emerald-100 font-bold"
                          onClick={() => adjustSize("m", 1)}
                        >
                          +
                        </Button>
                      </div>
                      <div className="text-right text-[11px] font-bold text-emerald-700 border-t border-emerald-100 pt-1">
                        = {(Number(sizeM || 0) * SIZE_PRICES.m).toLocaleString()} ฿
                      </div>
                    </div>

                    {/* Size L (600฿) */}
                    <div className="rounded-xl border-2 border-purple-400 bg-gradient-to-b from-purple-50/80 to-white p-3 shadow-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-purple-900">Size L</span>
                        <span className="rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          600 ฿/คู่
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 text-purple-700 hover:bg-purple-100 font-bold"
                          onClick={() => adjustSize("l", -1)}
                        >
                          -
                        </Button>
                        <Input
                          type="number"
                          min="0"
                          value={sizeL}
                          onChange={(e) => setSizeL(Math.max(0, parseInt(e.target.value) || 0))}
                          className="h-8 text-center font-mono font-bold text-sm bg-white border-purple-200 text-purple-900"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 text-purple-700 hover:bg-purple-100 font-bold"
                          onClick={() => adjustSize("l", 1)}
                        >
                          +
                        </Button>
                      </div>
                      <div className="text-right text-[11px] font-bold text-purple-700 border-t border-purple-100 pt-1">
                        = {(Number(sizeL || 0) * SIZE_PRICES.l).toLocaleString()} ฿
                      </div>
                    </div>

                    {/* Size XL (800฿) */}
                    <div className="rounded-xl border-2 border-pink-400 bg-gradient-to-b from-pink-50/80 to-white p-3 shadow-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-pink-900">Size XL</span>
                        <span className="rounded-full bg-pink-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          800 ฿/คู่
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 text-pink-700 hover:bg-pink-100 font-bold"
                          onClick={() => adjustSize("xl", -1)}
                        >
                          -
                        </Button>
                        <Input
                          type="number"
                          min="0"
                          value={sizeXL}
                          onChange={(e) => setSizeXL(Math.max(0, parseInt(e.target.value) || 0))}
                          className="h-8 text-center font-mono font-bold text-sm bg-white border-pink-200 text-pink-900"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 text-pink-700 hover:bg-pink-100 font-bold"
                          onClick={() => adjustSize("xl", 1)}
                        >
                          +
                        </Button>
                      </div>
                      <div className="text-right text-[11px] font-bold text-pink-700 border-t border-pink-100 pt-1">
                        = {(Number(sizeXL || 0) * SIZE_PRICES.xl).toLocaleString()} ฿
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Add-on Services & Extra Options */}
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-amber-600" /> ตัวเลือกบริการเสริม (Add-on Options)
                    </Label>
                    <span className="text-[11px] font-semibold text-amber-800">
                      รวมบริการเสริม: <strong>{extraServicesTotal.toLocaleString()} ฿</strong>
                    </span>
                  </div>

                  {/* Preset quick buttons */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PRESET_OPTIONS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => addPresetOption(preset)}
                        className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-left text-xs font-medium text-slate-800 shadow-2xs hover:bg-amber-100/70 hover:border-amber-400 active:scale-95 transition-all"
                      >
                        <span className="flex items-center gap-1 truncate">
                          <span>{preset.icon}</span>
                          <span className="truncate">{preset.name}</span>
                        </span>
                        <span className="font-bold text-amber-700 shrink-0 text-[11px]">{preset.tag}</span>
                      </button>
                    ))}
                  </div>

                  {/* Custom Extra Input */}
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      type="text"
                      placeholder="หรือพิมพ์ชื่อบริการเสริมอื่นๆ..."
                      value={customExtraName}
                      onChange={(e) => setCustomExtraName(e.target.value)}
                      className="h-8 text-xs bg-white flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="ราคา (฿)"
                      value={customExtraPrice}
                      onChange={(e) => setCustomExtraPrice(e.target.value ? Number(e.target.value) : "")}
                      className="h-8 text-xs font-mono w-24 bg-white"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={addCustomExtra}
                      className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1 px-3 shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" /> เพิ่ม
                    </Button>
                  </div>

                  {/* Added Extra Lines Table */}
                  {extraLines.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-white overflow-hidden mt-2">
                      <table className="w-full text-xs">
                        <thead className="bg-amber-100/60 text-amber-900 font-semibold border-b border-amber-200">
                          <tr>
                            <th className="px-2.5 py-1.5 text-left">รายการบริการเสริม</th>
                            <th className="px-2 py-1.5 text-center w-24">จำนวน</th>
                            <th className="px-2.5 py-1.5 text-right w-24">รวม (฿)</th>
                            <th className="px-2 py-1.5 w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100">
                          {extraLines.map((line) => (
                            <tr key={line.id} className="hover:bg-amber-50/50">
                              <td className="px-2.5 py-1.5 font-medium text-slate-800">{line.name}</td>
                              <td className="px-2 py-1.5 text-center">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => updateExtraQty(line.id, -1)}
                                    className="h-5 w-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold"
                                  >
                                    -
                                  </button>
                                  <span className="font-mono font-bold w-5 text-center">{line.qty}</span>
                                  <button
                                    type="button"
                                    onClick={() => updateExtraQty(line.id, 1)}
                                    className="h-5 w-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td className="px-2.5 py-1.5 text-right font-bold text-amber-900">
                                {(line.price * line.qty).toLocaleString()} ฿
                              </td>
                              <td className="px-1.5 py-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeExtraLine(line.id)}
                                  className="text-rose-500 hover:text-rose-700 p-1"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 4. Financial Breakdown & Payment Split */}
                <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/30 p-4">
                  <div className="flex items-center justify-between border-b border-teal-100 pb-2">
                    <Label className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5 text-teal-700" /> สรุปยอดเงินและวิธีชำระ (เงินสด / เงินโอน / ยอดรับจริง)
                    </Label>
                  </div>

                  {/* Summary Totals Bar */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-white p-2 border border-slate-200 shadow-2xs">
                      <div className="text-[10px] text-slate-500 font-semibold">ยอดก่อนลด</div>
                      <div className="text-xs sm:text-sm font-bold text-slate-800">{grossTotal.toLocaleString()} ฿</div>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-200 shadow-2xs">
                      <div className="text-[10px] text-amber-700 font-semibold">ส่วนลดรวม</div>
                      <div className="text-xs sm:text-sm font-bold text-amber-700">-{(Number(discount || 0)).toLocaleString()} ฿</div>
                    </div>
                    <div className="rounded-lg bg-teal-900 p-2 text-white shadow-2xs">
                      <div className="text-[10px] text-teal-200 font-semibold">ยอดสุทธิที่ต้องรับ</div>
                      <div className="text-xs sm:text-sm font-black text-teal-100">{netTotal.toLocaleString()} ฿</div>
                    </div>
                  </div>

                  {/* Discount Input */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">ส่วนลดรวม (บาท)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={discount || ""}
                      placeholder="0.00"
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                      className="text-xs h-8 font-mono bg-white"
                    />
                  </div>

                  {/* Cash & Transfer Inputs */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-blue-900 flex items-center gap-1">
                        <Smartphone className="h-3.5 w-3.5 text-blue-600" /> ยอดเงินโอน (บาท)
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={transferAmount || ""}
                        placeholder="0.00"
                        onChange={(e) => {
                          setTransferAmount(parseFloat(e.target.value) || 0);
                          setPaymentStatusManual(null);
                        }}
                        className="text-xs h-9 font-mono font-bold text-blue-900 bg-white border-blue-300"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-emerald-900 flex items-center gap-1">
                        <Wallet className="h-3.5 w-3.5 text-emerald-600" /> ยอดเงินสด (บาท)
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={cashAmount || ""}
                        placeholder="0.00"
                        onChange={(e) => {
                          setCashAmount(parseFloat(e.target.value) || 0);
                          setPaymentStatusManual(null);
                        }}
                        className="text-xs h-9 font-mono font-bold text-emerald-900 bg-white border-emerald-300"
                      />
                    </div>
                  </div>

                  {/* Quick Fill Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-slate-500 mr-1">กรอกด่วน:</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={autoFillTransferAll}
                      className="h-7 text-[11px] bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200 px-2"
                    >
                      ⚡ โอนทั้งหมด ({netTotal.toLocaleString()}฿)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={autoFillCashAll}
                      className="h-7 text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 px-2"
                    >
                      💵 เงินสดทั้งหมด ({netTotal.toLocaleString()}฿)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={autoFillHalfSplit}
                      className="h-7 text-[11px] bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 px-2"
                    >
                      🌓 แบ่ง 50/50
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={autoFillPendingAll}
                      className="h-7 text-[11px] bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 px-2"
                    >
                      ⏳ ค้างชำระ
                    </Button>
                  </div>

                  {/* Actual Received & Outstanding Card */}
                  <div className="rounded-xl border border-teal-300/80 bg-white p-3.5 shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" /> ยอดที่ได้รับจริง (Amount Paid):
                      </span>
                      <span className="text-sm font-extrabold text-teal-900 font-mono">
                        {actualReceived.toLocaleString()} บาท
                      </span>
                    </div>

                    {outstandingAmount > 0 ? (
                      <div className="flex items-center justify-between text-xs border-t border-rose-100 pt-2 text-rose-700">
                        <span className="font-bold flex items-center gap-1.5">
                          <AlertCircle className="h-4 w-4 text-rose-500" /> ยอดค้างชำระ (Outstanding):
                        </span>
                        <span className="text-sm font-black font-mono text-rose-600">
                          {outstandingAmount.toLocaleString()} บาท
                        </span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 border-t border-emerald-100 pt-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> รับชำระครบถ้วน ไม่มียอดค้างชำระ
                      </div>
                    )}
                  </div>

                  {/* Payment Status Selector */}
                  <div className="space-y-1.5 pt-1">
                    <Label className="text-xs font-bold text-slate-700">สถานะการชำระเงิน</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentStatusManual("ชำระครบ")}
                        className={`rounded-lg border py-2 px-3 text-xs font-bold text-center transition-all ${
                          currentPaymentStatus === "ชำระครบ"
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        ✓ ชำระครบ
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentStatusManual("ชำระบางส่วน")}
                        className={`rounded-lg border py-2 px-3 text-xs font-bold text-center transition-all ${
                          currentPaymentStatus === "ชำระบางส่วน"
                            ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        ⏱ ชำระบางส่วน
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentStatusManual("ค้างชำระ")}
                        className={`rounded-lg border py-2 px-3 text-xs font-bold text-center transition-all ${
                          currentPaymentStatus === "ค้างชำระ"
                            ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        ✕ ค้างชำระ
                      </button>
                    </div>
                  </div>
                </div>

                {/* Form Action Buttons */}
                <div className="flex items-center gap-3 pt-2">
                  {editingId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReset}
                      className="h-10 text-xs font-bold text-slate-600 border-slate-300"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> ยกเลิกแก้ไข
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="h-10 flex-1 bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm shadow-md gap-2"
                  >
                    {isPending ? (
                      "กำลังบันทึกข้อมูล..."
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        {editingId ? "บันทึกการแก้ไขยอดขาย" : "บันทึกยอดขายประจำวัน"}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT COLUMN: Historical Log, AR & Analytics (6 Cols) ── */}
        <div className="lg:col-span-6 space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="p-4 bg-slate-50 border-b border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900">
                    ประวัติยอดขายและรายการค้างชำระ ({filteredRecords.length} วัน)
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    รวม {overallStats.pairs} คู่ | ยอดขายรวม {overallStats.revenue.toLocaleString()} ฿ | ค้างชำระรวม {overallStats.outstanding.toLocaleString()} ฿
                  </CardDescription>
                </div>

                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-2 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="ค้นหาวันที่ / บริการ..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 text-xs pl-8 w-44 bg-white"
                  />
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 border-t border-slate-200/80 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                    activeTab === "all"
                      ? "bg-teal-800 text-white shadow-2xs"
                      : "bg-white text-slate-600 hover:bg-slate-200/70"
                  }`}
                >
                  ทั้งหมด ({records.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("outstanding")}
                  className={`rounded-lg px-3 py-1 text-xs font-bold flex items-center gap-1 transition-all ${
                    activeTab === "outstanding"
                      ? "bg-amber-600 text-white shadow-2xs"
                      : "bg-white text-amber-800 border border-amber-200 hover:bg-amber-50"
                  }`}
                >
                  <Clock className="h-3 w-3" /> ค้างชำระ ({overallStats.outstandingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("completed")}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                    activeTab === "completed"
                      ? "bg-emerald-700 text-white shadow-2xs"
                      : "bg-white text-slate-600 hover:bg-slate-200/70"
                  }`}
                >
                  ✓ ชำระครบแล้ว
                </button>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              {/* Stat Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5">
                  <div className="text-[10px] text-blue-600 font-semibold">เงินโอนสะสม</div>
                  <div className="font-extrabold text-blue-950 font-mono text-sm">
                    {overallStats.transfer.toLocaleString()} ฿
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5">
                  <div className="text-[10px] text-emerald-600 font-semibold">เงินสดสะสม</div>
                  <div className="font-extrabold text-emerald-950 font-mono text-sm">
                    {overallStats.cash.toLocaleString()} ฿
                  </div>
                </div>
                <div className="rounded-lg bg-teal-50 border border-teal-200 p-2.5">
                  <div className="text-[10px] text-teal-700 font-semibold">ยอดรับจริงรวม</div>
                  <div className="font-extrabold text-teal-950 font-mono text-sm">
                    {overallStats.totalPaid.toLocaleString()} ฿
                  </div>
                </div>
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5">
                  <div className="text-[10px] text-rose-700 font-semibold">ยอดค้างชำระสะสม</div>
                  <div className="font-extrabold text-rose-950 font-mono text-sm">
                    {overallStats.outstanding.toLocaleString()} ฿
                  </div>
                </div>
              </div>

              {/* Records Table */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                <div className="max-h-[580px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-100/90 backdrop-blur-xs text-slate-700 font-bold border-b border-slate-200 z-10">
                      <tr>
                        <th className="px-3 py-2.5 text-left">วันที่</th>
                        <th className="px-2 py-2.5 text-center">ไซส์ (S/M/L/XL)</th>
                        <th className="px-2.5 py-2.5 text-right">ยอดรับจริง / สุทธิ</th>
                        <th className="px-2.5 py-2.5 text-center">สถานะ / ค้างชำระ</th>
                        <th className="px-2 py-2.5 text-center">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredRecords.map((record) => {
                        const recPairs =
                          (record.size_s || 0) +
                          (record.size_m || 0) +
                          (record.size_l || 0) +
                          (record.size_xl || 0);

                        const hasPayments = (record.payments || []).length > 0;
                        const isExpanded = expandedRecordId === record.id;

                        const isPendingRow = record.outstanding > 0 || record.payment_status === "ชำระบางส่วน" || record.payment_status === "ค้างชำระ";

                        return (
                          <tr
                            key={record.id}
                            className={`transition-colors ${
                              isPendingRow ? "bg-amber-50/30 hover:bg-amber-50/70" : "hover:bg-slate-50/80"
                            }`}
                          >
                            <td className="px-3 py-2.5 font-bold text-slate-900 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span>{record.date}</span>
                                {hasPayments && (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedRecordId(isExpanded ? null : record.id)}
                                    className="rounded p-0.5 text-slate-400 hover:text-teal-700"
                                    title="ดูประวัติการรับชำระเงิน"
                                  >
                                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                  </button>
                                )}
                              </div>
                              {record.extra_items && (
                                <div className="text-[10px] text-amber-700 font-normal truncate max-w-[140px]" title={record.extra_items}>
                                  + {record.extra_items}
                                </div>
                              )}
                              {/* Expanded Payment History */}
                              {isExpanded && hasPayments && (
                                <div className="mt-2 p-2 rounded bg-white border border-teal-200 text-[10px] text-slate-700 space-y-1">
                                  <div className="font-bold text-teal-900">ประวัติการรับชำระเงินภายหลัง:</div>
                                  {record.payments.map((p) => (
                                    <div key={p.id} className="flex items-center justify-between border-b border-slate-100 pb-0.5">
                                      <span>
                                        📅 {p.received_date}: <strong>{Number(p.amount).toLocaleString()} ฿</strong> ({p.pay_method})
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteArPayment(p.id, record.date, Number(p.amount))}
                                        className="text-rose-500 hover:text-rose-700"
                                        title="ลบรายการรับเงินนี้"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>

                            <td className="px-2 py-2.5 text-center">
                              <div className="font-bold text-teal-900 font-mono">{recPairs} คู่</div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                S:{record.size_s || 0} M:{record.size_m || 0} L:{record.size_l || 0} XL:{record.size_xl || 0}
                              </div>
                            </td>

                            <td className="px-2.5 py-2.5 text-right font-mono whitespace-nowrap">
                              <div className="font-black text-slate-900">{record.total_paid.toLocaleString()} ฿</div>
                              <div className="text-[10px] text-slate-500">
                                สุทธิ {record.total_revenue.toLocaleString()} ฿
                              </div>
                              {record.total_ar_paid > 0 && (
                                <div className="text-[10px] text-emerald-700 font-semibold">
                                  (รับเพิ่ม +{record.total_ar_paid.toLocaleString()}฿)
                                </div>
                              )}
                            </td>

                            <td className="px-2 py-2.5 text-center whitespace-nowrap">
                              {record.outstanding > 0 ? (
                                <div className="space-y-1">
                                  <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 font-bold text-[10px]">
                                    ค้าง {record.outstanding.toLocaleString()} ฿
                                  </Badge>
                                  <div>
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => openCollectModal(record)}
                                      className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2 gap-1 shadow-2xs"
                                    >
                                      <DollarSign className="h-3 w-3" /> รับชำระ
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]">
                                  ✓ ชำระครบ
                                </Badge>
                              )}
                            </td>

                            <td className="px-2 py-2.5 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEdit(record)}
                                  className="h-7 w-7 p-0 text-slate-600 hover:text-teal-700"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(record.id)}
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredRecords.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                            ยังไม่มีรายการบันทึกยอดขาย
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── AR Collect Payment Modal ── */}
      {collectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <DollarSign className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">บันทึกรับชำระยอดค้าง (AR)</h3>
                  <p className="text-xs text-slate-500">บิลวันที่ {collectTarget.date}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeCollectModal}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>ยอดสุทธิของบิล:</span>
                <span className="font-bold">{collectTarget.total_revenue.toLocaleString()} บาท</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>ชำระไปแล้วก่อนหน้า:</span>
                <span className="font-bold text-emerald-700">{collectTarget.total_paid.toLocaleString()} บาท</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-amber-900 font-bold">
                <span>ยอดคงค้างชำระ:</span>
                <span className="font-black text-amber-700 font-mono text-sm">
                  {collectTarget.outstanding.toLocaleString()} บาท
                </span>
              </div>
            </div>

            <form onSubmit={handleCollectSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">วันที่รับเงิน</Label>
                <Input
                  type="date"
                  value={collectDate}
                  onChange={(e) => setCollectDate(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">จำนวนเงินที่รับชำระ (บาท)</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={collectTarget.outstanding || undefined}
                  value={collectAmount || ""}
                  onChange={(e) => setCollectAmount(parseFloat(e.target.value) || 0)}
                  className="h-9 text-xs font-mono font-bold text-emerald-800"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">ช่องทางการรับเงิน</Label>
                <select
                  value={collectMethod}
                  onChange={(e) => setCollectMethod(e.target.value as any)}
                  className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium focus:border-teal-600 focus:outline-none"
                >
                  <option value="โอน">โอนเงินเข้าบัญชี (Transfer)</option>
                  <option value="เงินสด">เงินสด (Cash)</option>
                  <option value="อื่นๆ">อื่นๆ</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">หมายเหตุ / อ้างอิงสลิป</Label>
                <Input
                  type="text"
                  placeholder="เช่น โอนผ่าน PromptPay ธ.กสิกรไทย"
                  value={collectNotes}
                  onChange={(e) => setCollectNotes(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={closeCollectModal}
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
                  {isPending ? "กำลังบันทึก..." : <><Check className="h-4 w-4" /> ยืนยันรับชำระเงิน</>}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

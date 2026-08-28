"use client";

import { useState, useTransition } from "react";
import { createServiceOrder, updateOrderStatus, type PosActionState } from "@/app/actions/pos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Sparkles,
  Plus,
  Trash2,
  Phone,
  User,
  Footprints,
  Clock,
  CheckCircle2,
  Truck,
  DollarSign,
  Receipt,
  Search,
  Filter,
  RefreshCw,
} from "lucide-react";

export type OrderItem = {
  id: string;
  order_no: string;
  customer_name: string;
  customer_phone: string;
  shoe_brand: string | null;
  shoe_model: string | null;
  shoe_color: string | null;
  shoe_size: string;
  status: "received" | "in_progress" | "ready" | "delivered" | "cancelled";
  payment_method: "cash" | "transfer" | "credit" | "unpaid";
  gross_amount: number;
  discount_amount: number;
  net_amount: number;
  received_at: string;
  notes: string | null;
};

const DEFAULT_SERVICES = [
  { id: "s1", name: "ซักทำความสะอาดทั่วไป (Basic Clean)", price: 150, category: "cleaning" },
  { id: "s2", name: "ซักละเอียด + ฆ่าเชื้อ (Deep Clean)", price: 250, category: "cleaning" },
  { id: "s3", name: "ซักด่วนพิเศษ (Express Clean)", price: 350, category: "cleaning" },
  { id: "s4", name: "แก้ยางเหลืองขอบรองเท้า (Unyellowing)", price: 300, category: "treatment" },
  { id: "s5", name: "ทำสี / เก็บรายละเอียด (Repaint)", price: 500, category: "repair" },
  { id: "s6", name: "ซ่อมพื้น / ติดกาว (Sole Repair)", price: 200, category: "repair" },
  { id: "s7", name: "เคลือบสเปรย์กันน้ำนาโน (Waterproof)", price: 100, category: "treatment" },
];

const POPULAR_BRANDS = ["Nike", "Adidas", "Jordan", "New Balance", "Converse", "Vans", "On Cloud", "Asics"];
const SIZES = [
  { label: "S (35-37)", val: "S" },
  { label: "M (38-41)", val: "M" },
  { label: "L (42-44)", val: "L" },
  { label: "XL (45+)", val: "XL" },
];

const STATUS_CONFIG = {
  received: { label: "รับงานแล้ว", color: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300" },
  in_progress: { label: "กำลังดำเนินการ", color: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300" },
  ready: { label: "พร้อมส่งมอบ", color: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300" },
  delivered: { label: "ส่งมอบแล้ว", color: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300" },
  cancelled: { label: "ยกเลิก", color: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/50 dark:text-rose-300" },
};

export function PosClient({ initialOrders }: { initialOrders: OrderItem[] }) {
  const [orders, setOrders] = useState<OrderItem[]>(initialOrders);
  const [selectedServices, setSelectedServices] = useState<{ id: string; name: string; price: number }[]>([
    DEFAULT_SERVICES[0],
  ]);
  const [selectedBrand, setSelectedBrand] = useState("Nike");
  const [selectedSize, setSelectedSize] = useState("M");
  const [discount, setDiscount] = useState<number>(0);
  const [customServiceName, setCustomServiceName] = useState("");
  const [customServicePrice, setCustomServicePrice] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "credit" | "unpaid">("cash");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isPending, startTransition] = useTransition();

  // Price calculations
  const grossAmount = selectedServices.reduce((sum, s) => sum + s.price, 0);
  const netAmount = Math.max(0, grossAmount - discount);

  function toggleService(service: { id: string; name: string; price: number }) {
    if (selectedServices.some((s) => s.id === service.id)) {
      setSelectedServices(selectedServices.filter((s) => s.id !== service.id));
    } else {
      setSelectedServices([...selectedServices, service]);
    }
  }

  function addCustomService() {
    if (!customServiceName.trim()) return;
    const newService = {
      id: `custom-${Date.now()}`,
      name: customServiceName.trim(),
      price: Number(customServicePrice) || 0,
    };
    setSelectedServices([...selectedServices, newService]);
    setCustomServiceName("");
    setCustomServicePrice(0);
  }

  function removeService(id: string) {
    setSelectedServices(selectedServices.filter((s) => s.id !== id));
  }

  async function handleSubmitOrder(formData: FormData) {
    startTransition(async () => {
      formData.set("shoe_brand", selectedBrand);
      formData.set("shoe_size", selectedSize);
      formData.set("gross_amount", String(grossAmount));
      formData.set("discount_amount", String(discount));
      formData.set("net_amount", String(netAmount));
      formData.set("payment_method", paymentMethod);
      if (paymentMethod === "cash") {
        formData.set("cash_amount", String(netAmount));
        formData.set("transfer_amount", "0");
      } else if (paymentMethod === "transfer") {
        formData.set("cash_amount", "0");
        formData.set("transfer_amount", String(netAmount));
      }

      // Add selected services
      selectedServices.forEach((s) => {
        formData.append("service_items", JSON.stringify(s));
      });

      const res = await createServiceOrder(undefined, formData);
      if (res?.error) {
        toast.error(res.error);
      } else if (res?.success) {
        toast.success(`บันทึกรับงานสำเร็จ เลขที่: ${res.orderNo}`);
        // Reset form
        setSelectedServices([DEFAULT_SERVICES[0]]);
        setDiscount(0);
        // Refresh orders locally
        const newOrder: OrderItem = {
          id: `tmp-${Date.now()}`,
          order_no: res.orderNo || `SC-${Date.now()}`,
          customer_name: String(formData.get("customer_name") ?? ""),
          customer_phone: String(formData.get("customer_phone") ?? ""),
          shoe_brand: selectedBrand,
          shoe_model: String(formData.get("shoe_model") ?? ""),
          shoe_color: String(formData.get("shoe_color") ?? ""),
          shoe_size: selectedSize,
          status: "received",
          payment_method: paymentMethod,
          gross_amount: grossAmount,
          discount_amount: discount,
          net_amount: netAmount,
          received_at: new Date().toISOString(),
          notes: String(formData.get("notes") ?? ""),
        };
        setOrders([newOrder, ...orders]);
      }
    });
  }

  async function handleStatusChange(orderId: string, newStatus: "received" | "in_progress" | "ready" | "delivered") {
    try {
      await updateOrderStatus(orderId, newStatus);
      toast.success("อัปเดตสถานะสำเร็จ");
      setOrders(orders.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
    } catch (err: any) {
      toast.error(err.message || "เกิดข้อผิดพลาด");
    }
  }

  const filteredOrders = orders.filter((o) => {
    const matchesStatus = filterStatus === "all" || o.status === filterStatus;
    const matchesSearch =
      searchTerm === "" ||
      o.order_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customer_phone.includes(searchTerm) ||
      (o.shoe_brand && o.shoe_brand.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-8">
      {/* ── Page Header Banner ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-teal-700 via-teal-800 to-slate-900 p-6 text-white shadow-md">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/30">
            <Sparkles className="h-3.5 w-3.5" />
            POS & Service Orders
          </div>
          <h2 className="text-2xl font-bold tracking-tight">งานบริการ / รับงานซักรองเท้า</h2>
          <p className="text-sm text-teal-100/80">
            บันทึกรับงานรองเท้า ออกใบรับฝาก คำนวณราคา และติดตามสถานะงานซัก-ซ่อมแบบเรียลไทม์
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/10 p-3 text-center backdrop-blur-sm">
            <div className="text-xs text-teal-200">งานค้างวันนี้</div>
            <div className="text-xl font-bold text-white">
              {orders.filter((o) => o.status === "received" || o.status === "in_progress").length} คู่
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* ── LEFT COLUMN: POS RECEIVING FORM (7 COLS) ── */}
        <div className="lg:col-span-7">
          <Card className="border-slate-200 shadow-sm dark:border-slate-800">
            <CardHeader className="bg-slate-50/50 pb-4 border-b border-slate-100 dark:border-slate-800/60 dark:bg-slate-900/50">
              <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Footprints className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                ฟอร์มรับงานซัก / ซ่อมรองเท้า
              </CardTitle>
              <CardDescription>กรอกข้อมูลลูกค้าและเลือกลักษณะบริการที่ต้องการ</CardDescription>
            </CardHeader>

            <CardContent className="p-6">
              <form action={handleSubmitOrder} className="space-y-6">
                {/* 1. Customer Information */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-teal-600" /> ข้อมูลลูกค้า
                  </h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="customer_name" className="text-xs font-semibold">
                        ชื่อลูกค้า <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        id="customer_name"
                        name="customer_name"
                        placeholder="ชื่อ-นามสกุล หรือ ชื่อเล่น"
                        required
                        className="bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="customer_phone" className="text-xs font-semibold">
                        เบอร์โทรศัพท์ <span className="text-rose-500">*</span>
                      </Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                          id="customer_phone"
                          name="customer_phone"
                          placeholder="0812345678"
                          required
                          className="pl-9 bg-white dark:bg-slate-900"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <hr className="border-slate-100 dark:border-slate-800" />

                {/* 2. Shoe Details */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Footprints className="h-3.5 w-3.5 text-teal-600" /> ข้อมูลรองเท้า
                  </h4>

                  {/* Quick Brand Pills */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">ยี่ห้อ / แบรนด์</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {POPULAR_BRANDS.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setSelectedBrand(b)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                            selectedBrand === b
                              ? "bg-teal-600 text-white shadow-xs"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="shoe_model" className="text-xs font-semibold">
                        รุ่นรองเท้า (Model)
                      </Label>
                      <Input id="shoe_model" name="shoe_model" placeholder="Air Force 1, Samba ฯลฯ" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="shoe_color" className="text-xs font-semibold">
                        สีรองเท้า
                      </Label>
                      <Input id="shoe_color" name="shoe_color" placeholder="ขาวล้วน, ดำ-แดง ฯลฯ" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">ขนาด (Size)</Label>
                      <div className="grid grid-cols-4 gap-1">
                        {SIZES.map((s) => (
                          <button
                            key={s.val}
                            type="button"
                            onClick={() => setSelectedSize(s.val)}
                            className={`rounded-md py-1.5 text-center text-xs font-semibold transition-all ${
                              selectedSize === s.val
                                ? "bg-teal-600 text-white shadow-xs"
                                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            {s.val}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <hr className="border-slate-100 dark:border-slate-800" />

                {/* 3. Service Selection */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-teal-600" /> เลือกบริการหลัก & บริการเสริม
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {DEFAULT_SERVICES.map((s) => {
                      const isSelected = selectedServices.some((item) => item.id === s.id);
                      return (
                        <div
                          key={s.id}
                          onClick={() => toggleService(s)}
                          className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-all ${
                            isSelected
                              ? "border-teal-500 bg-teal-50/70 ring-1 ring-teal-500 dark:bg-teal-950/40"
                              : "border-slate-200 bg-white hover:border-teal-300 dark:border-slate-800 dark:bg-slate-900"
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{s.name}</div>
                            <div className="text-[11px] text-teal-700 font-bold dark:text-teal-400">
                              {s.price.toLocaleString()} ฿
                            </div>
                          </div>
                          <div
                            className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                              isSelected ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white"
                            }`}
                          >
                            {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Custom Service */}
                  <div className="flex gap-2 pt-2">
                    <Input
                      placeholder="เพิ่มบริการอื่นๆ (เช่น เปลี่ยนเชือก, ดัดทรง)"
                      value={customServiceName}
                      onChange={(e) => setCustomServiceName(e.target.value)}
                      className="text-xs"
                    />
                    <Input
                      type="number"
                      placeholder="ราคา (฿)"
                      value={customServicePrice || ""}
                      onChange={(e) => setCustomServicePrice(Number(e.target.value))}
                      className="w-28 text-xs"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={addCustomService} className="gap-1 text-xs">
                      <Plus className="h-3.5 w-3.5" /> เพิ่ม
                    </Button>
                  </div>
                </div>

                <hr className="border-slate-100 dark:border-slate-800" />

                {/* 4. Payment and Totals Summary */}
                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900/80 space-y-4 border border-slate-200/80 dark:border-slate-800">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label className="text-xs font-semibold text-slate-500">ยอดรวมบริการ</Label>
                      <div className="text-lg font-bold text-slate-700 dark:text-slate-300">
                        {grossAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="discount" className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        ส่วนลดรวม (บาท)
                      </Label>
                      <Input
                        id="discount"
                        type="number"
                        min="0"
                        value={discount || ""}
                        onChange={(e) => setDiscount(Number(e.target.value))}
                        placeholder="0"
                        className="h-8 text-sm border-amber-300"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-teal-800 dark:text-teal-300">ยอดสุทธิที่ต้องชำระ</Label>
                      <div className="text-xl font-extrabold text-teal-700 dark:text-teal-400">
                        {netAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
                      </div>
                    </div>
                  </div>

                  {/* Payment Method Selector */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                    <Label className="text-xs font-semibold">วิธีชำระเงิน</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { id: "cash", label: "💵 เงินสด" },
                        { id: "transfer", label: "📱 โอนเงิน" },
                        { id: "credit", label: "💳 บัตรเครดิต" },
                        { id: "unpaid", label: "⏳ จ่ายตอนรับ" },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setPaymentMethod(m.id as any)}
                          className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                            paymentMethod === m.id
                              ? "bg-teal-700 text-white shadow-xs"
                              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="notes" className="text-xs font-semibold">
                      หมายเหตุ / รายละเอียดเพิ่มเติม (เช่น ตำแหน่งรอยเลอะ, นัดรับวันไหน)
                    </Label>
                    <Input id="notes" name="notes" placeholder="หมายเหตุพิเศษ..." className="text-xs" />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isPending || selectedServices.length === 0}
                  className="w-full h-11 bg-teal-600 font-bold text-white hover:bg-teal-700 shadow-sm text-sm gap-2"
                >
                  <Receipt className="h-4 w-4" />
                  {isPending ? "กำลังบันทึกข้อมูล..." : "บันทึกรับงานรองเท้า (สร้างรายการ)"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT COLUMN: ORDERS TRACKING & LIST (5 COLS) ── */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="border-slate-200 shadow-sm dark:border-slate-800">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800/60">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-teal-600" />
                  รายการงานในระบบ ({filteredOrders.length})
                </CardTitle>
                <div className="text-xs text-muted-foreground">อัปเดตล่าสุดเรียลไทม์</div>
              </div>

              {/* Filters & Search */}
              <div className="flex flex-col gap-2 pt-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder="ค้นหาชื่อ, เบอร์โทร, เลขที่บิล..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 pl-8 text-xs bg-slate-50 dark:bg-slate-900"
                  />
                </div>

                <div className="flex flex-wrap gap-1">
                  {[
                    { id: "all", label: "ทั้งหมด" },
                    { id: "received", label: "รับงาน" },
                    { id: "in_progress", label: "กำลังทำ" },
                    { id: "ready", label: "พร้อมรับ" },
                    { id: "delivered", label: "ส่งมอบแล้ว" },
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setFilterStatus(st.id)}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-all ${
                        filterStatus === st.id
                          ? "bg-teal-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-800 max-h-[680px] overflow-y-auto">
              {filteredOrders.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  <Footprints className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                  ยังไม่มีรายการงานที่ตรงกับเงื่อนไข
                </div>
              ) : (
                filteredOrders.map((order) => {
                  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.received;
                  return (
                    <div key={order.id} className="p-4 hover:bg-slate-50/80 dark:hover:bg-slate-900/50 transition-all space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-teal-800 dark:text-teal-300">{order.order_no}</span>
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.color}`}>
                              {cfg.label}
                            </span>
                          </div>
                          <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                            {order.customer_name} <span className="text-xs text-slate-400 font-normal">({order.customer_phone})</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-teal-700 dark:text-teal-400">
                            {order.net_amount.toLocaleString()} ฿
                          </div>
                          <div className="text-[10px] text-slate-400 uppercase">{order.payment_method}</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-lg p-2">
                        <span>
                          👟 {order.shoe_brand} {order.shoe_model} ({order.shoe_size})
                        </span>
                        <span>{new Date(order.received_at).toLocaleDateString("th-TH")}</span>
                      </div>

                      {order.notes && (
                        <div className="text-[11px] text-slate-500 italic bg-amber-50/50 dark:bg-amber-950/20 px-2 py-1 rounded">
                          📝 {order.notes}
                        </div>
                      )}

                      {/* Status Action Buttons */}
                      <div className="flex items-center gap-1.5 pt-1">
                        {order.status === "received" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatusChange(order.id, "in_progress")}
                            className="h-7 text-[11px] bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                          >
                            เริ่มทำความสะอาด
                          </Button>
                        )}
                        {order.status === "in_progress" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatusChange(order.id, "ready")}
                            className="h-7 text-[11px] bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                          >
                            ✓ ซักเสร็จแล้ว (พร้อมรับ)
                          </Button>
                        )}
                        {order.status === "ready" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatusChange(order.id, "delivered")}
                            className="h-7 text-[11px] bg-teal-600 text-white hover:bg-teal-700"
                          >
                            📦 ส่งมอบให้ลูกค้าแล้ว
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

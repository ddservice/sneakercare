"use client";

import { useState, useTransition } from "react";
import { updateShopProfile, type ShopProfile } from "@/app/actions/shop-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2, Image as ImageIcon, Save, QrCode } from "lucide-react";
import { errorMessage } from "@/lib/errors";

export function ShopProfileForm({ initialProfile }: { initialProfile: ShopProfile }) {
  const [profile, setProfile] = useState<ShopProfile>(initialProfile);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await updateShopProfile(profile);
        toast.success("บันทึกข้อมูลร้านและหัวบิลเรียบร้อยแล้ว");
      } catch (err) {
        toast.error(errorMessage(err, "เกิดข้อผิดพลาดในการบันทึก"));
      }
    });
  }

  return (
    <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
      <CardHeader className="border-b border-slate-100 pb-4">
        <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
          <Building2 className="h-5 w-5 text-teal-700" />
          ข้อมูลร้าน & หัวบิลเอกสาร (Shop Branding & Tax Profile)
        </CardTitle>
        <CardDescription className="text-xs">
          กำหนดโลโก้ ชื่อร้าน ที่อยู่ เลขผู้เสียภาษี และ PromptPay ที่จะแสดงบนหัวใบเสร็จ ใบวางบิล และใบกำกับภาษี
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Logo & Header Preview */}
          <div className="flex flex-wrap items-center gap-6 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="h-20 w-20 rounded-xl border border-slate-200 bg-white p-1 flex items-center justify-center overflow-hidden shadow-xs shrink-0">
              {profile.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- โลโก้ร้านเป็น URL ที่เจ้าของวางเองจากโฮสต์ใดก็ได้ และใช้ในเอกสาร A4 ที่สั่งพิมพ์ (next/image ต้องประกาศ remotePatterns ล่วงหน้า และแทรก wrapper ที่กวนการจัดหน้ากระดาษ)
                <img
                  src={profile.logoUrl}
                  alt="Shop Logo"
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    e.currentTarget.src = "";
                  }}
                />
              ) : (
                <ImageIcon className="h-8 w-8 text-slate-300" />
              )}
            </div>
            <div className="space-y-1.5 flex-1 min-w-[240px]">
              <Label className="text-xs font-semibold text-slate-700">URL โลโก้ร้าน (Logo Image URL)</Label>
              <Input
                value={profile.logoUrl}
                onChange={(e) => setProfile({ ...profile, logoUrl: e.target.value })}
                placeholder="https://.../LOGO.png"
                className="text-xs h-9 bg-white"
              />
              <p className="text-[11px] text-slate-400">
                รองรับไฟล์ภาพ JPEG, PNG, SVG (แนะนำพื้นหลังโปร่งใสหรือสีขาว)
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold text-slate-700">
                ชื่อร้าน / ชื่อบริษัท (ตามทะเบียนพาณิชย์/นิติบุคคล) <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                placeholder="เช่น บริษัท รวยรับทรัพย์168 จำกัด หรือ ชื่อร้าน/กิจการของคุณ"
                className="text-xs h-9"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                เลขประจำตัวผู้เสียภาษี (Tax ID 13 หลัก) <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={profile.taxId}
                onChange={(e) => setProfile({ ...profile, taxId: e.target.value })}
                placeholder="เลข 13 หลัก เช่น 0505568021002"
                className="text-xs h-9 font-mono"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">เบอร์โทรศัพท์ร้าน</Label>
              <Input
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="เช่น 052-010-120"
                className="text-xs h-9"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold text-slate-700">
                ที่อยู่สาขา / สำนักงานใหญ่ (ที่ระบุในหัวบิลและใบกำกับภาษี) <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                placeholder="เลขที่ อาคาร ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"
                className="text-xs h-9"
                required
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <QrCode className="h-3.5 w-3.5 text-teal-700" />
                PromptPay ID สำหรับรับเงิน (เบอร์โทร หรือ เลขผู้เสียภาษี 13 หลัก)
              </Label>
              <Input
                value={profile.promptPayId}
                onChange={(e) => setProfile({ ...profile, promptPayId: e.target.value })}
                placeholder="0505568021002 หรือ 0812345678"
                className="text-xs h-9 font-mono"
              />
              <p className="text-[11px] text-slate-400">
                ระบบจะนำ PromptPay ID นี้ไปปั่น QR Code ยอดเงินอัตโนมัติในใบแจ้งหนี้และใบวางบิล
              </p>
            </div>

            <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={profile.vatRegistered}
                  onChange={(e) => setProfile({ ...profile, vatRegistered: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  <span className="block text-xs font-semibold text-slate-800">จดทะเบียนภาษีมูลค่าเพิ่ม (VAT)</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    จดทะเบียนเป็นระดับกิจการ ไม่ใช่ต่อสาขา — ถ้าไม่จด ออกได้เฉพาะบิลเงินสด ไม่มีใบกำกับภาษี
                    ถ้าจดแล้วที่หน้าออกเอกสารเลือกได้ต่อใบว่าเป็นบิลเงินสดหรือบิล VAT 7%
                  </span>
                </span>
              </label>
            </div>

            <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-800">ลายเซ็นและตราประทับบนหนังสือรับรอง 50 ทวิ</div>
              <p className="text-[11px] text-slate-500">
                เมื่อออกเอกสารแล้ว ระบบประทับรูปเหล่านี้ฝั่งผู้มีหน้าที่หักภาษีอัตโนมัติตอนพิมพ์ — วางเป็น URL ภาพพื้นโปร่งใส
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">ชื่อผู้มีอำนาจลงนาม</Label>
                  <Input
                    value={profile.signatoryName}
                    onChange={(e) => setProfile({ ...profile, signatoryName: e.target.value })}
                    placeholder="เช่น ชื่อ-นามสกุล ผู้จัดการ"
                    className="text-xs h-9 bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">URL ลายเซ็นดิจิทัล</Label>
                  <Input
                    value={profile.signatureUrl}
                    onChange={(e) => setProfile({ ...profile, signatureUrl: e.target.value })}
                    placeholder="https://.../signature.png"
                    className="text-xs h-9 bg-white"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold text-slate-700">URL ตราประทับบริษัท</Label>
                  <Input
                    value={profile.stampUrl}
                    onChange={(e) => setProfile({ ...profile, stampUrl: e.target.value })}
                    placeholder="https://.../stamp.png"
                    className="text-xs h-9 bg-white"
                  />
                </div>
              </div>
              {(profile.signatureUrl || profile.stampUrl) && (
                <div className="flex flex-wrap items-center gap-4">
                  {profile.signatureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- ลายเซ็นจาก URL ที่เจ้าของวางเอง
                    <img src={profile.signatureUrl} alt="" className="h-12 max-w-[160px] object-contain bg-white border rounded p-1" />
                  ) : null}
                  {profile.stampUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- ตราประทับจาก URL ที่เจ้าของวางเอง
                    <img src={profile.stampUrl} alt="" className="h-16 w-16 object-contain bg-white border rounded p-1" />
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={isPending}
              className="bg-teal-700 hover:bg-emerald-600 text-white text-xs font-semibold h-10 px-6 gap-2"
            >
              <Save className="h-4 w-4" />
              {isPending ? "กำลังบันทึก..." : "บันทึกข้อมูลร้าน & หัวบิล"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

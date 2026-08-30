"use client";

import { useState, useTransition } from "react";
import { updateShopProfile, type ShopProfile } from "@/app/actions/shop-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2, Image as ImageIcon, Save, CheckCircle2, Phone, MapPin, QrCode } from "lucide-react";

export function ShopProfileForm({ initialProfile }: { initialProfile: ShopProfile }) {
  const [profile, setProfile] = useState<ShopProfile>(initialProfile);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await updateShopProfile(profile);
        toast.success("บันทึกข้อมูลร้านและหัวบิลเรียบร้อยแล้ว");
      } catch (err: any) {
        toast.error(err.message || "เกิดข้อผิดพลาดในการบันทึก");
      }
    });
  }

  return (
    <Card className="border-slate-200 shadow-xs">
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
                <img
                  src={profile.logoUrl}
                  alt="Shop Logo"
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    (e.target as any).src = "";
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
                placeholder="เช่น บริษัท รวยรับทรัพย์168 จำกัด หรือ Sneaker Care"
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
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={isPending}
              className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold h-10 px-6 gap-2"
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

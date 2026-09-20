import { AuthGate } from "./auth-gate";
import { Footprints } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="flex min-h-svh w-full flex-col items-center justify-center bg-slate-50 p-6 text-slate-800">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-teal-700 text-white">
            <Footprints className="h-5 w-5" />
          </span>
          <p className="text-sm font-semibold text-slate-900">DD-Management</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-7">
          <div className="mb-6 space-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">
              เข้าสู่ระบบ
            </h1>
          </div>
          <AuthGate />
        </div>
      </div>
    </main>
  );
}

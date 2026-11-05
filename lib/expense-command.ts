import { expenseCommandSchema } from "./finance-validation";
import { categoryKeyFor } from "./expense-categories";

export function parseExpenseForm(formData: FormData) {
  const withhold = formData.get("withhold") === "1";
  return expenseCommandSchema.safeParse({
    date: String(formData.get("expense_date") ?? ""),
    title: String(formData.get("title") ?? ""),
    category_key: categoryKeyFor(String(formData.get("category") ?? "")),
    amount: Number(formData.get("amount")),
    pay_method: String(formData.get("pay_method") ?? "บัญชีร้าน"),
    withhold, vat_rate: withhold ? Number(formData.get("vat_rate") || 0) : 0,
    wht_rate: withhold ? Number(formData.get("wht_rate") || 0) : 0,
    payee_id: withhold ? String(formData.get("payee_id") ?? "") : "",
    payee_kind: String(formData.get("payee_kind") || "person"),
    payee_name: withhold ? String(formData.get("payee_name") ?? "") : "",
    payee_tax_id: withhold ? String(formData.get("payee_tax_id") ?? "").replace(/[^0-9]/g, "") : "",
    payee_address: withhold ? String(formData.get("payee_address") ?? "") : "",
  });
}

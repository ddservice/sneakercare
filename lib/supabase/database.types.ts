// ⚠️ ไฟล์นี้ generate จากฐานข้อมูล production โดยตรง — อย่าแก้ส่วน `Database` ด้วยมือ
//
// สร้างด้วย (รันบน VPS ที่มี SUPABASE_DB_URL อยู่แล้ว):
//   npx supabase@latest gen types typescript --db-url "$SUPABASE_DB_URL" --schema public
//
// ⚠️ ก่อนหน้านี้ (จนถึง 2026-09-06) ไฟล์นี้เขียนมือและมีแค่ตารางฝั่งคลังสินค้า ทำให้โค้ดทั้งโปรเจกต์
// ต้องใช้รูปแบบ `(supabase.from("sc_x" as any) as any)` เพื่อเข้าถึงตาราง sc_* ซึ่งปิดตาการตรวจของ
// TypeScript ทั้งหมด — เป็นต้นเหตุจริงของบั๊ก 2 ตัวที่กว่าจะรู้ก็สายไปแล้ว:
//   • lib/audit.ts เขียน log ลงคอลัมน์ที่ไม่มีอยู่จริง ระบบ audit จึงไม่ทำงานเลยหลายเดือน
//   • ปุ่มบันทึก Telegram Bot Token เรียก RPC ผิดชื่อ (`fn_set_integration_secret` แทน
//     `inv_fn_set_integration_secret`) พังเงียบจนต้องใช้ตอนฉุกเฉินถึงเพิ่งรู้
// ตอนนี้ types ครบทั้ง sc_*, inv_*, view และ RPC ทุกตัวแล้ว — ให้ค่อยๆ ถอด `as any` ออกจากโค้ด
// และ **ห้ามเพิ่ม `as any` ใหม่** ถ้า type ไม่ตรงแปลว่าโค้ดผิด ไม่ใช่ type ผิด
//
// หมายเหตุ: @supabase/postgrest-js กำหนดให้ทุก Table/View ต้องมี `Relationships: []` เสมอ
// ไม่งั้น type ทั้งชุดจะ resolve เป็น `never` (ตัว generator ใส่ให้อยู่แล้ว)

// ── ชนิดข้อมูลที่เขียนมือ (ไม่ได้มาจาก generator) ────────────────────────
// เป็น union ที่ใช้ทั่วแอปเพื่อความอ่านง่าย ต้องคงไว้ ตัว generator ไม่สร้างให้เพราะฐานข้อมูล
// เก็บคอลัมน์พวกนี้เป็น text ธรรมดา ไม่ใช่ enum จริง
export type UserRole = "admin" | "co_admin" | "staff";
export type ItemType = "inventory" | "consumable";
export type StockTxnType =
  | "stock_in"
  | "stock_out"
  | "adjustment_increase"
  | "adjustment_decrease"
  | "waste";
export type StockTxnStatus = "approved" | "pending_approval" | "rejected";
export type AuditAction = "INSERT" | "UPDATE" | "DELETE";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      customers: {
        Row: {
          created_at: string
          id: string
          name: string
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          branch_id: string | null
          category: string
          created_at: string
          created_by: string | null
          expense_date: string
          id: string
          note: string | null
          title: string
        }
        Insert: {
          amount?: number
          branch_id?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          note?: string | null
          title: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          note?: string | null
          title?: string
        }
        Relationships: []
      }
      inv_audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["inv_audit_action"]
          after_data: Json | null
          before_data: Json | null
          id: number
          performed_at: string
          performed_by: string | null
          reason: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: Database["public"]["Enums"]["inv_audit_action"]
          after_data?: Json | null
          before_data?: Json | null
          id?: never
          performed_at?: string
          performed_by?: string | null
          reason?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: Database["public"]["Enums"]["inv_audit_action"]
          after_data?: Json | null
          before_data?: Json | null
          id?: never
          performed_at?: string
          performed_by?: string | null
          reason?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "sc_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      inv_branches: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          telegram_chat_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          telegram_chat_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          telegram_chat_id?: string | null
        }
        Relationships: []
      }
      inv_integration_secrets: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_integration_secrets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "sc_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      inv_item_stock: {
        Row: {
          alert_muted: boolean
          avg_unit_cost: number
          branch_id: string
          current_qty: number
          id: string
          item_id: string
          min_stock_level: number
          updated_at: string
        }
        Insert: {
          alert_muted?: boolean
          avg_unit_cost?: number
          branch_id: string
          current_qty?: number
          id?: string
          item_id: string
          min_stock_level?: number
          updated_at?: string
        }
        Update: {
          alert_muted?: boolean
          avg_unit_cost?: number
          branch_id?: string
          current_qty?: number
          id?: string
          item_id?: string
          min_stock_level?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_item_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "inv_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_v_low_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_v_top_consumed_items_30d"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_top_consumed_items_30d"
            referencedColumns: ["item_id"]
          },
        ]
      }
      inv_items: {
        Row: {
          base_unit: string
          category: string
          created_at: string
          default_min_stock_level: number
          id: string
          is_active: boolean
          item_type: Database["public"]["Enums"]["inv_item_type"]
          name: string
          purchase_unit: string
          purchase_unit_qty: number
          sku: string | null
          updated_at: string
        }
        Insert: {
          base_unit: string
          category: string
          created_at?: string
          default_min_stock_level?: number
          id?: string
          is_active?: boolean
          item_type: Database["public"]["Enums"]["inv_item_type"]
          name: string
          purchase_unit: string
          purchase_unit_qty?: number
          sku?: string | null
          updated_at?: string
        }
        Update: {
          base_unit?: string
          category?: string
          created_at?: string
          default_min_stock_level?: number
          id?: string
          is_active?: boolean
          item_type?: Database["public"]["Enums"]["inv_item_type"]
          name?: string
          purchase_unit?: string
          purchase_unit_qty?: number
          sku?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inv_notification_log: {
        Row: {
          branch_id: string
          channel: string
          id: string
          item_id: string
          message: string
          sent_at: string
        }
        Insert: {
          branch_id: string
          channel: string
          id?: string
          item_id: string
          message: string
          sent_at?: string
        }
        Update: {
          branch_id?: string
          channel?: string
          id?: string
          item_id?: string
          message?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_notification_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_notification_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "inv_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_notification_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_notification_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_v_low_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_notification_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_v_top_consumed_items_30d"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_notification_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_notification_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_notification_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_top_consumed_items_30d"
            referencedColumns: ["item_id"]
          },
        ]
      }
      inv_stock_transactions: {
        Row: {
          approved_by: string | null
          branch_id: string
          corrects_txn_id: string | null
          created_at: string
          id: string
          item_id: string
          performed_by: string
          quantity_delta: number
          reason: string | null
          reference_note: string | null
          reference_type: string | null
          status: Database["public"]["Enums"]["inv_txn_status"]
          supplier_id: string | null
          total_cost: number | null
          transaction_date: string
          txn_type: Database["public"]["Enums"]["inv_txn_type"]
          unit_cost_snapshot: number
        }
        Insert: {
          approved_by?: string | null
          branch_id: string
          corrects_txn_id?: string | null
          created_at?: string
          id?: string
          item_id: string
          performed_by: string
          quantity_delta: number
          reason?: string | null
          reference_note?: string | null
          reference_type?: string | null
          status?: Database["public"]["Enums"]["inv_txn_status"]
          supplier_id?: string | null
          total_cost?: number | null
          transaction_date?: string
          txn_type: Database["public"]["Enums"]["inv_txn_type"]
          unit_cost_snapshot?: number
        }
        Update: {
          approved_by?: string | null
          branch_id?: string
          corrects_txn_id?: string | null
          created_at?: string
          id?: string
          item_id?: string
          performed_by?: string
          quantity_delta?: number
          reason?: string | null
          reference_note?: string | null
          reference_type?: string | null
          status?: Database["public"]["Enums"]["inv_txn_status"]
          supplier_id?: string | null
          total_cost?: number | null
          transaction_date?: string
          txn_type?: Database["public"]["Enums"]["inv_txn_type"]
          unit_cost_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "inv_stock_transactions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "sc_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "inv_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_corrects_txn_id_fkey"
            columns: ["corrects_txn_id"]
            isOneToOne: false
            referencedRelation: "inv_stock_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_corrects_txn_id_fkey"
            columns: ["corrects_txn_id"]
            isOneToOne: false
            referencedRelation: "stock_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_corrects_txn_id_fkey"
            columns: ["corrects_txn_id"]
            isOneToOne: false
            referencedRelation: "v_stock_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_v_low_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_v_top_consumed_items_30d"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_top_consumed_items_30d"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "sc_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "inv_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_suppliers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          note: string | null
          phone: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          note?: string | null
          phone?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          note?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          branch_id: string | null
          created_at: string
          display_name: string | null
          fullname: string | null
          id: string
          is_active: boolean
          nickname: string | null
          role: string | null
          updated_at: string
          username: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          display_name?: string | null
          fullname?: string | null
          id: string
          is_active?: boolean
          nickname?: string | null
          role?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          display_name?: string | null
          fullname?: string | null
          id?: string
          is_active?: boolean
          nickname?: string | null
          role?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      sc_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          created_at: string
          detail: Json | null
          entity: string
          entity_id: string | null
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          detail?: Json | null
          entity: string
          entity_id?: string | null
          id?: never
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          detail?: Json | null
          entity?: string
          entity_id?: string | null
          id?: never
        }
        Relationships: []
      }
      sc_employees: {
        Row: {
          account: string | null
          bank: string | null
          comm_rate: number | null
          id: number
          last_updated: string | null
          name: string
          nickname: string | null
          position: string | null
          salary: number | null
          sso_exempt: boolean
          status: string | null
          updated_at: string | null
        }
        Insert: {
          account?: string | null
          bank?: string | null
          comm_rate?: number | null
          id?: number
          last_updated?: string | null
          name: string
          nickname?: string | null
          position?: string | null
          salary?: number | null
          sso_exempt?: boolean
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          account?: string | null
          bank?: string | null
          comm_rate?: number | null
          id?: number
          last_updated?: string | null
          name?: string
          nickname?: string | null
          position?: string | null
          salary?: number | null
          sso_exempt?: boolean
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sc_expenses: {
        Row: {
          amount: number | null
          category: string | null
          created_at: string | null
          date: string
          id: number
          last_updated: string | null
          name: string
          pay_method: string | null
          recorded_by: string | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          created_at?: string | null
          date: string
          id?: number
          last_updated?: string | null
          name: string
          pay_method?: string | null
          recorded_by?: string | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          created_at?: string | null
          date?: string
          id?: number
          last_updated?: string | null
          name?: string
          pay_method?: string | null
          recorded_by?: string | null
        }
        Relationships: []
      }
      sc_opex: {
        Row: {
          amount: number | null
          category: string | null
          created_at: string | null
          id: number
          key: string | null
          last_updated: string | null
          month: string
          name: string | null
          pay_method: string | null
          recorded_by: string | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          created_at?: string | null
          id?: number
          key?: string | null
          last_updated?: string | null
          month: string
          name?: string | null
          pay_method?: string | null
          recorded_by?: string | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          created_at?: string | null
          id?: number
          key?: string | null
          last_updated?: string | null
          month?: string
          name?: string | null
          pay_method?: string | null
          recorded_by?: string | null
        }
        Relationships: []
      }
      sc_opex_history: {
        Row: {
          change_note: string | null
          id: number
          items: Json
          month: string
          saved_at: string | null
          saved_by: string | null
          version: number
        }
        Insert: {
          change_note?: string | null
          id?: number
          items: Json
          month: string
          saved_at?: string | null
          saved_by?: string | null
          version?: number
        }
        Update: {
          change_note?: string | null
          id?: number
          items?: Json
          month?: string
          saved_at?: string | null
          saved_by?: string | null
          version?: number
        }
        Relationships: []
      }
      sc_payments: {
        Row: {
          amount: number | null
          created_at: string | null
          id: number
          notes: string | null
          pay_method: string | null
          received_date: string
          recorded_by: string | null
          sale_date: string
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          id?: number
          notes?: string | null
          pay_method?: string | null
          received_date?: string
          recorded_by?: string | null
          sale_date: string
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          id?: number
          notes?: string | null
          pay_method?: string | null
          received_date?: string
          recorded_by?: string | null
          sale_date?: string
        }
        Relationships: []
      }
      sc_sales: {
        Row: {
          amount_paid: number | null
          cash_amount: number | null
          created_at: string | null
          date: string
          discount: number | null
          extra_items: string | null
          grand_total: number | null
          id: number
          last_updated: string | null
          payment_status: string | null
          recorded_by: string | null
          size_l: number | null
          size_m: number | null
          size_s: number | null
          size_xl: number | null
          total_revenue: number | null
          transfer_amount: number | null
        }
        Insert: {
          amount_paid?: number | null
          cash_amount?: number | null
          created_at?: string | null
          date: string
          discount?: number | null
          extra_items?: string | null
          grand_total?: number | null
          id?: number
          last_updated?: string | null
          payment_status?: string | null
          recorded_by?: string | null
          size_l?: number | null
          size_m?: number | null
          size_s?: number | null
          size_xl?: number | null
          total_revenue?: number | null
          transfer_amount?: number | null
        }
        Update: {
          amount_paid?: number | null
          cash_amount?: number | null
          created_at?: string | null
          date?: string
          discount?: number | null
          extra_items?: string | null
          grand_total?: number | null
          id?: number
          last_updated?: string | null
          payment_status?: string | null
          recorded_by?: string | null
          size_l?: number | null
          size_m?: number | null
          size_s?: number | null
          size_xl?: number | null
          total_revenue?: number | null
          transfer_amount?: number | null
        }
        Relationships: []
      }
      sc_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      sc_users: {
        Row: {
          branch_id: string | null
          created_at: string | null
          fullname: string | null
          id: number
          nickname: string | null
          role: string | null
          user_id: string | null
          username: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          fullname?: string | null
          id?: number
          nickname?: string | null
          role?: string | null
          user_id?: string | null
          username: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          fullname?: string | null
          id?: number
          nickname?: string | null
          role?: string | null
          user_id?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "sc_users_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sc_users_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "inv_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          price: number
          quantity: number
          service_id: string | null
          service_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          price?: number
          quantity?: number
          service_id?: string | null
          service_name: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          price?: number
          quantity?: number
          service_id?: string | null
          service_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          branch_id: string | null
          cash_amount: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          discount_amount: number
          id: string
          net_amount: number
          note: string | null
          order_no: string
          payment_method: string
          payment_status: string
          received_at: string
          shoe_brand: string | null
          shoe_color: string | null
          shoe_model: string | null
          shoe_size: string | null
          status: string
          total_amount: number
          transfer_amount: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          cash_amount?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone: string
          delivered_at?: string | null
          discount_amount?: number
          id?: string
          net_amount?: number
          note?: string | null
          order_no: string
          payment_method?: string
          payment_status?: string
          received_at?: string
          shoe_brand?: string | null
          shoe_color?: string | null
          shoe_model?: string | null
          shoe_size?: string | null
          status?: string
          total_amount?: number
          transfer_amount?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          cash_amount?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string
          delivered_at?: string | null
          discount_amount?: number
          id?: string
          net_amount?: number
          note?: string | null
          order_no?: string
          payment_method?: string
          payment_status?: string
          received_at?: string
          shoe_brand?: string | null
          shoe_color?: string | null
          shoe_model?: string | null
          shoe_size?: string | null
          status?: string
          total_amount?: number
          transfer_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          base_price: number
          category: string
          code: string
          created_at: string
          estimated_days: number
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          base_price?: number
          category: string
          code: string
          created_at?: string
          estimated_days?: number
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          base_price?: number
          category?: string
          code?: string
          created_at?: string
          estimated_days?: number
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      ui_permissions: {
        Row: {
          feature_key: string
          role: string
          updated_at: string
          updated_by: string | null
          visible: boolean
        }
        Insert: {
          feature_key: string
          role: string
          updated_at?: string
          updated_by?: string | null
          visible?: boolean
        }
        Update: {
          feature_key?: string
          role?: string
          updated_at?: string
          updated_by?: string | null
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ui_permissions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "sc_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["inv_audit_action"] | null
          after_data: Json | null
          before_data: Json | null
          id: number | null
          performed_at: string | null
          performed_by: string | null
          reason: string | null
          record_id: string | null
          table_name: string | null
        }
        Insert: {
          action?: Database["public"]["Enums"]["inv_audit_action"] | null
          after_data?: Json | null
          before_data?: Json | null
          id?: number | null
          performed_at?: string | null
          performed_by?: string | null
          reason?: string | null
          record_id?: string | null
          table_name?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["inv_audit_action"] | null
          after_data?: Json | null
          before_data?: Json | null
          id?: number | null
          performed_at?: string | null
          performed_by?: string | null
          reason?: string | null
          record_id?: string | null
          table_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "sc_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          phone: string | null
          telegram_chat_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          phone?: string | null
          telegram_chat_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          phone?: string | null
          telegram_chat_id?: string | null
        }
        Relationships: []
      }
      integration_secrets: {
        Row: {
          key: string | null
          updated_at: string | null
          updated_by: string | null
          value: string | null
        }
        Insert: {
          key?: string | null
          updated_at?: string | null
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          key?: string | null
          updated_at?: string | null
          updated_by?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_integration_secrets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "sc_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      inv_v_inventory_value: {
        Row: {
          branch_id: string | null
          branch_name: string | null
          item_type: Database["public"]["Enums"]["inv_item_type"] | null
          total_value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_item_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "inv_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_v_item_stock: {
        Row: {
          alert_muted: boolean | null
          branch_id: string | null
          current_qty: number | null
          id: string | null
          item_id: string | null
          min_stock_level: number | null
          updated_at: string | null
        }
        Insert: {
          alert_muted?: boolean | null
          branch_id?: string | null
          current_qty?: number | null
          id?: string | null
          item_id?: string | null
          min_stock_level?: number | null
          updated_at?: string | null
        }
        Update: {
          alert_muted?: boolean | null
          branch_id?: string | null
          current_qty?: number | null
          id?: string | null
          item_id?: string | null
          min_stock_level?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_item_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "inv_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_v_low_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_v_top_consumed_items_30d"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_top_consumed_items_30d"
            referencedColumns: ["item_id"]
          },
        ]
      }
      inv_v_low_stock: {
        Row: {
          base_unit: string | null
          branch_id: string | null
          branch_name: string | null
          category: string | null
          current_qty: number | null
          item_id: string | null
          item_type: Database["public"]["Enums"]["inv_item_type"] | null
          min_stock_level: number | null
          name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_item_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "inv_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_v_monthly_cogs: {
        Row: {
          branch_id: string | null
          cogs: number | null
          month: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_stock_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "inv_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_v_top_consumed_items_30d: {
        Row: {
          base_unit: string | null
          branch_id: string | null
          item_id: string | null
          name: string | null
          total_cost_used: number | null
          total_qty_used: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_stock_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "inv_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      item_stock: {
        Row: {
          alert_muted: boolean | null
          avg_unit_cost: number | null
          branch_id: string | null
          current_qty: number | null
          id: string | null
          item_id: string | null
          min_stock_level: number | null
          updated_at: string | null
        }
        Insert: {
          alert_muted?: boolean | null
          avg_unit_cost?: number | null
          branch_id?: string | null
          current_qty?: number | null
          id?: string | null
          item_id?: string | null
          min_stock_level?: number | null
          updated_at?: string | null
        }
        Update: {
          alert_muted?: boolean | null
          avg_unit_cost?: number | null
          branch_id?: string | null
          current_qty?: number | null
          id?: string | null
          item_id?: string | null
          min_stock_level?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_item_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "inv_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_v_low_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_v_top_consumed_items_30d"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_top_consumed_items_30d"
            referencedColumns: ["item_id"]
          },
        ]
      }
      items: {
        Row: {
          base_unit: string | null
          category: string | null
          created_at: string | null
          default_min_stock_level: number | null
          id: string | null
          is_active: boolean | null
          item_type: Database["public"]["Enums"]["inv_item_type"] | null
          name: string | null
          purchase_unit: string | null
          purchase_unit_qty: number | null
          sku: string | null
          updated_at: string | null
        }
        Insert: {
          base_unit?: string | null
          category?: string | null
          created_at?: string | null
          default_min_stock_level?: number | null
          id?: string | null
          is_active?: boolean | null
          item_type?: Database["public"]["Enums"]["inv_item_type"] | null
          name?: string | null
          purchase_unit?: string | null
          purchase_unit_qty?: number | null
          sku?: string | null
          updated_at?: string | null
        }
        Update: {
          base_unit?: string | null
          category?: string | null
          created_at?: string | null
          default_min_stock_level?: number | null
          id?: string | null
          is_active?: boolean | null
          item_type?: Database["public"]["Enums"]["inv_item_type"] | null
          name?: string | null
          purchase_unit?: string | null
          purchase_unit_qty?: number | null
          sku?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      stock_transactions: {
        Row: {
          approved_by: string | null
          branch_id: string | null
          corrects_txn_id: string | null
          created_at: string | null
          id: string | null
          item_id: string | null
          performed_by: string | null
          quantity_delta: number | null
          reason: string | null
          reference_note: string | null
          reference_type: string | null
          status: Database["public"]["Enums"]["inv_txn_status"] | null
          supplier_id: string | null
          total_cost: number | null
          transaction_date: string | null
          txn_type: Database["public"]["Enums"]["inv_txn_type"] | null
          unit_cost_snapshot: number | null
        }
        Insert: {
          approved_by?: string | null
          branch_id?: string | null
          corrects_txn_id?: string | null
          created_at?: string | null
          id?: string | null
          item_id?: string | null
          performed_by?: string | null
          quantity_delta?: number | null
          reason?: string | null
          reference_note?: string | null
          reference_type?: string | null
          status?: Database["public"]["Enums"]["inv_txn_status"] | null
          supplier_id?: string | null
          total_cost?: number | null
          transaction_date?: string | null
          txn_type?: Database["public"]["Enums"]["inv_txn_type"] | null
          unit_cost_snapshot?: number | null
        }
        Update: {
          approved_by?: string | null
          branch_id?: string | null
          corrects_txn_id?: string | null
          created_at?: string | null
          id?: string | null
          item_id?: string | null
          performed_by?: string | null
          quantity_delta?: number | null
          reason?: string | null
          reference_note?: string | null
          reference_type?: string | null
          status?: Database["public"]["Enums"]["inv_txn_status"] | null
          supplier_id?: string | null
          total_cost?: number | null
          transaction_date?: string | null
          txn_type?: Database["public"]["Enums"]["inv_txn_type"] | null
          unit_cost_snapshot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_stock_transactions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "sc_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "inv_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_corrects_txn_id_fkey"
            columns: ["corrects_txn_id"]
            isOneToOne: false
            referencedRelation: "inv_stock_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_corrects_txn_id_fkey"
            columns: ["corrects_txn_id"]
            isOneToOne: false
            referencedRelation: "stock_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_corrects_txn_id_fkey"
            columns: ["corrects_txn_id"]
            isOneToOne: false
            referencedRelation: "v_stock_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_v_low_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_v_top_consumed_items_30d"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_top_consumed_items_30d"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "sc_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "inv_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          created_at: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          note: string | null
          phone: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          note?: string | null
          phone?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          note?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      v_inventory_value: {
        Row: {
          branch_id: string | null
          branch_name: string | null
          item_type: Database["public"]["Enums"]["inv_item_type"] | null
          total_value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_item_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "inv_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      v_item_stock: {
        Row: {
          alert_muted: boolean | null
          branch_id: string | null
          current_qty: number | null
          id: string | null
          item_id: string | null
          min_stock_level: number | null
          updated_at: string | null
        }
        Insert: {
          alert_muted?: boolean | null
          branch_id?: string | null
          current_qty?: number | null
          id?: string | null
          item_id?: string | null
          min_stock_level?: number | null
          updated_at?: string | null
        }
        Update: {
          alert_muted?: boolean | null
          branch_id?: string | null
          current_qty?: number | null
          id?: string | null
          item_id?: string | null
          min_stock_level?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_item_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "inv_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_v_low_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_v_top_consumed_items_30d"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_item_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_top_consumed_items_30d"
            referencedColumns: ["item_id"]
          },
        ]
      }
      v_low_stock: {
        Row: {
          base_unit: string | null
          branch_id: string | null
          branch_name: string | null
          category: string | null
          current_qty: number | null
          item_id: string | null
          item_type: Database["public"]["Enums"]["inv_item_type"] | null
          min_stock_level: number | null
          name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_item_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_item_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "inv_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stock_transactions: {
        Row: {
          approved_by: string | null
          branch_id: string | null
          branch_name: string | null
          corrects_txn_id: string | null
          created_at: string | null
          id: string | null
          item_id: string | null
          item_name: string | null
          performed_by: string | null
          performed_by_name: string | null
          quantity_delta: number | null
          reason: string | null
          reference_note: string | null
          reference_type: string | null
          status: Database["public"]["Enums"]["inv_txn_status"] | null
          transaction_date: string | null
          txn_type: Database["public"]["Enums"]["inv_txn_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_stock_transactions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "sc_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "inv_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_corrects_txn_id_fkey"
            columns: ["corrects_txn_id"]
            isOneToOne: false
            referencedRelation: "inv_stock_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_corrects_txn_id_fkey"
            columns: ["corrects_txn_id"]
            isOneToOne: false
            referencedRelation: "stock_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_corrects_txn_id_fkey"
            columns: ["corrects_txn_id"]
            isOneToOne: false
            referencedRelation: "v_stock_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_v_low_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_v_top_consumed_items_30d"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_top_consumed_items_30d"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "sc_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      v_top_consumed_items_30d: {
        Row: {
          base_unit: string | null
          branch_id: string | null
          item_id: string | null
          name: string | null
          total_cost_used: number | null
          total_qty_used: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_stock_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "inv_branches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      fn_integration_secret_status: {
        Args: { p_key: string }
        Returns: {
          is_set: boolean
          updated_at: string
          value_suffix: string
        }[]
      }
      fn_sc_is_admin: { Args: never; Returns: boolean }
      inv_fn_approve_adjustment: {
        Args: { p_approve: boolean; p_txn_id: string }
        Returns: undefined
      }
      inv_fn_current_branch: { Args: never; Returns: string }
      inv_fn_current_role: { Args: never; Returns: string }
      inv_fn_integration_secret_status: {
        Args: { p_key: string }
        Returns: {
          is_set: boolean
          updated_at: string
          value_suffix: string
        }[]
      }
      inv_fn_set_alert_muted: {
        Args: { p_branch_id: string; p_item_id: string; p_muted: boolean }
        Returns: undefined
      }
      inv_fn_set_integration_secret: {
        Args: { p_key: string; p_value: string }
        Returns: undefined
      }
      inv_fn_set_min_stock_level: {
        Args: { p_branch_id: string; p_item_id: string; p_new_min: number }
        Returns: undefined
      }
      sc_get_my_role: { Args: never; Returns: string }
    }
    Enums: {
      inv_audit_action: "INSERT" | "UPDATE" | "DELETE"
      inv_item_type: "inventory" | "consumable"
      inv_txn_status: "approved" | "pending_approval" | "rejected"
      inv_txn_type:
        | "stock_in"
        | "stock_out"
        | "adjustment_increase"
        | "adjustment_decrease"
        | "waste"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      inv_audit_action: ["INSERT", "UPDATE", "DELETE"],
      inv_item_type: ["inventory", "consumable"],
      inv_txn_status: ["approved", "pending_approval", "rejected"],
      inv_txn_type: [
        "stock_in",
        "stock_out",
        "adjustment_increase",
        "adjustment_decrease",
        "waste",
      ],
    },
  },
} as const


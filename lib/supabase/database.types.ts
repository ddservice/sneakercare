// เขียนมือให้ตรงกับ docs/database-schema.sql — เมื่อ link Supabase CLI แล้วให้ regenerate ด้วย
// `supabase gen types typescript --linked > lib/supabase/database.types.ts` แทนการแก้ไฟล์นี้มือต่อไป
//
// หมายเหตุ: @supabase/postgrest-js กำหนดให้ทุก Table/View ต้องมี `Relationships: []` (แม้ไม่มี FK ที่
// ใช้ embed จริง) ไม่งั้น type ทั้งชุดจะ resolve เป็น `never` ทั้ง Database (ดูปัญหาที่เจอตอน tsc --noEmit)

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

export interface Database {
  public: {
    Tables: {
      branches: {
        Row: {
          id: string;
          name: string;
          address: string | null;
          phone: string | null;
          telegram_chat_id: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["branches"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["branches"]["Row"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string;
          role: UserRole;
          branch_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          username: string;
          display_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          }
        ];
      };
      suppliers: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          note: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["suppliers"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["suppliers"]["Row"]>;
        Relationships: [];
      };
      items: {
        Row: {
          id: string;
          sku: string | null;
          name: string;
          item_type: ItemType;
          category: string;
          base_unit: string;
          purchase_unit: string;
          purchase_unit_qty: number;
          default_min_stock_level: number;
          supplier_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["items"]["Row"]> & {
          name: string;
          item_type: ItemType;
          category: string;
          base_unit: string;
          purchase_unit: string;
        };
        Update: Partial<Database["public"]["Tables"]["items"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "items_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          }
        ];
      };
      item_stock: {
        Row: {
          id: string;
          item_id: string;
          branch_id: string;
          current_qty: number;
          avg_unit_cost: number;
          min_stock_level: number;
          updated_at: string;
        };
        Insert: never; // เขียนได้ผ่าน trigger/RPC เท่านั้น
        Update: never;
        Relationships: [
          {
            foreignKeyName: "item_stock_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "item_stock_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          }
        ];
      };
      stock_transactions: {
        Row: {
          id: string;
          item_id: string;
          branch_id: string;
          txn_type: StockTxnType;
          status: StockTxnStatus;
          quantity_delta: number;
          unit_cost_snapshot: number;
          total_cost: number;
          reference_type: string | null;
          reference_note: string | null;
          corrects_txn_id: string | null;
          reason: string | null;
          performed_by: string;
          approved_by: string | null;
          created_at: string;
        };
        Insert: {
          item_id: string;
          branch_id: string;
          txn_type: StockTxnType;
          status?: StockTxnStatus;
          quantity_delta: number;
          unit_cost_snapshot?: number;
          reference_type?: string | null;
          reference_note?: string | null;
          corrects_txn_id?: string | null;
          reason?: string | null;
          performed_by: string;
        };
        Update: never; // append-only ledger — ห้าม UPDATE (revoke ไว้ที่ DB แล้ว)
        Relationships: [
          {
            foreignKeyName: "stock_transactions_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_transactions_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_transactions_performed_by_fkey";
            columns: ["performed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_transactions_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      audit_logs: {
        Row: {
          id: number;
          table_name: string;
          record_id: string;
          action: AuditAction;
          performed_by: string | null;
          performed_at: string;
          before_data: Record<string, unknown> | null;
          after_data: Record<string, unknown> | null;
          reason: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      notification_log: {
        Row: {
          id: string;
          item_id: string;
          branch_id: string;
          channel: string;
          message: string;
          sent_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notification_log"]["Row"]> & {
          item_id: string;
          branch_id: string;
          channel: string;
          message: string;
        };
        Update: never;
        Relationships: [];
      };
      app_settings: {
        Row: { key: string; value: string | null; updated_at: string };
        Insert: { key: string; value?: string | null };
        Update: Partial<Database["public"]["Tables"]["app_settings"]["Row"]>;
        Relationships: [];
      };
      integration_secrets: {
        // ไม่มี SELECT policy ให้ client เลย (ดู docs/architecture.md §2.1) — Row ยังต้องเป็น object
        // shape จริงตาม GenericTable constraint ของ postgrest-js (ใช้ never จะทำให้ type ทั้ง Database พัง)
        Row: { key: string; value: string; updated_by: string | null; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          phone: string;
          name: string;
          note: string | null;
          branch_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["customers"]["Row"]> & {
          phone: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Row"]>;
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          name: string;
          category: string;
          base_price: number;
          description: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["services"]["Row"]> & {
          name: string;
          base_price: number;
        };
        Update: Partial<Database["public"]["Tables"]["services"]["Row"]>;
        Relationships: [];
      };
      service_orders: {
        Row: {
          id: string;
          order_no: string;
          branch_id: string | null;
          customer_id: string | null;
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
          cash_amount: number;
          transfer_amount: number;
          is_paid: boolean;
          notes: string | null;
          received_by: string | null;
          received_at: string;
          completed_at: string | null;
          delivered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["service_orders"]["Row"]> & {
          order_no: string;
          customer_name: string;
          customer_phone: string;
          net_amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["service_orders"]["Row"]>;
        Relationships: [];
      };
      service_order_items: {
        Row: {
          id: string;
          order_id: string;
          service_id: string | null;
          service_name: string;
          price: number;
          quantity: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["service_order_items"]["Row"]> & {
          order_id: string;
          service_name: string;
          price: number;
        };
        Update: Partial<Database["public"]["Tables"]["service_order_items"]["Row"]>;
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          branch_id: string | null;
          category: string;
          title: string;
          amount: number;
          expense_date: string;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["expenses"]["Row"]> & {
          category: string;
          title: string;
          amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["expenses"]["Row"]>;
        Relationships: [];
      };
    };
    Views: {
      v_low_stock: {
        Row: {
          branch_id: string;
          branch_name: string;
          item_id: string;
          name: string;
          item_type: ItemType;
          category: string;
          current_qty: number;
          min_stock_level: number;
          base_unit: string;
        };
        Relationships: [];
      };
      v_inventory_value: {
        Row: { branch_id: string; branch_name: string; item_type: ItemType; total_value: number };
        Relationships: [];
      };
      v_top_consumed_items_30d: {
        Row: {
          branch_id: string;
          item_id: string;
          name: string;
          base_unit: string;
          total_qty_used: number;
          total_cost_used: number;
        };
        Relationships: [];
      };
      v_monthly_cogs: {
        Row: { branch_id: string; month: string; cogs: number };
        Relationships: [];
      };
      v_item_stock: {
        Row: {
          item_id: string;
          branch_id: string;
          current_qty: number;
          min_stock_level: number;
          updated_at: string;
          name: string;
          item_type: ItemType;
          category: string;
          base_unit: string;
          is_active: boolean;
          branch_name: string;
        };
        Relationships: [];
      };
      v_item_stock_cost: {
        Row: {
          item_id: string;
          branch_id: string;
          current_qty: number;
          avg_unit_cost: number;
          min_stock_level: number;
          updated_at: string;
          name: string;
          item_type: ItemType;
          category: string;
          base_unit: string;
          is_active: boolean;
          branch_name: string;
        };
        Relationships: [];
      };
      v_stock_transactions: {
        Row: {
          id: string;
          item_id: string;
          branch_id: string;
          txn_type: StockTxnType;
          status: StockTxnStatus;
          quantity_delta: number;
          reference_type: string | null;
          reference_note: string | null;
          corrects_txn_id: string | null;
          reason: string | null;
          performed_by: string;
          approved_by: string | null;
          created_at: string;
          item_name: string;
          branch_name: string;
          performed_by_name: string;
        };
        Relationships: [];
      };
      v_stock_transactions_cost: {
        Row: {
          id: string;
          item_id: string;
          branch_id: string;
          txn_type: StockTxnType;
          status: StockTxnStatus;
          quantity_delta: number;
          unit_cost_snapshot: number;
          total_cost: number;
          reference_type: string | null;
          reference_note: string | null;
          corrects_txn_id: string | null;
          reason: string | null;
          performed_by: string;
          approved_by: string | null;
          created_at: string;
          item_name: string;
          branch_name: string;
          performed_by_name: string;
        };
        Relationships: [];
      };
      v_top_consumed_qty_30d: {
        Row: {
          branch_id: string;
          item_id: string;
          name: string;
          base_unit: string;
          total_qty_used: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      fn_approve_adjustment: {
        Args: { p_txn_id: string; p_approve: boolean };
        Returns: undefined;
      };
      fn_set_min_stock_level: {
        Args: { p_item_id: string; p_branch_id: string; p_new_min: number };
        Returns: undefined;
      };
      fn_set_integration_secret: {
        Args: { p_key: string; p_value: string };
        Returns: undefined;
      };
      fn_integration_secret_status: {
        Args: { p_key: string };
        Returns: { is_set: boolean; value_suffix: string | null; updated_at: string | null }[];
      };
    };
  };
}

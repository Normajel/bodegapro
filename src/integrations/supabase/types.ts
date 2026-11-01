export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      companies: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      company_memberships: {
        Row: {
          company_id: string;
          created_at: string;
          is_active: boolean;
          role_id: string;
          user_id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          is_active?: boolean;
          role_id: string;
          user_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          is_active?: boolean;
          role_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_memberships_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_memberships_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "app_roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      app_roles: {
        Row: {
          company_id: string | null;
          created_at: string;
          id: string;
          is_system: boolean;
          name: string;
          permissions: Json;
          updated_at: string;
        };
        Insert: {
          company_id?: string | null;
          created_at?: string;
          id?: string;
          is_system?: boolean;
          name: string;
          permissions?: Json;
          updated_at?: string;
        };
        Update: {
          company_id?: string | null;
          created_at?: string;
          id?: string;
          is_system?: boolean;
          name?: string;
          permissions?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      company_settings: {
        Row: {
          address: string;
          billing_email: string;
          business_activity: string;
          company_id: string;
          email: string;
          id: boolean;
          name: string;
          phone: string;
          rut: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          address?: string;
          billing_email?: string;
          business_activity?: string;
          company_id?: string;
          email?: string;
          id?: boolean;
          name?: string;
          phone?: string;
          rut?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          address?: string;
          billing_email?: string;
          business_activity?: string;
          company_id?: string;
          email?: string;
          id?: boolean;
          name?: string;
          phone?: string;
          rut?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      cubication_template_items: {
        Row: {
          company_id: string;
          id: string;
          product_id: string;
          quantity: number;
          template_id: string;
        };
        Insert: {
          company_id?: string;
          id?: string;
          product_id: string;
          quantity: number;
          template_id: string;
        };
        Update: {
          company_id?: string;
          id?: string;
          product_id?: string;
          quantity?: number;
          template_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cubication_template_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cubication_template_items_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "cubication_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      cubication_templates: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          unit_code: string;
          updated_at: string;
        };
        Insert: {
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          unit_code: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          unit_code?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          address: string | null;
          company_id: string;
          contact_name: string | null;
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          notes: string | null;
          phone: string | null;
          work_area: string | null;
        };
        Insert: {
          address?: string | null;
          company_id?: string;
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          phone?: string | null;
          work_area?: string | null;
        };
        Update: {
          address?: string | null;
          company_id?: string;
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          work_area?: string | null;
        };
        Relationships: [];
      };
      purchase_order_items: {
        Row: {
          company_id: string;
          description: string;
          id: string;
          item_type: string;
          line_total: number;
          measure_unit: string;
          product_id: string | null;
          purchase_order_id: string;
          quantity: number;
          received_quantity: number;
          unit_cost: number;
        };
        Insert: {
          company_id?: string;
          description: string;
          id?: string;
          item_type?: string;
          line_total?: never;
          measure_unit: string;
          product_id: string | null;
          purchase_order_id: string;
          quantity: number;
          received_quantity?: number;
          unit_cost: number;
        };
        Update: {
          company_id?: string;
          description?: string;
          id?: string;
          item_type?: string;
          line_total?: never;
          measure_unit?: string;
          product_id?: string | null;
          purchase_order_id?: string;
          quantity?: number;
          received_quantity?: number;
          unit_cost?: number;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_cost_centers: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          company_id?: string;
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          approval_status: string;
          approved_at: string | null;
          approved_by: string | null;
          company_id: string;
          cost_center_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          net_total: number;
          notes: string | null;
          order_number: string;
          order_date: string;
          payment_terms: string;
          payment_terms_other: string | null;
          status: string;
          supplier_id: string;
          total_amount: number;
          updated_at: string;
          vat_amount: number;
          vat_rate: number;
        };
        Insert: {
          approval_status?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          company_id?: string;
          cost_center_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          net_total?: number;
          notes?: string | null;
          order_number: string;
          order_date?: string;
          payment_terms?: string;
          payment_terms_other?: string | null;
          status?: string;
          supplier_id: string;
          total_amount?: number;
          updated_at?: string;
          vat_amount?: number;
          vat_rate?: number;
        };
        Update: {
          approval_status?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          company_id?: string;
          cost_center_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          net_total?: number;
          notes?: string | null;
          order_number?: string;
          order_date?: string;
          payment_terms?: string;
          payment_terms_other?: string | null;
          status?: string;
          supplier_id?: string;
          total_amount?: number;
          updated_at?: string;
          vat_amount?: number;
          vat_rate?: number;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_cost_center_id_fkey";
            columns: ["cost_center_id"];
            isOneToOne: false;
            referencedRelation: "purchase_cost_centers";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          active: boolean;
          barcode: string | null;
          category: string;
          company_id: string;
          created_at: string;
          id: string;
          location: string | null;
          min_stock: number;
          name: string;
          sku: string;
          stock: number;
          stock_quantity: number;
          supplier_id: string | null;
          unit: string;
          unit_cost: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          barcode?: string | null;
          category?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
          location?: string | null;
          min_stock?: number;
          name: string;
          sku: string;
          stock?: number;
          stock_quantity?: number;
          supplier_id?: string | null;
          unit?: string;
          unit_cost?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          barcode?: string | null;
          category?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
          location?: string | null;
          min_stock?: number;
          name?: string;
          sku?: string;
          stock?: number;
          stock_quantity?: number;
          supplier_id?: string | null;
          unit?: string;
          unit_cost?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          active_company_id: string | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          role_id: string | null;
          username: string | null;
        };
        Insert: {
          active_company_id?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          role_id?: string | null;
          username?: string | null;
        };
        Update: {
          active_company_id?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          role_id?: string | null;
          username?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "app_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_menu_settings: {
        Row: {
          enabled: boolean;
          label: string;
          module_key: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          enabled?: boolean;
          label: string;
          module_key: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          enabled?: boolean;
          label?: string;
          module_key?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          batch_id: string | null;
          company_id: string;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          document_number: string | null;
          document_type: string | null;
          folio: number | null;
          id: string;
          measure_unit: string | null;
          notes: string | null;
          product_id: string;
          purchase_order: string | null;
          purchase_order_id: string | null;
          purchase_order_item_id: string | null;
          quantity: number;
          quantity_value: number;
          reference: string | null;
          supplier_id: string | null;
          type: Database["public"]["Enums"]["movement_type"];
          unit_cost: number | null;
          unit_type: string | null;
          unit_type_value: string | null;
        };
        Insert: {
          batch_id?: string | null;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          document_number?: string | null;
          document_type?: string | null;
          folio?: number | null;
          id?: string;
          measure_unit?: string | null;
          notes?: string | null;
          product_id: string;
          purchase_order?: string | null;
          purchase_order_id?: string | null;
          purchase_order_item_id?: string | null;
          quantity: number;
          quantity_value?: number;
          reference?: string | null;
          supplier_id?: string | null;
          type: Database["public"]["Enums"]["movement_type"];
          unit_cost?: number | null;
          unit_type?: string | null;
          unit_type_value?: string | null;
        };
        Update: {
          batch_id?: string | null;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          document_number?: string | null;
          document_type?: string | null;
          folio?: number | null;
          id?: string;
          measure_unit?: string | null;
          notes?: string | null;
          product_id?: string;
          purchase_order?: string | null;
          purchase_order_id?: string | null;
          purchase_order_item_id?: string | null;
          quantity?: number;
          quantity_value?: number;
          reference?: string | null;
          supplier_id?: string | null;
          type?: Database["public"]["Enums"]["movement_type"];
          unit_cost?: number | null;
          unit_type?: string | null;
          unit_type_value?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_purchase_order_id_fkey";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_purchase_order_item_id_fkey";
            columns: ["purchase_order_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_order_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_movement_document_cancellations: {
        Row: {
          cancellation_id: string;
          cancellation_reason: string | null;
          cancelled_at: string;
          cancelled_by: string;
          company_id: string;
          stock_movement_id: string;
        };
        Insert: {
          cancellation_id: string;
          cancellation_reason?: string | null;
          cancelled_at?: string;
          cancelled_by: string;
          company_id?: string;
          stock_movement_id: string;
        };
        Update: {
          cancellation_id?: string;
          cancellation_reason?: string | null;
          cancelled_at?: string;
          cancelled_by?: string;
          company_id?: string;
          stock_movement_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movement_document_cancellations_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movement_document_cancellations_stock_movement_id_fkey";
            columns: ["stock_movement_id"];
            isOneToOne: true;
            referencedRelation: "stock_movements";
            referencedColumns: ["id"];
          },
        ];
      };
      suppliers: {
        Row: {
          address: string | null;
          city: string | null;
          company_id: string;
          contact_name: string | null;
          created_at: string;
          delivery_address: string | null;
          email: string | null;
          id: string;
          name: string;
          notes: string | null;
          phone: string | null;
          rut: string | null;
        };
        Insert: {
          address?: string | null;
          city?: string | null;
          company_id?: string;
          contact_name?: string | null;
          created_at?: string;
          delivery_address?: string | null;
          email?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          phone?: string | null;
          rut?: string | null;
        };
        Update: {
          address?: string | null;
          city?: string | null;
          company_id?: string;
          contact_name?: string | null;
          created_at?: string;
          delivery_address?: string | null;
          email?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          rut?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      customer_directory: {
        Row: {
          id: string;
          name: string;
        };
        Relationships: [];
      };
      supplier_directory: {
        Row: {
          id: string;
          name: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      active_company_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      current_company_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      active_role_name: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      set_active_company: {
        Args: { p_company_id: string };
        Returns: string;
      };
      create_company_with_admin: {
        Args: { p_name: string };
        Returns: string;
      };
      reset_business_data: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      archive_product: {
        Args: { p_product_id: string };
        Returns: undefined;
      };
      has_app_permission: {
        Args: { action_name?: string; module_name: string };
        Returns: boolean;
      };
      is_app_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_platform_owner: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      transfer_platform_owner: {
        Args: { p_new_user_id: string };
        Returns: undefined;
      };
      save_movement_batch: {
        Args: { edit_batch?: string; edit_id?: string; payload: Json };
        Returns: {
          batch_id: string | null;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          document_number: string | null;
          document_type: string | null;
          folio: number | null;
          id: string;
          measure_unit: string | null;
          notes: string | null;
          product_id: string;
          purchase_order: string | null;
          quantity: number;
          quantity_value: number;
          reference: string | null;
          supplier_id: string | null;
          type: Database["public"]["Enums"]["movement_type"];
          unit_cost: number | null;
          unit_type: string | null;
          unit_type_value: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "stock_movements";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      save_purchase_order: {
        Args: {
          p_cost_center_id?: string | null;
          p_description?: string | null;
          p_lines: Json;
          p_notes: string | null;
          p_order_date?: string;
          p_order_id?: string;
          p_payment_terms?: string;
          p_payment_terms_other?: string | null;
          p_supplier_id: string;
        };
        Returns: string;
      };
      approve_purchase_order: {
        Args: { p_order_id: string };
        Returns: undefined;
      };
      get_supplier_order_info: {
        Args: { p_supplier_id: string };
        Returns: {
          id: string;
          name: string;
          rut: string | null;
          city: string | null;
          address: string | null;
          delivery_address: string | null;
          contact_name: string | null;
          phone: string | null;
          email: string | null;
        }[];
      };
      receive_purchase_order: {
        Args: {
          p_document_number: string;
          p_document_type: string;
          p_lines: Json;
          p_order_id: string;
        };
        Returns: Database["public"]["Tables"]["stock_movements"]["Row"][];
      };
      cancel_purchase_order: {
        Args: { p_order_id: string };
        Returns: undefined;
      };
      save_cubication_template: {
        Args: {
          p_items: Json;
          p_unit_code: string;
        };
        Returns: string;
      };
    };
    Enums: {
      movement_type: "entrada" | "salida";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      movement_type: ["entrada", "salida"],
    },
  },
} as const;

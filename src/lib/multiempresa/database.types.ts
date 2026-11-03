export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      accepted_services: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          company_id: string;
          description: string;
          entered_at: string;
          id: string;
          measure_unit: string;
          net_total: number;
          order_number: string;
          payment_terms: string;
          purchase_order_id: string;
          purchase_order_item_id: string;
          quantity: number;
          status: string;
          supplier_id: string;
          supplier_name: string;
          total: number;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          company_id: string;
          description: string;
          entered_at: string;
          id?: string;
          measure_unit: string;
          net_total: number;
          order_number: string;
          payment_terms: string;
          purchase_order_id: string;
          purchase_order_item_id: string;
          quantity: number;
          status?: string;
          supplier_id: string;
          supplier_name: string;
          total: number;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          company_id?: string;
          description?: string;
          entered_at?: string;
          id?: string;
          measure_unit?: string;
          net_total?: number;
          order_number?: string;
          payment_terms?: string;
          purchase_order_id?: string;
          purchase_order_item_id?: string;
          quantity?: number;
          status?: string;
          supplier_id?: string;
          supplier_name?: string;
          total?: number;
        };
        Relationships: [
          {
            foreignKeyName: "accepted_services_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "accepted_services_company_id_purchase_order_id_fkey";
            columns: ["company_id", "purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "accepted_services_company_id_purchase_order_item_id_fkey";
            columns: ["company_id", "purchase_order_item_id"];
            isOneToOne: true;
            referencedRelation: "purchase_order_items";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "accepted_services_company_id_supplier_id_fkey";
            columns: ["company_id", "supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "accepted_services_same_order_fk";
            columns: ["company_id", "purchase_order_id", "purchase_order_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_order_items";
            referencedColumns: ["company_id", "purchase_order_id", "id"];
          },
        ];
      };
      companies: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          status: string;
          tax_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          status?: string;
          tax_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          status?: string;
          tax_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      company_memberships: {
        Row: {
          company_id: string;
          created_at: string;
          role_code: string;
          status: string;
          user_id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          role_code: string;
          status?: string;
          user_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          role_code?: string;
          status?: string;
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
        ];
      };
      cubication_special_items: {
        Row: {
          company_id: string;
          line_id: string;
          quantity: number;
          special_product_id: string;
          template_id: string;
          unit_cost: number;
        };
        Insert: {
          company_id: string;
          line_id: string;
          quantity: number;
          special_product_id: string;
          template_id: string;
          unit_cost: number;
        };
        Update: {
          company_id?: string;
          line_id?: string;
          quantity?: number;
          special_product_id?: string;
          template_id?: string;
          unit_cost?: number;
        };
        Relationships: [
          {
            foreignKeyName: "cubication_special_items_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cubication_special_items_company_id_special_product_id_fkey";
            columns: ["company_id", "special_product_id"];
            isOneToOne: false;
            referencedRelation: "special_products";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "cubication_special_items_company_id_template_id_fkey";
            columns: ["company_id", "template_id"];
            isOneToOne: false;
            referencedRelation: "cubication_templates";
            referencedColumns: ["company_id", "id"];
          },
        ];
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
          company_id: string;
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
            foreignKeyName: "cubication_template_items_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cubication_template_items_company_id_product_id_fkey";
            columns: ["company_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "cubication_template_items_company_id_template_id_fkey";
            columns: ["company_id", "template_id"];
            isOneToOne: false;
            referencedRelation: "cubication_templates";
            referencedColumns: ["company_id", "id"];
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
          company_id: string;
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
        Relationships: [
          {
            foreignKeyName: "cubication_templates_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
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
          company_id: string;
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
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
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
          company_id: string;
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
            foreignKeyName: "products_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_company_id_supplier_id_fkey";
            columns: ["company_id", "supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["company_id", "id"];
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
          company_id: string;
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
        Relationships: [
          {
            foreignKeyName: "purchase_cost_centers_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_entries: {
        Row: {
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          company_id: string;
          created_at: string;
          created_by: string | null;
          document_number: string;
          document_type: string;
          id: string;
          notes: string | null;
          purchase_order: string | null;
          supplier_id: string | null;
        };
        Insert: {
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          document_number: string;
          document_type: string;
          id?: string;
          notes?: string | null;
          purchase_order?: string | null;
          supplier_id?: string | null;
        };
        Update: {
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          document_number?: string;
          document_type?: string;
          id?: string;
          notes?: string | null;
          purchase_order?: string | null;
          supplier_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_entries_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_entries_company_id_supplier_id_fkey";
            columns: ["company_id", "supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["company_id", "id"];
          },
        ];
      };
      purchase_entry_items: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          product_id: string;
          purchase_entry_id: string;
          quantity: number;
          stock_movement_id: string;
          unit: string;
          unit_price: number;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          product_id: string;
          purchase_entry_id: string;
          quantity: number;
          stock_movement_id: string;
          unit: string;
          unit_price: number;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          product_id?: string;
          purchase_entry_id?: string;
          quantity?: number;
          stock_movement_id?: string;
          unit?: string;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_entry_items_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_entry_items_company_id_product_id_fkey";
            columns: ["company_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "purchase_entry_items_company_id_purchase_entry_id_fkey";
            columns: ["company_id", "purchase_entry_id"];
            isOneToOne: false;
            referencedRelation: "purchase_entries";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "purchase_entry_items_company_id_stock_movement_id_fkey";
            columns: ["company_id", "stock_movement_id"];
            isOneToOne: true;
            referencedRelation: "stock_movements";
            referencedColumns: ["company_id", "id"];
          },
        ];
      };
      purchase_order_items: {
        Row: {
          company_id: string;
          description: string;
          id: string;
          item_type: string;
          line_total: number | null;
          measure_unit: string;
          product_id: string | null;
          purchase_order_id: string;
          quantity: number;
          received_quantity: number;
          special_product_id: string | null;
          unit_cost: number;
        };
        Insert: {
          company_id: string;
          description: string;
          id?: string;
          item_type?: string;
          line_total?: number | null;
          measure_unit: string;
          product_id?: string | null;
          purchase_order_id: string;
          quantity: number;
          received_quantity?: number;
          special_product_id?: string | null;
          unit_cost: number;
        };
        Update: {
          company_id?: string;
          description?: string;
          id?: string;
          item_type?: string;
          line_total?: number | null;
          measure_unit?: string;
          product_id?: string | null;
          purchase_order_id?: string;
          quantity?: number;
          received_quantity?: number;
          special_product_id?: string | null;
          unit_cost?: number;
        };
        Relationships: [
          {
            foreignKeyName: "poi_special_product_tenant_fk";
            columns: ["company_id", "special_product_id"];
            isOneToOne: false;
            referencedRelation: "special_products";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "purchase_order_items_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_order_items_company_id_product_id_fkey";
            columns: ["company_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "purchase_order_items_company_id_purchase_order_id_fkey";
            columns: ["company_id", "purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["company_id", "id"];
          },
        ];
      };
      purchase_orders: {
        Row: {
          approval_status: string;
          approved_at: string | null;
          approved_by: string | null;
          company_id: string;
          completed_at: string | null;
          cost_center_id: string | null;
          created_at: string;
          created_by: string | null;
          delivery_days: number | null;
          description: string | null;
          id: string;
          net_total: number;
          notes: string | null;
          order_date: string;
          order_number: string;
          payment_terms: string;
          payment_terms_other: string | null;
          sent_at: string | null;
          sent_to: string | null;
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
          company_id: string;
          completed_at?: string | null;
          cost_center_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          delivery_days?: number | null;
          description?: string | null;
          id?: string;
          net_total?: number;
          notes?: string | null;
          order_date?: string;
          order_number: string;
          payment_terms?: string;
          payment_terms_other?: string | null;
          sent_at?: string | null;
          sent_to?: string | null;
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
          completed_at?: string | null;
          cost_center_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          delivery_days?: number | null;
          description?: string | null;
          id?: string;
          net_total?: number;
          notes?: string | null;
          order_date?: string;
          order_number?: string;
          payment_terms?: string;
          payment_terms_other?: string | null;
          sent_at?: string | null;
          sent_to?: string | null;
          status?: string;
          supplier_id?: string;
          total_amount?: number;
          updated_at?: string;
          vat_amount?: number;
          vat_rate?: number;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_orders_company_id_cost_center_id_fkey";
            columns: ["company_id", "cost_center_id"];
            isOneToOne: false;
            referencedRelation: "purchase_cost_centers";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "purchase_orders_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_company_id_supplier_id_fkey";
            columns: ["company_id", "supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["company_id", "id"];
          },
        ];
      };
      special_cubication_documents: {
        Row: {
          company_id: string;
          context: Json;
          created_at: string;
          created_by: string | null;
          id: string;
          unit_code: string;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          context?: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          unit_code: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          context?: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          unit_code?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "special_cubication_documents_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      special_cubication_lines: {
        Row: {
          company_id: string;
          document_id: string;
          line_id: string;
          quantity: number;
          special_product_id: string;
          total_cost: number | null;
          unit_cost: number;
        };
        Insert: {
          company_id: string;
          document_id: string;
          line_id: string;
          quantity: number;
          special_product_id: string;
          total_cost?: number | null;
          unit_cost: number;
        };
        Update: {
          company_id?: string;
          document_id?: string;
          line_id?: string;
          quantity?: number;
          special_product_id?: string;
          total_cost?: number | null;
          unit_cost?: number;
        };
        Relationships: [
          {
            foreignKeyName: "special_cubication_lines_company_id_document_id_fkey";
            columns: ["company_id", "document_id"];
            isOneToOne: false;
            referencedRelation: "special_cubication_documents";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "special_cubication_lines_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "special_cubication_lines_company_id_special_product_id_fkey";
            columns: ["company_id", "special_product_id"];
            isOneToOne: false;
            referencedRelation: "special_products";
            referencedColumns: ["company_id", "id"];
          },
        ];
      };
      special_product_receipts: {
        Row: {
          batch_id: string;
          company_id: string;
          created_by: string;
          document_number: string;
          document_type: string;
          id: string;
          purchase_date: string;
          purchase_order_id: string;
          purchase_order_item_id: string;
          quantity: number;
          received_at: string;
          special_product_id: string;
          supplier_id: string;
          supplier_name: string;
          total_cost: number | null;
          unit_cost: number;
        };
        Insert: {
          batch_id: string;
          company_id: string;
          created_by: string;
          document_number: string;
          document_type: string;
          id?: string;
          purchase_date: string;
          purchase_order_id: string;
          purchase_order_item_id: string;
          quantity: number;
          received_at?: string;
          special_product_id: string;
          supplier_id: string;
          supplier_name: string;
          total_cost?: number | null;
          unit_cost: number;
        };
        Update: {
          batch_id?: string;
          company_id?: string;
          created_by?: string;
          document_number?: string;
          document_type?: string;
          id?: string;
          purchase_date?: string;
          purchase_order_id?: string;
          purchase_order_item_id?: string;
          quantity?: number;
          received_at?: string;
          special_product_id?: string;
          supplier_id?: string;
          supplier_name?: string;
          total_cost?: number | null;
          unit_cost?: number;
        };
        Relationships: [
          {
            foreignKeyName: "special_product_receipts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "special_product_receipts_company_id_purchase_order_id_fkey";
            columns: ["company_id", "purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "special_product_receipts_company_id_purchase_order_item_id_fkey";
            columns: ["company_id", "purchase_order_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_order_items";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "special_product_receipts_company_id_special_product_id_fkey";
            columns: ["company_id", "special_product_id"];
            isOneToOne: false;
            referencedRelation: "special_products";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "special_product_receipts_company_id_supplier_id_fkey";
            columns: ["company_id", "supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "special_receipts_same_order_fk";
            columns: ["company_id", "purchase_order_id", "purchase_order_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_order_items";
            referencedColumns: ["company_id", "purchase_order_id", "id"];
          },
        ];
      };
      special_products: {
        Row: {
          active: boolean;
          barcode: string | null;
          category: string;
          company_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          location: string | null;
          name: string;
          sku: string;
          supplier_id: string | null;
          unit: string;
          unit_cost: number;
        };
        Insert: {
          active?: boolean;
          barcode?: string | null;
          category: string;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          location?: string | null;
          name: string;
          sku: string;
          supplier_id?: string | null;
          unit?: string;
          unit_cost?: number;
        };
        Update: {
          active?: boolean;
          barcode?: string | null;
          category?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          location?: string | null;
          name?: string;
          sku?: string;
          supplier_id?: string | null;
          unit?: string;
          unit_cost?: number;
        };
        Relationships: [
          {
            foreignKeyName: "special_products_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "special_products_company_id_supplier_id_fkey";
            columns: ["company_id", "supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["company_id", "id"];
          },
        ];
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
          folio: number;
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
          type: string;
          unit_cost: number | null;
          unit_type: string | null;
          unit_type_value: string | null;
        };
        Insert: {
          batch_id?: string | null;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          document_number?: string | null;
          document_type?: string | null;
          folio?: never;
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
          type: string;
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
          folio?: never;
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
          type?: string;
          unit_cost?: number | null;
          unit_type?: string | null;
          unit_type_value?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "movements_customer_company_fk";
            columns: ["company_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "movements_order_item_same_order_fk";
            columns: ["company_id", "purchase_order_id", "purchase_order_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_order_items";
            referencedColumns: ["company_id", "purchase_order_id", "id"];
          },
          {
            foreignKeyName: "stock_movements_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_company_id_product_id_fkey";
            columns: ["company_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "stock_movements_company_id_purchase_order_id_fkey";
            columns: ["company_id", "purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "stock_movements_company_id_purchase_order_item_id_fkey";
            columns: ["company_id", "purchase_order_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_order_items";
            referencedColumns: ["company_id", "id"];
          },
          {
            foreignKeyName: "stock_movements_company_id_supplier_id_fkey";
            columns: ["company_id", "supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["company_id", "id"];
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
          delivery_days: number | null;
          email: string | null;
          id: string;
          name: string;
          notes: string | null;
          phone: string | null;
          rut: string | null;
          supplier_kind: string;
        };
        Insert: {
          address?: string | null;
          city?: string | null;
          company_id: string;
          contact_name?: string | null;
          created_at?: string;
          delivery_address?: string | null;
          delivery_days?: number | null;
          email?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          phone?: string | null;
          rut?: string | null;
          supplier_kind?: string;
        };
        Update: {
          address?: string | null;
          city?: string | null;
          company_id?: string;
          contact_name?: string | null;
          created_at?: string;
          delivery_address?: string | null;
          delivery_days?: number | null;
          email?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          rut?: string | null;
          supplier_kind?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      approve_purchase_order: {
        Args: { p_order_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
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
    Enums: {},
  },
} as const;

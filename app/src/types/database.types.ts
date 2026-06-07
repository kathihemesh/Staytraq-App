export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      payments: {
        Row: {
          amount: number | null
          billing_month: string | null
          created_at: string
          id: number
          owner_id: string
          payment_date: string | null
          status: Database["public"]["Enums"]["payment_status"]
          tenant_id: number | null
          updated_at: string | null
          utr_number: string | null
          verified_by_owner: boolean | null
        }
        Insert: {
          amount?: number | null
          billing_month?: string | null
          created_at?: string
          id?: number
          owner_id: string
          payment_date?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id?: number | null
          updated_at?: string | null
          utr_number?: string | null
          verified_by_owner?: boolean | null
        }
        Update: {
          amount?: number | null
          billing_month?: string | null
          created_at?: string
          id?: number
          owner_id?: string
          payment_date?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id?: number | null
          updated_at?: string | null
          utr_number?: string | null
          verified_by_owner?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "pg_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_table"
            referencedColumns: ["id"]
          }
        ]
      }
      pg_details: {
        Row: {
          address: string
          city: string
          created_at: string
          id: number
          no_floors: number
          owner_id: string
          pg_name: string
          updated_at: string | null
        }
        Insert: {
          address: string
          city: string
          created_at?: string
          id?: number
          no_floors?: number
          owner_id: string
          pg_name: string
          updated_at?: string | null
        }
        Update: {
          address?: string
          city?: string
          created_at?: string
          id?: number
          no_floors?: number
          owner_id?: string
          pg_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pg_details_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "pg_owners"
            referencedColumns: ["id"]
          }
        ]
      }
      pg_owners: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_onboarded: boolean
          mobile_number: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          is_onboarded?: boolean
          mobile_number?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_onboarded?: boolean
          mobile_number?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          id: number
          message: string | null
          sent_at: string | null
          sent_via: Database["public"]["Enums"]["sms_sent_via"] | null
          status: Database["public"]["Enums"]["sms_status"] | null
          tenant_id: number | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          message?: string | null
          sent_at?: string | null
          sent_via?: Database["public"]["Enums"]["sms_sent_via"] | null
          status?: Database["public"]["Enums"]["sms_status"] | null
          tenant_id?: number | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          message?: string | null
          sent_at?: string | null
          sent_via?: Database["public"]["Enums"]["sms_sent_via"] | null
          status?: Database["public"]["Enums"]["sms_status"] | null
          tenant_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_table"
            referencedColumns: ["id"]
          }
        ]
      }
      rooms_table: {
        Row: {
          created_at: string
          floor_no: number
          id: number
          maintenance: number
          notes: string | null
          occupied_beds: number
          pg_id: number
          rent_amount: number
          room_number: string
          room_type: Database["public"]["Enums"]["room_type"]
          status: Database["public"]["Enums"]["room_status"]
          total_beds: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          floor_no?: number
          id?: number
          maintenance?: number
          notes?: string | null
          occupied_beds?: number
          pg_id: number
          rent_amount: number
          room_number: string
          room_type?: Database["public"]["Enums"]["room_type"]
          status?: Database["public"]["Enums"]["room_status"]
          total_beds: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          floor_no?: number
          id?: number
          maintenance?: number
          notes?: string | null
          occupied_beds?: number
          pg_id?: number
          rent_amount?: number
          room_number?: string
          room_type?: Database["public"]["Enums"]["room_type"]
          status?: Database["public"]["Enums"]["room_status"]
          total_beds?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_table_pg_id_fkey"
            columns: ["pg_id"]
            isOneToOne: false
            referencedRelation: "pg_details"
            referencedColumns: ["id"]
          }
        ]
      }
      monthly_payment_links: {
        Row: {
          id: number
          owner_id: string
          month: number
          year: number
          portal_token: string
          created_at: string
        }
        Insert: {
          id?: number
          owner_id: string
          month: number
          year: number
          portal_token?: string
          created_at?: string
        }
        Update: {
          id?: number
          owner_id?: string
          month?: number
          year?: number
          portal_token?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_payment_links_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "pg_owners"
            referencedColumns: ["id"]
          }
        ]
      }
      settings: {
        Row: {
          created_at: string
          grace_period_days: number | null
          id: number
          late_fee_per_day: number | null
          owner_id: string
          rent_due_day: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          grace_period_days?: number | null
          id?: number
          late_fee_per_day?: number | null
          owner_id: string
          rent_due_day?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          grace_period_days?: number | null
          id?: number
          late_fee_per_day?: number | null
          owner_id?: string
          rent_due_day?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "pg_owners"
            referencedColumns: ["id"]
          }
        ]
      }
      tenants_table: {
        Row: {
          created_at: string
          deposit_amount: number | null
          deposit_refund_amount: number | null
          email: string | null
          exit_date: string | null
          extra_charges: number | null
          id: number
          id_documents: Json | null
          join_date: string | null
          mobile_number: string | null
          name: string | null
          notes: string | null
          owner_id: string
          pg_id: number | null
          rent_due_day: number | null
          room_id: number | null
          status: Database["public"]["Enums"]["tenant_status"]
          updated_at: string | null
          payment_code: string
        }
        Insert: {
          created_at?: string
          deposit_amount?: number | null
          deposit_refund_amount?: number | null
          email?: string | null
          exit_date?: string | null
          extra_charges?: number | null
          id?: number
          id_documents?: Json | null
          join_date?: string | null
          mobile_number?: string | null
          name?: string | null
          notes?: string | null
          owner_id: string
          pg_id?: number | null
          rent_due_day?: number | null
          room_id?: number | null
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string | null
          payment_code?: string
        }
        Update: {
          created_at?: string
          deposit_amount?: number | null
          deposit_refund_amount?: number | null
          email?: string | null
          exit_date?: string | null
          extra_charges?: number | null
          id?: number
          id_documents?: Json | null
          join_date?: string | null
          mobile_number?: string | null
          name?: string | null
          notes?: string | null
          owner_id?: string
          pg_id?: number | null
          rent_due_day?: number | null
          room_id?: number | null
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string | null
          payment_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_table_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "pg_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_table_pg_id_fkey"
            columns: ["pg_id"]
            isOneToOne: false
            referencedRelation: "pg_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_table_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms_table"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      onboard_new_owner: {
        Args: {
          p_address: string
          p_city: string
          p_full_name: string
          p_pg_name: string
        }
        Returns: undefined
      }
    }
    Enums: {
      payment_status: "paid" | "pending" | "late"
      room_status: "full" | "partially occupied" | "vacant" | "maintenance"
      room_type: "ac" | "non-ac"
      sms_sent_via: "whatsapp" | "sms"
      sms_status: "sent" | "failed"
      tenant_status: "active" | "pending_move_in" | "notice_period" | "move_out"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

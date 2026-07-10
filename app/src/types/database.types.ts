export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      complaints: {
        Row: {
          complaint_message: string
          created_at: string
          id: number
          image_paths: string[] | null
          owner_id: string
          owner_response: string | null
          pg_id: number | null
          status: string
          tenant_phone: string
          updated_at: string
        }
        Insert: {
          complaint_message: string
          created_at?: string
          id?: number
          image_paths?: string[] | null
          owner_id: string
          owner_response?: string | null
          pg_id?: number | null
          status?: string
          tenant_phone: string
          updated_at?: string
        }
        Update: {
          complaint_message?: string
          created_at?: string
          id?: number
          image_paths?: string[] | null
          owner_id?: string
          owner_response?: string | null
          pg_id?: number | null
          status?: string
          tenant_phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "pg_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_pg_id_fkey"
            columns: ["pg_id"]
            isOneToOne: false
            referencedRelation: "pg_details"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          id: number
          move_in_date: string | null
          name: string
          owner_id: string
          pg_id: number | null
          phone: string
          room_no: string | null
          room_type: string | null
          sharing_preference: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          move_in_date?: string | null
          name: string
          owner_id: string
          pg_id?: number | null
          phone: string
          room_no?: string | null
          room_type?: string | null
          sharing_preference?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          move_in_date?: string | null
          name?: string
          owner_id?: string
          pg_id?: number | null
          phone?: string
          room_no?: string | null
          room_type?: string | null
          sharing_preference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "pg_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_pg_id_fkey"
            columns: ["pg_id"]
            isOneToOne: false
            referencedRelation: "pg_details"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_payment_links: {
        Row: {
          created_at: string
          id: number
          month: number
          owner_id: string
          portal_token: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: number
          month: number
          owner_id: string
          portal_token?: string
          year: number
        }
        Update: {
          created_at?: string
          id?: number
          month?: number
          owner_id?: string
          portal_token?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_payment_links_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "pg_owners"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: number
          metadata: Json | null
          new_status: string | null
          notes: string | null
          old_status: string | null
          owner_id: string | null
          payment_id: number
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: never
          metadata?: Json | null
          new_status?: string | null
          notes?: string | null
          old_status?: string | null
          owner_id?: string | null
          payment_id: number
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: never
          metadata?: Json | null
          new_status?: string | null
          notes?: string | null
          old_status?: string | null
          owner_id?: string | null
          payment_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_audit_log_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_submissions: {
        Row: {
          amount_approved: number | null
          created_at: string | null
          id: number
          notes: string | null
          owner_id: string
          payment_id: number
          payment_method: string | null
          screenshot_path: string | null
          status: string
          submitted_at: string | null
          tenant_id: number | null
          utr_number: string | null
          verified_at: string | null
        }
        Insert: {
          amount_approved?: number | null
          created_at?: string | null
          id?: number
          notes?: string | null
          owner_id: string
          payment_id: number
          payment_method?: string | null
          screenshot_path?: string | null
          status?: string
          submitted_at?: string | null
          tenant_id?: number | null
          utr_number?: string | null
          verified_at?: string | null
        }
        Update: {
          amount_approved?: number | null
          created_at?: string | null
          id?: number
          notes?: string | null
          owner_id?: string
          payment_id?: number
          payment_method?: string | null
          screenshot_path?: string | null
          status?: string
          submitted_at?: string | null
          tenant_id?: number | null
          utr_number?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_submissions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "pg_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_submissions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_table"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_paid: number
          created_at: string | null
          due_date: string
          extra_charges: number | null
          id: number
          is_deposit: boolean
          month: number
          owner_id: string
          paid_at: string | null
          payment_code: string
          payment_method: string | null
          payment_token: string
          reminder_sent: boolean | null
          rent_amount: number
          screenshot_path: string | null
          status: string | null
          submitted_at: string | null
          tenant_id: number
          total_amount: number
          utr_number: string | null
          verification_notes: string | null
          verified_at: string | null
          year: number
        }
        Insert: {
          amount_paid?: number
          created_at?: string | null
          due_date: string
          extra_charges?: number | null
          id?: never
          is_deposit?: boolean
          month: number
          owner_id: string
          paid_at?: string | null
          payment_code?: string
          payment_method?: string | null
          payment_token?: string
          reminder_sent?: boolean | null
          rent_amount: number
          screenshot_path?: string | null
          status?: string | null
          submitted_at?: string | null
          tenant_id: number
          total_amount: number
          utr_number?: string | null
          verification_notes?: string | null
          verified_at?: string | null
          year: number
        }
        Update: {
          amount_paid?: number
          created_at?: string | null
          due_date?: string
          extra_charges?: number | null
          id?: never
          is_deposit?: boolean
          month?: number
          owner_id?: string
          paid_at?: string | null
          payment_code?: string
          payment_method?: string | null
          payment_token?: string
          reminder_sent?: boolean | null
          rent_amount?: number
          screenshot_path?: string | null
          status?: string | null
          submitted_at?: string | null
          tenant_id?: number
          total_amount?: number
          utr_number?: string | null
          verification_notes?: string | null
          verified_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_table"
            referencedColumns: ["id"]
          },
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
            isOneToOne: false
            referencedRelation: "pg_owners"
            referencedColumns: ["id"]
          },
        ]
      }
      pg_owners: {
        Row: {
          auto_reply_enabled: boolean | null
          chatbot_enabled: boolean | null
          chatbot_phone: string | null
          complaint_token: string
          created_at: string
          email: string | null
          id: string
          is_onboarded: boolean
          mobile_number: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          auto_reply_enabled?: boolean | null
          chatbot_enabled?: boolean | null
          chatbot_phone?: string | null
          complaint_token?: string
          created_at?: string
          email?: string | null
          id: string
          is_onboarded?: boolean
          mobile_number?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          auto_reply_enabled?: boolean | null
          chatbot_enabled?: boolean | null
          chatbot_phone?: string | null
          complaint_token?: string
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
          owner_id: string | null
          sent_at: string | null
          sent_via: Database["public"]["Enums"]["sms_sent_via"] | null
          status: Database["public"]["Enums"]["sms_status"] | null
          tenant_id: number | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          message?: string | null
          owner_id?: string | null
          sent_at?: string | null
          sent_via?: Database["public"]["Enums"]["sms_sent_via"] | null
          status?: Database["public"]["Enums"]["sms_status"] | null
          tenant_id?: number | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          message?: string | null
          owner_id?: string | null
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
          },
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
          },
        ]
      }
      settings: {
        Row: {
          created_at: string
          default_deposit_fees: number | null
          grace_period_days: number | null
          id: number
          is_merchant: boolean | null
          owner_id: string
          payment_instructions: string | null
          pg_id: number
          refund_deposit: number | null
          rent_due_day: number | null
          updated_at: string | null
          upi_id: string | null
          upi_name: string | null
          whatsapp_invite_link: string | null
        }
        Insert: {
          created_at?: string
          default_deposit_fees?: number | null
          grace_period_days?: number | null
          id?: number
          is_merchant?: boolean | null
          owner_id: string
          payment_instructions?: string | null
          pg_id: number
          refund_deposit?: number | null
          rent_due_day?: number | null
          updated_at?: string | null
          upi_id?: string | null
          upi_name?: string | null
          whatsapp_invite_link?: string | null
        }
        Update: {
          created_at?: string
          default_deposit_fees?: number | null
          grace_period_days?: number | null
          id?: number
          is_merchant?: boolean | null
          owner_id?: string
          payment_instructions?: string | null
          pg_id?: number
          refund_deposit?: number | null
          rent_due_day?: number | null
          updated_at?: string | null
          upi_id?: string | null
          upi_name?: string | null
          whatsapp_invite_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "pg_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settings_pg_id_fkey"
            columns: ["pg_id"]
            isOneToOne: true
            referencedRelation: "pg_details"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants_table: {
        Row: {
          aadhaar_number: string | null
          created_at: string
          deduction_payment_id: number | null
          deduction_target_month: number | null
          deduction_target_year: number | null
          deleted_at: string | null
          deposit_amount: number | null
          deposit_refund_amount: number | null
          email: string | null
          exit_date: string | null
          extra_charges: number | null
          id: number
          id_back_path: string | null
          id_documents: Json | null
          id_front_path: string | null
          identity_deleted_at: string | null
          identity_msg_failed: boolean
          identity_reminder_last_date: string | null
          identity_request_flag: boolean
          identity_type: string | null
          ignore_identity_flag: boolean
          join_date: string | null
          mobile_number: string | null
          mobile_number_normalized: string | null
          name: string | null
          notes: string | null
          original_payment_amount: number | null
          owner_id: string
          pan_code: string | null
          payment_code: string
          payment_portal_token: string | null
          payment_reminder_last_date: string | null
          pending_deposit_deduction: number | null
          pg_id: number | null
          rent_due_day: number | null
          room_id: number | null
          status: Database["public"]["Enums"]["tenant_status"]
          updated_at: string | null
          verification_status: string
          verification_token: string | null
        }
        Insert: {
          aadhaar_number?: string | null
          created_at?: string
          deduction_payment_id?: number | null
          deduction_target_month?: number | null
          deduction_target_year?: number | null
          deleted_at?: string | null
          deposit_amount?: number | null
          deposit_refund_amount?: number | null
          email?: string | null
          exit_date?: string | null
          extra_charges?: number | null
          id?: number
          id_back_path?: string | null
          id_documents?: Json | null
          id_front_path?: string | null
          identity_deleted_at?: string | null
          identity_msg_failed?: boolean
          identity_reminder_last_date?: string | null
          identity_request_flag?: boolean
          identity_type?: string | null
          ignore_identity_flag?: boolean
          join_date?: string | null
          mobile_number?: string | null
          mobile_number_normalized?: string | null
          name?: string | null
          notes?: string | null
          original_payment_amount?: number | null
          owner_id: string
          pan_code?: string | null
          payment_code?: string
          payment_portal_token?: string | null
          payment_reminder_last_date?: string | null
          pending_deposit_deduction?: number | null
          pg_id?: number | null
          rent_due_day?: number | null
          room_id?: number | null
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string | null
          verification_status?: string
          verification_token?: string | null
        }
        Update: {
          aadhaar_number?: string | null
          created_at?: string
          deduction_payment_id?: number | null
          deduction_target_month?: number | null
          deduction_target_year?: number | null
          deleted_at?: string | null
          deposit_amount?: number | null
          deposit_refund_amount?: number | null
          email?: string | null
          exit_date?: string | null
          extra_charges?: number | null
          id?: number
          id_back_path?: string | null
          id_documents?: Json | null
          id_front_path?: string | null
          identity_deleted_at?: string | null
          identity_msg_failed?: boolean
          identity_reminder_last_date?: string | null
          identity_request_flag?: boolean
          identity_type?: string | null
          ignore_identity_flag?: boolean
          join_date?: string | null
          mobile_number?: string | null
          mobile_number_normalized?: string | null
          name?: string | null
          notes?: string | null
          original_payment_amount?: number | null
          owner_id?: string
          pan_code?: string | null
          payment_code?: string
          payment_portal_token?: string | null
          payment_reminder_last_date?: string | null
          pending_deposit_deduction?: number | null
          pg_id?: number | null
          rent_due_day?: number | null
          room_id?: number | null
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string | null
          verification_status?: string
          verification_token?: string | null
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
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_user_exists: {
        Args: { p_email: string; p_phone: string }
        Returns: boolean
      }
      get_dashboard_monthly_collection:
        | { Args: { months_back?: number; owner_id: string }; Returns: Json }
        | {
            Args: { months_back?: number; owner_id: string; p_pg_id?: number }
            Returns: Json
          }
      get_dashboard_recent_activity:
        | { Args: { limit_count?: number; owner_id: string }; Returns: Json }
        | {
            Args: { limit_count?: number; owner_id: string; p_pg_id?: number }
            Returns: Json
          }
      get_dashboard_summary:
        | { Args: { owner_id: string }; Returns: Json }
        | { Args: { owner_id: string; p_pg_id?: number }; Returns: Json }
      get_payment_month_summary: {
        Args: {
          owner_id: string
          p_month: number
          p_pg_id?: number
          p_year: number
        }
        Returns: Json
      }
      get_payments_page: {
        Args: {
          owner_id: string
          p_month: number
          p_pg_id?: number
          p_year: number
          page_offset?: number
          page_size?: number
          search_term?: string
          status_filter?: string
        }
        Returns: {
          amount_paid: number
          due_date: string
          extra_charges: number
          id: number
          month: number
          paid_at: string
          payment_code: string
          payment_method: string
          payment_token: string
          reminder_sent: boolean
          rent_amount: number
          rent_amount_room: number
          room_number: string
          screenshot_path: string
          status: string
          submitted_at: string
          tenant_id: number
          tenant_mobile_number: string
          tenant_name: string
          total_amount: number
          utr_number: string
          verification_notes: string
          verified_at: string
          year: number
        }[]
      }
      normalize_mobile_last10: { Args: { p_mobile: string }; Returns: string }
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
      payment_status: ["paid", "pending", "late"],
      room_status: ["full", "partially occupied", "vacant", "maintenance"],
      room_type: ["ac", "non-ac"],
      sms_sent_via: ["whatsapp", "sms"],
      sms_status: ["sent", "failed"],
      tenant_status: ["active", "pending_move_in", "notice_period", "move_out"],
    },
  },
} as const

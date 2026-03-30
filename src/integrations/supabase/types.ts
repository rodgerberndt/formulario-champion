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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ad_spend: {
        Row: {
          ad_id: string | null
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          clicks: number
          created_at: string
          creative_key: string | null
          date: string
          id: string
          impressions: number
          spend: number
          utm_content: string | null
          utm_creative: string | null
        }
        Insert: {
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          clicks?: number
          created_at?: string
          creative_key?: string | null
          date: string
          id?: string
          impressions?: number
          spend?: number
          utm_content?: string | null
          utm_creative?: string | null
        }
        Update: {
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          clicks?: number
          created_at?: string
          creative_key?: string | null
          date?: string
          id?: string
          impressions?: number
          spend?: number
          utm_content?: string | null
          utm_creative?: string | null
        }
        Relationships: []
      }
      kommo_webhook_logs: {
        Row: {
          contact_id: number | null
          created_at: string
          error_message: string | null
          external_key: string | null
          final_status: string | null
          id: string
          lead_id: number | null
          lead_name: string | null
          lead_phone: string | null
          request_payload: Json | null
          response_payload: Json | null
          retry_count: number | null
          source: string | null
          stage: string | null
          status: string
        }
        Insert: {
          contact_id?: number | null
          created_at?: string
          error_message?: string | null
          external_key?: string | null
          final_status?: string | null
          id?: string
          lead_id?: number | null
          lead_name?: string | null
          lead_phone?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          retry_count?: number | null
          source?: string | null
          stage?: string | null
          status?: string
        }
        Update: {
          contact_id?: number | null
          created_at?: string
          error_message?: string | null
          external_key?: string | null
          final_status?: string | null
          id?: string
          lead_id?: number | null
          lead_name?: string | null
          lead_phone?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          retry_count?: number | null
          source?: string | null
          stage?: string | null
          status?: string
        }
        Relationships: []
      }
      lead_events: {
        Row: {
          button_id: string | null
          created_at: string
          event_name: string
          id: string
          metadata: Json | null
          page: string | null
          session_id: string
          step_id: string | null
        }
        Insert: {
          button_id?: string | null
          created_at?: string
          event_name: string
          id?: string
          metadata?: Json | null
          page?: string | null
          session_id: string
          step_id?: string | null
        }
        Update: {
          button_id?: string | null
          created_at?: string
          event_name?: string
          id?: string
          metadata?: Json | null
          page?: string | null
          session_id?: string
          step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "lead_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sessions: {
        Row: {
          ad_id: string | null
          adset_id: string | null
          campaign_id: string | null
          completed: boolean
          created_at: string
          creative_id: string | null
          current_step_id: string | null
          device_type: string | null
          entered_quiz_page: boolean
          fbclid: string | null
          fbp: string | null
          first_page: string | null
          gclid: string | null
          id: string
          ip_address: string | null
          last_page: string | null
          last_seen_at: string
          lead_instagram: string | null
          lead_market: string | null
          lead_name: string | null
          lead_stage: string | null
          lead_whatsapp: string | null
          referrer: string | null
          rodger_whatsapp_last_error: string | null
          rodger_whatsapp_message_id: string | null
          rodger_whatsapp_notified: boolean | null
          rodger_whatsapp_notified_at: string | null
          start_button_id: string | null
          started_quiz: boolean
          ttclid: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          ad_id?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          completed?: boolean
          created_at?: string
          creative_id?: string | null
          current_step_id?: string | null
          device_type?: string | null
          entered_quiz_page?: boolean
          fbclid?: string | null
          fbp?: string | null
          first_page?: string | null
          gclid?: string | null
          id?: string
          ip_address?: string | null
          last_page?: string | null
          last_seen_at?: string
          lead_instagram?: string | null
          lead_market?: string | null
          lead_name?: string | null
          lead_stage?: string | null
          lead_whatsapp?: string | null
          referrer?: string | null
          rodger_whatsapp_last_error?: string | null
          rodger_whatsapp_message_id?: string | null
          rodger_whatsapp_notified?: boolean | null
          rodger_whatsapp_notified_at?: string | null
          start_button_id?: string | null
          started_quiz?: boolean
          ttclid?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          ad_id?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          completed?: boolean
          created_at?: string
          creative_id?: string | null
          current_step_id?: string | null
          device_type?: string | null
          entered_quiz_page?: boolean
          fbclid?: string | null
          fbp?: string | null
          first_page?: string | null
          gclid?: string | null
          id?: string
          ip_address?: string | null
          last_page?: string | null
          last_seen_at?: string
          lead_instagram?: string | null
          lead_market?: string | null
          lead_name?: string | null
          lead_stage?: string | null
          lead_whatsapp?: string | null
          referrer?: string | null
          rodger_whatsapp_last_error?: string | null
          rodger_whatsapp_message_id?: string | null
          rodger_whatsapp_notified?: boolean | null
          rodger_whatsapp_notified_at?: string | null
          start_button_id?: string | null
          started_quiz?: boolean
          ttclid?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          ad_id: string | null
          adset_id: string | null
          attribution_source: string | null
          campaign_id: string | null
          capi_events_sent: Json | null
          created_at: string
          decisor: boolean | null
          dor_desejo: string
          email: string | null
          empresa: string | null
          estagio_negocio: string | null
          faturamento_faixa: string | null
          fbclid: string | null
          gargalo: string | null
          gclid: string | null
          id: string
          instagram: string
          investimento_faixa: string | null
          ip_address: string | null
          is_duplicate_ip: boolean | null
          kommo_contact_id: number | null
          kommo_lead_id: number | null
          kommo_retry_count: number
          kommo_status: string
          kommo_synced_at: string | null
          last_kommo_error: string | null
          lido: boolean
          mercado: string
          nome_completo: string
          objetivo: string | null
          orcamento_faixa: string | null
          placement: string | null
          raw_answers_json: Json | null
          score: number | null
          sdr_override: string | null
          segmento: string | null
          site_source_name: string | null
          ticket_faixa: string | null
          tier: string | null
          timing: string | null
          trafego_faixa: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          whatsapp: string
        }
        Insert: {
          ad_id?: string | null
          adset_id?: string | null
          attribution_source?: string | null
          campaign_id?: string | null
          capi_events_sent?: Json | null
          created_at?: string
          decisor?: boolean | null
          dor_desejo: string
          email?: string | null
          empresa?: string | null
          estagio_negocio?: string | null
          faturamento_faixa?: string | null
          fbclid?: string | null
          gargalo?: string | null
          gclid?: string | null
          id?: string
          instagram: string
          investimento_faixa?: string | null
          ip_address?: string | null
          is_duplicate_ip?: boolean | null
          kommo_contact_id?: number | null
          kommo_lead_id?: number | null
          kommo_retry_count?: number
          kommo_status?: string
          kommo_synced_at?: string | null
          last_kommo_error?: string | null
          lido?: boolean
          mercado: string
          nome_completo: string
          objetivo?: string | null
          orcamento_faixa?: string | null
          placement?: string | null
          raw_answers_json?: Json | null
          score?: number | null
          sdr_override?: string | null
          segmento?: string | null
          site_source_name?: string | null
          ticket_faixa?: string | null
          tier?: string | null
          timing?: string | null
          trafego_faixa?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp: string
        }
        Update: {
          ad_id?: string | null
          adset_id?: string | null
          attribution_source?: string | null
          campaign_id?: string | null
          capi_events_sent?: Json | null
          created_at?: string
          decisor?: boolean | null
          dor_desejo?: string
          email?: string | null
          empresa?: string | null
          estagio_negocio?: string | null
          faturamento_faixa?: string | null
          fbclid?: string | null
          gargalo?: string | null
          gclid?: string | null
          id?: string
          instagram?: string
          investimento_faixa?: string | null
          ip_address?: string | null
          is_duplicate_ip?: boolean | null
          kommo_contact_id?: number | null
          kommo_lead_id?: number | null
          kommo_retry_count?: number
          kommo_status?: string
          kommo_synced_at?: string | null
          last_kommo_error?: string | null
          lido?: boolean
          mercado?: string
          nome_completo?: string
          objetivo?: string | null
          orcamento_faixa?: string | null
          placement?: string | null
          raw_answers_json?: Json | null
          score?: number | null
          sdr_override?: string | null
          segmento?: string | null
          site_source_name?: string | null
          ticket_faixa?: string | null
          tier?: string | null
          timing?: string | null
          trafego_faixa?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp?: string
        }
        Relationships: []
      }
      manual_sales: {
        Row: {
          created_at: string
          creative_key: string | null
          id: string
          lead_id: string | null
          notes: string | null
          revenue: number
          sale_date: string
          utm_content: string | null
        }
        Insert: {
          created_at?: string
          creative_key?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          revenue?: number
          sale_date: string
          utm_content?: string | null
        }
        Update: {
          created_at?: string
          creative_key?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          revenue?: number
          sale_date?: string
          utm_content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_sales_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          created_at: string
          creative_key: string | null
          id: string
          lead_id: string | null
          notes: string | null
          utm_content: string | null
        }
        Insert: {
          created_at?: string
          creative_key?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          utm_content?: string | null
        }
        Update: {
          created_at?: string
          creative_key?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          utm_content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads_cache: {
        Row: {
          ad_id: string | null
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          created_at: string
          creative_id: string | null
          creative_name: string | null
          creative_thumbnail_url: string | null
          id: string
          last_synced_at: string
          updated_at: string
        }
        Insert: {
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          created_at?: string
          creative_id?: string | null
          creative_name?: string | null
          creative_thumbnail_url?: string | null
          id?: string
          last_synced_at?: string
          updated_at?: string
        }
        Update: {
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          created_at?: string
          creative_id?: string | null
          creative_name?: string | null
          creative_thumbnail_url?: string | null
          id?: string
          last_synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string
          p256dh: string
          user_label: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string
          p256dh: string
          user_label?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string
          p256dh?: string
          user_label?: string | null
        }
        Relationships: []
      }
      quiz_leads: {
        Row: {
          answers: Json
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string
          status: string
          utm: Json
        }
        Insert: {
          answers?: Json
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone: string
          status?: string
          utm?: Json
        }
        Update: {
          answers?: Json
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string
          status?: string
          utm?: Json
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const

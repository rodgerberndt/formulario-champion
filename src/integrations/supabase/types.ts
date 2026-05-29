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
          landing_page_views: number
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
          landing_page_views?: number
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
          landing_page_views?: number
          spend?: number
          utm_content?: string | null
          utm_creative?: string | null
        }
        Relationships: []
      }
      ai_assistant_access_log: {
        Row: {
          api_key_fingerprint: string | null
          contains_pii: boolean | null
          contains_sensitive_free_text: boolean | null
          created_at: string
          endpoint: string
          id: string
          ip: string | null
          latency_ms: number | null
          method: string
          query_params: Json | null
          row_count: number | null
          status_code: number | null
          user_agent: string | null
        }
        Insert: {
          api_key_fingerprint?: string | null
          contains_pii?: boolean | null
          contains_sensitive_free_text?: boolean | null
          created_at?: string
          endpoint: string
          id?: string
          ip?: string | null
          latency_ms?: number | null
          method?: string
          query_params?: Json | null
          row_count?: number | null
          status_code?: number | null
          user_agent?: string | null
        }
        Update: {
          api_key_fingerprint?: string | null
          contains_pii?: boolean | null
          contains_sensitive_free_text?: boolean | null
          created_at?: string
          endpoint?: string
          id?: string
          ip?: string | null
          latency_ms?: number | null
          method?: string
          query_params?: Json | null
          row_count?: number | null
          status_code?: number | null
          user_agent?: string | null
        }
        Relationships: []
      }
      ai_assistant_action_log: {
        Row: {
          affected_row_id: string | null
          affected_table: string | null
          applied_payload: Json | null
          created_at: string
          error_message: string | null
          executor: string
          id: string
          proposed_action_id: string | null
          success: boolean
        }
        Insert: {
          affected_row_id?: string | null
          affected_table?: string | null
          applied_payload?: Json | null
          created_at?: string
          error_message?: string | null
          executor: string
          id?: string
          proposed_action_id?: string | null
          success: boolean
        }
        Update: {
          affected_row_id?: string | null
          affected_table?: string | null
          applied_payload?: Json | null
          created_at?: string
          error_message?: string | null
          executor?: string
          id?: string
          proposed_action_id?: string | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ai_assistant_action_log_proposed_action_id_fkey"
            columns: ["proposed_action_id"]
            isOneToOne: false
            referencedRelation: "ai_assistant_proposed_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_assistant_proposed_actions: {
        Row: {
          action_type: string
          approved_at: string | null
          approver_id: string | null
          approver_note: string | null
          created_at: string
          current_state: Json | null
          executed_at: string | null
          execution_result: Json | null
          expected_impact: string | null
          expires_at: string
          files_or_tables_affected: string[] | null
          id: string
          is_hard_block: boolean
          proposed_change: Json
          proposer_fingerprint: string | null
          requires_manual_execution: boolean
          risks: string | null
          rollback_plan: string | null
          status: string
          target: string
        }
        Insert: {
          action_type: string
          approved_at?: string | null
          approver_id?: string | null
          approver_note?: string | null
          created_at?: string
          current_state?: Json | null
          executed_at?: string | null
          execution_result?: Json | null
          expected_impact?: string | null
          expires_at?: string
          files_or_tables_affected?: string[] | null
          id?: string
          is_hard_block?: boolean
          proposed_change: Json
          proposer_fingerprint?: string | null
          requires_manual_execution?: boolean
          risks?: string | null
          rollback_plan?: string | null
          status?: string
          target: string
        }
        Update: {
          action_type?: string
          approved_at?: string | null
          approver_id?: string | null
          approver_note?: string | null
          created_at?: string
          current_state?: Json | null
          executed_at?: string | null
          execution_result?: Json | null
          expected_impact?: string | null
          expires_at?: string
          files_or_tables_affected?: string[] | null
          id?: string
          is_hard_block?: boolean
          proposed_change?: Json
          proposer_fingerprint?: string | null
          requires_manual_execution?: boolean
          risks?: string | null
          rollback_plan?: string | null
          status?: string
          target?: string
        }
        Relationships: []
      }
      click_events: {
        Row: {
          click_id: string | null
          click_type: string
          created_at: string
          href: string | null
          id: string
          label: string | null
          metadata: Json | null
          page: string
          section_id: string | null
          session_id: string
        }
        Insert: {
          click_id?: string | null
          click_type: string
          created_at?: string
          href?: string | null
          id?: string
          label?: string | null
          metadata?: Json | null
          page?: string
          section_id?: string | null
          session_id: string
        }
        Update: {
          click_id?: string | null
          click_type?: string
          created_at?: string
          href?: string | null
          id?: string
          label?: string | null
          metadata?: Json | null
          page?: string
          section_id?: string | null
          session_id?: string
        }
        Relationships: []
      }
      daily_reports: {
        Row: {
          ajuste_amanha: string | null
          aprendizado: string | null
          atrapalhou_performance: string | null
          causa_gargalo: string | null
          created_at: string
          energia: string
          execucao: string
          gargalo_funil: string | null
          id: string
          leads_trabalhados: number
          ligacoes_realizadas: number
          melhor_abordagem: string | null
          mood: string
          mqls_chamados: number
          mqls_responderam: number
          notas: string | null
          objecao_principal: string | null
          oportunidades_quentes: number
          padrao_leads: string | null
          precisa_ajuda: string | null
          report_date: string
          respostas_recebidas: number
          reunioes_agendadas: number
          sdr_name: string
          updated_at: string
          valor_fechado: number
          valor_pipeline: number
          vendas_sprint: number
        }
        Insert: {
          ajuste_amanha?: string | null
          aprendizado?: string | null
          atrapalhou_performance?: string | null
          causa_gargalo?: string | null
          created_at?: string
          energia?: string
          execucao?: string
          gargalo_funil?: string | null
          id?: string
          leads_trabalhados?: number
          ligacoes_realizadas?: number
          melhor_abordagem?: string | null
          mood?: string
          mqls_chamados?: number
          mqls_responderam?: number
          notas?: string | null
          objecao_principal?: string | null
          oportunidades_quentes?: number
          padrao_leads?: string | null
          precisa_ajuda?: string | null
          report_date: string
          respostas_recebidas?: number
          reunioes_agendadas?: number
          sdr_name: string
          updated_at?: string
          valor_fechado?: number
          valor_pipeline?: number
          vendas_sprint?: number
        }
        Update: {
          ajuste_amanha?: string | null
          aprendizado?: string | null
          atrapalhou_performance?: string | null
          causa_gargalo?: string | null
          created_at?: string
          energia?: string
          execucao?: string
          gargalo_funil?: string | null
          id?: string
          leads_trabalhados?: number
          ligacoes_realizadas?: number
          melhor_abordagem?: string | null
          mood?: string
          mqls_chamados?: number
          mqls_responderam?: number
          notas?: string | null
          objecao_principal?: string | null
          oportunidades_quentes?: number
          padrao_leads?: string | null
          precisa_ajuda?: string | null
          report_date?: string
          respostas_recebidas?: number
          reunioes_agendadas?: number
          sdr_name?: string
          updated_at?: string
          valor_fechado?: number
          valor_pipeline?: number
          vendas_sprint?: number
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
      landing_hits: {
        Row: {
          click_id: string | null
          created_at: string
          device_type: string | null
          fbclid: string | null
          gclid: string | null
          id: string
          ip_address: string | null
          path: string
          referrer: string | null
          session_id: string | null
          ttclid: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          click_id?: string | null
          created_at?: string
          device_type?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          ip_address?: string | null
          path?: string
          referrer?: string | null
          session_id?: string | null
          ttclid?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          click_id?: string | null
          created_at?: string
          device_type?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          ip_address?: string | null
          path?: string
          referrer?: string | null
          session_id?: string | null
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
          clicked_whatsapp: boolean
          clicked_whatsapp_at: string | null
          created_at: string
          decisor: boolean | null
          dor_desejo: string
          email: string | null
          empresa: string | null
          estagio_negocio: string | null
          faturamento_faixa: string | null
          fbclid: string | null
          first_opened_at: string | null
          gargalo: string | null
          gclid: string | null
          id: string
          instagram: string
          instagram_follow_dispatched_at: string | null
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
          nps_score: number | null
          objetivo: string | null
          operacoes_ativas: number | null
          orcamento_faixa: string | null
          placement: string | null
          raw_answers_json: Json | null
          score: number | null
          sdr_override: string | null
          segmento: string | null
          site_source_name: string | null
          skipped_queue: boolean
          skipped_queue_at: string | null
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
          clicked_whatsapp?: boolean
          clicked_whatsapp_at?: string | null
          created_at?: string
          decisor?: boolean | null
          dor_desejo: string
          email?: string | null
          empresa?: string | null
          estagio_negocio?: string | null
          faturamento_faixa?: string | null
          fbclid?: string | null
          first_opened_at?: string | null
          gargalo?: string | null
          gclid?: string | null
          id?: string
          instagram: string
          instagram_follow_dispatched_at?: string | null
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
          nps_score?: number | null
          objetivo?: string | null
          operacoes_ativas?: number | null
          orcamento_faixa?: string | null
          placement?: string | null
          raw_answers_json?: Json | null
          score?: number | null
          sdr_override?: string | null
          segmento?: string | null
          site_source_name?: string | null
          skipped_queue?: boolean
          skipped_queue_at?: string | null
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
          clicked_whatsapp?: boolean
          clicked_whatsapp_at?: string | null
          created_at?: string
          decisor?: boolean | null
          dor_desejo?: string
          email?: string | null
          empresa?: string | null
          estagio_negocio?: string | null
          faturamento_faixa?: string | null
          fbclid?: string | null
          first_opened_at?: string | null
          gargalo?: string | null
          gclid?: string | null
          id?: string
          instagram?: string
          instagram_follow_dispatched_at?: string | null
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
          nps_score?: number | null
          objetivo?: string | null
          operacoes_ativas?: number | null
          orcamento_faixa?: string | null
          placement?: string | null
          raw_answers_json?: Json | null
          score?: number | null
          sdr_override?: string | null
          segmento?: string | null
          site_source_name?: string | null
          skipped_queue?: boolean
          skipped_queue_at?: string | null
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
          closer: string | null
          created_at: string
          creative_key: string | null
          id: string
          lead_id: string | null
          notes: string | null
          revenue: number
          sale_date: string
          sale_type: string
          utm_content: string | null
        }
        Insert: {
          closer?: string | null
          created_at?: string
          creative_key?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          revenue?: number
          sale_date: string
          sale_type?: string
          utm_content?: string | null
        }
        Update: {
          closer?: string | null
          created_at?: string
          creative_key?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          revenue?: number
          sale_date?: string
          sale_type?: string
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
          attended: boolean
          closer: string | null
          created_at: string
          creative_key: string | null
          id: string
          lead_id: string | null
          notes: string | null
          utm_content: string | null
        }
        Insert: {
          attended?: boolean
          closer?: string | null
          created_at?: string
          creative_key?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          utm_content?: string | null
        }
        Update: {
          attended?: boolean
          closer?: string | null
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
      scroll_milestones: {
        Row: {
          id: string
          milestone: number
          page: string
          reached_at: string
          session_id: string
        }
        Insert: {
          id?: string
          milestone: number
          page?: string
          reached_at?: string
          session_id: string
        }
        Update: {
          id?: string
          milestone?: number
          page?: string
          reached_at?: string
          session_id?: string
        }
        Relationships: []
      }
      section_views: {
        Row: {
          created_at: string
          first_seen_at: string
          id: string
          last_seen_at: string
          page: string
          section_id: string
          section_order: number
          session_id: string
          time_spent_ms: number
        }
        Insert: {
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          page?: string
          section_id: string
          section_order: number
          session_id: string
          time_spent_ms?: number
        }
        Update: {
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          page?: string
          section_id?: string
          section_order?: number
          session_id?: string
          time_spent_ms?: number
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
      increment_section_time: {
        Args: {
          p_add_ms: number
          p_page: string
          p_section_id: string
          p_section_order: number
          p_session_id: string
        }
        Returns: undefined
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

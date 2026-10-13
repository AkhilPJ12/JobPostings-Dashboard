export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_enrichment_queue: {
        Row: {
          attempts: number;
          available_at: string;
          created_at: string;
          id: number;
          input_tokens: number | null;
          job_id: number;
          last_error: string | null;
          latency_ms: number | null;
          lease_token: string | null;
          leased_until: string | null;
          model: string;
          output_tokens: number | null;
          prompt_version: number;
          source_hash: string;
          state: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          available_at?: string;
          created_at?: string;
          id?: never;
          input_tokens?: number | null;
          job_id: number;
          last_error?: string | null;
          latency_ms?: number | null;
          lease_token?: string | null;
          leased_until?: string | null;
          model: string;
          output_tokens?: number | null;
          prompt_version: number;
          source_hash: string;
          state?: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          available_at?: string;
          created_at?: string;
          id?: never;
          input_tokens?: number | null;
          job_id?: number;
          last_error?: string | null;
          latency_ms?: number | null;
          lease_token?: string | null;
          leased_until?: string | null;
          model?: string;
          output_tokens?: number | null;
          prompt_version?: number;
          source_hash?: string;
          state?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_enrichment_queue_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "job_read_model";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_enrichment_queue_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_enrichment_settings: {
        Row: {
          model: string;
          prompt_version: number;
          singleton: boolean;
        };
        ComputedFields: never;
        Insert: {
          model: string;
          prompt_version?: number;
          singleton?: boolean;
        };
        Update: {
          model?: string;
          prompt_version?: number;
          singleton?: boolean;
        };
        Relationships: [];
      };
      ai_enrichment_usage: {
        Row: {
          created_at: string;
          model: string;
          request_count: number;
          updated_at: string;
          usage_date: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          model: string;
          request_count?: number;
          updated_at?: string;
          usage_date: string;
        };
        Update: {
          created_at?: string;
          model?: string;
          request_count?: number;
          updated_at?: string;
          usage_date?: string;
        };
        Relationships: [];
      };
      ai_worker_lease: {
        Row: {
          expires_at: string;
          singleton: boolean;
          token: string;
        };
        ComputedFields: never;
        Insert: {
          expires_at: string;
          singleton?: boolean;
          token: string;
        };
        Update: {
          expires_at?: string;
          singleton?: boolean;
          token?: string;
        };
        Relationships: [];
      };
      companies: {
        Row: {
          careers_url: string | null;
          careers_url_1: string | null;
          color: string | null;
          Company_icon: string | null;
          created_at: string;
          id: number;
          is_active: boolean;
          logo_url: string | null;
          name: string;
          updated_at: string;
          website_url: string | null;
        };
        ComputedFields: never;
        Insert: {
          careers_url?: string | null;
          careers_url_1?: string | null;
          color?: string | null;
          Company_icon?: string | null;
          created_at?: string;
          id?: never;
          is_active?: boolean;
          logo_url?: string | null;
          name: string;
          updated_at?: string;
          website_url?: string | null;
        };
        Update: {
          careers_url?: string | null;
          careers_url_1?: string | null;
          color?: string | null;
          Company_icon?: string | null;
          created_at?: string;
          id?: never;
          is_active?: boolean;
          logo_url?: string | null;
          name?: string;
          updated_at?: string;
          website_url?: string | null;
        };
        Relationships: [];
      };
      job_source_identities: {
        Row: {
          date_provenance: string;
          external_job_id: string;
          first_seen_at: string;
          source_posted_date: string | null;
        };
        ComputedFields: never;
        Insert: {
          date_provenance?: string;
          external_job_id: string;
          first_seen_at?: string;
          source_posted_date?: string | null;
        };
        Update: {
          date_provenance?: string;
          external_job_id?: string;
          first_seen_at?: string;
          source_posted_date?: string | null;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          ai_enriched_at: string | null;
          ai_enrichment_attempts: number;
          ai_enrichment_error: string | null;
          ai_enrichment_model: string | null;
          ai_enrichment_status: string | null;
          ai_prompt_version: number | null;
          ai_result: Json | null;
          ai_result_source_hash: string | null;
          company_id: number;
          created_at: string;
          date_provenance: string;
          department: string | null;
          description: string | null;
          employment_type: string | null;
          end_date: string | null;
          external_job_id: string | null;
          first_seen_at: string;
          h1b_sponsorship: string | null;
          id: number;
          inactive_since_at: string | null;
          is_active: boolean;
          job_url: string | null;
          last_seen_at: string;
          location: string | null;
          location_type: string | null;
          pay_range: string | null;
          posted_date: string | null;
          preferred_qualifications: string[] | null;
          raw_job_payload: Json | null;
          required_qualifications: string[] | null;
          search_text: string | null;
          security_clearance: string | null;
          source_content_hash: string | null;
          source_field_provenance: NonNullable<Json>;
          summary: string | null;
          title: string;
          updated_at: string;
          visible_search_text: string | null;
        };
        ComputedFields: never;
        Insert: {
          ai_enriched_at?: string | null;
          ai_enrichment_attempts?: number;
          ai_enrichment_error?: string | null;
          ai_enrichment_model?: string | null;
          ai_enrichment_status?: string | null;
          ai_prompt_version?: number | null;
          ai_result?: Json | null;
          ai_result_source_hash?: string | null;
          company_id: number;
          created_at?: string;
          date_provenance?: string;
          department?: string | null;
          description?: string | null;
          employment_type?: string | null;
          end_date?: string | null;
          external_job_id?: string | null;
          first_seen_at?: string;
          h1b_sponsorship?: string | null;
          id?: never;
          inactive_since_at?: string | null;
          is_active?: boolean;
          job_url?: string | null;
          last_seen_at?: string;
          location?: string | null;
          location_type?: string | null;
          pay_range?: string | null;
          posted_date?: string | null;
          preferred_qualifications?: string[] | null;
          raw_job_payload?: Json | null;
          required_qualifications?: string[] | null;
          search_text?: never;
          security_clearance?: string | null;
          source_content_hash?: string | null;
          source_field_provenance?: NonNullable<Json>;
          summary?: string | null;
          title: string;
          updated_at?: string;
          visible_search_text?: never;
        };
        Update: {
          ai_enriched_at?: string | null;
          ai_enrichment_attempts?: number;
          ai_enrichment_error?: string | null;
          ai_enrichment_model?: string | null;
          ai_enrichment_status?: string | null;
          ai_prompt_version?: number | null;
          ai_result?: Json | null;
          ai_result_source_hash?: string | null;
          company_id?: number;
          created_at?: string;
          date_provenance?: string;
          department?: string | null;
          description?: string | null;
          employment_type?: string | null;
          end_date?: string | null;
          external_job_id?: string | null;
          first_seen_at?: string;
          h1b_sponsorship?: string | null;
          id?: never;
          inactive_since_at?: string | null;
          is_active?: boolean;
          job_url?: string | null;
          last_seen_at?: string;
          location?: string | null;
          location_type?: string | null;
          pay_range?: string | null;
          posted_date?: string | null;
          preferred_qualifications?: string[] | null;
          raw_job_payload?: Json | null;
          required_qualifications?: string[] | null;
          search_text?: never;
          security_clearance?: string | null;
          source_content_hash?: string | null;
          source_field_provenance?: NonNullable<Json>;
          summary?: string | null;
          title?: string;
          updated_at?: string;
          visible_search_text?: never;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      scraper_leases: {
        Row: {
          company_name: string;
          expires_at: string;
          token: string;
        };
        ComputedFields: never;
        Insert: {
          company_name: string;
          expires_at: string;
          token: string;
        };
        Update: {
          company_name?: string;
          expires_at?: string;
          token?: string;
        };
        Relationships: [];
      };
      scraper_runs: {
        Row: {
          company_name: string;
          completed_at: string | null;
          created_at: string;
          duration_seconds: number | null;
          error_message: string | null;
          id: number;
          run_group_id: string | null;
          started_at: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          company_name: string;
          completed_at?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          error_message?: string | null;
          id?: never;
          run_group_id?: string | null;
          started_at: string;
          status: string;
        };
        Update: {
          company_name?: string;
          completed_at?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          error_message?: string | null;
          id?: never;
          run_group_id?: string | null;
          started_at?: string;
          status?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      job_read_model: {
        Row: {
          company: string | null;
          company_color: string | null;
          company_icon: string | null;
          company_id: number | null;
          date_provenance: string | null;
          department: string | null;
          description: string | null;
          employment_type: string | null;
          end_date: string | null;
          external_job_id: string | null;
          first_seen_date: string | null;
          h1b_sponsorship: string | null;
          id: number | null;
          is_active: boolean | null;
          job_url: string | null;
          location: string | null;
          location_type: string | null;
          pay_range: string | null;
          posted_date: string | null;
          preferred_qualifications: string[] | null;
          required_qualifications: string[] | null;
          search_text: string | null;
          security_clearance: string | null;
          summary: string | null;
          summary_generated: boolean | null;
          title: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      claim_ai_enrichment: {
        Args: { p_company?: string; p_lease_seconds?: number; p_model: string; p_state?: string };
        Returns: Json;
      };
      claim_ai_worker_lease: { Args: Record<PropertyKey, never>; Returns: string };
      claim_scraper_lease: { Args: { p_company: string; p_seconds?: number }; Returns: string };
      consume_ai_enrichment_quota: {
        Args: { p_max_requests: number; p_model: string; p_usage_date: string };
        Returns: boolean;
      };
      count_ai_enrichment_queue: {
        Args: { p_company?: string; p_model: string; p_state?: string };
        Returns: number;
      };
      fail_ai_enrichment: {
        Args: {
          p_error: string;
          p_lease_token: string;
          p_queue_id: number;
          p_retry_after_seconds?: number;
          p_retryable: boolean;
        };
        Returns: boolean;
      };
      finish_ai_enrichment: {
        Args: {
          p_input_tokens: number;
          p_latency_ms: number;
          p_lease_token: string;
          p_output_tokens: number;
          p_queue_id: number;
          p_result: Json;
        };
        Returns: boolean;
      };
      finish_scraper_lease: {
        Args: {
          p_company: string;
          p_completed_at: string;
          p_error: string;
          p_run_group: string;
          p_started_at: string;
          p_status: string;
          p_token: string;
        };
        Returns: boolean;
      };
      get_job_facets: { Args: Record<PropertyKey, never>; Returns: Json };
      get_public_enrichment_health: { Args: Record<PropertyKey, never>; Returns: Json };
      get_public_job: { Args: { p_id: number }; Returns: Json };
      get_public_scraper_statuses: { Args: Record<PropertyKey, never>; Returns: Json };
      release_ai_enrichment: {
        Args: { p_delay_seconds?: number; p_lease_token: string; p_queue_id: number };
        Returns: boolean;
      };
      release_ai_worker_lease: { Args: { p_token: string }; Returns: boolean };
      renew_ai_worker_lease: { Args: { p_token: string }; Returns: boolean };
      search_jobs: { Args: { p_query?: Json }; Returns: Json };
      show_limit: { Args: Record<PropertyKey, never>; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;

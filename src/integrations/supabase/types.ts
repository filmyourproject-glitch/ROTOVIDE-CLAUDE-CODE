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
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          export_id: string | null
          id: string
          stripe_payment_intent_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          export_id?: string | null
          id?: string
          stripe_payment_intent_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          export_id?: string | null
          id?: string
          stripe_payment_intent_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      exports: {
        Row: {
          created_at: string | null
          credits_used: number | null
          download_url: string | null
          expires_at: string | null
          format: string | null
          id: string
          mux_asset_id: string | null
          mux_playback_id: string | null
          project_id: string
          settings: Json | null
          size_bytes: number | null
          status: string | null
          user_id: string
          watermarked: boolean | null
        }
        Insert: {
          created_at?: string | null
          credits_used?: number | null
          download_url?: string | null
          expires_at?: string | null
          format?: string | null
          id?: string
          mux_asset_id?: string | null
          mux_playback_id?: string | null
          project_id: string
          settings?: Json | null
          size_bytes?: number | null
          status?: string | null
          user_id: string
          watermarked?: boolean | null
        }
        Update: {
          created_at?: string | null
          credits_used?: number | null
          download_url?: string | null
          expires_at?: string | null
          format?: string | null
          id?: string
          mux_asset_id?: string | null
          mux_playback_id?: string | null
          project_id?: string
          settings?: Json | null
          size_bytes?: number | null
          status?: string | null
          user_id?: string
          watermarked?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "exports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_files: {
        Row: {
          audio_similarity_score: number | null
          classification_confidence: number | null
          clip_classification: string | null
          created_at: string | null
          deleted_at: string | null
          duration_seconds: number | null
          expires_at: string | null
          face_confidence: number | null
          face_crop_x: number | null
          face_crop_y: number | null
          face_keyframes: Json | null
          file_name: string
          file_type: string
          id: string
          mux_asset_id: string | null
          mux_playback_id: string | null
          mux_upload_id: string | null
          preview_image_path: string | null
          project_id: string
          proxy_storage_path: string | null
          size_bytes: number | null
          static_renditions_ready: boolean | null
          status: string | null
          storage_path: string | null
          suggested_timeline_position: number | null
          user_id: string
          waveform_data: Json | null
        }
        Insert: {
          audio_similarity_score?: number | null
          classification_confidence?: number | null
          clip_classification?: string | null
          created_at?: string | null
          deleted_at?: string | null
          duration_seconds?: number | null
          expires_at?: string | null
          face_confidence?: number | null
          face_crop_x?: number | null
          face_crop_y?: number | null
          face_keyframes?: Json | null
          file_name: string
          file_type: string
          id?: string
          mux_asset_id?: string | null
          mux_playback_id?: string | null
          mux_upload_id?: string | null
          preview_image_path?: string | null
          project_id: string
          proxy_storage_path?: string | null
          size_bytes?: number | null
          static_renditions_ready?: boolean | null
          status?: string | null
          storage_path?: string | null
          suggested_timeline_position?: number | null
          user_id: string
          waveform_data?: Json | null
        }
        Update: {
          audio_similarity_score?: number | null
          classification_confidence?: number | null
          clip_classification?: string | null
          created_at?: string | null
          deleted_at?: string | null
          duration_seconds?: number | null
          expires_at?: string | null
          face_confidence?: number | null
          face_crop_x?: number | null
          face_crop_y?: number | null
          face_keyframes?: Json | null
          file_name?: string
          file_type?: string
          id?: string
          mux_asset_id?: string | null
          mux_playback_id?: string | null
          mux_upload_id?: string | null
          preview_image_path?: string | null
          project_id?: string
          proxy_storage_path?: string | null
          size_bytes?: number | null
          static_renditions_ready?: boolean | null
          status?: string | null
          storage_path?: string | null
          suggested_timeline_position?: number | null
          user_id?: string
          waveform_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "media_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_files_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          notification_export_complete: boolean | null
          notification_storage_warning: boolean | null
          plan: string | null
          storage_used_bytes: number | null
          suspicious_activity: boolean | null
          suspicious_activity_reason: string | null
          trial_ends_at: string | null
          trial_used: boolean | null
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id: string
          notification_export_complete?: boolean | null
          notification_storage_warning?: boolean | null
          plan?: string | null
          storage_used_bytes?: number | null
          suspicious_activity?: boolean | null
          suspicious_activity_reason?: string | null
          trial_ends_at?: string | null
          trial_used?: boolean | null
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          notification_export_complete?: boolean | null
          notification_storage_warning?: boolean | null
          plan?: string | null
          storage_used_bytes?: number | null
          suspicious_activity?: boolean | null
          suspicious_activity_reason?: string | null
          trial_ends_at?: string | null
          trial_used?: boolean | null
        }
        Relationships: []
      }
      project_clips: {
        Row: {
          clip_index: number
          created_at: string | null
          download_url: string | null
          end_time: number
          id: string
          label: string | null
          mux_asset_id: string | null
          mux_playback_id: string | null
          project_id: string
          score: number | null
          start_time: number
          status: string | null
          user_id: string
        }
        Insert: {
          clip_index: number
          created_at?: string | null
          download_url?: string | null
          end_time: number
          id?: string
          label?: string | null
          mux_asset_id?: string | null
          mux_playback_id?: string | null
          project_id: string
          score?: number | null
          start_time: number
          status?: string | null
          user_id: string
        }
        Update: {
          clip_index?: number
          created_at?: string | null
          download_url?: string | null
          end_time?: number
          id?: string
          label?: string | null
          mux_asset_id?: string | null
          mux_playback_id?: string | null
          project_id?: string
          score?: number | null
          start_time?: number
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_clips_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          analysis_data: Json | null
          artist_name: string | null
          bpm: number | null
          color_grade: string | null
          color_grade_intensity: number | null
          created_at: string | null
          cutting_strategy: string | null
          detected_bpm: number | null
          export_storage_bytes: number | null
          format: string | null
          id: string
          last_activity_at: string | null
          lyrics_data: Json | null
          name: string
          raw_storage_bytes: number | null
          song_sections: Json | null
          song_title: string | null
          status: string | null
          style_preset: string | null
          sync_status: string | null
          timeline_data: Json | null
          trim_end: number | null
          trim_start: number | null
          type: string
          user_id: string
        }
        Insert: {
          analysis_data?: Json | null
          artist_name?: string | null
          bpm?: number | null
          color_grade?: string | null
          color_grade_intensity?: number | null
          created_at?: string | null
          cutting_strategy?: string | null
          detected_bpm?: number | null
          export_storage_bytes?: number | null
          format?: string | null
          id?: string
          last_activity_at?: string | null
          lyrics_data?: Json | null
          name: string
          raw_storage_bytes?: number | null
          song_sections?: Json | null
          song_title?: string | null
          status?: string | null
          style_preset?: string | null
          sync_status?: string | null
          timeline_data?: Json | null
          trim_end?: number | null
          trim_start?: number | null
          type?: string
          user_id: string
        }
        Update: {
          analysis_data?: Json | null
          artist_name?: string | null
          bpm?: number | null
          color_grade?: string | null
          color_grade_intensity?: number | null
          created_at?: string | null
          cutting_strategy?: string | null
          detected_bpm?: number | null
          export_storage_bytes?: number | null
          format?: string | null
          id?: string
          last_activity_at?: string | null
          lyrics_data?: Json | null
          name?: string
          raw_storage_bytes?: number | null
          song_sections?: Json | null
          song_title?: string | null
          status?: string | null
          style_preset?: string | null
          sync_status?: string | null
          timeline_data?: Json | null
          trim_end?: number | null
          trim_start?: number | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_attempts: {
        Row: {
          created_at: string | null
          id: string
          ip_address: string | null
          success: boolean | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trial_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credits: {
        Row: {
          created_at: string
          email_export_ready: boolean
          email_low_credits: boolean
          email_monthly_reset: boolean
          email_trial_expiry: boolean
          id: string
          onboarding_completed: boolean
          plan: string
          primary_use: string | null
          stripe_customer_id: string | null
          subscription_credits: number
          subscription_resets_at: string | null
          topup_credits: number
          trial_credits: number
          trial_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_export_ready?: boolean
          email_low_credits?: boolean
          email_monthly_reset?: boolean
          email_trial_expiry?: boolean
          id?: string
          onboarding_completed?: boolean
          plan?: string
          primary_use?: string | null
          stripe_customer_id?: string | null
          subscription_credits?: number
          subscription_resets_at?: string | null
          topup_credits?: number
          trial_credits?: number
          trial_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_export_ready?: boolean
          email_low_credits?: boolean
          email_monthly_reset?: boolean
          email_trial_expiry?: boolean
          id?: string
          onboarding_completed?: boolean
          plan?: string
          primary_use?: string | null
          stripe_customer_id?: string | null
          subscription_credits?: number
          subscription_resets_at?: string | null
          topup_credits?: number
          trial_credits?: number
          trial_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          id: string
          email: string
          name: string | null
          instagram_url: string | null
          tiktok_url: string | null
          mission: string | null
          agreed_to_terms: boolean
          source: string | null
          status: string
          notes: string | null
          invite_code: string | null
          code_sent: boolean
          code_sent_at: string | null
          redeemed: boolean
          redeemed_at: string | null
          invite_sent_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          email: string
          name?: string | null
          instagram_url?: string | null
          tiktok_url?: string | null
          mission?: string | null
          agreed_to_terms?: boolean
          source?: string | null
          status?: string
          notes?: string | null
          invite_code?: string | null
          code_sent?: boolean
          code_sent_at?: string | null
          redeemed?: boolean
          redeemed_at?: string | null
          invite_sent_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          email?: string
          name?: string | null
          instagram_url?: string | null
          tiktok_url?: string | null
          mission?: string | null
          agreed_to_terms?: boolean
          source?: string | null
          status?: string
          notes?: string | null
          invite_code?: string | null
          code_sent?: boolean
          code_sent_at?: string | null
          redeemed?: boolean
          redeemed_at?: string | null
          invite_sent_at?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      deduct_credit: {
        Args: { p_amount?: number; p_export_id: string }
        Returns: Json
      }
      update_storage_used: { Args: { p_user_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

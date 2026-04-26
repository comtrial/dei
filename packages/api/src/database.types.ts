export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_status: {
        Row: {
          account_state: Database["public"]["Enums"]["account_state"]
          age_eligible: boolean
          age_verified_at: string | null
          banned_at: string | null
          created_at: string
          deleted_at: string | null
          discovery_enabled_at: string | null
          first_video_approved_at: string | null
          first_video_uploaded_at: string | null
          identity_verified_at: string | null
          onboarding_state: Database["public"]["Enums"]["onboarding_state"]
          profile_completed_at: string | null
          suspended_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_state?: Database["public"]["Enums"]["account_state"]
          age_eligible?: boolean
          age_verified_at?: string | null
          banned_at?: string | null
          created_at?: string
          deleted_at?: string | null
          discovery_enabled_at?: string | null
          first_video_approved_at?: string | null
          first_video_uploaded_at?: string | null
          identity_verified_at?: string | null
          onboarding_state?: Database["public"]["Enums"]["onboarding_state"]
          profile_completed_at?: string | null
          suspended_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_state?: Database["public"]["Enums"]["account_state"]
          age_eligible?: boolean
          age_verified_at?: string | null
          banned_at?: string | null
          created_at?: string
          deleted_at?: string | null
          discovery_enabled_at?: string | null
          first_video_approved_at?: string | null
          first_video_uploaded_at?: string | null
          identity_verified_at?: string | null
          onboarding_state?: Database["public"]["Enums"]["onboarding_state"]
          profile_completed_at?: string | null
          suspended_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_actions: {
        Row: {
          action_type: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          object_id: string | null
          object_type: string | null
          target_user_id: string | null
        }
        Insert: {
          action_type: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          object_id?: string | null
          object_type?: string | null
          target_user_id?: string | null
        }
        Update: {
          action_type?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          object_id?: string | null
          object_type?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocked_user_id: string
          blocker_user_id: string
          created_at: string
          id: string
          reason: string | null
          unblocked_at: string | null
          updated_at: string
        }
        Insert: {
          blocked_user_id: string
          blocker_user_id: string
          created_at?: string
          id?: string
          reason?: string | null
          unblocked_at?: string | null
          updated_at?: string
        }
        Update: {
          blocked_user_id?: string
          blocker_user_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          unblocked_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      identity_verifications: {
        Row: {
          adult_verified: boolean | null
          birth_year: number | null
          created_at: string
          expires_at: string | null
          failed_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          phone_country_code: string | null
          phone_hash: string | null
          provider: Database["public"]["Enums"]["identity_provider"]
          provider_metadata: Json
          provider_verification_id: string | null
          requested_at: string
          status: Database["public"]["Enums"]["verification_status"]
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          adult_verified?: boolean | null
          birth_year?: number | null
          created_at?: string
          expires_at?: string | null
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          phone_country_code?: string | null
          phone_hash?: string | null
          provider?: Database["public"]["Enums"]["identity_provider"]
          provider_metadata?: Json
          provider_verification_id?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["verification_status"]
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          adult_verified?: boolean | null
          birth_year?: number | null
          created_at?: string
          expires_at?: string | null
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          phone_country_code?: string | null
          phone_hash?: string | null
          provider?: Database["public"]["Enums"]["identity_provider"]
          provider_metadata?: Json
          provider_verification_id?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["verification_status"]
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      moderation_cases: {
        Row: {
          assigned_admin_id: string | null
          closed_at: string | null
          created_at: string
          id: string
          priority: number
          resolution: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["moderation_source_type"]
          status: Database["public"]["Enums"]["moderation_case_status"]
          subject_user_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_admin_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          priority?: number
          resolution?: string | null
          source_id?: string | null
          source_type: Database["public"]["Enums"]["moderation_source_type"]
          status?: Database["public"]["Enums"]["moderation_case_status"]
          subject_user_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_admin_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          priority?: number
          resolution?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["moderation_source_type"]
          status?: Database["public"]["Enums"]["moderation_case_status"]
          subject_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      private_profiles: {
        Row: {
          birth_date: string | null
          created_at: string
          phone_country_code: string | null
          phone_hash: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          phone_country_code?: string | null
          phone_hash?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          phone_country_code?: string | null
          phone_hash?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_videos: {
        Row: {
          approved_at: string | null
          created_at: string
          duration_ms: number
          file_size_bytes: number | null
          id: string
          is_primary: boolean
          mime_type: string
          moderation_status: Database["public"]["Enums"]["moderation_status"]
          rejected_at: string | null
          rejection_reason: string | null
          removed_at: string | null
          storage_bucket: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          duration_ms: number
          file_size_bytes?: number | null
          id?: string
          is_primary?: boolean
          mime_type?: string
          moderation_status?: Database["public"]["Enums"]["moderation_status"]
          rejected_at?: string | null
          rejection_reason?: string | null
          removed_at?: string | null
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          duration_ms?: number
          file_size_bytes?: number | null
          id?: string
          is_primary?: boolean
          mime_type?: string
          moderation_status?: Database["public"]["Enums"]["moderation_status"]
          rejected_at?: string | null
          rejection_reason?: string | null
          removed_at?: string | null
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          bio: string | null
          created_at: string
          display_name: string | null
          gender: string | null
          id: string
          profile_status: Database["public"]["Enums"]["moderation_status"]
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          gender?: string | null
          id: string
          profile_status?: Database["public"]["Enums"]["moderation_status"]
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          gender?: string | null
          id?: string
          profile_status?: Database["public"]["Enums"]["moderation_status"]
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          description: string | null
          id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reported_user_id: string
          reporter_user_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_id: string | null
          target_type: Database["public"]["Enums"]["moderation_source_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          reason: Database["public"]["Enums"]["report_reason"]
          reported_user_id: string
          reporter_user_id: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string | null
          target_type?: Database["public"]["Enums"]["moderation_source_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          reason?: Database["public"]["Enums"]["report_reason"]
          reported_user_id?: string
          reporter_user_id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string | null
          target_type?: Database["public"]["Enums"]["moderation_source_type"]
          updated_at?: string
        }
        Relationships: []
      }
      user_consents: {
        Row: {
          accepted_at: string
          age_policy_version: string
          community_guidelines_version: string
          created_at: string
          id: string
          marketing_email_opt_in: boolean
          marketing_push_opt_in: boolean
          privacy_version: string
          terms_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          age_policy_version: string
          community_guidelines_version: string
          created_at?: string
          id?: string
          marketing_email_opt_in?: boolean
          marketing_push_opt_in?: boolean
          privacy_version: string
          terms_version: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          age_policy_version?: string
          community_guidelines_version?: string
          created_at?: string
          id?: string
          marketing_email_opt_in?: boolean
          marketing_push_opt_in?: boolean
          privacy_version?: string
          terms_version?: string
          user_id?: string
        }
        Relationships: []
      }
      user_devices: {
        Row: {
          app_version: string | null
          created_at: string
          device_label: string | null
          id: string
          installation_id_hash: string
          last_seen_at: string
          platform: Database["public"]["Enums"]["device_platform"]
          push_provider: Database["public"]["Enums"]["push_provider"] | null
          push_token: string | null
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_label?: string | null
          id?: string
          installation_id_hash: string
          last_seen_at?: string
          platform: Database["public"]["Enums"]["device_platform"]
          push_provider?: Database["public"]["Enums"]["push_provider"] | null
          push_token?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_label?: string | null
          id?: string
          installation_id_hash?: string
          last_seen_at?: string
          platform?: Database["public"]["Enums"]["device_platform"]
          push_provider?: Database["public"]["Enums"]["push_provider"] | null
          push_token?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_required_consents: {
        Args: {
          p_age_policy_version: string
          p_community_guidelines_version: string
          p_marketing_email_opt_in?: boolean
          p_marketing_push_opt_in?: boolean
          p_privacy_version: string
          p_terms_version: string
        }
        Returns: {
          account_state: Database["public"]["Enums"]["account_state"]
          age_eligible: boolean
          age_verified_at: string | null
          banned_at: string | null
          created_at: string
          deleted_at: string | null
          discovery_enabled_at: string | null
          first_video_approved_at: string | null
          first_video_uploaded_at: string | null
          identity_verified_at: string | null
          onboarding_state: Database["public"]["Enums"]["onboarding_state"]
          profile_completed_at: string | null
          suspended_at: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "account_status"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_enter_discovery: {
        Args: { target_user_id?: string }
        Returns: boolean
      }
      complete_local_dev_identity_verification: {
        Args: never
        Returns: {
          account_state: Database["public"]["Enums"]["account_state"]
          age_eligible: boolean
          age_verified_at: string | null
          banned_at: string | null
          created_at: string
          deleted_at: string | null
          discovery_enabled_at: string | null
          first_video_approved_at: string | null
          first_video_uploaded_at: string | null
          identity_verified_at: string | null
          onboarding_state: Database["public"]["Enums"]["onboarding_state"]
          profile_completed_at: string | null
          suspended_at: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "account_status"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_profile: {
        Args: {
          p_bio?: string
          p_birth_date?: string
          p_display_name: string
          p_gender?: string
        }
        Returns: {
          account_state: Database["public"]["Enums"]["account_state"]
          age_eligible: boolean
          age_verified_at: string | null
          banned_at: string | null
          created_at: string
          deleted_at: string | null
          discovery_enabled_at: string | null
          first_video_approved_at: string | null
          first_video_uploaded_at: string | null
          identity_verified_at: string | null
          onboarding_state: Database["public"]["Enums"]["onboarding_state"]
          profile_completed_at: string | null
          suspended_at: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "account_status"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_eligibility: {
        Args: never
        Returns: {
          account_state: Database["public"]["Enums"]["account_state"]
          account_user_id: string
          age_eligible: boolean
          can_enter_discovery: boolean
          first_video_approved: boolean
          first_video_uploaded: boolean
          has_accepted_terms: boolean
          identity_verified: boolean
          latest_video_id: string
          latest_video_rejection_reason: string
          latest_video_status: Database["public"]["Enums"]["moderation_status"]
          next_step: Database["public"]["Enums"]["onboarding_state"]
          onboarding_state: Database["public"]["Enums"]["onboarding_state"]
          profile_complete: boolean
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      account_state: "active" | "suspended" | "banned" | "deleted"
      device_platform: "ios" | "android" | "web"
      identity_provider: "portone"
      moderation_case_status: "open" | "in_review" | "resolved" | "dismissed"
      moderation_source_type: "report" | "profile_video" | "user"
      moderation_status: "pending" | "approved" | "rejected" | "removed"
      onboarding_state:
        | "terms"
        | "phone"
        | "identity_verification"
        | "profile"
        | "first_video"
        | "video_review"
        | "complete"
      push_provider: "expo" | "apns" | "fcm"
      report_reason:
        | "underage"
        | "harassment"
        | "hate_or_abuse"
        | "sexual_content"
        | "violence"
        | "spam_or_scam"
        | "impersonation"
        | "illegal_activity"
        | "other"
      report_status: "open" | "in_review" | "resolved" | "dismissed"
      verification_status:
        | "pending"
        | "verified"
        | "failed"
        | "expired"
        | "canceled"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_state: ["active", "suspended", "banned", "deleted"],
      device_platform: ["ios", "android", "web"],
      identity_provider: ["portone"],
      moderation_case_status: ["open", "in_review", "resolved", "dismissed"],
      moderation_source_type: ["report", "profile_video", "user"],
      moderation_status: ["pending", "approved", "rejected", "removed"],
      onboarding_state: [
        "terms",
        "phone",
        "identity_verification",
        "profile",
        "first_video",
        "video_review",
        "complete",
      ],
      push_provider: ["expo", "apns", "fcm"],
      report_reason: [
        "underage",
        "harassment",
        "hate_or_abuse",
        "sexual_content",
        "violence",
        "spam_or_scam",
        "impersonation",
        "illegal_activity",
        "other",
      ],
      report_status: ["open", "in_review", "resolved", "dismissed"],
      verification_status: [
        "pending",
        "verified",
        "failed",
        "expired",
        "canceled",
      ],
    },
  },
} as const


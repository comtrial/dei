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
      audit: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          detail: Json | null
          id: string
          target: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          target?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          target?: string | null
        }
        Relationships: []
      }
      auth_verification: {
        Row: {
          ci_hash: string | null
          created_at: string
          di_hash: string | null
          failed_at: string | null
          failure_code: string | null
          failure_count: number
          failure_message: string | null
          id: string
          identity_verification_tx_id: string | null
          lock_until: string | null
          provider: string
          provider_metadata: Json
          provider_verification_id: string | null
          status: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          ci_hash?: string | null
          created_at?: string
          di_hash?: string | null
          failed_at?: string | null
          failure_code?: string | null
          failure_count?: number
          failure_message?: string | null
          id?: string
          identity_verification_tx_id?: string | null
          lock_until?: string | null
          provider?: string
          provider_metadata?: Json
          provider_verification_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          ci_hash?: string | null
          created_at?: string
          di_hash?: string | null
          failed_at?: string | null
          failure_code?: string | null
          failure_count?: number
          failure_message?: string | null
          id?: string
          identity_verification_tx_id?: string | null
          lock_until?: string | null
          provider?: string
          provider_metadata?: Json
          provider_verification_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      block: {
        Row: {
          blocked_user_id: string
          blocker_user_id: string
          created_at: string
          id: string
          room_id: string | null
          unblocked_at: string | null
        }
        Insert: {
          blocked_user_id: string
          blocker_user_id: string
          created_at?: string
          id?: string
          room_id?: string | null
          unblocked_at?: string | null
        }
        Update: {
          blocked_user_id?: string
          blocker_user_id?: string
          created_at?: string
          id?: string
          room_id?: string | null
          unblocked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "block_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room"
            referencedColumns: ["id"]
          },
        ]
      }
      group_match: {
        Row: {
          id: string
          matched_at: string
          room_id: string | null
          status: string
          team_a_id: string
          team_b_id: string
        }
        Insert: {
          id?: string
          matched_at?: string
          room_id?: string | null
          status?: string
          team_a_id: string
          team_b_id: string
        }
        Update: {
          id?: string
          matched_at?: string
          room_id?: string | null
          status?: string
          team_a_id?: string
          team_b_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_match_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_match_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_match_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      match_member: {
        Row: {
          match_id: string
          side: string
          user_id: string
        }
        Insert: {
          match_id: string
          side: string
          user_id: string
        }
        Update: {
          match_id?: string
          side?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_member_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "group_match"
            referencedColumns: ["id"]
          },
        ]
      }
      match_queue: {
        Row: {
          desired_size: number
          enqueued_at: string
          expires_at: string | null
          gender: string | null
          id: string
          matched_at: string | null
          region: string | null
          status: string
          team_id: string
        }
        Insert: {
          desired_size?: number
          enqueued_at?: string
          expires_at?: string | null
          gender?: string | null
          id?: string
          matched_at?: string | null
          region?: string | null
          status?: string
          team_id: string
        }
        Update: {
          desired_size?: number
          enqueued_at?: string
          expires_at?: string | null
          gender?: string | null
          id?: string
          matched_at?: string | null
          region?: string | null
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_queue_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      message: {
        Row: {
          body: string
          client_msg_id: string | null
          created_at: string
          id: string
          room_id: string
          status: string
          user_id: string
          whisper_to_user_id: string | null
        }
        Insert: {
          body: string
          client_msg_id?: string | null
          created_at?: string
          id?: string
          room_id: string
          status?: string
          user_id: string
          whisper_to_user_id?: string | null
        }
        Update: {
          body?: string
          client_msg_id?: string | null
          created_at?: string
          id?: string
          room_id?: string
          status?: string
          user_id?: string
          whisper_to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room"
            referencedColumns: ["id"]
          },
        ]
      }
      message_mention: {
        Row: {
          message_id: string
          user_id: string
        }
        Insert: {
          message_id: string
          user_id: string
        }
        Update: {
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_mention_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "message"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_setting: {
        Row: {
          chat_mention: boolean
          match_alert: boolean
          push_enabled: boolean
          updated_at: string
          upload_reminder: boolean
          user_id: string
        }
        Insert: {
          chat_mention?: boolean
          match_alert?: boolean
          push_enabled?: boolean
          updated_at?: string
          upload_reminder?: boolean
          user_id: string
        }
        Update: {
          chat_mention?: boolean
          match_alert?: boolean
          push_enabled?: boolean
          updated_at?: string
          upload_reminder?: boolean
          user_id?: string
        }
        Relationships: []
      }
      pass: {
        Row: {
          created_at: string
          granted: number
          id: string
          kind: string
          remaining: number
          source: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted?: number
          id?: string
          kind?: string
          remaining?: number
          source?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted?: number
          id?: string
          kind?: string
          remaining?: number
          source?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      payment: {
        Row: {
          amount: number | null
          created_at: string
          id: string
          product_id: string | null
          provider: string
          status: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: string
          product_id?: string | null
          provider?: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: string
          product_id?: string | null
          provider?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      profile: {
        Row: {
          bio: string | null
          birth_year: number | null
          created_at: string
          gender: string | null
          is_adult: boolean
          is_in_active_room: boolean
          last_room_leave_at: string | null
          mbti: string | null
          nickname: string | null
          nickname_changed_at: string | null
          nickname_lower: string | null
          onboarding_completed_at: string | null
          photo_url: string | null
          quiet_hours_end: number
          quiet_hours_start: number
          region: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          birth_year?: number | null
          created_at?: string
          gender?: string | null
          is_adult?: boolean
          is_in_active_room?: boolean
          last_room_leave_at?: string | null
          mbti?: string | null
          nickname?: string | null
          nickname_changed_at?: string | null
          nickname_lower?: string | null
          onboarding_completed_at?: string | null
          photo_url?: string | null
          quiet_hours_end?: number
          quiet_hours_start?: number
          region?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          birth_year?: number | null
          created_at?: string
          gender?: string | null
          is_adult?: boolean
          is_in_active_room?: boolean
          last_room_leave_at?: string | null
          mbti?: string | null
          nickname?: string | null
          nickname_changed_at?: string | null
          nickname_lower?: string | null
          onboarding_completed_at?: string | null
          photo_url?: string | null
          quiet_hours_end?: number
          quiet_hours_start?: number
          region?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_token: {
        Row: {
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      refund_ticket: {
        Row: {
          created_at: string
          id: string
          payment_id: string | null
          reason: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payment_id?: string | null
          reason?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payment_id?: string | null
          reason?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_ticket_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment"
            referencedColumns: ["id"]
          },
        ]
      }
      report: {
        Row: {
          category: string
          created_at: string
          detail: string | null
          id: string
          reported_user_id: string
          reporter_user_id: string
          room_id: string | null
          status: string
        }
        Insert: {
          category: string
          created_at?: string
          detail?: string | null
          id?: string
          reported_user_id: string
          reporter_user_id: string
          room_id?: string | null
          status?: string
        }
        Update: {
          category?: string
          created_at?: string
          detail?: string | null
          id?: string
          reported_user_id?: string
          reporter_user_id?: string
          room_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room"
            referencedColumns: ["id"]
          },
        ]
      }
      room: {
        Row: {
          active_member_count: number
          created_at: string
          ended_at: string | null
          ended_reason: string | null
          expires_at: string
          id: string
          member_count: number
          status: string
        }
        Insert: {
          active_member_count?: number
          created_at?: string
          ended_at?: string | null
          ended_reason?: string | null
          expires_at?: string
          id?: string
          member_count?: number
          status?: string
        }
        Update: {
          active_member_count?: number
          created_at?: string
          ended_at?: string | null
          ended_reason?: string | null
          expires_at?: string
          id?: string
          member_count?: number
          status?: string
        }
        Relationships: []
      }
      room_lifecycle: {
        Row: {
          actor_user_id: string | null
          created_at: string
          detail: Json | null
          event: string
          id: string
          room_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          detail?: Json | null
          event: string
          id?: string
          room_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          detail?: Json | null
          event?: string
          id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_lifecycle_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room"
            referencedColumns: ["id"]
          },
        ]
      }
      room_member: {
        Row: {
          joined_at: string
          left_at: string | null
          role: string
          room_id: string
          status: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          left_at?: string | null
          role?: string
          room_id: string
          status?: string
          user_id: string
        }
        Update: {
          joined_at?: string
          left_at?: string | null
          role?: string
          room_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_member_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket: {
        Row: {
          category: string
          created_at: string
          id: string
          message: string
          reply_email: string | null
          status: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          message: string
          reply_email?: string | null
          status?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          message?: string
          reply_email?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      team: {
        Row: {
          created_at: string
          disbanded_at: string | null
          gender: string | null
          id: string
          name: string | null
          owner_user_id: string
          status: string
          target_size: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          disbanded_at?: string | null
          gender?: string | null
          id?: string
          name?: string | null
          owner_user_id: string
          status?: string
          target_size?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          disbanded_at?: string | null
          gender?: string | null
          id?: string
          name?: string | null
          owner_user_id?: string
          status?: string
          target_size?: number
          updated_at?: string
        }
        Relationships: []
      }
      team_invite: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          invitee_user_id: string | null
          inviter_user_id: string
          status: string
          team_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          invitee_user_id?: string | null
          inviter_user_id: string
          status?: string
          team_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          invitee_user_id?: string | null
          inviter_user_id?: string
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invite_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      team_member: {
        Row: {
          joined_at: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_member_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      terms_agreement: {
        Row: {
          agreed_at: string
          created_at: string
          id: string
          location_collection: boolean
          marketing_opt_in: boolean
          privacy_policy: boolean
          service_terms: boolean
          terms_version: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agreed_at?: string
          created_at?: string
          id?: string
          location_collection?: boolean
          marketing_opt_in?: boolean
          privacy_policy?: boolean
          service_terms?: boolean
          terms_version: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agreed_at?: string
          created_at?: string
          id?: string
          location_collection?: boolean
          marketing_opt_in?: boolean
          privacy_policy?: boolean
          service_terms?: boolean
          terms_version?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      video: {
        Row: {
          created_at: string
          duration_ms: number | null
          hour_slot: number | null
          id: string
          muted: boolean
          room_id: string
          status: string
          storage_path: string | null
          thumbnail_path: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          hour_slot?: number | null
          id?: string
          muted?: boolean
          room_id: string
          status?: string
          storage_path?: string | null
          thumbnail_path?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          hour_slot?: number | null
          id?: string
          muted?: boolean
          room_id?: string
          status?: string
          storage_path?: string | null
          thumbnail_path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_room_videos: {
        Args: { p_hour_from: number; p_hour_to: number; p_room_id: string }
        Returns: {
          created_at: string
          duration_ms: number | null
          hour_slot: number | null
          id: string
          muted: boolean
          room_id: string
          status: string
          storage_path: string | null
          thumbnail_path: string | null
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "video"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_admin: { Args: never; Returns: boolean }
      is_blocked_between: { Args: { a: string; b: string }; Returns: boolean }
      room_is_member: {
        Args: { p_room_id: string; p_user_id: string }
        Returns: boolean
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const


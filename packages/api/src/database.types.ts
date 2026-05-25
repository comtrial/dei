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
      admins: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          id: string
          is_active: boolean
          last_login_at: string | null
          name: string | null
          role: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          name?: string | null
          role?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          name?: string | null
          role?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          meta: Json | null
          operator_email: string | null
          operator_id: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          meta?: Json | null
          operator_email?: string | null
          operator_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          meta?: Json | null
          operator_email?: string | null
          operator_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
        ]
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
      booster_grants: {
        Row: {
          consumed_at: string | null
          consumed_for_room_id: string | null
          granted_at: string
          id: string
          product_id: string
          profile_id: string
          revenuecat_transaction_id: string | null
          source: string
        }
        Insert: {
          consumed_at?: string | null
          consumed_for_room_id?: string | null
          granted_at?: string
          id?: string
          product_id: string
          profile_id: string
          revenuecat_transaction_id?: string | null
          source: string
        }
        Update: {
          consumed_at?: string | null
          consumed_for_room_id?: string | null
          granted_at?: string
          id?: string
          product_id?: string
          profile_id?: string
          revenuecat_transaction_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "booster_grants_consumed_for_room_id_fkey"
            columns: ["consumed_for_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booster_grants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      chat_mentions: {
        Row: {
          mentioned_profile_id: string
          message_id: string
        }
        Insert: {
          mentioned_profile_id: string
          message_id: string
        }
        Update: {
          mentioned_profile_id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_mentions_mentioned_profile_id_fkey"
            columns: ["mentioned_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chat_mentions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          room_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          room_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chat_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          created_at: string
          id: string
          log_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          log_date: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          log_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feature_flag_rules: {
        Row: {
          conditions: Json
          created_at: string
          enabled: boolean
          flag_key: string
          id: string
          priority: number
          result_value: Json
        }
        Insert: {
          conditions?: Json
          created_at?: string
          enabled?: boolean
          flag_key: string
          id?: string
          priority?: number
          result_value: Json
        }
        Update: {
          conditions?: Json
          created_at?: string
          enabled?: boolean
          flag_key?: string
          id?: string
          priority?: number
          result_value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_rules_flag_key_fkey"
            columns: ["flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          default_value: Json
          description: string | null
          enabled: boolean
          key: string
          rollout_percentage: number
          rollout_variants: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_value?: Json
          description?: string | null
          enabled?: boolean
          key: string
          rollout_percentage?: number
          rollout_variants?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_value?: Json
          description?: string | null
          enabled?: boolean
          key?: string
          rollout_percentage?: number
          rollout_variants?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          invited_at: string
          profile_id: string
          role: string
        }
        Insert: {
          group_id: string
          invited_at?: string
          profile_id: string
          role?: string
        }
        Update: {
          group_id?: string
          invited_at?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          disbanded_at: string | null
          id: string
          leader_id: string
          matched_room_id: string | null
          size: number
          status: string
        }
        Insert: {
          created_at?: string
          disbanded_at?: string | null
          id?: string
          leader_id: string
          matched_room_id?: string | null
          size: number
          status?: string
        }
        Update: {
          created_at?: string
          disbanded_at?: string | null
          id?: string
          leader_id?: string
          matched_room_id?: string | null
          size?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "groups_matched_room_id_fkey"
            columns: ["matched_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      hourly_uploads: {
        Row: {
          archived_at: string | null
          duration_ms: number
          expires_at: string
          hour_slot: number
          id: string
          profile_id: string
          room_id: string
          slot_date: string
          storage_path: string
          thumbnail_path: string | null
          uploaded_at: string
        }
        Insert: {
          archived_at?: string | null
          duration_ms: number
          expires_at?: string
          hour_slot: number
          id?: string
          profile_id: string
          room_id: string
          slot_date: string
          storage_path: string
          thumbnail_path?: string | null
          uploaded_at?: string
        }
        Update: {
          archived_at?: string | null
          duration_ms?: number
          expires_at?: string
          hour_slot?: number
          id?: string
          profile_id?: string
          room_id?: string
          slot_date?: string
          storage_path?: string
          thumbnail_path?: string | null
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hourly_uploads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hourly_uploads_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_verifications: {
        Row: {
          adult_verified: boolean | null
          birth_year: number | null
          ci_hash: string | null
          created_at: string
          di_hash: string | null
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
          ci_hash?: string | null
          created_at?: string
          di_hash?: string | null
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
          ci_hash?: string | null
          created_at?: string
          di_hash?: string | null
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
      logs: {
        Row: {
          comment: string | null
          created_at: string
          duration_sec: number
          hour_slot: number
          id: string
          recorded_at: string
          thumbnail_path: string | null
          thumbnail_urls: string[]
          user_id: string
          video_url: string
          검수_YN: string
          검수_상태: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          duration_sec: number
          hour_slot: number
          id?: string
          recorded_at: string
          thumbnail_path?: string | null
          thumbnail_urls?: string[]
          user_id: string
          video_url: string
          검수_YN?: string
          검수_상태?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          duration_sec?: number
          hour_slot?: number
          id?: string
          recorded_at?: string
          thumbnail_path?: string | null
          thumbnail_urls?: string[]
          user_id?: string
          video_url?: string
          검수_YN?: string
          검수_상태?: string
        }
        Relationships: []
      }
      match_queue: {
        Row: {
          age_range_max: number | null
          age_range_min: number | null
          consumed_at: string | null
          desired_opponent_gender: string
          enqueued_at: string
          group_id: string
          id: string
          submitter_gender: string
        }
        Insert: {
          age_range_max?: number | null
          age_range_min?: number | null
          consumed_at?: string | null
          desired_opponent_gender: string
          enqueued_at?: string
          group_id: string
          id?: string
          submitter_gender: string
        }
        Update: {
          age_range_max?: number | null
          age_range_min?: number | null
          consumed_at?: string | null
          desired_opponent_gender?: string
          enqueued_at?: string
          group_id?: string
          id?: string
          submitter_gender?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_queue_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
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
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          metadata: Json
          read_at: string | null
          route: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          metadata?: Json
          read_at?: string | null
          route?: string | null
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          metadata?: Json
          read_at?: string | null
          route?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          environment: string | null
          external_tx_id: string | null
          failed_at: string | null
          id: string
          offering_id: string | null
          package_id: string | null
          payment_method: string | null
          product_id: string | null
          product_type: string
          provider: string
          purchased_at: string | null
          raw_payload: Json
          refunded_at: string | null
          revenuecat_app_user_id: string | null
          revenuecat_event_id: string | null
          revenuecat_original_app_user_id: string | null
          revenuecat_transaction_id: string | null
          store: string | null
          updated_at: string
          user_id: string
          결제상태: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          environment?: string | null
          external_tx_id?: string | null
          failed_at?: string | null
          id?: string
          offering_id?: string | null
          package_id?: string | null
          payment_method?: string | null
          product_id?: string | null
          product_type?: string
          provider?: string
          purchased_at?: string | null
          raw_payload?: Json
          refunded_at?: string | null
          revenuecat_app_user_id?: string | null
          revenuecat_event_id?: string | null
          revenuecat_original_app_user_id?: string | null
          revenuecat_transaction_id?: string | null
          store?: string | null
          updated_at?: string
          user_id: string
          결제상태?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          environment?: string | null
          external_tx_id?: string | null
          failed_at?: string | null
          id?: string
          offering_id?: string | null
          package_id?: string | null
          payment_method?: string | null
          product_id?: string | null
          product_type?: string
          provider?: string
          purchased_at?: string | null
          raw_payload?: Json
          refunded_at?: string | null
          revenuecat_app_user_id?: string | null
          revenuecat_event_id?: string | null
          revenuecat_original_app_user_id?: string | null
          revenuecat_transaction_id?: string | null
          store?: string | null
          updated_at?: string
          user_id?: string
          결제상태?: string
        }
        Relationships: []
      }
      private_profiles: {
        Row: {
          birth_date: string | null
          ci_hash: string | null
          created_at: string
          di_hash: string | null
          phone_country_code: string | null
          phone_hash: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          birth_date?: string | null
          ci_hash?: string | null
          created_at?: string
          di_hash?: string | null
          phone_country_code?: string | null
          phone_hash?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          birth_date?: string | null
          ci_hash?: string | null
          created_at?: string
          di_hash?: string | null
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
          thumbnail_path: string | null
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
          thumbnail_path?: string | null
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
          thumbnail_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          birth_date: string | null
          blocked_until: string | null
          created_at: string
          gender: string | null
          interest_categories: string[]
          interest_tags: string[]
          intro: string | null
          is_in_active_room: boolean
          last_room_leave_at: string | null
          mbti: string | null
          nickname: string | null
          nickname_lower: string | null
          phone: string | null
          photo_url: string | null
          quiet_hours_end: number
          quiet_hours_start: number
          region_sido: string | null
          region_sigungu: string | null
          suspend_reason: string | null
          updated_at: string
          user_id: string
          사진_검수_YN: string
          차단_YN: string
          회원상태: string
        }
        Insert: {
          birth_date?: string | null
          blocked_until?: string | null
          created_at?: string
          gender?: string | null
          interest_categories?: string[]
          interest_tags?: string[]
          intro?: string | null
          is_in_active_room?: boolean
          last_room_leave_at?: string | null
          mbti?: string | null
          nickname?: string | null
          nickname_lower?: string | null
          phone?: string | null
          photo_url?: string | null
          quiet_hours_end?: number
          quiet_hours_start?: number
          region_sido?: string | null
          region_sigungu?: string | null
          suspend_reason?: string | null
          updated_at?: string
          user_id: string
          사진_검수_YN?: string
          차단_YN?: string
          회원상태?: string
        }
        Update: {
          birth_date?: string | null
          blocked_until?: string | null
          created_at?: string
          gender?: string | null
          interest_categories?: string[]
          interest_tags?: string[]
          intro?: string | null
          is_in_active_room?: boolean
          last_room_leave_at?: string | null
          mbti?: string | null
          nickname?: string | null
          nickname_lower?: string | null
          phone?: string | null
          photo_url?: string | null
          quiet_hours_end?: number
          quiet_hours_start?: number
          region_sido?: string | null
          region_sigungu?: string | null
          suspend_reason?: string | null
          updated_at?: string
          user_id?: string
          사진_검수_YN?: string
          차단_YN?: string
          회원상태?: string
        }
        Relationships: []
      }
      refresh_item_grants: {
        Row: {
          consumed_at: string | null
          created_at: string
          granted_at: string
          granted_count: number
          id: string
          payment_id: string
          product_id: string
          remaining_count: number
          revoke_reason: string | null
          revoked_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          granted_at?: string
          granted_count?: number
          id?: string
          payment_id: string
          product_id: string
          remaining_count?: number
          revoke_reason?: string | null
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          granted_at?: string
          granted_count?: number
          id?: string
          payment_id?: string
          product_id?: string
          remaining_count?: number
          revoke_reason?: string | null
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refresh_item_grants_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      refresh_redemptions: {
        Row: {
          candidate_user_ids: string[]
          created_at: string
          failure_reason: string | null
          grant_id: string | null
          id: string
          pool_date: string
          seen_user_ids: string[]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          candidate_user_ids?: string[]
          created_at?: string
          failure_reason?: string | null
          grant_id?: string | null
          id?: string
          pool_date?: string
          seen_user_ids?: string[]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          candidate_user_ids?: string[]
          created_at?: string
          failure_reason?: string | null
          grant_id?: string | null
          id?: string
          pool_date?: string
          seen_user_ids?: string[]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refresh_redemptions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "refresh_item_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          id: string
          reason_code: string
          reason_detail: string | null
          reported_id: string
          reporter_id: string
          resolution_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          room_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason_code: string
          reason_detail?: string | null
          reported_id: string
          reporter_id: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          reason_code?: string
          reason_detail?: string | null
          reported_id?: string
          reporter_id?: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reports_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      revenuecat_webhook_events: {
        Row: {
          aliases: string[]
          app_user_id: string | null
          created_at: string
          environment: string | null
          event_type: string
          id: string
          original_app_user_id: string | null
          payload: Json
          processed_at: string | null
          product_id: string | null
          transaction_id: string | null
        }
        Insert: {
          aliases?: string[]
          app_user_id?: string | null
          created_at?: string
          environment?: string | null
          event_type: string
          id: string
          original_app_user_id?: string | null
          payload: Json
          processed_at?: string | null
          product_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          aliases?: string[]
          app_user_id?: string | null
          created_at?: string
          environment?: string | null
          event_type?: string
          id?: string
          original_app_user_id?: string | null
          payload?: Json
          processed_at?: string | null
          product_id?: string | null
          transaction_id?: string | null
        }
        Relationships: []
      }
      review_history: {
        Row: {
          action: string
          created_at: string
          id: string
          log_id: string | null
          operator_email: string | null
          operator_id: string | null
          reason: string | null
          target_type: string
          target_user: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          log_id?: string | null
          operator_email?: string | null
          operator_id?: string | null
          reason?: string | null
          target_type: string
          target_user?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          log_id?: string | null
          operator_email?: string | null
          operator_id?: string | null
          reason?: string | null
          target_type?: string
          target_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_history_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "logs"
            referencedColumns: ["id"]
          },
        ]
      }
      room_auto_kicks: {
        Row: {
          blocks_count: number
          id: string
          kicked_profile_id: string
          room_id: string
          total_members: number
          triggered_at: string
        }
        Insert: {
          blocks_count: number
          id?: string
          kicked_profile_id: string
          room_id: string
          total_members: number
          triggered_at?: string
        }
        Update: {
          blocks_count?: number
          id?: string
          kicked_profile_id?: string
          room_id?: string
          total_members?: number
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_auto_kicks_kicked_profile_id_fkey"
            columns: ["kicked_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "room_auto_kicks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_leave_cooldowns: {
        Row: {
          cooldown_until: string
          created_at: string
          profile_id: string
          source_room_id: string | null
        }
        Insert: {
          cooldown_until: string
          created_at?: string
          profile_id: string
          source_room_id?: string | null
        }
        Update: {
          cooldown_until?: string
          created_at?: string
          profile_id?: string
          source_room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_leave_cooldowns_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "room_leave_cooldowns_source_room_id_fkey"
            columns: ["source_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_members: {
        Row: {
          group_id: string | null
          joined_at: string
          left_at: string | null
          profile_id: string
          room_id: string
          status: string
        }
        Insert: {
          group_id?: string | null
          joined_at?: string
          left_at?: string | null
          profile_id: string
          room_id: string
          status?: string
        }
        Update: {
          group_id?: string | null
          joined_at?: string
          left_at?: string | null
          profile_id?: string
          room_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
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
      sms_log: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          phone: string
          result: string
          send_count: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          phone: string
          result?: string
          send_count?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          phone?: string
          result?: string
          send_count?: number
          user_id?: string | null
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
      v_block_pairs: {
        Row: {
          a: string | null
          b: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _flag_attr_value: {
        Args: {
          p_attr: Database["public"]["Enums"]["flag_attribute"]
          p_user: string
        }
        Returns: Json
      }
      _flag_cond_match: {
        Args: {
          p_actual: Json
          p_expected: Json
          p_op: Database["public"]["Enums"]["flag_operator"]
        }
        Returns: boolean
      }
      _video_review_notify_config: { Args: never; Returns: Json }
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
      admin_create_room: { Args: { p_group_ids: string[] }; Returns: string }
      block_profile_user: {
        Args: { p_blocked_user_id: string; p_reason?: string }
        Returns: string
      }
      block_user: {
        Args: {
          p_blocked_id: string
          p_reason?: string
          p_source_room_id?: string
        }
        Returns: undefined
      }
      can_enter_discovery: {
        Args: { target_user_id?: string }
        Returns: boolean
      }
      complete_local_dev_consumable_purchase: {
        Args: { p_product_id?: string }
        Returns: {
          consumed_at: string | null
          created_at: string
          granted_at: string
          granted_count: number
          id: string
          payment_id: string
          product_id: string
          remaining_count: number
          revoke_reason: string | null
          revoked_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "refresh_item_grants"
          isOneToOne: true
          isSetofReturn: false
        }
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
      complete_log_intro: {
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
          p_interest_categories?: string[]
          p_interest_tags?: string[]
          p_mbti?: string
          p_profile_image_path?: string
          p_region_sido?: string
          p_region_sigungu?: string
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
      consume_booster_grant: { Args: never; Returns: string }
      consume_refresh_item: {
        Args: { p_seen_user_ids?: string[] }
        Returns: {
          display_name: string
          gender: string
          log_id: string
          pool_id: string
          redemption_id: string
          thumbnail_path: string
          user_id: string
          video_path: string
          video_url: string
        }[]
      }
      create_group: { Args: { p_nicknames: string[] }; Returns: string }
      create_notification: {
        Args: {
          p_body?: string
          p_dedupe_key?: string
          p_metadata?: Json
          p_route?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      create_profile_report: {
        Args: {
          p_description?: string
          p_log_id?: string
          p_reason?: string
          p_reason_category?: string
          p_reported_id: string
        }
        Returns: string
      }
      delete_own_log_and_recalculate: {
        Args: { p_log_id: string }
        Returns: {
          log_date: string
          remaining_count: number
          status: string
        }[]
      }
      disband_group: { Args: { p_group_id: string }; Returns: undefined }
      enqueue_group_for_match: { Args: { p_group_id: string }; Returns: string }
      evaluate_my_flags: { Args: never; Returns: Json }
      get_available_heart_count: {
        Args: { p_user_id?: string }
        Returns: number
      }
      get_available_refresh_item_count: {
        Args: { p_user_id?: string }
        Returns: number
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
      get_public_profile: {
        Args: { p_profile_user_id: string }
        Returns: {
          created_at: string
          gender: string
          interest_categories: string[]
          interest_tags: string[]
          intro: string
          mbti: string
          nickname: string
          photo_url: string
          profile_user_id: string
          region_sido: string
          region_sigungu: string
        }[]
      }
      get_public_profile_logs: {
        Args: { p_profile_user_id: string }
        Returns: {
          created_at: string
          duration_sec: number
          hour_slot: number
          id: string
          recorded_at: string
          thumbnail_path: string
          user_id: string
          video_url: string
        }[]
      }
      grant_free_booster_for_female: { Args: never; Returns: string }
      grant_refresh_item: {
        Args: {
          p_granted_count?: number
          p_payment_id: string
          p_product_id: string
          p_user_id: string
        }
        Returns: {
          consumed_at: string | null
          created_at: string
          granted_at: string
          granted_count: number
          id: string
          payment_id: string
          product_id: string
          remaining_count: number
          revoke_reason: string | null
          revoked_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "refresh_item_grants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_admin: { Args: never; Returns: boolean }
      is_heart_product: { Args: { p_product_id: string }; Returns: boolean }
      is_public_profile_visible: {
        Args: { p_profile_user_id: string; p_viewer_user_id: string }
        Returns: boolean
      }
      is_refresh_item_product: {
        Args: { p_product_id: string }
        Returns: boolean
      }
      leave_room: { Args: { p_room_id: string }; Returns: undefined }
      recalculate_daily_log: { Args: { p_user_id: string }; Returns: undefined }
      recalculate_daily_log_for_date: {
        Args: { p_log_date: string; p_user_id: string }
        Returns: {
          created_at: string
          id: string
          log_date: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "daily_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_refresh_redemption: {
        Args: {
          p_candidate_user_ids?: string[]
          p_failure_reason?: string
          p_grant_id?: string
          p_seen_user_ids?: string[]
          p_status?: string
          p_user_id: string
        }
        Returns: {
          candidate_user_ids: string[]
          created_at: string
          failure_reason: string | null
          grant_id: string | null
          id: string
          pool_date: string
          seen_user_ids: string[]
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "refresh_redemptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_user_push_token: {
        Args: {
          p_app_version?: string
          p_device_label?: string
          p_installation_id_hash: string
          p_platform: Database["public"]["Enums"]["device_platform"]
          p_push_provider?: Database["public"]["Enums"]["push_provider"]
          p_push_token: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "user_devices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_user: {
        Args: {
          p_reason_code: string
          p_reason_detail?: string
          p_reported_id: string
          p_room_id?: string
        }
        Returns: string
      }
      revoke_refresh_item_grant_for_payment: {
        Args: { p_payment_id: string; p_revoke_reason?: string }
        Returns: {
          consumed_at: string | null
          created_at: string
          granted_at: string
          granted_count: number
          id: string
          payment_id: string
          product_id: string
          remaining_count: number
          revoke_reason: string | null
          revoked_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "refresh_item_grants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_chat_message: {
        Args: { p_body: string; p_room_id: string }
        Returns: string
      }
      transfer_existing_member_account: {
        Args: { p_from_user_id: string; p_to_user_id: string }
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
      upload_hourly_video: {
        Args: {
          p_duration_ms: number
          p_hour_slot: number
          p_room_id: string
          p_slot_date: string
          p_storage_path: string
          p_thumbnail_path: string
        }
        Returns: string
      }
    }
    Enums: {
      account_state: "active" | "suspended" | "banned" | "deleted"
      device_platform: "ios" | "android" | "web"
      flag_attribute:
        | "days_since_signup"
        | "days_since_first_video"
        | "days_since_first_video_approved"
        | "identity_verified"
        | "profile_complete"
        | "first_video_approved"
        | "likes_sent_count"
        | "likes_received_count"
        | "match_count"
        | "has_successful_payment"
        | "gender"
        | "region_sido"
        | "account_state"
      flag_operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in"
      identity_provider: "portone"
      moderation_case_status: "open" | "in_review" | "resolved" | "dismissed"
      moderation_source_type: "report" | "profile_video" | "user"
      moderation_status: "pending" | "approved" | "rejected" | "removed"
      onboarding_state:
        | "terms"
        | "phone"
        | "identity_verification"
        | "profile"
        | "log_intro"
        | "first_video"
        | "video_review"
        | "complete"
      push_provider: "expo" | "apns" | "fcm"
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
      flag_attribute: [
        "days_since_signup",
        "days_since_first_video",
        "days_since_first_video_approved",
        "identity_verified",
        "profile_complete",
        "first_video_approved",
        "likes_sent_count",
        "likes_received_count",
        "match_count",
        "has_successful_payment",
        "gender",
        "region_sido",
        "account_state",
      ],
      flag_operator: ["eq", "neq", "gt", "gte", "lt", "lte", "in"],
      identity_provider: ["portone"],
      moderation_case_status: ["open", "in_review", "resolved", "dismissed"],
      moderation_source_type: ["report", "profile_video", "user"],
      moderation_status: ["pending", "approved", "rejected", "removed"],
      onboarding_state: [
        "terms",
        "phone",
        "identity_verification",
        "profile",
        "log_intro",
        "first_video",
        "video_review",
        "complete",
      ],
      push_provider: ["expo", "apns", "fcm"],
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


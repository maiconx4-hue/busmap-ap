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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          code: string
          description: string
          icon: string
          name: string
        }
        Insert: {
          code: string
          description: string
          icon?: string
          name: string
        }
        Update: {
          code?: string
          description?: string
          icon?: string
          name?: string
        }
        Relationships: []
      }
      bus_groups: {
        Row: {
          accuracy_m: number
          active_contributors: number
          confidence: string
          created_at: string
          divergence_m: number
          id: string
          last_update: string
          lat: number
          lng: number
          route_id: string
          signal: string
          status: string
          top_level: string | null
        }
        Insert: {
          accuracy_m?: number
          active_contributors?: number
          confidence?: string
          created_at?: string
          divergence_m?: number
          id?: string
          last_update?: string
          lat: number
          lng: number
          route_id: string
          signal?: string
          status?: string
          top_level?: string | null
        }
        Update: {
          accuracy_m?: number
          active_contributors?: number
          confidence?: string
          created_at?: string
          divergence_m?: number
          id?: string
          last_update?: string
          lat?: number
          lng?: number
          route_id?: string
          signal?: string
          status?: string
          top_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bus_groups_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      contributions: {
        Row: {
          created_at: string
          duration_s: number
          id: string
          session_id: string | null
          user_id: string
          xp: number
        }
        Insert: {
          created_at?: string
          duration_s?: number
          id?: string
          session_id?: string | null
          user_id: string
          xp: number
        }
        Update: {
          created_at?: string
          duration_s?: number
          id?: string
          session_id?: string | null
          user_id?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "contributions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "location_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_updates: {
        Row: {
          accepted: boolean
          accuracy_m: number
          created_at: string
          id: number
          lat: number
          lng: number
          reject_reason: string | null
          session_id: string
          speed_kmh: number | null
        }
        Insert: {
          accepted: boolean
          accuracy_m: number
          created_at?: string
          id?: number
          lat: number
          lng: number
          reject_reason?: string | null
          session_id: string
          speed_kmh?: number | null
        }
        Update: {
          accepted?: boolean
          accuracy_m?: number
          created_at?: string
          id?: number
          lat?: number
          lng?: number
          reject_reason?: string | null
          session_id?: string
          speed_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gps_updates_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "location_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      group_motion: {
        Row: {
          estimate_until: string | null
          first_at: string
          first_progress_m: number
          geometry_hash: string
          group_id: string
          last_at: string
          last_progress_m: number
          observed_s: number
          sample_count: number
          speed_mps: number | null
          total_m: number
        }
        Insert: {
          estimate_until?: string | null
          first_at: string
          first_progress_m: number
          geometry_hash: string
          group_id: string
          last_at: string
          last_progress_m: number
          observed_s?: number
          sample_count?: number
          speed_mps?: number | null
          total_m: number
        }
        Update: {
          estimate_until?: string | null
          first_at?: string
          first_progress_m?: number
          geometry_hash?: string
          group_id?: string
          last_at?: string
          last_progress_m?: number
          observed_s?: number
          sample_count?: number
          speed_mps?: number | null
          total_m?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_motion_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "bus_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      location_sessions: {
        Row: {
          accepted_count: number
          distance_m: number
          end_reason: string | null
          ended_at: string | null
          first_accepted_at: string | null
          group_id: string | null
          id: string
          last_accepted_at: string | null
          last_accuracy: number | null
          last_lat: number | null
          last_lng: number | null
          last_update_at: string
          max_gap_s: number
          off_route_count: number
          rejected_count: number
          route_id: string
          speed_reject_count: number
          started_at: string
          status: Database["public"]["Enums"]["session_status"]
          update_count: number
          user_id: string | null
          validation: Database["public"]["Enums"]["validation_status"]
          validation_notes: string | null
          visitor_id: string
          xp_awarded: number
          xp_credited: boolean
        }
        Insert: {
          accepted_count?: number
          distance_m?: number
          end_reason?: string | null
          ended_at?: string | null
          first_accepted_at?: string | null
          group_id?: string | null
          id?: string
          last_accepted_at?: string | null
          last_accuracy?: number | null
          last_lat?: number | null
          last_lng?: number | null
          last_update_at?: string
          max_gap_s?: number
          off_route_count?: number
          rejected_count?: number
          route_id: string
          speed_reject_count?: number
          started_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          update_count?: number
          user_id?: string | null
          validation?: Database["public"]["Enums"]["validation_status"]
          validation_notes?: string | null
          visitor_id: string
          xp_awarded?: number
          xp_credited?: boolean
        }
        Update: {
          accepted_count?: number
          distance_m?: number
          end_reason?: string | null
          ended_at?: string | null
          first_accepted_at?: string | null
          group_id?: string | null
          id?: string
          last_accepted_at?: string | null
          last_accuracy?: number | null
          last_lat?: number | null
          last_lng?: number | null
          last_update_at?: string
          max_gap_s?: number
          off_route_count?: number
          rejected_count?: number
          route_id?: string
          speed_reject_count?: number
          started_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          update_count?: number
          user_id?: string | null
          validation?: Database["public"]["Enums"]["validation_status"]
          validation_notes?: string | null
          visitor_id?: string
          xp_awarded?: number
          xp_credited?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "location_sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "bus_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_sessions_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_sessions_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "visitors"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_log: {
        Row: {
          deleted_groups: number
          deleted_updates: number
          expired_sessions: number
          id: number
          ran_at: string
        }
        Insert: {
          deleted_groups?: number
          deleted_updates?: number
          expired_sessions?: number
          id?: number
          ran_at?: string
        }
        Update: {
          deleted_groups?: number
          deleted_updates?: number
          expired_sessions?: number
          id?: number
          ran_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          is_anonymous: boolean
          nickname: string | null
          xp: number
        }
        Insert: {
          created_at?: string
          id: string
          is_anonymous?: boolean
          nickname?: string | null
          xp?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_anonymous?: boolean
          nickname?: string | null
          xp?: number
        }
        Relationships: []
      }
      routes: {
        Row: {
          code: string
          color: string
          created_at: string
          creation_method: string
          description: string
          dest_label: string
          dest_lat: number | null
          dest_lng: number | null
          direction: string
          distance_m: number
          geometry: Json
          id: string
          name: string
          origin_label: string
          origin_lat: number | null
          origin_lng: number | null
          published_at: string | null
          status: Database["public"]["Enums"]["route_status"]
          updated_at: string
        }
        Insert: {
          code: string
          color?: string
          created_at?: string
          creation_method?: string
          description?: string
          dest_label?: string
          dest_lat?: number | null
          dest_lng?: number | null
          direction?: string
          distance_m?: number
          geometry?: Json
          id?: string
          name: string
          origin_label?: string
          origin_lat?: number | null
          origin_lng?: number | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["route_status"]
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string
          created_at?: string
          creation_method?: string
          description?: string
          dest_label?: string
          dest_lat?: number | null
          dest_lng?: number | null
          direction?: string
          distance_m?: number
          geometry?: Json
          id?: string
          name?: string
          origin_label?: string
          origin_lat?: number | null
          origin_lng?: number | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["route_status"]
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          description: string
          key: string
          updated_at: string
          value: number
        }
        Insert: {
          description?: string
          key: string
          updated_at?: string
          value: number
        }
        Update: {
          description?: string
          key?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          code: string
          earned_at: string
          user_id: string
        }
        Insert: {
          code: string
          earned_at?: string
          user_id: string
        }
        Update: {
          code?: string
          earned_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["code"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visitors: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          secret_hash: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          secret_hash: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          secret_hash?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_stats: { Args: never; Returns: Json }
      award_achievements: { Args: { p_user: string }; Returns: undefined }
      claim_visitor: {
        Args: { p_secret: string; p_visitor: string }
        Returns: Json
      }
      credit_session: { Args: { p_session: string }; Returns: undefined }
      delete_my_data: { Args: never; Returns: undefined }
      distance_to_route: {
        Args: { p_lat: number; p_lng: number; p_route: string }
        Returns: number
      }
      end_session: {
        Args: { p_secret: string; p_session: string; p_visitor: string }
        Returns: Json
      }
      expire_stale: { Args: never; Returns: Json }
      finalize_session: { Args: { p_session: string }; Returns: undefined }
      get_setting: { Args: { k: string }; Returns: number }
      group_estimate: {
        Args: { at_time?: string; gid: string }
        Returns: {
          based_at: string
          lat: number
          lng: number
          until_at: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      haversine_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      in_service_area: { Args: { lat: number; lng: number }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      level_for_xp: { Args: { p_xp: number }; Returns: string }
      project_route: {
        Args: { geom: Json; plat: number; plng: number }
        Returns: {
          ambiguous: boolean
          distance_m: number
          progress_m: number
          total_m: number
        }[]
      }
      public_map_groups: { Args: never; Returns: Json }
      push_update: {
        Args: {
          p_accuracy: number
          p_lat: number
          p_lng: number
          p_secret: string
          p_session: string
          p_visitor: string
        }
        Returns: Json
      }
      recompute_group: { Args: { p_group: string }; Returns: undefined }
      record_group_motion: { Args: { gid: string }; Returns: undefined }
      register_visitor: { Args: never; Returns: Json }
      route_distance_m: {
        Args: { p_lat: number; p_lng: number; p_route: string }
        Returns: number
      }
      route_point_at: {
        Args: { geom: Json; progress: number }
        Returns: {
          lat: number
          lng: number
        }[]
      }
      run_maintenance: { Args: never; Returns: undefined }
      start_session: {
        Args: {
          p_accuracy: number
          p_lat: number
          p_lng: number
          p_route: string
          p_secret: string
          p_target_group?: string
          p_visitor: string
        }
        Returns: Json
      }
      verify_visitor: {
        Args: { p_secret: string; p_visitor: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      route_status: "draft" | "published" | "inactive"
      session_status: "active" | "ended" | "expired"
      validation_status: "pending" | "valid" | "invalid" | "inconclusive"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      route_status: ["draft", "published", "inactive"],
      session_status: ["active", "ended", "expired"],
      validation_status: ["pending", "valid", "invalid", "inconclusive"],
    },
  },
} as const

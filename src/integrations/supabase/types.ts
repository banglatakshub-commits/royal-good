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
      ad_views: {
        Row: {
          created_at: string
          id: string
          tg_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tg_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tg_id?: string
        }
        Relationships: []
      }
      admin_telegram_ids: {
        Row: {
          created_at: string
          name: string | null
          tg_id: string
        }
        Insert: {
          created_at?: string
          name?: string | null
          tg_id: string
        }
        Update: {
          created_at?: string
          name?: string | null
          tg_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          ad_reward: number
          ad_seconds: number
          ads_script_id: string
          daily_ads: number
          daily_quiz: number
          daily_spins: number
          daily_typing: number
          id: number
          min_withdraw: number
          ref_bonus: number
          support_telegram_username: string
          task_reward: number
          updated_at: string
        }
        Insert: {
          ad_reward?: number
          ad_seconds?: number
          ads_script_id?: string
          daily_ads?: number
          daily_quiz?: number
          daily_spins?: number
          daily_typing?: number
          id?: number
          min_withdraw?: number
          ref_bonus?: number
          support_telegram_username?: string
          task_reward?: number
          updated_at?: string
        }
        Update: {
          ad_reward?: number
          ad_seconds?: number
          ads_script_id?: string
          daily_ads?: number
          daily_quiz?: number
          daily_spins?: number
          daily_typing?: number
          id?: number
          min_withdraw?: number
          ref_bonus?: number
          support_telegram_username?: string
          task_reward?: number
          updated_at?: string
        }
        Relationships: []
      }
      custom_tasks: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          icon: string
          id: string
          link: string | null
          reward: number
          title: string
          wait_seconds: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          link?: string | null
          reward?: number
          title: string
          wait_seconds?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          link?: string | null
          reward?: number
          title?: string
          wait_seconds?: number
        }
        Relationships: []
      }
      job_views: {
        Row: {
          created_at: string
          id: string
          kind: string
          tg_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          tg_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          tg_id?: string
        }
        Relationships: []
      }
      players: {
        Row: {
          balance: number
          blocked: boolean
          chat_id: number | null
          name: string
          photo_url: string | null
          tg_id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          balance?: number
          blocked?: boolean
          chat_id?: number | null
          name: string
          photo_url?: string | null
          tg_id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          balance?: number
          blocked?: boolean
          chat_id?: number | null
          name?: string
          photo_url?: string | null
          tg_id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          photo_url: string | null
          referred_id: string
          referred_name: string | null
          referrer_id: string
        }
        Insert: {
          created_at?: string
          photo_url?: string | null
          referred_id: string
          referred_name?: string | null
          referrer_id: string
        }
        Update: {
          created_at?: string
          photo_url?: string | null
          referred_id?: string
          referred_name?: string | null
          referrer_id?: string
        }
        Relationships: []
      }
      task_claims: {
        Row: {
          created_at: string
          task_id: string
          tg_id: string
        }
        Insert: {
          created_at?: string
          task_id: string
          tg_id: string
        }
        Update: {
          created_at?: string
          task_id?: string
          tg_id?: string
        }
        Relationships: []
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
      withdrawals: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          name: string | null
          note: string | null
          number: string
          status: string
          tg_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: string
          name?: string | null
          note?: string | null
          number: string
          status?: string
          tg_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          name?: string | null
          note?: string | null
          number?: string
          status?: string
          tg_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_balance: { Args: { _amt: number; _tg: string }; Returns: number }
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
    },
  },
} as const

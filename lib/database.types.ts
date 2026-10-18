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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json
          id: number
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: never
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: never
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_number: string
          account_type: string
          bank_name: string
          branch_name: string
          holder_kana: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_number: string
          account_type: string
          bank_name: string
          branch_name: string
          holder_kana: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_number?: string
          account_type?: string
          bank_name?: string
          branch_name?: string
          holder_kana?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id?: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          added_at: string
          listing_id: string
          options: Json
          user_id: string
        }
        Insert: {
          added_at?: string
          listing_id: string
          options?: Json
          user_id?: string
        }
        Update: {
          added_at?: string
          listing_id?: string
          options?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_runs: {
        Row: {
          detail: Json
          last_error: string | null
          last_finished_at: string | null
          last_ok: boolean | null
          last_started_at: string | null
          name: string
        }
        Insert: {
          detail?: Json
          last_error?: string | null
          last_finished_at?: string | null
          last_ok?: boolean | null
          last_started_at?: string | null
          name: string
        }
        Update: {
          detail?: Json
          last_error?: string | null
          last_finished_at?: string | null
          last_ok?: boolean | null
          last_started_at?: string | null
          name?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          seller_id: string
        }
        Insert: {
          created_at?: string
          follower_id?: string
          seller_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          image_src: string | null
          image_url: string | null
          image_urls: string[] | null
          price: number | null
          seller_id: string | null
          shipping_badge: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_src?: string | null
          image_url?: string | null
          image_urls?: string[] | null
          price?: number | null
          seller_id?: string | null
          shipping_badge?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_src?: string | null
          image_url?: string | null
          image_urls?: string[] | null
          price?: number | null
          seller_id?: string | null
          shipping_badge?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      kyc_applications: {
        Row: {
          app_no: number
          birth_date: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          doc_type: string
          document_paths: string[]
          documents_purged_at: string | null
          id: string
          provider: string
          provider_ref: string | null
          reject_reason: string | null
          resubmit_allowed: boolean
          status: string
          user_id: string
        }
        Insert: {
          app_no?: never
          birth_date?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          doc_type: string
          document_paths?: string[]
          documents_purged_at?: string | null
          id?: string
          provider: string
          provider_ref?: string | null
          reject_reason?: string | null
          resubmit_allowed?: boolean
          status?: string
          user_id: string
        }
        Update: {
          app_no?: never
          birth_date?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          doc_type?: string
          document_paths?: string[]
          documents_purged_at?: string | null
          id?: string
          provider?: string
          provider_ref?: string | null
          reject_reason?: string | null
          resubmit_allowed?: boolean
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount: number
          created_at: string
          id: number
          kind: string
          note: string
          order_id: string | null
          payout_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: never
          kind: string
          note?: string
          order_id?: string | null
          payout_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: never
          kind?: string
          note?: string
          order_id?: string | null
          payout_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_item_map: {
        Row: {
          created_at: string
          item_id: string
          listing_id: string
        }
        Insert: {
          created_at?: string
          item_id: string
          listing_id: string
        }
        Update: {
          created_at?: string
          item_id?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "legacy_item_map_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          anonymous_ok: boolean
          category: string | null
          color: string | null
          cool_shipping: boolean
          created_at: string
          description: string
          followers_only: boolean
          id: string
          image_paths: string[]
          like_count: number
          material: string | null
          max_worn_days: number | null
          ng_note: string
          opt_card: boolean
          opt_extend: boolean
          opt_letter: boolean
          opt_photo: boolean
          opt_video: boolean
          opt_ziplock: boolean
          pre_message_ok: boolean
          price: number | null
          published_at: string | null
          request_only: boolean
          sales_count: number
          same_day: boolean
          seller_id: string
          ship_estimate: string
          size: string | null
          status: string
          stock_mode: string
          title: string
          updated_at: string
          view_count: number
          worn_days: number | null
        }
        Insert: {
          anonymous_ok?: boolean
          category?: string | null
          color?: string | null
          cool_shipping?: boolean
          created_at?: string
          description?: string
          followers_only?: boolean
          id?: string
          image_paths?: string[]
          like_count?: number
          material?: string | null
          max_worn_days?: number | null
          ng_note?: string
          opt_card?: boolean
          opt_extend?: boolean
          opt_letter?: boolean
          opt_photo?: boolean
          opt_video?: boolean
          opt_ziplock?: boolean
          pre_message_ok?: boolean
          price?: number | null
          published_at?: string | null
          request_only?: boolean
          sales_count?: number
          same_day?: boolean
          seller_id?: string
          ship_estimate?: string
          size?: string | null
          status?: string
          stock_mode?: string
          title?: string
          updated_at?: string
          view_count?: number
          worn_days?: number | null
        }
        Update: {
          anonymous_ok?: boolean
          category?: string | null
          color?: string | null
          cool_shipping?: boolean
          created_at?: string
          description?: string
          followers_only?: boolean
          id?: string
          image_paths?: string[]
          like_count?: number
          material?: string | null
          max_worn_days?: number | null
          ng_note?: string
          opt_card?: boolean
          opt_extend?: boolean
          opt_letter?: boolean
          opt_photo?: boolean
          opt_video?: boolean
          opt_ziplock?: boolean
          pre_message_ok?: boolean
          price?: number | null
          published_at?: string | null
          request_only?: boolean
          sales_count?: number
          same_day?: boolean
          seller_id?: string
          ship_estimate?: string
          size?: string | null
          status?: string
          stock_mode?: string
          title?: string
          updated_at?: string
          view_count?: number
          worn_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_outbox: {
        Row: {
          body: string
          created_at: string
          error: string | null
          id: number
          kind: string
          mode: string
          sent: boolean
          subject: string
          to_address: string
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          error?: string | null
          id?: never
          kind: string
          mode: string
          sent?: boolean
          subject: string
          to_address: string
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          error?: string | null
          id?: never
          kind?: string
          mode?: string
          sent?: boolean
          subject?: string
          to_address?: string
          user_id?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          created_at: string
          hearted: boolean
          id: string
          image_paths: string[]
          kind: string
          listing_id: string | null
          order_id: string | null
          sender_id: string | null
          status: string
          thread_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          hearted?: boolean
          id?: string
          image_paths?: string[]
          kind: string
          listing_id?: string | null
          order_id?: string | null
          sender_id?: string | null
          status?: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          hearted?: boolean
          id?: string
          image_paths?: string[]
          kind?: string
          listing_id?: string | null
          order_id?: string | null
          sender_id?: string | null
          status?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          link: string | null
          mailed_at: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          mailed_at?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          mailed_at?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_addresses: {
        Row: {
          address1: string
          address2: string
          buyer_id: string
          created_at: string
          name: string
          order_id: string
          phone: string
          postal: string
          prefecture: string
        }
        Insert: {
          address1: string
          address2?: string
          buyer_id: string
          created_at?: string
          name: string
          order_id: string
          phone: string
          postal: string
          prefecture: string
        }
        Update: {
          address1?: string
          address2?: string
          buyer_id?: string
          created_at?: string
          name?: string
          order_id?: string
          phone?: string
          postal?: string
          prefecture?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_addresses_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_addresses_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          anonymous: boolean
          anonymous_fee: number
          auto_completed: boolean
          base_price: number
          buyer_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          carrier: string | null
          category: string
          completed_at: string | null
          created_at: string
          expires_at: string
          fee: number
          fee_rate: number
          group_id: string
          id: string
          image_path: string | null
          listing_id: string
          needs_refund: boolean
          options: Json
          order_no: number
          paid_at: string | null
          payment_method: string
          payment_ref: string | null
          preparing_at: string | null
          refund_ref: string | null
          refunded_at: string | null
          seller_id: string
          seller_net: number
          shipped_at: string | null
          single_stock: boolean
          status: string
          subtotal: number
          title: string
          total: number
          tracking_no: string | null
          updated_at: string
          video_fee: number
          worn_days: number
          worn_surcharge: number
        }
        Insert: {
          anonymous?: boolean
          anonymous_fee?: number
          auto_completed?: boolean
          base_price: number
          buyer_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          category: string
          completed_at?: string | null
          created_at?: string
          expires_at: string
          fee: number
          fee_rate: number
          group_id: string
          id?: string
          image_path?: string | null
          listing_id: string
          needs_refund?: boolean
          options?: Json
          order_no?: never
          paid_at?: string | null
          payment_method: string
          payment_ref?: string | null
          preparing_at?: string | null
          refund_ref?: string | null
          refunded_at?: string | null
          seller_id: string
          seller_net: number
          shipped_at?: string | null
          single_stock: boolean
          status?: string
          subtotal: number
          title: string
          total: number
          tracking_no?: string | null
          updated_at?: string
          video_fee?: number
          worn_days: number
          worn_surcharge?: number
        }
        Update: {
          anonymous?: boolean
          anonymous_fee?: number
          auto_completed?: boolean
          base_price?: number
          buyer_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          category?: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          fee?: number
          fee_rate?: number
          group_id?: string
          id?: string
          image_path?: string | null
          listing_id?: string
          needs_refund?: boolean
          options?: Json
          order_no?: never
          paid_at?: string | null
          payment_method?: string
          payment_ref?: string | null
          preparing_at?: string | null
          refund_ref?: string | null
          refunded_at?: string | null
          seller_id?: string
          seller_net?: number
          shipped_at?: string | null
          single_stock?: boolean
          status?: string
          subtotal?: number
          title?: string
          total?: number
          tracking_no?: string | null
          updated_at?: string
          video_fee?: number
          worn_days?: number
          worn_surcharge?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          event_id: string
          kind: string | null
          provider: string
          received_at: string
        }
        Insert: {
          event_id: string
          kind?: string | null
          provider: string
          received_at?: string
        }
        Update: {
          event_id?: string
          kind?: string | null
          provider?: string
          received_at?: string
        }
        Relationships: []
      }
      payouts: {
        Row: {
          account_last4: string
          account_number: string
          account_type: string
          amount: number
          bank_name: string
          branch_name: string
          decided_at: string | null
          decided_by: string | null
          fee: number
          holder_kana: string
          id: string
          net: number
          payout_no: number
          reject_reason: string | null
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          account_last4: string
          account_number: string
          account_type: string
          amount: number
          bank_name: string
          branch_name: string
          decided_at?: string | null
          decided_by?: string | null
          fee?: number
          holder_kana: string
          id?: string
          net: number
          payout_no?: never
          reject_reason?: string | null
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          account_last4?: string
          account_number?: string
          account_type?: string
          amount?: number
          bank_name?: string
          branch_name?: string
          decided_at?: string | null
          decided_by?: string | null
          fee?: number
          holder_kana?: string
          id?: string
          net?: number
          payout_no?: never
          reject_reason?: string | null
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          post_id: string
          status: string
        }
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          id?: string
          post_id: string
          status?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          post_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          body: string
          category: string | null
          comment_count: number
          created_at: string
          edited_at: string | null
          id: string
          image_paths: string[]
          like_count: number
          listing_id: string | null
          pinned: boolean
          status: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          author_id?: string
          body: string
          category?: string | null
          comment_count?: number
          created_at?: string
          edited_at?: string | null
          id?: string
          image_paths?: string[]
          like_count?: number
          listing_id?: string | null
          pinned?: boolean
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          category?: string | null
          comment_count?: number
          created_at?: string
          edited_at?: string | null
          id?: string
          image_paths?: string[]
          like_count?: number
          listing_id?: string | null
          pinned?: boolean
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accept_messages: boolean
          age: number | null
          avatar_path: string | null
          bio: string
          body_type: string | null
          cover_path: string | null
          created_at: string
          follower_count: number
          following_count: number
          height_cm: number | null
          id: string
          kyc_status: string
          last_seen_at: string | null
          ng_note: string
          nickname: string
          notify_follow: boolean
          notify_message: boolean
          notify_new_listing: boolean
          notify_new_post: boolean
          notify_news: boolean
          notify_order: boolean
          occupation: string | null
          public_name: string | null
          purchase_count: number
          rating_count: number
          rating_sum: number
          role: string
          sales_count: number
          ship_estimate: string | null
          status: string
          supported_options: string[]
          updated_at: string
        }
        Insert: {
          accept_messages?: boolean
          age?: number | null
          avatar_path?: string | null
          bio?: string
          body_type?: string | null
          cover_path?: string | null
          created_at?: string
          follower_count?: number
          following_count?: number
          height_cm?: number | null
          id: string
          kyc_status?: string
          last_seen_at?: string | null
          ng_note?: string
          nickname: string
          notify_follow?: boolean
          notify_message?: boolean
          notify_new_listing?: boolean
          notify_new_post?: boolean
          notify_news?: boolean
          notify_order?: boolean
          occupation?: string | null
          public_name?: string | null
          purchase_count?: number
          rating_count?: number
          rating_sum?: number
          role?: string
          sales_count?: number
          ship_estimate?: string | null
          status?: string
          supported_options?: string[]
          updated_at?: string
        }
        Update: {
          accept_messages?: boolean
          age?: number | null
          avatar_path?: string | null
          bio?: string
          body_type?: string | null
          cover_path?: string | null
          created_at?: string
          follower_count?: number
          following_count?: number
          height_cm?: number | null
          id?: string
          kyc_status?: string
          last_seen_at?: string | null
          ng_note?: string
          nickname?: string
          notify_follow?: boolean
          notify_message?: boolean
          notify_new_listing?: boolean
          notify_new_post?: boolean
          notify_news?: boolean
          notify_order?: boolean
          occupation?: string | null
          public_name?: string | null
          purchase_count?: number
          rating_count?: number
          rating_sum?: number
          role?: string
          sales_count?: number
          ship_estimate?: string | null
          status?: string
          supported_options?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          expires_at: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket: string
          expires_at: string
          hits?: number
          window_start: string
        }
        Update: {
          bucket?: string
          expires_at?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          detail: string
          handled_at: string | null
          handled_by: string | null
          id: string
          reason: string
          report_no: number
          reporter_id: string | null
          resolution_note: string | null
          status: string
          target_id: string
          target_owner: string | null
          target_type: string
        }
        Insert: {
          created_at?: string
          detail?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          reason: string
          report_no?: never
          reporter_id?: string | null
          resolution_note?: string | null
          status?: string
          target_id: string
          target_owner?: string | null
          target_type: string
        }
        Update: {
          created_at?: string
          detail?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          reason?: string
          report_no?: never
          reporter_id?: string | null
          resolution_note?: string | null
          status?: string
          target_id?: string
          target_owner?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_target_owner_fkey"
            columns: ["target_owner"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string
          buyer_id: string
          category: string
          created_at: string
          id: string
          listing_id: string | null
          order_id: string
          rating: number
          seller_id: string
          status: string
          title: string
        }
        Insert: {
          body?: string
          buyer_id: string
          category: string
          created_at?: string
          id?: string
          listing_id?: string | null
          order_id: string
          rating: number
          seller_id: string
          status?: string
          title: string
        }
        Update: {
          body?: string
          buyer_id?: string
          category?: string
          created_at?: string
          id?: string
          listing_id?: string | null
          order_id?: string
          rating?: number
          seller_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_change_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          from_role: string
          id: string
          reason: string
          reject_reason: string | null
          status: string
          to_role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          from_role: string
          id?: string
          reason?: string
          reject_reason?: string | null
          status?: string
          to_role: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          from_role?: string
          id?: string
          reason?: string
          reject_reason?: string | null
          status?: string
          to_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_change_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_addresses: {
        Row: {
          address1: string
          address2: string
          name: string
          phone: string
          postal: string
          prefecture: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address1: string
          address2?: string
          name: string
          phone: string
          postal: string
          prefecture: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          address1?: string
          address2?: string
          name?: string
          phone?: string
          postal?: string
          prefecture?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          age: number | null
          bio: string | null
          created_at: string
          id: string
          nickname: string | null
          occupation: string | null
          profile_image_url: string | null
          profile_image_urls: string[] | null
        }
        Insert: {
          age?: number | null
          bio?: string | null
          created_at?: string
          id: string
          nickname?: string | null
          occupation?: string | null
          profile_image_url?: string | null
          profile_image_urls?: string[] | null
        }
        Update: {
          age?: number | null
          bio?: string | null
          created_at?: string
          id?: string
          nickname?: string | null
          occupation?: string | null
          profile_image_url?: string | null
          profile_image_urls?: string[] | null
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          anonymous_fee: number
          auto_complete_days: number
          extend_fee_per_day: number
          fee_rate: number
          forwarding_address: string
          id: boolean
          mail_kyc: boolean
          mail_order: boolean
          mail_payout: boolean
          maintenance: boolean
          min_payout: number
          mod_spam_filter: boolean
          notice: string
          payout_fee: number
          registration_open: boolean
          updated_at: string
          updated_by: string | null
          video_fee: number
        }
        Insert: {
          anonymous_fee?: number
          auto_complete_days?: number
          extend_fee_per_day?: number
          fee_rate?: number
          forwarding_address?: string
          id?: boolean
          mail_kyc?: boolean
          mail_order?: boolean
          mail_payout?: boolean
          maintenance?: boolean
          min_payout?: number
          mod_spam_filter?: boolean
          notice?: string
          payout_fee?: number
          registration_open?: boolean
          updated_at?: string
          updated_by?: string | null
          video_fee?: number
        }
        Update: {
          anonymous_fee?: number
          auto_complete_days?: number
          extend_fee_per_day?: number
          fee_rate?: number
          forwarding_address?: string
          id?: boolean
          mail_kyc?: boolean
          mail_order?: boolean
          mail_payout?: boolean
          maintenance?: boolean
          min_payout?: number
          mod_spam_filter?: boolean
          notice?: string
          payout_fee?: number
          registration_open?: boolean
          updated_at?: string
          updated_by?: string | null
          video_fee?: number
        }
        Relationships: []
      }
      threads: {
        Row: {
          buyer_id: string
          buyer_last_read_at: string | null
          buyer_muted: boolean
          created_at: string
          id: string
          last_message_at: string
          last_message_preview: string
          seller_id: string
          seller_last_read_at: string | null
          seller_muted: boolean
        }
        Insert: {
          buyer_id: string
          buyer_last_read_at?: string | null
          buyer_muted?: boolean
          created_at?: string
          id?: string
          last_message_at?: string
          last_message_preview?: string
          seller_id: string
          seller_last_read_at?: string | null
          seller_muted?: boolean
        }
        Update: {
          buyer_id?: string
          buyer_last_read_at?: string | null
          buyer_muted?: boolean
          created_at?: string
          id?: string
          last_message_at?: string
          last_message_preview?: string
          seller_id?: string
          seller_last_read_at?: string | null
          seller_muted?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "threads_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sanctions: {
        Row: {
          admin_id: string | null
          created_at: string
          id: number
          kind: string
          reason: string
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          created_at?: string
          id?: never
          kind: string
          reason?: string
          user_id: string
        }
        Update: {
          admin_id?: string | null
          created_at?: string
          id?: never
          kind?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sanctions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_cancel_order: {
        Args: { p_admin: string; p_order: string; p_reason: string }
        Returns: Json
      }
      admin_dashboard: {
        Args: { p_admin: string; p_months?: number }
        Returns: Json
      }
      admin_kyc_allow_resubmit: {
        Args: { p_admin: string; p_app: string }
        Returns: undefined
      }
      admin_kyc_decide: {
        Args: {
          p_admin: string
          p_allow_resubmit?: boolean
          p_app: string
          p_approve: boolean
          p_reason: string
          p_underage?: boolean
        }
        Returns: Json
      }
      admin_kyc_start_review: {
        Args: { p_admin: string; p_app: string }
        Returns: undefined
      }
      admin_ledger_adjust: {
        Args: {
          p_admin: string
          p_amount: number
          p_note: string
          p_order?: string
          p_user: string
        }
        Returns: undefined
      }
      admin_moderate: {
        Args: {
          p_action: string
          p_admin: string
          p_id: string
          p_type: string
        }
        Returns: undefined
      }
      admin_payout_pay: {
        Args: { p_admin: string; p_payout: string }
        Returns: Json
      }
      admin_payout_reject: {
        Args: { p_admin: string; p_payout: string; p_reason: string }
        Returns: undefined
      }
      admin_report_update: {
        Args: {
          p_admin: string
          p_note: string
          p_report: string
          p_status: string
        }
        Returns: undefined
      }
      admin_role_change_decide: {
        Args: {
          p_admin: string
          p_approve: boolean
          p_reason: string
          p_req: string
        }
        Returns: undefined
      }
      admin_set_listing_status: {
        Args: {
          p_admin: string
          p_listing: string
          p_reason: string
          p_status: string
        }
        Returns: undefined
      }
      admin_set_user_status: {
        Args: {
          p_admin: string
          p_reason: string
          p_status: string
          p_user: string
        }
        Returns: undefined
      }
      admin_update_settings: {
        Args: { p_admin: string; p_patch: Json }
        Returns: undefined
      }
      admin_warn_user: {
        Args: { p_admin: string; p_reason: string; p_user: string }
        Returns: undefined
      }
      admin_withdraw_user: {
        Args: { p_admin: string; p_reason: string; p_user: string }
        Returns: Json
      }
      assert_admin: { Args: { p_admin: string }; Returns: undefined }
      attach_payment_ref: {
        Args: { p_group: string; p_ref: string }
        Returns: undefined
      }
      audit: {
        Args: {
          p_action: string
          p_actor: string
          p_detail?: Json
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      auto_complete_orders: { Args: never; Returns: number }
      blocked_between: { Args: { p_a: string; p_b: string }; Returns: boolean }
      bump_listing_view: { Args: { p_listing: string; p_viewer?: string | null }; Returns: undefined }
      cancel_expired_orders: {
        Args: never
        Returns: {
          group_id: string
          order_id: string
          payment_method: string
          payment_ref: string
        }[]
      }
      cancel_my_pending_group: { Args: { p_group: string }; Returns: number }
      admin_user_balance: { Args: { p_admin: string; p_user: string }; Returns: number }
      delete_my_listing: { Args: { p_listing: string }; Returns: undefined }
      claim_mail_batch: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          email: string
          kind: string
          link: string
          notification_id: string
          title: string
          user_id: string
        }[]
      }
      cleanup_retention: { Args: never; Returns: Json }
      complete_order: { Args: { p_order: string }; Returns: undefined }
      create_checkout: {
        Args: {
          p_address: Json
          p_buyer: string
          p_items: Json
          p_method: string
        }
        Returns: Json
      }
      ensure_thread: {
        Args: { p_buyer: string; p_seller: string }
        Returns: string
      }
      file_report: {
        Args: {
          p_detail: string
          p_reason: string
          p_target: string
          p_type: string
        }
        Returns: number
      }
      finish_order: {
        Args: { p_auto: boolean; p_order: string }
        Returns: undefined
      }
      is_blocked_with: { Args: { p_other: string }; Returns: boolean }
      is_end_user: { Args: never; Returns: boolean }
      is_following: { Args: { p_seller: string }; Returns: boolean }
      is_verified: { Args: { p_uid: string }; Returns: boolean }
      kyc_apply_decision: {
        Args: {
          p_actor: string
          p_allow_resubmit: boolean
          p_app: string
          p_approve: boolean
          p_reason: string
          p_underage: boolean
        }
        Returns: Json
      }
      kyc_mark_purged: { Args: { p_app: string }; Returns: undefined }
      kyc_provider_result: {
        Args: {
          p_approve: boolean
          p_reason: string
          p_ref: string
          p_underage: boolean
        }
        Returns: Json
      }
      kyc_set_provider_ref: {
        Args: { p_app: string; p_ref: string }
        Returns: undefined
      }
      legacy_clean: { Args: { p: string; p_max: number }; Returns: string }
      listing_quote: {
        Args: {
          p_anonymous_fee: number
          p_extend_fee: number
          p_listing: Database["public"]["Tables"]["listings"]["Row"]
          p_opts: Json
          p_video_fee: number
        }
        Returns: Json
      }
      looks_spammy: { Args: { p_text: string }; Returns: boolean }
      mark_group_paid: {
        Args: { p_amount: number; p_group: string; p_ref: string }
        Returns: string
      }
      mark_refunded: {
        Args: { p_order: string; p_ref: string }
        Returns: undefined
      }
      mark_thread_read: { Args: { p_thread: string }; Returns: undefined }
      migrate_legacy_data: { Args: never; Returns: Json }
      my_balance: { Args: never; Returns: number }
      my_ledger: {
        Args: { p_limit?: number }
        Returns: {
          amount: number
          balance: number
          created_at: string
          id: number
          kind: string
          note: string
          order_id: string
        }[]
      }
      my_profile: {
        Args: never
        Returns: {
          accept_messages: boolean
          age: number | null
          avatar_path: string | null
          bio: string
          body_type: string | null
          cover_path: string | null
          created_at: string
          follower_count: number
          following_count: number
          height_cm: number | null
          id: string
          kyc_status: string
          last_seen_at: string | null
          ng_note: string
          nickname: string
          notify_follow: boolean
          notify_message: boolean
          notify_new_listing: boolean
          notify_new_post: boolean
          notify_news: boolean
          notify_order: boolean
          occupation: string | null
          public_name: string | null
          purchase_count: number
          rating_count: number
          rating_sum: number
          role: string
          sales_count: number
          ship_estimate: string | null
          status: string
          supported_options: string[]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_threads: {
        Args: never
        Returns: {
          last_message_at: string
          muted: boolean
          other_avatar: string
          other_id: string
          other_last_seen: string
          other_name: string
          other_read_at: string
          other_role: string
          other_verified: boolean
          preview: string
          thread_id: string
          unread: number
        }[]
      }
      my_unread_messages: { Args: never; Returns: number }
      notify: {
        Args: {
          p_body: string
          p_kind: string
          p_link: string
          p_title: string
          p_user: string
        }
        Returns: undefined
      }
      open_thread: { Args: { p_other: string }; Returns: string }
      paths_ok: {
        Args: { p_max: number; p_owner: string; p_paths: string[] }
        Returns: boolean
      }
      pin_post: {
        Args: { p_pinned: boolean; p_post: string }
        Returns: undefined
      }
      post_review: {
        Args: { p_body: string; p_order: string; p_rating: number }
        Returns: string
      }
      post_system_message: {
        Args: {
          p_body: string
          p_buyer: string
          p_kind: string
          p_listing: string
          p_order: string
          p_seller: string
        }
        Returns: undefined
      }
      prepare_order: { Args: { p_order: string }; Returns: undefined }
      quote_listing: {
        Args: { p_listing: string; p_opts: Json }
        Returns: Json
      }
      rate_limit_take: {
        Args: {
          p_buckets: string[]
          p_max: number[]
          p_offset_seconds: number[]
          p_window_seconds: number[]
        }
        Returns: {
          allowed: boolean
          denied_bucket: string
          retry_after_seconds: number
        }[]
      }
      request_payout: { Args: { p_amount: number }; Returns: string }
      request_role_change: { Args: { p_reason: string }; Returns: string }
      san: { Args: { p_name: string }; Returns: string }
      search_listings: { Args: { p: Json }; Returns: Json }
      seller_can_leave: { Args: { p_user: string }; Returns: string }
      seller_cancel_order: {
        Args: { p_order: string; p_reason: string }
        Returns: undefined
      }
      seller_is_public: { Args: { p_uid: string }; Returns: boolean }
      seller_stats: { Args: { p_period?: string }; Returns: Json }
      send_message: {
        Args: {
          p_body: string
          p_image_paths?: string[]
          p_listing?: string
          p_thread: string
        }
        Returns: string
      }
      set_thread_muted: {
        Args: { p_muted: boolean; p_thread: string }
        Returns: undefined
      }
      ship_order: {
        Args: { p_carrier: string; p_order: string; p_tracking: string }
        Returns: undefined
      }
      spam_hold: { Args: { p_text: string }; Returns: boolean }
      submit_kyc: {
        Args: {
          p_birth_date: string
          p_doc_type: string
          p_paths: string[]
          p_provider: string
          p_user: string
        }
        Returns: Json
      }
      suspend_internal: {
        Args: { p_actor: string; p_reason: string; p_user: string }
        Returns: undefined
      }
      toggle_message_heart: { Args: { p_message: string }; Returns: boolean }
      touch_last_seen: { Args: never; Returns: undefined }
      trend_tags: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          n: number
          tag: string
        }[]
      }
      viewer_context: {
        Args: never
        Returns: {
          avatar_path: string
          is_admin: boolean
          kyc_status: string
          nickname: string
          role: string
          status: string
        }[]
      }
      weekly_ranking: {
        Args: { p_kind?: string; p_limit?: number }
        Returns: Json
      }
      withdraw_account: {
        Args: { p_reason: string; p_user: string }
        Returns: Json
      }
      withdraw_internal: {
        Args: {
          p_actor: string
          p_force: boolean
          p_reason: string
          p_user: string
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
    Enums: {},
  },
} as const

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
      account_groups: {
        Row: {
          created_at: string
          created_by: string | null
          group_name: string
          id: number
          notes: string | null
          the_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_name: string
          id?: number
          notes?: string | null
          the_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_name?: string
          id?: number
          notes?: string | null
          the_number?: number
        }
        Relationships: []
      }
      accounts: {
        Row: {
          account_name: string
          account_number: number
          account_reference: string | null
          account_type: string
          branch_id: number | null
          ceiling_amount: number | null
          ceiling_currency_id: number | null
          created_at: string
          created_by: string | null
          father_number: number | null
          group_id: number | null
          id: number
          trade_name: string | null
        }
        Insert: {
          account_name: string
          account_number: number
          account_reference?: string | null
          account_type?: string
          branch_id?: number | null
          ceiling_amount?: number | null
          ceiling_currency_id?: number | null
          created_at?: string
          created_by?: string | null
          father_number?: number | null
          group_id?: number | null
          id?: number
          trade_name?: string | null
        }
        Update: {
          account_name?: string
          account_number?: number
          account_reference?: string | null
          account_type?: string
          branch_id?: number | null
          ceiling_amount?: number | null
          ceiling_currency_id?: number | null
          created_at?: string
          created_by?: string | null
          father_number?: number | null
          group_id?: number | null
          id?: number
          trade_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "account_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      activation_codes: {
        Row: {
          code_hash: string
          created_at: string
          created_by: string
          id: string
          installation_id: string
          licensed_until: string | null
          revoked_at: string | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          created_by: string
          id?: string
          installation_id: string
          licensed_until?: string | null
          revoked_at?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          created_by?: string
          id?: string
          installation_id?: string
          licensed_until?: string | null
          revoked_at?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activation_codes_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "installation_license"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: number
          target: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: never
          target?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: never
          target?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      admin_setup_claim: {
        Row: {
          claimed_at: string
          id: number
        }
        Insert: {
          claimed_at?: string
          id?: number
        }
        Update: {
          claimed_at?: string
          id?: number
        }
        Relationships: []
      }
      agent_settlements: {
        Row: {
          agent_id: number
          amount: number
          box_id: number | null
          client_ref: string | null
          created_at: string
          created_by: string | null
          currency_id: number
          direction: string
          document_number: number | null
          id: number
          notes: string | null
          the_date: string
        }
        Insert: {
          agent_id: number
          amount: number
          box_id?: number | null
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          currency_id: number
          direction: string
          document_number?: number | null
          id?: never
          notes?: string | null
          the_date?: string
        }
        Update: {
          agent_id?: number
          amount?: number
          box_id?: number | null
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          currency_id?: number
          direction?: string
          document_number?: number | null
          id?: never
          notes?: string | null
          the_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_settlements_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_settlements_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_settlements_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          account_id: number | null
          address: string | null
          agent_name: string
          branch_id: number | null
          classification_id: number | null
          client_ref: string | null
          created_at: string
          created_by: string | null
          id: number
          notes: string | null
          phone: string | null
          the_number: number
        }
        Insert: {
          account_id?: number | null
          address?: string | null
          agent_name: string
          branch_id?: number | null
          classification_id?: number | null
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          notes?: string | null
          phone?: string | null
          the_number: number
        }
        Update: {
          account_id?: number | null
          address?: string | null
          agent_name?: string
          branch_id?: number | null
          classification_id?: number | null
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          notes?: string | null
          phone?: string | null
          the_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "agents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_classification_id_fkey"
            columns: ["classification_id"]
            isOneToOne: false
            referencedRelation: "classifications"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          active: boolean
          area_name: string
          created_at: string
          created_by: string | null
          governorate_id: number
          id: number
          the_number: number
        }
        Insert: {
          active?: boolean
          area_name: string
          created_at?: string
          created_by?: string | null
          governorate_id: number
          id?: number
          the_number: number
        }
        Update: {
          active?: boolean
          area_name?: string
          created_at?: string
          created_by?: string | null
          governorate_id?: number
          id?: number
          the_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "areas_governorate_id_fkey"
            columns: ["governorate_id"]
            isOneToOne: false
            referencedRelation: "governorates"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_reply_commands: {
        Row: {
          active: boolean
          code: number
          label: string
        }
        Insert: {
          active?: boolean
          code: number
          label: string
        }
        Update: {
          active?: boolean
          code?: number
          label?: string
        }
        Relationships: []
      }
      auto_reply_settings: {
        Row: {
          display_name: string
          enabled: boolean
          id: number
          instructions_enabled: boolean
          instructions_hours: number
          phone_number: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          display_name?: string
          enabled?: boolean
          id?: number
          instructions_enabled?: boolean
          instructions_hours?: number
          phone_number?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          display_name?: string
          enabled?: boolean
          id?: number
          instructions_enabled?: boolean
          instructions_hours?: number
          phone_number?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_name: string | null
          account_number: string
          account_type: string | null
          bank_id: number
          created_at: string
          created_by: string | null
          currency_id: number | null
          id: number
          notes: string | null
        }
        Insert: {
          account_name?: string | null
          account_number: string
          account_type?: string | null
          bank_id: number
          created_at?: string
          created_by?: string | null
          currency_id?: number | null
          id?: never
          notes?: string | null
        }
        Update: {
          account_name?: string | null
          account_number?: string
          account_type?: string | null
          bank_id?: number
          created_at?: string
          created_by?: string | null
          currency_id?: number | null
          id?: never
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      banks: {
        Row: {
          bank_name: string
          created_at: string
          created_by: string | null
          id: number
          notes: string | null
        }
        Insert: {
          bank_name: string
          created_at?: string
          created_by?: string | null
          id?: never
          notes?: string | null
        }
        Update: {
          bank_name?: string
          created_at?: string
          created_by?: string | null
          id?: never
          notes?: string | null
        }
        Relationships: []
      }
      blacklist: {
        Row: {
          created_at: string
          created_by: string | null
          full_name: string
          id: number
          identity_number: string | null
          phone_number: string | null
          reason: string | null
          the_date: string
          the_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          full_name: string
          id?: number
          identity_number?: string | null
          phone_number?: string | null
          reason?: string | null
          the_date?: string
          the_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: number
          identity_number?: string | null
          phone_number?: string | null
          reason?: string | null
          the_date?: string
          the_number?: number
        }
        Relationships: []
      }
      box_closings: {
        Row: {
          box_id: number
          close_date: string
          closed_by: string | null
          counted_amount: number
          created_at: string
          currency_id: number
          difference: number | null
          id: number
          notes: string | null
          system_balance: number
        }
        Insert: {
          box_id: number
          close_date: string
          closed_by?: string | null
          counted_amount: number
          created_at?: string
          currency_id: number
          difference?: number | null
          id?: never
          notes?: string | null
          system_balance?: number
        }
        Update: {
          box_id?: number
          close_date?: string
          closed_by?: string | null
          counted_amount?: number
          created_at?: string
          currency_id?: number
          difference?: number | null
          id?: never
          notes?: string | null
          system_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "box_closings_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_closings_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      box_movements: {
        Row: {
          amount: number
          box_id: number
          branch_id: number | null
          client_ref: string | null
          created_at: string
          created_by: string | null
          currency_id: number | null
          id: number
          movement_type: string
          notes: string | null
          source_id: number | null
          source_type: string | null
        }
        Insert: {
          amount?: number
          box_id: number
          branch_id?: number | null
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          currency_id?: number | null
          id?: never
          movement_type?: string
          notes?: string | null
          source_id?: number | null
          source_type?: string | null
        }
        Update: {
          amount?: number
          box_id?: number
          branch_id?: number | null
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          currency_id?: number | null
          id?: never
          movement_type?: string
          notes?: string | null
          source_id?: number | null
          source_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "box_movements_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_movements_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      boxes: {
        Row: {
          account_id: number | null
          box_name: string
          branch_id: number | null
          created_at: string
          created_by: string | null
          id: number
          the_number: number
        }
        Insert: {
          account_id?: number | null
          box_name: string
          branch_id?: number | null
          created_at?: string
          created_by?: string | null
          id?: never
          the_number: number
        }
        Update: {
          account_id?: number | null
          box_name?: string
          branch_id?: number | null
          created_at?: string
          created_by?: string | null
          id?: never
          the_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "boxes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boxes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          branch_name: string
          created_at: string
          created_by: string | null
          english_name: string | null
          id: number
          notes: string | null
          phone: string | null
          the_number: number
        }
        Insert: {
          address?: string | null
          branch_name: string
          created_at?: string
          created_by?: string | null
          english_name?: string | null
          id?: number
          notes?: string | null
          phone?: string | null
          the_number: number
        }
        Update: {
          address?: string | null
          branch_name?: string
          created_at?: string
          created_by?: string | null
          english_name?: string | null
          id?: number
          notes?: string | null
          phone?: string | null
          the_number?: number
        }
        Relationships: []
      }
      buy_currencies: {
        Row: {
          account_id: number | null
          amount: number
          box_id: number | null
          branch_id: number | null
          cash_customer_name: string | null
          client_ref: string | null
          commission: number
          created_at: string
          created_by: string | null
          currency_id: number | null
          customer_id: number | null
          customer_phone: string | null
          document_number: number | null
          exchange_amount: number | null
          exchange_currency_id: number | null
          id: number
          notes: string | null
          payment_method: string
          price: number
          the_date: string
          the_number: number | null
        }
        Insert: {
          account_id?: number | null
          amount: number
          box_id?: number | null
          branch_id?: number | null
          cash_customer_name?: string | null
          client_ref?: string | null
          commission?: number
          created_at?: string
          created_by?: string | null
          currency_id?: number | null
          customer_id?: number | null
          customer_phone?: string | null
          document_number?: number | null
          exchange_amount?: number | null
          exchange_currency_id?: number | null
          id?: never
          notes?: string | null
          payment_method?: string
          price: number
          the_date?: string
          the_number?: number | null
        }
        Update: {
          account_id?: number | null
          amount?: number
          box_id?: number | null
          branch_id?: number | null
          cash_customer_name?: string | null
          client_ref?: string | null
          commission?: number
          created_at?: string
          created_by?: string | null
          currency_id?: number | null
          customer_id?: number | null
          customer_phone?: string | null
          document_number?: number | null
          exchange_amount?: number | null
          exchange_currency_id?: number | null
          id?: never
          notes?: string | null
          payment_method?: string
          price?: number
          the_date?: string
          the_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "buy_currencies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_currencies_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_currencies_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_currencies_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_currencies_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_currencies_exchange_currency_id_fkey"
            columns: ["exchange_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_vouchers: {
        Row: {
          amount: number
          batch_id: string | null
          batch_position: number | null
          box_id: number | null
          branch_id: number | null
          cash_name: string | null
          client_ref: string | null
          created_at: string
          created_by: string | null
          currency_id: number
          customer_id: number | null
          document_number: number | null
          id: number
          notes: string | null
          the_date: string
          the_number: number | null
          voucher_type: string
        }
        Insert: {
          amount: number
          batch_id?: string | null
          batch_position?: number | null
          box_id?: number | null
          branch_id?: number | null
          cash_name?: string | null
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          currency_id: number
          customer_id?: number | null
          document_number?: number | null
          id?: never
          notes?: string | null
          the_date?: string
          the_number?: number | null
          voucher_type: string
        }
        Update: {
          amount?: number
          batch_id?: string | null
          batch_position?: number | null
          box_id?: number | null
          branch_id?: number | null
          cash_name?: string | null
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          currency_id?: number
          customer_id?: number | null
          document_number?: number | null
          id?: never
          notes?: string | null
          the_date?: string
          the_number?: number | null
          voucher_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_vouchers_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_vouchers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_vouchers_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_vouchers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      check_books: {
        Row: {
          account_number: string | null
          bank_id: number | null
          created_at: string
          created_by: string | null
          from_number: number
          id: number
          notes: string | null
          to_number: number
        }
        Insert: {
          account_number?: string | null
          bank_id?: number | null
          created_at?: string
          created_by?: string | null
          from_number: number
          id?: never
          notes?: string | null
          to_number: number
        }
        Update: {
          account_number?: string | null
          bank_id?: number | null
          created_at?: string
          created_by?: string | null
          from_number?: number
          id?: never
          notes?: string | null
          to_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "check_books_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
        ]
      }
      checks: {
        Row: {
          amount: number
          bank_id: number | null
          bank_name: string | null
          beneficiary_name: string | null
          book_id: number | null
          box_id: number | null
          branch_id: number | null
          check_account_name: string | null
          check_account_number: string | null
          check_number: string
          check_type: string
          client_ref: string | null
          collected_date: string | null
          created_at: string
          created_by: string | null
          currency_id: number
          customer_id: number | null
          document_number: number | null
          due_date: string | null
          exchange_amount: number | null
          exchange_currency_id: number | null
          id: number
          notes: string | null
          party_name: string | null
          status: string
          the_date: string
          the_number: number | null
        }
        Insert: {
          amount: number
          bank_id?: number | null
          bank_name?: string | null
          beneficiary_name?: string | null
          book_id?: number | null
          box_id?: number | null
          branch_id?: number | null
          check_account_name?: string | null
          check_account_number?: string | null
          check_number: string
          check_type: string
          client_ref?: string | null
          collected_date?: string | null
          created_at?: string
          created_by?: string | null
          currency_id: number
          customer_id?: number | null
          document_number?: number | null
          due_date?: string | null
          exchange_amount?: number | null
          exchange_currency_id?: number | null
          id?: never
          notes?: string | null
          party_name?: string | null
          status?: string
          the_date?: string
          the_number?: number | null
        }
        Update: {
          amount?: number
          bank_id?: number | null
          bank_name?: string | null
          beneficiary_name?: string | null
          book_id?: number | null
          box_id?: number | null
          branch_id?: number | null
          check_account_name?: string | null
          check_account_number?: string | null
          check_number?: string
          check_type?: string
          client_ref?: string | null
          collected_date?: string | null
          created_at?: string
          created_by?: string | null
          currency_id?: number
          customer_id?: number | null
          document_number?: number | null
          due_date?: string | null
          exchange_amount?: number | null
          exchange_currency_id?: number | null
          id?: never
          notes?: string | null
          party_name?: string | null
          status?: string
          the_date?: string
          the_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "checks_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "check_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_exchange_currency_id_fkey"
            columns: ["exchange_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      classifications: {
        Row: {
          applies_to: string
          classification_name: string
          created_at: string
          created_by: string | null
          id: number
          notes: string | null
          the_number: number
        }
        Insert: {
          applies_to?: string
          classification_name: string
          created_at?: string
          created_by?: string | null
          id?: number
          notes?: string | null
          the_number: number
        }
        Update: {
          applies_to?: string
          classification_name?: string
          created_at?: string
          created_by?: string | null
          id?: number
          notes?: string | null
          the_number?: number
        }
        Relationships: []
      }
      commission_rules: {
        Row: {
          agent_id: number | null
          amount_from: number | null
          amount_to: number | null
          branch_id: number | null
          commission_currency_id: number | null
          commission_value: number
          created_at: string
          created_by: string | null
          currency_id: number | null
          document_type: string
          id: number
          max_commission: number | null
          method: string
          min_commission: number | null
          notes: string | null
          the_number: number | null
        }
        Insert: {
          agent_id?: number | null
          amount_from?: number | null
          amount_to?: number | null
          branch_id?: number | null
          commission_currency_id?: number | null
          commission_value: number
          created_at?: string
          created_by?: string | null
          currency_id?: number | null
          document_type: string
          id?: never
          max_commission?: number | null
          method: string
          min_commission?: number | null
          notes?: string | null
          the_number?: number | null
        }
        Update: {
          agent_id?: number | null
          amount_from?: number | null
          amount_to?: number | null
          branch_id?: number | null
          commission_currency_id?: number | null
          commission_value?: number
          created_at?: string
          created_by?: string | null
          currency_id?: number | null
          document_type?: string
          id?: never
          max_commission?: number | null
          method?: string
          min_commission?: number | null
          notes?: string | null
          the_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_commission_currency_id_fkey"
            columns: ["commission_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          center_name: string
          created_at: string
          created_by: string | null
          id: number
          notes: string | null
          parent_id: number | null
          the_number: number | null
        }
        Insert: {
          center_name: string
          created_at?: string
          created_by?: string | null
          id?: never
          notes?: string | null
          parent_id?: number | null
          the_number?: number | null
        }
        Update: {
          center_name?: string
          created_at?: string
          created_by?: string | null
          id?: never
          notes?: string | null
          parent_id?: number | null
          the_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          active: boolean
          country_name: string
          created_at: string
          created_by: string | null
          id: number
          phone_code: string | null
          the_number: number
        }
        Insert: {
          active?: boolean
          country_name: string
          created_at?: string
          created_by?: string | null
          id?: number
          phone_code?: string | null
          the_number: number
        }
        Update: {
          active?: boolean
          country_name?: string
          created_at?: string
          created_by?: string | null
          id?: number
          phone_code?: string | null
          the_number?: number
        }
        Relationships: []
      }
      currencies: {
        Row: {
          arabic_code: string | null
          created_at: string
          created_by: string | null
          currency_name: string
          english_code: string | null
          id: number
          iso_code: string | null
          max_buy_price: number | null
          min_sell_price: number | null
          notes: string | null
          the_number: number
        }
        Insert: {
          arabic_code?: string | null
          created_at?: string
          created_by?: string | null
          currency_name: string
          english_code?: string | null
          id?: number
          iso_code?: string | null
          max_buy_price?: number | null
          min_sell_price?: number | null
          notes?: string | null
          the_number: number
        }
        Update: {
          arabic_code?: string | null
          created_at?: string
          created_by?: string | null
          currency_name?: string
          english_code?: string | null
          id?: number
          iso_code?: string | null
          max_buy_price?: number | null
          min_sell_price?: number | null
          notes?: string | null
          the_number?: number
        }
        Relationships: []
      }
      currency_prices: {
        Row: {
          buy_price: number
          exchange_price: number
          id: number
          max_price: number
          min_price: number
          notes: string | null
          sell_price: number
          source_currency_id: number
          target_currency_id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          buy_price?: number
          exchange_price?: number
          id?: number
          max_price?: number
          min_price?: number
          notes?: string | null
          sell_price?: number
          source_currency_id: number
          target_currency_id: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          buy_price?: number
          exchange_price?: number
          id?: number
          max_price?: number
          min_price?: number
          notes?: string | null
          sell_price?: number
          source_currency_id?: number
          target_currency_id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "currency_prices_source_currency_id_fkey"
            columns: ["source_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "currency_prices_target_currency_id_fkey"
            columns: ["target_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      currency_rate_history: {
        Row: {
          buy_price: number
          changed_at: string
          changed_by: string | null
          exchange_price: number
          id: number
          sell_price: number
          source_currency_id: number
          target_currency_id: number
        }
        Insert: {
          buy_price: number
          changed_at?: string
          changed_by?: string | null
          exchange_price: number
          id?: number
          sell_price: number
          source_currency_id: number
          target_currency_id: number
        }
        Update: {
          buy_price?: number
          changed_at?: string
          changed_by?: string | null
          exchange_price?: number
          id?: number
          sell_price?: number
          source_currency_id?: number
          target_currency_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "currency_rate_history_source_currency_id_fkey"
            columns: ["source_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "currency_rate_history_target_currency_id_fkey"
            columns: ["target_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_transfer_movements: {
        Row: {
          created_at: string
          created_by: string | null
          credit: number
          currency_id: number
          customer_id: number
          debit: number
          id: number
          notes: string
          source_id: number
          source_type: string
          the_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credit?: number
          currency_id: number
          customer_id: number
          debit?: number
          id?: never
          notes: string
          source_id: number
          source_type: string
          the_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credit?: number
          currency_id?: number
          customer_id?: number
          debit?: number
          id?: never
          notes?: string
          source_id?: number
          source_type?: string
          the_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_transfer_movements_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_transfer_movements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          account_id: number | null
          branch_id: number | null
          classification_id: number | null
          client_ref: string | null
          created_at: string
          created_by: string | null
          credit_limit: number | null
          full_name: string
          id: number
          phone_number: string | null
          stop_reason: string | null
          stopped: boolean
          the_user_id: number | null
        }
        Insert: {
          account_id?: number | null
          branch_id?: number | null
          classification_id?: number | null
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          full_name: string
          id?: never
          phone_number?: string | null
          stop_reason?: string | null
          stopped?: boolean
          the_user_id?: number | null
        }
        Update: {
          account_id?: number | null
          branch_id?: number | null
          classification_id?: number | null
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          full_name?: string
          id?: never
          phone_number?: string | null
          stop_reason?: string | null
          stopped?: boolean
          the_user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_classification_id_fkey"
            columns: ["classification_id"]
            isOneToOne: false
            referencedRelation: "classifications"
            referencedColumns: ["id"]
          },
        ]
      }
      document_counters: {
        Row: {
          last_number: number
          scope: string
        }
        Insert: {
          last_number?: number
          scope: string
        }
        Update: {
          last_number?: number
          scope?: string
        }
        Relationships: []
      }
      document_number_registry: {
        Row: {
          created_at: string
          number: number
          scope: string
          source_id: number
          source_table: string
        }
        Insert: {
          created_at?: string
          number: number
          scope: string
          source_id: number
          source_table: string
        }
        Update: {
          created_at?: string
          number?: number
          scope?: string
          source_id?: number
          source_table?: string
        }
        Relationships: []
      }
      entries: {
        Row: {
          branch_id: number | null
          created_at: string
          created_by: string | null
          debited: boolean
          document_number: number | null
          entry_number: number
          id: number
          notes: string | null
          posting_reversal_of: number | null
          posting_source: string | null
          posting_source_id: number | null
          the_date: string
        }
        Insert: {
          branch_id?: number | null
          created_at?: string
          created_by?: string | null
          debited?: boolean
          document_number?: number | null
          entry_number: number
          id?: never
          notes?: string | null
          posting_reversal_of?: number | null
          posting_source?: string | null
          posting_source_id?: number | null
          the_date?: string
        }
        Update: {
          branch_id?: number | null
          created_at?: string
          created_by?: string | null
          debited?: boolean
          document_number?: number | null
          entry_number?: number
          id?: never
          notes?: string | null
          posting_reversal_of?: number | null
          posting_source?: string | null
          posting_source_id?: number | null
          the_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_posting_reversal_of_fkey"
            columns: ["posting_reversal_of"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      entries_details: {
        Row: {
          account_id: number | null
          amount: number
          currency_id: number | null
          entry_id: number
          entry_index: number | null
          id: number
          notes: string | null
          settlement_mirror: boolean
          side: string
        }
        Insert: {
          account_id?: number | null
          amount?: number
          currency_id?: number | null
          entry_id: number
          entry_index?: number | null
          id?: never
          notes?: string | null
          settlement_mirror?: boolean
          side?: string
        }
        Update: {
          account_id?: number | null
          amount?: number
          currency_id?: number | null
          entry_id?: number
          entry_index?: number | null
          id?: never
          notes?: string | null
          settlement_mirror?: boolean
          side?: string
        }
        Relationships: [
          {
            foreignKeyName: "entries_details_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_details_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_details_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_years: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: number
          locked: boolean
          notes: string | null
          start_date: string
          the_year: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: never
          locked?: boolean
          notes?: string | null
          start_date: string
          the_year: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: never
          locked?: boolean
          notes?: string | null
          start_date?: string
          the_year?: number
        }
        Relationships: []
      }
      forbidden_texts: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          forbidden_text: string
          id: number
          the_number: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          forbidden_text: string
          id?: number
          the_number: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          forbidden_text?: string
          id?: number
          the_number?: number
        }
        Relationships: []
      }
      funds_inventory: {
        Row: {
          box_id: number
          branch_id: number | null
          created_at: string
          created_by: string | null
          id: number
          notes: string | null
          the_date: string
          the_number: number | null
          voided_at: string | null
        }
        Insert: {
          box_id: number
          branch_id?: number | null
          created_at?: string
          created_by?: string | null
          id?: never
          notes?: string | null
          the_date?: string
          the_number?: number | null
          voided_at?: string | null
        }
        Update: {
          box_id?: number
          branch_id?: number | null
          created_at?: string
          created_by?: string | null
          id?: never
          notes?: string | null
          the_date?: string
          the_number?: number | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funds_inventory_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funds_inventory_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      funds_inventory_details: {
        Row: {
          currency_id: number
          difference: number | null
          id: number
          inventory_id: number
          notes: string | null
          real_amount: number
          system_amount: number
        }
        Insert: {
          currency_id: number
          difference?: number | null
          id?: never
          inventory_id: number
          notes?: string | null
          real_amount?: number
          system_amount?: number
        }
        Update: {
          currency_id?: number
          difference?: number | null
          id?: never
          inventory_id?: number
          notes?: string | null
          real_amount?: number
          system_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "funds_inventory_details_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funds_inventory_details_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "funds_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      governorates: {
        Row: {
          active: boolean
          country_id: number
          created_at: string
          created_by: string | null
          governorate_name: string
          id: number
          the_number: number
        }
        Insert: {
          active?: boolean
          country_id: number
          created_at?: string
          created_by?: string | null
          governorate_name: string
          id?: number
          the_number: number
        }
        Update: {
          active?: boolean
          country_id?: number
          created_at?: string
          created_by?: string | null
          governorate_name?: string
          id?: number
          the_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "governorates_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      group_screen_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_print: boolean
          can_update: boolean
          can_view: boolean
          extra_actions: Json
          group_id: number
          id: number
          screen_path: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_print?: boolean
          can_update?: boolean
          can_view?: boolean
          extra_actions?: Json
          group_id: number
          id?: never
          screen_path: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_print?: boolean
          can_update?: boolean
          can_view?: boolean
          extra_actions?: Json
          group_id?: number
          id?: never
          screen_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_screen_permissions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "user_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_password_setup: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      incoming_transfers: {
        Row: {
          agent_id: number | null
          amount: number
          area_id: number | null
          box_id: number | null
          branch_commission: number
          branch_id: number | null
          canceled: boolean
          client_ref: string | null
          commission_currency_id: number | null
          country_id: number | null
          created_at: string
          created_by: string | null
          currency_id: number
          customer_id: number | null
          delivered: boolean
          delivered_at: string | null
          delivered_by: string | null
          destination_name: string | null
          document_number: number | null
          export_agent_id: number | null
          export_notes: string | null
          exported_at: string | null
          exported_by: string | null
          governorate_id: number | null
          id: number
          internal_outgoing_id: number | null
          notes: string | null
          payment_method: string
          receiver_id_number: string | null
          receiver_identity_number: string | null
          receiver_identity_type: string | null
          receiver_name: string
          receiver_phone: string | null
          reference_number: string | null
          sender_name: string
          sender_phone: string | null
          source_name: string | null
          state: string | null
          the_date: string
          transfer_number: number | null
          transfer_purpose: string | null
        }
        Insert: {
          agent_id?: number | null
          amount: number
          area_id?: number | null
          box_id?: number | null
          branch_commission?: number
          branch_id?: number | null
          canceled?: boolean
          client_ref?: string | null
          commission_currency_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: string | null
          currency_id: number
          customer_id?: number | null
          delivered?: boolean
          delivered_at?: string | null
          delivered_by?: string | null
          destination_name?: string | null
          document_number?: number | null
          export_agent_id?: number | null
          export_notes?: string | null
          exported_at?: string | null
          exported_by?: string | null
          governorate_id?: number | null
          id?: never
          internal_outgoing_id?: number | null
          notes?: string | null
          payment_method?: string
          receiver_id_number?: string | null
          receiver_identity_number?: string | null
          receiver_identity_type?: string | null
          receiver_name: string
          receiver_phone?: string | null
          reference_number?: string | null
          sender_name: string
          sender_phone?: string | null
          source_name?: string | null
          state?: string | null
          the_date?: string
          transfer_number?: number | null
          transfer_purpose?: string | null
        }
        Update: {
          agent_id?: number | null
          amount?: number
          area_id?: number | null
          box_id?: number | null
          branch_commission?: number
          branch_id?: number | null
          canceled?: boolean
          client_ref?: string | null
          commission_currency_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: string | null
          currency_id?: number
          customer_id?: number | null
          delivered?: boolean
          delivered_at?: string | null
          delivered_by?: string | null
          destination_name?: string | null
          document_number?: number | null
          export_agent_id?: number | null
          export_notes?: string | null
          exported_at?: string | null
          exported_by?: string | null
          governorate_id?: number | null
          id?: never
          internal_outgoing_id?: number | null
          notes?: string | null
          payment_method?: string
          receiver_id_number?: string | null
          receiver_identity_number?: string | null
          receiver_identity_type?: string | null
          receiver_name?: string
          receiver_phone?: string | null
          reference_number?: string | null
          sender_name?: string
          sender_phone?: string | null
          source_name?: string | null
          state?: string | null
          the_date?: string
          transfer_number?: number | null
          transfer_purpose?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incoming_transfers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_transfers_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_transfers_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_transfers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_transfers_commission_currency_id_fkey"
            columns: ["commission_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_transfers_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_transfers_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_transfers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_transfers_export_agent_id_fkey"
            columns: ["export_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_transfers_governorate_id_fkey"
            columns: ["governorate_id"]
            isOneToOne: false
            referencedRelation: "governorates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_transfers_internal_outgoing_id_fkey"
            columns: ["internal_outgoing_id"]
            isOneToOne: false
            referencedRelation: "outgoing_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      installation_license: {
        Row: {
          activated: boolean
          activated_at: string | null
          activated_by: string | null
          company_name: string
          id: string
          licensed_until: string | null
          singleton: number
          trial_ends_at: string
          trial_started_at: string
        }
        Insert: {
          activated?: boolean
          activated_at?: string | null
          activated_by?: string | null
          company_name: string
          id?: string
          licensed_until?: string | null
          singleton?: number
          trial_ends_at?: string
          trial_started_at?: string
        }
        Update: {
          activated?: boolean
          activated_at?: string | null
          activated_by?: string | null
          company_name?: string
          id?: string
          licensed_until?: string | null
          singleton?: number
          trial_ends_at?: string
          trial_started_at?: string
        }
        Relationships: []
      }
      inventory_postings: {
        Row: {
          difference_account_id: number
          entry_id: number
          id: number
          inventory_id: number
          posted_at: string
          posted_by: string
          reversal_entry_id: number | null
          reversed_at: string | null
          reversed_by: string | null
        }
        Insert: {
          difference_account_id: number
          entry_id: number
          id?: number
          inventory_id: number
          posted_at?: string
          posted_by?: string
          reversal_entry_id?: number | null
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Update: {
          difference_account_id?: number
          entry_id?: number
          id?: number
          inventory_id?: number
          posted_at?: string
          posted_by?: string
          reversal_entry_id?: number | null
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_postings_difference_account_id_fkey"
            columns: ["difference_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_postings_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_postings_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "funds_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_postings_reversal_entry_id_fkey"
            columns: ["reversal_entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_vouchers: {
        Row: {
          amount: number
          branch_id: number | null
          client_ref: string | null
          created_at: string
          created_by: string | null
          credit_account_id: number
          currency_id: number
          debit_account_id: number
          document_number: number | null
          entry_id: number | null
          id: number
          notes: string | null
          the_date: string
          the_number: number | null
        }
        Insert: {
          amount: number
          branch_id?: number | null
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          credit_account_id: number
          currency_id: number
          debit_account_id: number
          document_number?: number | null
          entry_id?: number | null
          id?: never
          notes?: string | null
          the_date?: string
          the_number?: number | null
        }
        Update: {
          amount?: number
          branch_id?: number | null
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          credit_account_id?: number
          currency_id?: number
          debit_account_id?: number
          document_number?: number | null
          entry_id?: number | null
          id?: never
          notes?: string | null
          the_date?: string
          the_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_vouchers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_vouchers_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_vouchers_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_vouchers_debit_account_id_fkey"
            columns: ["debit_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_vouchers_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      loop_entries: {
        Row: {
          active: boolean
          branch_id: number | null
          created_at: string
          created_by: string | null
          id: number
          notes: string | null
          the_number: number | null
          title: string
        }
        Insert: {
          active?: boolean
          branch_id?: number | null
          created_at?: string
          created_by?: string | null
          id?: never
          notes?: string | null
          the_number?: number | null
          title: string
        }
        Update: {
          active?: boolean
          branch_id?: number | null
          created_at?: string
          created_by?: string | null
          id?: never
          notes?: string | null
          the_number?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "loop_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      loop_entries_details: {
        Row: {
          account_id: number | null
          amount: number
          currency_id: number
          id: number
          loop_id: number
          notes: string | null
          side: string
        }
        Insert: {
          account_id?: number | null
          amount: number
          currency_id: number
          id?: never
          loop_id: number
          notes?: string | null
          side?: string
        }
        Update: {
          account_id?: number | null
          amount?: number
          currency_id?: number
          id?: never
          loop_id?: number
          notes?: string | null
          side?: string
        }
        Relationships: [
          {
            foreignKeyName: "loop_entries_details_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loop_entries_details_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loop_entries_details_loop_id_fkey"
            columns: ["loop_id"]
            isOneToOne: false
            referencedRelation: "loop_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      loop_entries_runs: {
        Row: {
          created_at: string
          created_by: string | null
          entry_id: number | null
          id: number
          loop_id: number
          run_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_id?: number | null
          id?: never
          loop_id: number
          run_date?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_id?: number | null
          id?: never
          loop_id?: number
          run_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "loop_entries_runs_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loop_entries_runs_loop_id_fkey"
            columns: ["loop_id"]
            isOneToOne: false
            referencedRelation: "loop_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      outgoing_transfers: {
        Row: {
          agent_id: number | null
          amount: number
          area_id: number | null
          box_id: number | null
          branch_commission: number
          branch_id: number | null
          canceled: boolean
          check_id: number | null
          client_ref: string | null
          commission_currency_id: number | null
          country_id: number | null
          created_at: string
          created_by: string | null
          currency_id: number
          customer_id: number | null
          delivered: boolean
          destination_name: string | null
          document_number: number | null
          export_agent_id: number | null
          export_notes: string | null
          exported_at: string | null
          exported_by: string | null
          governorate_id: number | null
          id: number
          is_internal: boolean
          notes: string | null
          payment_method: string
          receiver_identity_number: string | null
          receiver_identity_type: string | null
          receiver_name: string
          receiver_phone: string | null
          reference_number: string | null
          sender_name: string
          sender_phone: string | null
          source_name: string | null
          state: string | null
          the_date: string
          transfer_number: number | null
          transfer_purpose: string | null
        }
        Insert: {
          agent_id?: number | null
          amount: number
          area_id?: number | null
          box_id?: number | null
          branch_commission?: number
          branch_id?: number | null
          canceled?: boolean
          check_id?: number | null
          client_ref?: string | null
          commission_currency_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: string | null
          currency_id: number
          customer_id?: number | null
          delivered?: boolean
          destination_name?: string | null
          document_number?: number | null
          export_agent_id?: number | null
          export_notes?: string | null
          exported_at?: string | null
          exported_by?: string | null
          governorate_id?: number | null
          id?: never
          is_internal?: boolean
          notes?: string | null
          payment_method?: string
          receiver_identity_number?: string | null
          receiver_identity_type?: string | null
          receiver_name: string
          receiver_phone?: string | null
          reference_number?: string | null
          sender_name: string
          sender_phone?: string | null
          source_name?: string | null
          state?: string | null
          the_date?: string
          transfer_number?: number | null
          transfer_purpose?: string | null
        }
        Update: {
          agent_id?: number | null
          amount?: number
          area_id?: number | null
          box_id?: number | null
          branch_commission?: number
          branch_id?: number | null
          canceled?: boolean
          check_id?: number | null
          client_ref?: string | null
          commission_currency_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: string | null
          currency_id?: number
          customer_id?: number | null
          delivered?: boolean
          destination_name?: string | null
          document_number?: number | null
          export_agent_id?: number | null
          export_notes?: string | null
          exported_at?: string | null
          exported_by?: string | null
          governorate_id?: number | null
          id?: never
          is_internal?: boolean
          notes?: string | null
          payment_method?: string
          receiver_identity_number?: string | null
          receiver_identity_type?: string | null
          receiver_name?: string
          receiver_phone?: string | null
          reference_number?: string | null
          sender_name?: string
          sender_phone?: string | null
          source_name?: string | null
          state?: string | null
          the_date?: string
          transfer_number?: number | null
          transfer_purpose?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outgoing_transfers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outgoing_transfers_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outgoing_transfers_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outgoing_transfers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outgoing_transfers_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outgoing_transfers_commission_currency_id_fkey"
            columns: ["commission_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outgoing_transfers_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outgoing_transfers_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outgoing_transfers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outgoing_transfers_export_agent_id_fkey"
            columns: ["export_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outgoing_transfers_governorate_id_fkey"
            columns: ["governorate_id"]
            isOneToOne: false
            referencedRelation: "governorates"
            referencedColumns: ["id"]
          },
        ]
      }
      period_closings: {
        Row: {
          closed_by: string | null
          created_at: string
          entry_id: number | null
          from_date: string
          id: number
          period_type: string
          to_date: string
        }
        Insert: {
          closed_by?: string | null
          created_at?: string
          entry_id?: number | null
          from_date: string
          id?: never
          period_type: string
          to_date: string
        }
        Update: {
          closed_by?: string | null
          created_at?: string
          entry_id?: number | null
          from_date?: string
          id?: never
          period_type?: string
          to_date?: string
        }
        Relationships: []
      }
      platform_owners: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          branch_name: string
          created_at: string
          full_name: string
          id: string
          phone: string
          updated_at: string
          username: string | null
        }
        Insert: {
          branch_name?: string
          created_at?: string
          full_name?: string
          id: string
          phone?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          branch_name?: string
          created_at?: string
          full_name?: string
          id?: string
          phone?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      profiles_probe_x: {
        Row: {
          id: number | null
        }
        Insert: {
          id?: number | null
        }
        Update: {
          id?: number | null
        }
        Relationships: []
      }
      receiver_cards: {
        Row: {
          country_id: number | null
          created_at: string
          created_by: string | null
          full_name: string
          id: number
          identity_number: string | null
          identity_type: string | null
          notes: string | null
          phone_number: string | null
          the_number: number
        }
        Insert: {
          country_id?: number | null
          created_at?: string
          created_by?: string | null
          full_name: string
          id?: number
          identity_number?: string | null
          identity_type?: string | null
          notes?: string | null
          phone_number?: string | null
          the_number: number
        }
        Update: {
          country_id?: number | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: number
          identity_number?: string | null
          identity_type?: string | null
          notes?: string | null
          phone_number?: string | null
          the_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "receiver_cards_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      sell_currencies: {
        Row: {
          account_id: number | null
          amount: number
          box_id: number | null
          branch_id: number | null
          cash_customer_name: string | null
          client_ref: string | null
          commission: number
          created_at: string
          created_by: string | null
          currency_id: number | null
          customer_id: number | null
          customer_phone: string | null
          document_number: number | null
          exchange_amount: number | null
          exchange_currency_id: number | null
          id: number
          notes: string | null
          payment_method: string
          price: number
          the_date: string
          the_number: number | null
        }
        Insert: {
          account_id?: number | null
          amount: number
          box_id?: number | null
          branch_id?: number | null
          cash_customer_name?: string | null
          client_ref?: string | null
          commission?: number
          created_at?: string
          created_by?: string | null
          currency_id?: number | null
          customer_id?: number | null
          customer_phone?: string | null
          document_number?: number | null
          exchange_amount?: number | null
          exchange_currency_id?: number | null
          id?: never
          notes?: string | null
          payment_method?: string
          price: number
          the_date?: string
          the_number?: number | null
        }
        Update: {
          account_id?: number | null
          amount?: number
          box_id?: number | null
          branch_id?: number | null
          cash_customer_name?: string | null
          client_ref?: string | null
          commission?: number
          created_at?: string
          created_by?: string | null
          currency_id?: number | null
          customer_id?: number | null
          customer_phone?: string | null
          document_number?: number | null
          exchange_amount?: number | null
          exchange_currency_id?: number | null
          id?: never
          notes?: string | null
          payment_method?: string
          price?: number
          the_date?: string
          the_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sell_currencies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sell_currencies_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sell_currencies_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sell_currencies_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sell_currencies_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sell_currencies_exchange_currency_id_fkey"
            columns: ["exchange_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_announcements: {
        Row: {
          active: boolean
          body: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          starts_at: string
          title: string
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          starts_at?: string
          title: string
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          starts_at?: string
          title?: string
        }
        Relationships: []
      }
      staff_session_locks: {
        Row: {
          failed_attempts: number
          locked: boolean
          pin_hash: string
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          failed_attempts?: number
          locked?: boolean
          pin_hash: string
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          failed_attempts?: number
          locked?: boolean
          pin_hash?: string
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_work_defaults: {
        Row: {
          allow_buy: boolean
          allow_future_date: boolean
          allow_past_date: boolean
          allow_sell: boolean
          box_id: number | null
          branch_id: number | null
          currency_id: number | null
          enforce_box: boolean
          enforce_currency: boolean
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          allow_buy?: boolean
          allow_future_date?: boolean
          allow_past_date?: boolean
          allow_sell?: boolean
          box_id?: number | null
          branch_id?: number | null
          currency_id?: number | null
          enforce_box?: boolean
          enforce_currency?: boolean
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          allow_buy?: boolean
          allow_future_date?: boolean
          allow_past_date?: boolean
          allow_sell?: boolean
          box_id?: number | null
          branch_id?: number | null
          currency_id?: number | null
          enforce_box?: boolean
          enforce_currency?: boolean
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_work_defaults_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_work_defaults_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_work_defaults_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_work_defaults_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          id: number
          key: string
          owner: string
          scope: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: never
          key: string
          owner: string
          scope: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          id?: never
          key?: string
          owner?: string
          scope?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      transfer_entities: {
        Row: {
          active: boolean
          country_id: number | null
          created_at: string
          created_by: string | null
          entity_name: string
          id: number
          notes: string | null
          phone_number: string | null
          the_number: number
        }
        Insert: {
          active?: boolean
          country_id?: number | null
          created_at?: string
          created_by?: string | null
          entity_name: string
          id?: number
          notes?: string | null
          phone_number?: string | null
          the_number: number
        }
        Update: {
          active?: boolean
          country_id?: number | null
          created_at?: string
          created_by?: string | null
          entity_name?: string
          id?: number
          notes?: string | null
          phone_number?: string | null
          the_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "transfer_entities_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_purposes: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: number
          purpose_name: string
          the_number: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: number
          purpose_name: string
          the_number: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: number
          purpose_name?: string
          the_number?: number
        }
        Relationships: []
      }
      transfer_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: number
          payload: Json | null
          reason: string
          request_type: string
          requested_by: string | null
          status: string
          transfer_id: number
          transfer_kind: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: never
          payload?: Json | null
          reason: string
          request_type: string
          requested_by?: string | null
          status?: string
          transfer_id: number
          transfer_kind: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: never
          payload?: Json | null
          reason?: string
          request_type?: string
          requested_by?: string | null
          status?: string
          transfer_id?: number
          transfer_kind?: string
        }
        Relationships: []
      }
      user_group_members: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: number
          id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: number
          id?: number
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: number
          id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "user_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_groups: {
        Row: {
          allowed_screens: string[]
          created_at: string
          created_by: string | null
          group_name: string
          id: number
          notes: string | null
          the_number: number
        }
        Insert: {
          allowed_screens?: string[]
          created_at?: string
          created_by?: string | null
          group_name: string
          id?: number
          notes?: string | null
          the_number: number
        }
        Update: {
          allowed_screens?: string[]
          created_at?: string
          created_by?: string | null
          group_name?: string
          id?: number
          notes?: string | null
          the_number?: number
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
      user_screen_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_print: boolean
          can_update: boolean
          can_view: boolean
          created_at: string
          extra_actions: Json
          id: number
          screen_path: string
          user_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_print?: boolean
          can_update?: boolean
          can_view?: boolean
          created_at?: string
          extra_actions?: Json
          id?: never
          screen_path: string
          user_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_print?: boolean
          can_update?: boolean
          can_view?: boolean
          created_at?: string
          extra_actions?: Json
          id?: never
          screen_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_screen_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_bot_settings: {
        Row: {
          auto_ack: boolean
          customer_kinds: string[]
          customers_enabled: boolean
          enabled: boolean
          exchangers_enabled: boolean
          id: number
          owners_enabled: boolean
          paused_text: string
          read_images: boolean
          reply_unregistered: boolean
          unregistered_text: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_ack?: boolean
          customer_kinds?: string[]
          customers_enabled?: boolean
          enabled?: boolean
          exchangers_enabled?: boolean
          id?: number
          owners_enabled?: boolean
          paused_text?: string
          read_images?: boolean
          reply_unregistered?: boolean
          unregistered_text?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_ack?: boolean
          customer_kinds?: string[]
          customers_enabled?: boolean
          enabled?: boolean
          exchangers_enabled?: boolean
          id?: number
          owners_enabled?: boolean
          paused_text?: string
          read_images?: boolean
          reply_unregistered?: boolean
          unregistered_text?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      wa_contacts: {
        Row: {
          active: boolean
          agent_id: number | null
          created_at: string
          created_by: string | null
          customer_id: number | null
          display_name: string
          id: number
          notify_kinds: string[]
          phone: string
          role: string
        }
        Insert: {
          active?: boolean
          agent_id?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: number | null
          display_name?: string
          id?: number
          notify_kinds?: string[]
          phone: string
          role: string
        }
        Update: {
          active?: boolean
          agent_id?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: number | null
          display_name?: string
          id?: number
          notify_kinds?: string[]
          phone?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_contacts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_items: {
        Row: {
          amount: number | null
          commission: number | null
          contact_id: number | null
          created_at: string
          currency: string | null
          data: Json
          decided_at: string | null
          decided_by: string | null
          decided_via: string | null
          duplicate_note: string | null
          id: number
          inbound_message_id: string
          kind: string
          posted_at: string | null
          posted_by: string | null
          posted_id: number | null
          posted_table: string | null
          source_role: string
          status: string
          summary: string
          transfer_number: string | null
        }
        Insert: {
          amount?: number | null
          commission?: number | null
          contact_id?: number | null
          created_at?: string
          currency?: string | null
          data?: Json
          decided_at?: string | null
          decided_by?: string | null
          decided_via?: string | null
          duplicate_note?: string | null
          id?: number
          inbound_message_id: string
          kind: string
          posted_at?: string | null
          posted_by?: string | null
          posted_id?: number | null
          posted_table?: string | null
          source_role: string
          status?: string
          summary?: string
          transfer_number?: string | null
        }
        Update: {
          amount?: number | null
          commission?: number | null
          contact_id?: number | null
          created_at?: string
          currency?: string | null
          data?: Json
          decided_at?: string | null
          decided_by?: string | null
          decided_via?: string | null
          duplicate_note?: string | null
          id?: number
          inbound_message_id?: string
          kind?: string
          posted_at?: string | null
          posted_by?: string | null
          posted_id?: number | null
          posted_table?: string | null
          source_role?: string
          status?: string
          summary?: string
          transfer_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_items_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "wa_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_message_statuses: {
        Row: {
          errors: Json | null
          id: number
          provider_ts: string | null
          recipient: string | null
          status: string
          wa_message_id: string
        }
        Insert: {
          errors?: Json | null
          id?: number
          provider_ts?: string | null
          recipient?: string | null
          status: string
          wa_message_id: string
        }
        Update: {
          errors?: Json | null
          id?: number
          provider_ts?: string | null
          recipient?: string | null
          status?: string
          wa_message_id?: string
        }
        Relationships: []
      }
      wa_messages: {
        Row: {
          body: string
          contact_id: number | null
          created_at: string
          direction: string
          id: number
          media_id: string | null
          msg_type: string
          phone: string
          provider_ts: string | null
          reply_key: string | null
          send_error: string | null
          send_state: string | null
          wa_message_id: string | null
        }
        Insert: {
          body?: string
          contact_id?: number | null
          created_at?: string
          direction: string
          id?: number
          media_id?: string | null
          msg_type?: string
          phone: string
          provider_ts?: string | null
          reply_key?: string | null
          send_error?: string | null
          send_state?: string | null
          wa_message_id?: string | null
        }
        Update: {
          body?: string
          contact_id?: number | null
          created_at?: string
          direction?: string
          id?: number
          media_id?: string | null
          msg_type?: string
          phone?: string
          provider_ts?: string | null
          reply_key?: string | null
          send_error?: string | null
          send_state?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "wa_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_webhook_events: {
        Row: {
          attempts: number
          delivery_id: string
          event: string
          id: number
          next_attempt_at: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
        }
        Insert: {
          attempts?: number
          delivery_id: string
          event: string
          id?: number
          next_attempt_at?: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          attempts?: number
          delivery_id?: string
          event?: string
          id?: number
          next_attempt_at?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          amount: number
          created_at: string
          currency_id: number
          customer_id: number
          decided_at: string | null
          decided_by: string | null
          id: number
          reason: string | null
          requested_by: string | null
          response: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency_id: number
          customer_id: number
          decided_at?: string | null
          decided_by?: string | null
          id?: never
          reason?: string | null
          requested_by?: string | null
          response?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency_id?: number
          customer_id?: number
          decided_at?: string | null
          decided_by?: string | null
          id?: never
          reason?: string | null
          requested_by?: string | null
          response?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      zz_probe: {
        Row: {
          id: number | null
        }
        Insert: {
          id?: number | null
        }
        Update: {
          id?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aden_date: { Args: { ts: string }; Returns: string }
      apply_activation_code: { Args: { p_code: string }; Returns: undefined }
      box_day_summary: {
        Args: { p_date: string }
        Returns: {
          box_id: number
          closing: number
          currency_id: number
          opening: number
          payments: number
          receipts: number
        }[]
      }
      can_access_transfer_evidence: {
        Args: { p_action: string; p_path: string }
        Returns: boolean
      }
      close_period: {
        Args: { p_from: string; p_to: string; p_type: string }
        Returns: number
      }
      create_balanced_entry: {
        Args: {
          p_branch_id: number
          p_details: Json
          p_entry_number: number
          p_notes: string
          p_the_date: string
        }
        Returns: number
      }
      create_multi_cash_voucher: {
        Args: {
          p_batch: string
          p_box: number
          p_customer: number
          p_date: string
          p_lines: Json
          p_name: string
          p_notes: string
          p_type: string
        }
        Returns: number
      }
      daily_operations_report: {
        Args: { p_branch?: number; p_date: string }
        Returns: Json
      }
      decide_transfer_request: {
        Args: { p_approve: boolean; p_id: number }
        Returns: undefined
      }
      decide_withdrawal_request: {
        Args: { p_approve: boolean; p_id: number; p_response?: string }
        Returns: undefined
      }
      delete_cash_voucher: { Args: { p_id: number }; Returns: undefined }
      delete_funds_inventory: { Args: { p_id: number }; Returns: undefined }
      delete_outgoing_transfer: { Args: { p_id: number }; Returns: undefined }
      document_scope: {
        Args: { p_row: Json; p_table: string }
        Returns: string
      }
      export_document_numbering: { Args: never; Returns: Json }
      financial_setting_account: {
        Args: { p_branch: number; p_key: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_screen_permission: {
        Args: { p_action: string; p_screen: string }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_exchange_staff: { Args: never; Returns: boolean }
      is_platform_owner: { Args: never; Returns: boolean }
      issue_activation_code: { Args: { p_until?: string }; Returns: Json }
      license_status: { Args: never; Returns: Json }
      license_writes_allowed: { Args: never; Returns: boolean }
      link_wa_item_transfer: {
        Args: { p_item: number; p_table: string; p_transfer: number }
        Returns: undefined
      }
      lock_staff_session: { Args: never; Returns: undefined }
      management_alerts: { Args: { p_date: string }; Returns: Json }
      next_account_number: { Args: { p_father: number }; Returns: number }
      post_box: {
        Args: {
          p_amount: number
          p_box: number
          p_currency: number
          p_notes: string
          p_src: string
          p_src_id: number
          p_type: string
        }
        Returns: undefined
      }
      post_inventory_difference: { Args: { p_id: number }; Returns: number }
      require_staff_session: { Args: never; Returns: undefined }
      reverse_inventory_difference: { Args: { p_id: number }; Returns: number }
      revoke_activation_code: { Args: { p_id: string }; Returns: undefined }
      save_funds_inventory: {
        Args: {
          p_box: number
          p_date: string
          p_id: number
          p_lines: Json
          p_notes: string
        }
        Returns: number
      }
      set_staff_session_pin: { Args: { p_pin: string }; Returns: undefined }
      staff_active: { Args: never; Returns: boolean }
      staff_can_read: { Args: { p_screens: string[] }; Returns: boolean }
      staff_mfa_satisfied: { Args: never; Returns: boolean }
      staff_session_identifier: { Args: never; Returns: string }
      staff_session_status: { Args: never; Returns: Json }
      staff_session_unlocked: { Args: never; Returns: boolean }
      staff_trade_allowed: { Args: { p_kind: string }; Returns: boolean }
      unlock_staff_session: { Args: { p_pin: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "manager" | "teller" | "accountant"
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
      app_role: ["admin", "manager", "teller", "accountant"],
    },
  },
} as const

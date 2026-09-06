/**
 * Tipos de la base de datos.
 * Se mantienen a mano y en paralelo a /supabase/migrations. Cuando el proyecto de
 * Supabase esté creado, se regeneran con:
 *   npx supabase gen types typescript --project-id <id> > src/lib/types/database.ts
 */

export type ContentStatusRow = "draft" | "published" | "archived";
export type SubscriptionStatusRow = "active" | "past_due" | "canceled" | "expired";
export type PaymentTypeRow = "entry" | "recurring";
export type CommissionStatusRow = "pending" | "approved" | "paid" | "rejected";

export type ProfileRow = {
  id: string;
  email: string;
  trial_started_at: string | null;
  referred_by: string | null;
  external_customer_id: string | null;
  signup_ip: string | null;
  is_admin: boolean;
  deleted_at: string | null;
  created_at: string;
}

export type SubscriptionRow = {
  id: string;
  user_id: string;
  status: SubscriptionStatusRow;
  current_period_end: string | null;
  past_due_since: string | null;
  external_subscription_id: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentRow = {
  id: string;
  user_id: string;
  type: PaymentTypeRow;
  amount_cents: number;
  currency: string;
  external_payment_id: string;
  paid_at: string;
  created_at: string;
}

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  position: number;
  status: ContentStatusRow;
  created_at: string;
}

export type CourseRow = {
  id: string;
  category_id: string;
  owner_id: string | null;
  title: string;
  slug: string;
  description: string | null;
  cover_url: string | null;
  status: ContentStatusRow;
  position: number;
  published_at: string | null;
  created_at: string;
}

export type ModuleRow = {
  id: string;
  course_id: string;
  title: string;
  position: number;
  created_at: string;
}

export type LessonRow = {
  id: string;
  module_id: string;
  title: string;
  position: number;
  video_provider: string;
  video_id: string | null;
  duration_seconds: number | null;
  is_published: boolean;
  created_at: string;
}

export type BookRow = {
  id: string;
  title: string;
  author: string | null;
  slug: string;
  description: string | null;
  cover_url: string | null;
  file_provider: string;
  file_path: string;
  page_count: number;
  is_downloadable: boolean;
  status: ContentStatusRow;
  position: number;
  published_at: string | null;
  created_at: string;
}

export type LessonProgressRow = {
  user_id: string;
  lesson_id: string;
  last_position_seconds: number;
  completed_at: string | null;
  updated_at: string;
  created_at: string;
}

export type BookProgressRow = {
  user_id: string;
  book_id: string;
  last_page: number;
  completed_at: string | null;
  updated_at: string;
  created_at: string;
}

export type UserDeviceRow = {
  id: string;
  user_id: string;
  fingerprint: string;
  user_agent: string | null;
  last_seen_at: string;
  released_at: string | null;
  created_at: string;
}

export type AffiliateProfileRow = {
  user_id: string;
  code: string;
  activated_at: string;
  created_at: string;
}

export type CommissionRow = {
  id: string;
  affiliate_user_id: string;
  referred_user_id: string;
  payment_id: string;
  amount_cents: number;
  status: CommissionStatusRow;
  created_at: string;
}

export type AppSettingRow = {
  key: string;
  value: unknown;
  updated_at: string;
  created_at: string;
}

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  diff: unknown;
  created_at: string;
}

export type WebhookEventRow = {
  id: string;
  external_event_id: string;
  payload: unknown;
  processed_at: string | null;
  error: string | null;
  created_at: string;
}

export type RateLimitEventRow = {
  bucket: string;
  actor: string;
  created_at: string;
}

/** Los campos con valor por defecto en SQL son opcionales al insertar. */
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Pick<ProfileRow, "id" | "email"> & Partial<ProfileRow>>;
      subscriptions: Table<
        SubscriptionRow,
        Pick<SubscriptionRow, "user_id" | "status"> & Partial<SubscriptionRow>
      >;
      payments: Table<
        PaymentRow,
        Pick<PaymentRow, "user_id" | "type" | "amount_cents" | "external_payment_id" | "paid_at"> &
          Partial<PaymentRow>
      >;
      categories: Table<CategoryRow, Pick<CategoryRow, "name" | "slug"> & Partial<CategoryRow>>;
      courses: Table<
        CourseRow,
        Pick<CourseRow, "category_id" | "title" | "slug"> & Partial<CourseRow>
      >;
      modules: Table<ModuleRow, Pick<ModuleRow, "course_id" | "title"> & Partial<ModuleRow>>;
      lessons: Table<LessonRow, Pick<LessonRow, "module_id" | "title"> & Partial<LessonRow>>;
      books: Table<
        BookRow,
        Pick<BookRow, "title" | "slug" | "file_path" | "page_count"> & Partial<BookRow>
      >;
      lesson_progress: Table<
        LessonProgressRow,
        Pick<LessonProgressRow, "user_id" | "lesson_id"> & Partial<LessonProgressRow>
      >;
      book_progress: Table<
        BookProgressRow,
        Pick<BookProgressRow, "user_id" | "book_id"> & Partial<BookProgressRow>
      >;
      user_devices: Table<
        UserDeviceRow,
        Pick<UserDeviceRow, "user_id" | "fingerprint"> & Partial<UserDeviceRow>
      >;
      affiliate_profiles: Table<
        AffiliateProfileRow,
        Pick<AffiliateProfileRow, "user_id" | "code"> & Partial<AffiliateProfileRow>
      >;
      commissions: Table<
        CommissionRow,
        Pick<
          CommissionRow,
          "affiliate_user_id" | "referred_user_id" | "payment_id" | "amount_cents"
        > &
          Partial<CommissionRow>
      >;
      app_settings: Table<AppSettingRow, Pick<AppSettingRow, "key" | "value"> & Partial<AppSettingRow>>;
      audit_log: Table<
        AuditLogRow,
        Pick<AuditLogRow, "action" | "entity_type"> & Partial<AuditLogRow>
      >;
      webhook_events: Table<
        WebhookEventRow,
        Pick<WebhookEventRow, "external_event_id" | "payload"> & Partial<WebhookEventRow>
      >;
      rate_limit_events: Table<
        RateLimitEventRow,
        Pick<RateLimitEventRow, "bucket" | "actor"> & Partial<RateLimitEventRow>
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      has_content_access: { Args: { uid: string }; Returns: boolean };
      access_expires_at: { Args: { uid: string }; Returns: string };
      resolve_referral_code: { Args: { referral_code: string }; Returns: string | null };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      get_setting_int: { Args: { setting_key: string }; Returns: number };
      has_course_progress: { Args: { course: string; uid: string }; Returns: boolean };
      has_book_progress: { Args: { book: string; uid: string }; Returns: boolean };
      reorder_entity: { Args: { entity: string; ordered_ids: string[] }; Returns: undefined };
      set_content_status: {
        Args: { entity: string; target_id: string; new_status: string };
        Returns: undefined;
      };
      check_rate_limit: {
        Args: { bucket: string; actor: string; max_events: number; window_seconds: number };
        Returns: boolean;
      };
      search_catalog: {
        Args: { query: string; max_results?: number };
        Returns: unknown;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

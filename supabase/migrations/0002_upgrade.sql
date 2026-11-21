-- SafeChat AI — Upgrade migration
-- Adds: conversation_safety_status, user_scam_reports, push_subscriptions,
--       notification_preferences, notifications tables + RLS policies

-- ============ conversation_safety_status ============
-- Stores user-confirmed classification separately from AI analysis.
-- Each conversation member can mark a conversation as scam or safe.
create table if not exists public.conversation_safety_status (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('scam','safe')),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(conversation_id, user_id)
);
create index if not exists css_conv_idx on public.conversation_safety_status(conversation_id);
create index if not exists css_user_idx on public.conversation_safety_status(user_id);

-- ============ user_scam_reports ============
-- Tracks when a user reports a conversation as scam (for feedback loop)
create table if not exists public.user_scam_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique(conversation_id, reporter_id)
);
create index if not exists usr_conv_idx on public.user_scam_reports(conversation_id);

-- ============ push_subscriptions ============
-- Stores browser push subscription endpoints and keys for each user/device
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  device_info jsonb default '{}'::jsonb,
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint)
);
create index if not exists ps_user_idx on public.push_subscriptions(user_id);
create index if not exists ps_endpoint_idx on public.push_subscriptions(endpoint);

-- ============ notification_preferences ============
-- Per-user notification settings
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  push_enabled boolean not null default true,
  new_message_notifications boolean not null default true,
  group_message_notifications boolean not null default true,
  security_alert_notifications boolean not null default true,
  sound_enabled boolean not null default true,
  message_preview_enabled boolean not null default false,
  muted_conversations uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- ============ notifications ============
-- In-app notification records (also used to trigger push)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('message','group_message','security_alert','system')),
  title text not null,
  body text,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  data jsonb default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notif_user_idx on public.notifications(user_id, is_read);
create index if not exists notif_created_idx on public.notifications(created_at desc);

-- ============ updated_at triggers ============
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['conversation_safety_status','user_scam_reports','push_subscriptions','notification_preferences','notifications'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ============ ROW LEVEL SECURITY ============
alter table public.conversation_safety_status enable row level security;
alter table public.user_scam_reports enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;

-- conversation_safety_status: members can read, users can write their own
create policy css_select on public.conversation_safety_status for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()) or user_id = auth.uid());
create policy css_insert on public.conversation_safety_status for insert to authenticated
  with check (user_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));
create policy css_update on public.conversation_safety_status for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy css_delete on public.conversation_safety_status for delete to authenticated
  using (user_id = auth.uid());

-- user_scam_reports: reporters can manage own, conversation members can read
create policy usr_select on public.user_scam_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_conversation_member(conversation_id, auth.uid()));
create policy usr_insert on public.user_scam_reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy usr_delete on public.user_scam_reports for delete to authenticated
  using (reporter_id = auth.uid());

-- push_subscriptions: users manage own subscriptions only
create policy ps_select on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());
create policy ps_insert on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());
create policy ps_update on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ps_delete on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- notification_preferences: users manage own preferences only
create policy np_select on public.notification_preferences for select to authenticated
  using (user_id = auth.uid());
create policy np_insert on public.notification_preferences for insert to authenticated
  with check (user_id = auth.uid());
create policy np_update on public.notification_preferences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notifications: users read/update own notifications only
create policy notif_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notif_insert on public.notifications for insert to authenticated
  with check (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- Grant permissions
 grant all on public.conversation_safety_status to authenticated;
grant all on public.user_scam_reports to authenticated;
grant all on public.push_subscriptions to authenticated;
grant all on public.notification_preferences to authenticated;
grant all on public.notifications to authenticated;
grant usage on all sequences in schema public to authenticated;

notify pgrst, 'reload schema';

-- SafeChat AI — initial schema
-- Run in Supabase SQL editor or via supabase CLI.

create extension if not exists "pgcrypto";

-- ============ profiles ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text not null,
  avatar_url text,
  bio text default '',
  is_online boolean not null default false,
  last_seen timestamptz not null default now(),
  ai_analysis_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_username_idx on public.profiles(username);

-- ============ friendships (accepted) ============
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, friend_id)
);
create index if not exists friendships_user_idx on public.friendships(user_id);
create index if not exists friendships_friend_idx on public.friendships(friend_id);

-- ============ friend_requests ============
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(from_user, to_user)
);

-- ============ conversations ============
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'direct' check (type in ('direct','group')),
  name text,
  avatar_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ conversation_members ============
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);
create index if not exists cm_user_idx on public.conversation_members(user_id);

-- ============ messages ============
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  content text not null default '',
  type text not null default 'text' check (type in ('text','image','file','link','system')),
  reply_to uuid references public.messages(id) on delete set null,
  is_edited boolean not null default false,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages(conversation_id, created_at);
create index if not exists messages_sender_idx on public.messages(sender_id);

-- ============ message_attachments ============
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  file_name text not null,
  file_type text,
  file_size bigint,
  storage_path text not null,
  created_at timestamptz not null default now()
);
create index if not exists attachments_message_idx on public.message_attachments(message_id);

-- ============ message_reactions ============
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- ============ read_receipts (per-member last read) ============
-- last_read_at lives on conversation_members; this table stores explicit receipts if needed.
create table if not exists public.read_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- ============ typing_presence ============
create table if not exists public.typing_presence (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_typing boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- ============ safety_analyses ============
create table if not exists public.safety_analyses (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null default 'rules' check (source in ('rules','ai')),
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  safety_score integer not null default 100 check (safety_score between 0 and 100),
  risk_level text not null default 'MINIMAL',
  result jsonb not null default '{}'::jsonb,
  analyzed_at timestamptz not null default now()
);
create index if not exists safety_conv_idx on public.safety_analyses(conversation_id, analyzed_at desc);
create index if not exists safety_user_idx on public.safety_analyses(user_id);

-- ============ suspicious_messages (denormalized flags for dashboard) ============
create table if not exists public.suspicious_messages (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null,
  categories text[] not null default '{}',
  flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(message_id)
);
create index if not exists susp_conv_idx on public.suspicious_messages(conversation_id);

-- ============ detected_urls ============
create table if not exists public.detected_urls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  url text not null,
  domain text,
  risk_score integer not null default 0,
  flags text[] not null default '{}',
  reputation text default 'unknown' check (reputation in ('unknown','safe','suspicious','malicious')),
  checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists urls_conv_idx on public.detected_urls(conversation_id);

-- ============ safety_alerts ============
create table if not exists public.safety_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  level text not null default 'MODERATE' check (level in ('LOW','MODERATE','HIGH','CRITICAL')),
  title text not null,
  detail text,
  categories text[] not null default '{}',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists alerts_user_idx on public.safety_alerts(user_id, is_read);

-- ============ blocked_users ============
create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, blocked_id)
);

-- ============ user_feedback ============
create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  analysis_id uuid references public.safety_analyses(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  verdict text not null check (verdict in ('true_positive','false_positive','unclear')),
  note text,
  created_at timestamptz not null default now()
);

-- ============ user_privacy_settings ============
create table if not exists public.user_privacy_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  ai_analysis_enabled boolean not null default true,
  retain_analyses_days integer not null default 90 check (retain_analyses_days between 1 and 3650),
  share_analytics boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ============ updated_at trigger ============
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['profiles','friendships','friend_requests','conversations','messages','safety_analyses'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ============ helper: is conversation member ============
create or replace function public.is_conversation_member(cid uuid, uid uuid)
returns boolean language sql security definer stable as $$
  select exists(select 1 from public.conversation_members where conversation_id = cid and user_id = uid);
$$;

-- ============ auto-create profile on signup ============
create or replace function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text,1,8)),
    coalesce(new.raw_user_meta_data->>'display_name', coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)))
  )
  on conflict (id) do nothing;
  insert into public.user_privacy_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ ROW LEVEL SECURITY ============
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_requests enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_reactions enable row level security;
alter table public.read_receipts enable row level security;
alter table public.typing_presence enable row level security;
alter table public.safety_analyses enable row level security;
alter table public.suspicious_messages enable row level security;
alter table public.detected_urls enable row level security;
alter table public.safety_alerts enable row level security;
alter table public.blocked_users enable row level security;
alter table public.user_feedback enable row level security;
alter table public.user_privacy_settings enable row level security;

-- profiles: readable by all authenticated, writable by owner
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- friendships: members can see their own friendships
create policy friendships_select on public.friendships for select to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());
create policy friendships_insert on public.friendships for insert to authenticated
  with check (user_id = auth.uid() or friend_id = auth.uid());
create policy friendships_delete on public.friendships for delete to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());

-- friend_requests
create policy fr_select on public.friend_requests for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());
create policy fr_insert on public.friend_requests for insert to authenticated
  with check (from_user = auth.uid());
create policy fr_update on public.friend_requests for update to authenticated
  using (from_user = auth.uid() or to_user = auth.uid()) with check (from_user = auth.uid() or to_user = auth.uid());
create policy fr_delete on public.friend_requests for delete to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());

-- conversations: members only
create policy conv_select on public.conversations for select to authenticated
  using (public.is_conversation_member(id, auth.uid()));
create policy conv_insert on public.conversations for insert to authenticated
  with check (auth.uid() is not null);
create policy conv_update on public.conversations for update to authenticated
  using (public.is_conversation_member(id, auth.uid()));

-- conversation_members
create policy cm_select on public.conversation_members for select to authenticated
  using (user_id = auth.uid() or public.is_conversation_member(conversation_id, auth.uid()));
create policy cm_insert on public.conversation_members for insert to authenticated
  with check (user_id = auth.uid() or public.is_conversation_member(conversation_id, auth.uid()));
create policy cm_update on public.conversation_members for update to authenticated
  using (user_id = auth.uid() or public.is_conversation_member(conversation_id, auth.uid()));
create policy cm_delete on public.conversation_members for delete to authenticated
  using (user_id = auth.uid() or public.is_conversation_member(conversation_id, auth.uid()));

-- messages: members can read; members can insert as themselves; sender can update/delete own
create policy msg_select on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));
create policy msg_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));
create policy msg_update on public.messages for update to authenticated
  using (sender_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));
create policy msg_delete on public.messages for delete to authenticated
  using (sender_id = auth.uid());

-- attachments: follow message membership
create policy att_select on public.message_attachments for select to authenticated
  using (exists(select 1 from public.messages m where m.id = message_id and public.is_conversation_member(m.conversation_id, auth.uid())));
create policy att_insert on public.message_attachments for insert to authenticated
  with check (exists(select 1 from public.messages m where m.id = message_id and m.sender_id = auth.uid()));

-- reactions
create policy react_select on public.message_reactions for select to authenticated
  using (exists(select 1 from public.messages m where m.id = message_id and public.is_conversation_member(m.conversation_id, auth.uid())));
create policy react_insert on public.message_reactions for insert to authenticated
  with check (user_id = auth.uid());
create policy react_delete on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());

-- read receipts
create policy rr_select on public.read_receipts for select to authenticated
  using (user_id = auth.uid() or exists(select 1 from public.messages m where m.id = message_id and public.is_conversation_member(m.conversation_id, auth.uid())));
create policy rr_insert on public.read_receipts for insert to authenticated with check (user_id = auth.uid());

-- typing presence
create policy tp_select on public.typing_presence for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));
create policy tp_upsert on public.typing_presence for insert to authenticated with check (user_id = auth.uid());
create policy tp_update on public.typing_presence for update to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));

-- safety tables: members of conversation can read; users manage own alerts/feedback
create policy sa_select on public.safety_analyses for select to authenticated
  using (user_id = auth.uid() or public.is_conversation_member(conversation_id, auth.uid()));
create policy sa_insert on public.safety_analyses for insert to authenticated
  with check (user_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));
create policy sa_delete on public.safety_analyses for delete to authenticated using (user_id = auth.uid());

create policy sm_select on public.suspicious_messages for select to authenticated
  using (user_id = auth.uid() or public.is_conversation_member(conversation_id, auth.uid()));
create policy sm_insert on public.suspicious_messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));

create policy du_select on public.detected_urls for select to authenticated
  using (user_id = auth.uid() or public.is_conversation_member(conversation_id, auth.uid()));
create policy du_insert on public.detected_urls for insert to authenticated
  with check (user_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));

create policy sal_select on public.safety_alerts for select to authenticated using (user_id = auth.uid());
create policy sal_insert on public.safety_alerts for insert to authenticated with check (user_id = auth.uid());
create policy sal_update on public.safety_alerts for update to authenticated using (user_id = auth.uid());
create policy sal_delete on public.safety_alerts for delete to authenticated using (user_id = auth.uid());

create policy bu_select on public.blocked_users for select to authenticated using (user_id = auth.uid());
create policy bu_insert on public.blocked_users for insert to authenticated with check (user_id = auth.uid());
create policy bu_delete on public.blocked_users for delete to authenticated using (user_id = auth.uid());

create policy fb_select on public.user_feedback for select to authenticated using (user_id = auth.uid());
create policy fb_insert on public.user_feedback for insert to authenticated with check (user_id = auth.uid());

create policy ps_select on public.user_privacy_settings for select to authenticated using (user_id = auth.uid());
create policy ps_insert on public.user_privacy_settings for insert to authenticated with check (user_id = auth.uid());
create policy ps_update on public.user_privacy_settings for update to authenticated using (user_id = auth.uid());

-- ============ storage bucket for attachments ============
insert into storage.buckets (id, name, public) values ('chat-files', 'chat-files', false)
on conflict (id) do nothing;

create policy chatfiles_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files');
create policy chatfiles_select on storage.objects for select to authenticated
  using (bucket_id = 'chat-files' and exists(
    select 1 from public.message_attachments a
    join public.messages m on m.id = a.message_id
    where a.storage_path = name and public.is_conversation_member(m.conversation_id, auth.uid())
  ));

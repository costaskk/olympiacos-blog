-- Thrylos Agora Supabase schema
-- Run this once in Supabase SQL Editor.
-- Then run: select public.make_admin_invite();
-- Copy the returned token and use it to register the owner/admin account.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext;

-- Profiles are anonymous for normal users: no email, phone, legal name, or ID is stored here.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle citext not null unique,
  display_name text not null,
  avatar_url text,
  bio text not null default '',
  chat_color text not null default '#e31b2f',
  role text not null default 'member' check (role in ('member', 'editor', 'moderator', 'admin')),
  invite_id uuid,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  constraint profiles_handle_format check (handle ~ '^[a-zA-Z0-9_]{3,24}$'),
  constraint profiles_display_name_len check (char_length(display_name) between 1 and 48),
  constraint profiles_bio_len check (char_length(bio) <= 500),
  constraint profiles_chat_color_format check (chat_color ~ '^#[0-9A-Fa-f]{6}$')
);

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists chat_color text not null default '#e31b2f';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_chat_color_format') then
    alter table public.profiles
      add constraint profiles_chat_color_format check (chat_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;


create table if not exists public.invites (
  id uuid primary key default extensions.gen_random_uuid(),
  token_hash text not null unique,
  invite_role text not null default 'member' check (invite_role in ('member', 'editor', 'moderator', 'admin')),
  created_by uuid references public.profiles(id) on delete set null,
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days'
);

create table if not exists public.site_settings (
  key text primary key,
  value text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint site_settings_key_len check (char_length(key) between 1 and 80),
  constraint site_settings_value_len check (char_length(value) <= 1200)
);

insert into public.site_settings (key, value)
values
  ('site_title', 'Thrylos Agora'),
  ('tagline', 'Anonymous. Invite-only. Red-white agora.'),
  ('header_tagline', 'Independent red-white community'),
  ('gate_heading', 'A modern private red-white blog for members only.'),
  ('gate_intro', 'Post matchday reactions, transfer thoughts, images, YouTube links, and news. Join the live general chat, private/group rooms, and voice room without giving an email.'),
  ('feed_eyebrow', 'ΘΡΥΛΟΣ AGORA · PRIVATE BOARD'),
  ('feed_heading', 'Red-white matchday pulse, news and member posts.'),
  ('feed_intro', 'A modern members-only space for clean posts, images, YouTube clips, transfer talk, match reactions and private community chat.'),
  ('community_title', 'Clean red-white community'),
  ('community_text', 'Use the feed for member posts and the floating chat for general talk, private messages and group rooms.'),
  ('footer_text', 'Independent red-white fan project. Add only brand assets you are allowed to use in public/brand/ or from the admin settings page.'),
  ('logo_url', ''),
  ('hero_url', '')
on conflict (key) do nothing;

alter table public.invites add column if not exists invite_role text not null default 'member';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invites_invite_role_check'
  ) then
    alter table public.invites
      add constraint invites_invite_role_check check (invite_role in ('member', 'editor', 'moderator', 'admin'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_invite_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_invite_id_fkey foreign key (invite_id) references public.invites(id) on delete set null;
  end if;
end $$;


-- v5.9 editor/article roles. Safe to run repeatedly on existing databases.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles drop constraint profiles_role_check;
  end if;
  alter table public.profiles add constraint profiles_role_check check (role in ('member', 'editor', 'moderator', 'admin'));

  if exists (select 1 from pg_constraint where conname = 'invites_invite_role_check') then
    alter table public.invites drop constraint invites_invite_role_check;
  end if;
  alter table public.invites add constraint invites_invite_role_check check (invite_role in ('member', 'editor', 'moderator', 'admin'));
end $$;

create table if not exists public.posts (
  id uuid primary key default extensions.gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'article' check (kind in ('article', 'post', 'news', 'image', 'video')),
  title text,
  category text not null default 'opinion' check (category in ('basketball', 'football', 'erasitexnhs', 'volleyball', 'transfers', 'opinion', 'media')),
  excerpt text,
  status text not null default 'published' check (status in ('draft', 'published')),
  content text not null,
  image_path text,
  video_url text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_title_len check (title is null or char_length(title) between 1 and 180),
  constraint posts_excerpt_len check (excerpt is null or char_length(excerpt) <= 420),
  constraint posts_content_len check (char_length(content) between 1 and 20000),
  constraint posts_source_url_len check (source_url is null or char_length(source_url) <= 600),
  constraint posts_video_url_len check (video_url is null or char_length(video_url) <= 600)
);


alter table public.posts add column if not exists title text;
alter table public.posts add column if not exists category text not null default 'opinion';
alter table public.posts add column if not exists excerpt text;
alter table public.posts add column if not exists status text not null default 'published';
update public.posts set title = left(regexp_replace(content, '\s+', ' ', 'g'), 120) where title is null;


-- Editorial article fields added in v5.9.
alter table public.posts add column if not exists title text;
alter table public.posts add column if not exists excerpt text;
alter table public.posts add column if not exists category text not null default 'basketball';
alter table public.posts add column if not exists status text not null default 'published';

-- Upgrade old kind/category constraints if this database was created by an older version.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'posts_kind_check') then
    alter table public.posts drop constraint posts_kind_check;
  end if;
  alter table public.posts add constraint posts_kind_check check (kind in ('post', 'news', 'image', 'video', 'article'));

  if not exists (select 1 from pg_constraint where conname = 'posts_category_check') then
    alter table public.posts add constraint posts_category_check check (category in ('basketball', 'football', 'erasitexnhs', 'volleyball', 'transfers', 'opinion', 'media'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_status_check') then
    alter table public.posts add constraint posts_status_check check (status in ('draft', 'published'));
  end if;
end $$;

create table if not exists public.comments (
  id uuid primary key default extensions.gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint comments_body_len check (char_length(body) between 1 and 2000)
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.encrypted_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  salt text not null,
  key_version integer not null default 1,
  created_at timestamptz not null default now()
);


create table if not exists public.chat_threads (
  id uuid primary key default extensions.gen_random_uuid(),
  title text,
  is_general boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_threads_title_len check (title is null or char_length(title) <= 80)
);

create unique index if not exists chat_threads_one_general on public.chat_threads (is_general) where is_general;
create index if not exists idx_chat_threads_updated_at on public.chat_threads (updated_at desc);

create table if not exists public.chat_thread_members (
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create index if not exists idx_chat_thread_members_user on public.chat_thread_members (user_id, thread_id);

create table if not exists public.chat_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint chat_messages_body_len check (char_length(body) between 1 and 2000)
);

create index if not exists idx_chat_messages_thread_created on public.chat_messages (thread_id, created_at asc);

insert into public.chat_threads (title, is_general, created_by)
values ('General chat', true, null)
on conflict do nothing;

create index if not exists idx_posts_created_at on public.posts (created_at desc);
create index if not exists idx_comments_post_id_created_at on public.comments (post_id, created_at asc);
create index if not exists idx_messages_created_at on public.encrypted_messages (created_at desc);
create index if not exists idx_invites_created_by on public.invites (created_by, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists posts_touch_updated_at on public.posts;
create trigger posts_touch_updated_at
before update on public.posts
for each row execute function public.touch_updated_at();


drop trigger if exists chat_threads_touch_updated_at on public.chat_threads;
create trigger chat_threads_touch_updated_at
before update on public.chat_threads
for each row execute function public.touch_updated_at();

create or replace function public.bump_chat_thread_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.chat_threads set updated_at = now() where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists chat_messages_bump_thread on public.chat_messages;
create trigger chat_messages_bump_thread
after insert on public.chat_messages
for each row execute function public.bump_chat_thread_updated_at();

create or replace function public.is_staff(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.profiles
    where id = check_user and role in ('admin', 'moderator')
  );
$$;


create or replace function public.can_publish_articles(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = check_user and role in ('admin', 'moderator', 'editor')
  );
$$;

create or replace function public.is_full_admin(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.profiles
    where id = check_user and role = 'admin'
  );
$$;


create or replace function public.publish_article(
  article_title text,
  article_category text,
  article_excerpt text,
  article_content text,
  article_image_path text default null,
  article_video_url text default null,
  article_source_url text default null
)
returns public.posts
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cleaned_category text;
  new_post public.posts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if not public.can_publish_articles(auth.uid()) then
    raise exception 'This account does not have writer access';
  end if;

  if article_title is null or length(trim(article_title)) < 1 then
    raise exception 'Article title is required';
  end if;

  if article_content is null or length(trim(article_content)) < 1 then
    raise exception 'Article body is required';
  end if;

  cleaned_category := coalesce(nullif(trim(article_category), ''), 'opinion');
  if cleaned_category not in ('basketball', 'football', 'erasitexnhs', 'volleyball', 'transfers', 'opinion', 'media') then
    cleaned_category := 'opinion';
  end if;

  insert into public.posts (
    author_id,
    kind,
    title,
    category,
    excerpt,
    status,
    content,
    image_path,
    video_url,
    source_url
  ) values (
    auth.uid(),
    'article',
    trim(article_title),
    cleaned_category,
    nullif(trim(coalesce(article_excerpt, '')), ''),
    'published',
    trim(article_content),
    nullif(trim(coalesce(article_image_path, '')), ''),
    nullif(trim(coalesce(article_video_url, '')), ''),
    nullif(trim(coalesce(article_source_url, '')), '')
  ) returning * into new_post;

  return new_post;
end;
$$;

grant execute on function public.publish_article(text, text, text, text, text, text, text) to authenticated;

-- Backwards-compatible name used by older policies.
create or replace function public.can_publish_articles(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = check_user and role in ('admin', 'moderator', 'editor')
  );
$$;

create or replace function public.is_admin(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select public.is_staff(check_user);
$$;


create or replace function public.is_chat_thread_member(check_thread uuid, check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.chat_threads
    where id = check_thread and is_general = true
  ) or exists (
    select 1 from public.chat_thread_members
    where thread_id = check_thread and user_id = check_user
  );
$$;

create or replace function public.create_chat_thread(thread_title text default null, member_ids uuid[] default array[]::uuid[])
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_thread_id uuid;
  v_title text;
  v_member uuid;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select count(*) into v_count
  from (select distinct unnest(coalesce(member_ids, array[]::uuid[])) as member_id) picked
  join public.profiles p on p.id = picked.member_id
  where picked.member_id <> auth.uid();

  if v_count < 1 then
    raise exception 'Select at least one member';
  end if;

  v_title := nullif(trim(coalesce(thread_title, '')), '');

  insert into public.chat_threads (title, is_general, created_by)
  values (v_title, false, auth.uid())
  returning id into v_thread_id;

  insert into public.chat_thread_members (thread_id, user_id)
  values (v_thread_id, auth.uid())
  on conflict do nothing;

  for v_member in
    select distinct picked.member_id
    from (select unnest(coalesce(member_ids, array[]::uuid[])) as member_id) picked
    join public.profiles p on p.id = picked.member_id
    where picked.member_id <> auth.uid()
  loop
    insert into public.chat_thread_members (thread_id, user_id)
    values (v_thread_id, v_member)
    on conflict do nothing;
  end loop;

  return v_thread_id;
end;
$$;

create or replace function public.create_invite(days_valid integer default 30)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  raw_token text;
  valid_days integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Profile is required before creating invites';
  end if;

  valid_days := greatest(1, least(coalesce(days_valid, 30), 90));
  raw_token := lower(encode(extensions.gen_random_bytes(24), 'hex'));

  insert into public.invites (token_hash, invite_role, created_by, expires_at)
  values (encode(extensions.digest(raw_token, 'sha256'), 'hex'), 'member', auth.uid(), now() + make_interval(days => valid_days));

  return raw_token;
end;
$$;

create or replace function public.accept_invite(raw_token text, chosen_handle text, chosen_display_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_invite public.invites%rowtype;
  v_profile public.profiles%rowtype;
  v_handle text;
  v_display text;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if raw_token is null or length(trim(raw_token)) < 12 then
    raise exception 'Invalid invite token';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    select * into v_profile from public.profiles where id = auth.uid();
    return v_profile;
  end if;

  v_handle := lower(trim(chosen_handle));
  if v_handle !~ '^[a-zA-Z0-9_]{3,24}$' then
    raise exception 'Handle must be 3-24 characters: letters, numbers, underscore only';
  end if;

  v_display := nullif(trim(coalesce(chosen_display_name, '')), '');
  if v_display is null then
    v_display := v_handle;
  end if;

  if char_length(v_display) < 1 or char_length(v_display) > 48 then
    raise exception 'Display name must be 1-48 characters';
  end if;

  v_hash := encode(extensions.digest(trim(raw_token)::text, 'sha256'::text), 'hex');

  select * into v_invite
  from public.invites
  where token_hash = v_hash
    and used_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Invite is invalid, expired, or already used';
  end if;

  -- The invite decides the role. Normal app-created invites are always member invites.
  -- The admin/founder invite is created only from Supabase SQL.
  v_role := coalesce(v_invite.invite_role, 'member');

  insert into public.profiles (id, handle, display_name, role, invite_id)
  values (auth.uid(), v_handle, v_display, v_role, v_invite.id)
  returning * into v_profile;

  update public.invites
  set used_by = auth.uid(), used_at = now()
  where id = v_invite.id;

  return v_profile;
end;
$$;

-- SQL-editor helper for the owner/admin account.
-- Run: select public.make_admin_invite();
-- It returns a one-use admin invite. Use that invite in the app to create your admin account.
create or replace function public.make_admin_invite(days_valid integer default 7)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  raw_token text;
  valid_days integer;
begin
  valid_days := greatest(1, least(coalesce(days_valid, 7), 30));
  raw_token := 'founder-' || lower(encode(extensions.gen_random_bytes(18), 'hex'));

  insert into public.invites (token_hash, invite_role, created_by, expires_at)
  values (encode(extensions.digest(raw_token, 'sha256'), 'hex'), 'admin', null, now() + make_interval(days => valid_days));

  return raw_token;
end;
$$;

-- Backwards-compatible alias from the first version.
create or replace function public.make_founder_invite()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return public.make_admin_invite(7);
end;
$$;

create or replace function public.admin_set_user_role(target_user uuid, new_role text)
returns public.profiles
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles%rowtype;
  admin_count integer;
begin
  if not public.is_full_admin(auth.uid()) then
    raise exception 'Only admins can change roles';
  end if;

  if new_role not in ('member', 'editor', 'moderator', 'admin') then
    raise exception 'Invalid role';
  end if;

  select count(*) into admin_count from public.profiles where role = 'admin';
  if target_user = auth.uid() and new_role <> 'admin' and admin_count <= 1 then
    raise exception 'You cannot demote the only admin account';
  end if;

  update public.profiles
  set role = new_role, last_seen = now()
  where id = target_user
  returning * into v_profile;

  if not found then
    raise exception 'User not found';
  end if;

  return v_profile;
end;
$$;

revoke all on function public.make_admin_invite(integer) from public, anon, authenticated;
revoke all on function public.make_founder_invite() from public, anon, authenticated;
revoke all on function public.create_invite(integer) from public, anon;
revoke all on function public.accept_invite(text, text, text) from public, anon;
revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
revoke all on function public.create_chat_thread(text, uuid[]) from public, anon;
grant execute on function public.create_invite(integer) to authenticated;
grant execute on function public.accept_invite(text, text, text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.can_publish_articles(uuid) to authenticated;
grant execute on function public.can_publish_articles(uuid) to anon, authenticated;
grant execute on function public.create_chat_thread(text, uuid[]) to authenticated;

alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.site_settings enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.encrypted_messages enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_thread_members enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists profiles_select_authenticated on public.profiles;
drop policy if exists profiles_public_select on public.profiles;
create policy profiles_public_select on public.profiles
for select to anon, authenticated
using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Prevent normal users from editing their own role through the browser.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, bio, chat_color, last_seen) on public.profiles to authenticated;

drop policy if exists site_settings_public_select on public.site_settings;
create policy site_settings_public_select on public.site_settings
for select to anon, authenticated
using (true);

drop policy if exists site_settings_admin_insert on public.site_settings;
create policy site_settings_admin_insert on public.site_settings
for insert to authenticated
with check (public.is_full_admin());

drop policy if exists site_settings_admin_update on public.site_settings;
create policy site_settings_admin_update on public.site_settings
for update to authenticated
using (public.is_full_admin())
with check (public.is_full_admin());

drop policy if exists site_settings_admin_delete on public.site_settings;
create policy site_settings_admin_delete on public.site_settings
for delete to authenticated
using (public.is_full_admin());

grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;

drop policy if exists invites_select_own on public.invites;
create policy invites_select_own on public.invites
for select to authenticated
using (created_by = auth.uid() or used_by = auth.uid() or public.is_full_admin());

drop policy if exists posts_select_authenticated on public.posts;
drop policy if exists posts_select_public_published on public.posts;
drop policy if exists posts_public_select_published on public.posts;
create policy posts_public_select_published on public.posts
for select to anon, authenticated
using (status = 'published' or author_id = auth.uid() or public.is_staff());

drop policy if exists posts_insert_self on public.posts;
create policy posts_insert_self on public.posts
for insert to authenticated
with check (author_id = auth.uid() and public.can_publish_articles());

drop policy if exists posts_update_self_or_admin on public.posts;
create policy posts_update_self_or_admin on public.posts
for update to authenticated
using ((author_id = auth.uid() and public.can_publish_articles()) or public.is_staff())
with check ((author_id = auth.uid() and public.can_publish_articles()) or public.is_staff());

drop policy if exists posts_delete_self_or_admin on public.posts;
create policy posts_delete_self_or_admin on public.posts
for delete to authenticated
using (author_id = auth.uid() or public.is_staff());

drop policy if exists comments_select_authenticated on public.comments;
create policy comments_select_authenticated on public.comments
for select to authenticated
using (true);

drop policy if exists comments_insert_self on public.comments;
create policy comments_insert_self on public.comments
for insert to authenticated
with check (author_id = auth.uid());

drop policy if exists comments_delete_self_or_admin on public.comments;
create policy comments_delete_self_or_admin on public.comments
for delete to authenticated
using (author_id = auth.uid() or public.is_staff());

drop policy if exists likes_select_authenticated on public.post_likes;
create policy likes_select_authenticated on public.post_likes
for select to authenticated
using (true);

drop policy if exists likes_insert_self on public.post_likes;
create policy likes_insert_self on public.post_likes
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists likes_delete_self on public.post_likes;
create policy likes_delete_self on public.post_likes
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists messages_select_authenticated on public.encrypted_messages;
create policy messages_select_authenticated on public.encrypted_messages
for select to authenticated
using (true);

drop policy if exists messages_insert_self on public.encrypted_messages;
create policy messages_insert_self on public.encrypted_messages
for insert to authenticated
with check (sender_id = auth.uid());

drop policy if exists messages_delete_self_or_admin on public.encrypted_messages;
create policy messages_delete_self_or_admin on public.encrypted_messages
for delete to authenticated
using (sender_id = auth.uid() or public.is_staff());

-- Modern chat threads: general chat is visible to all authenticated members;
-- private/group chats are visible only to selected members.
drop policy if exists chat_threads_select_allowed on public.chat_threads;
create policy chat_threads_select_allowed on public.chat_threads
for select to authenticated
using (is_general = true or public.is_chat_thread_member(id));

drop policy if exists chat_threads_insert_self on public.chat_threads;
create policy chat_threads_insert_self on public.chat_threads
for insert to authenticated
with check (created_by = auth.uid() and is_general = false);

drop policy if exists chat_threads_update_members_or_staff on public.chat_threads;
create policy chat_threads_update_members_or_staff on public.chat_threads
for update to authenticated
using (public.is_chat_thread_member(id) or public.is_staff())
with check (public.is_chat_thread_member(id) or public.is_staff());

drop policy if exists chat_thread_members_select_allowed on public.chat_thread_members;
create policy chat_thread_members_select_allowed on public.chat_thread_members
for select to authenticated
using (public.is_chat_thread_member(thread_id));

drop policy if exists chat_thread_members_insert_thread_creator on public.chat_thread_members;
create policy chat_thread_members_insert_thread_creator on public.chat_thread_members
for insert to authenticated
with check (exists (select 1 from public.chat_threads t where t.id = thread_id and t.created_by = auth.uid()));

drop policy if exists chat_messages_select_allowed on public.chat_messages;
create policy chat_messages_select_allowed on public.chat_messages
for select to authenticated
using (public.is_chat_thread_member(thread_id));

drop policy if exists chat_messages_insert_allowed on public.chat_messages;
create policy chat_messages_insert_allowed on public.chat_messages
for insert to authenticated
with check (sender_id = auth.uid() and public.is_chat_thread_member(thread_id));

drop policy if exists chat_messages_delete_self_or_staff on public.chat_messages;
create policy chat_messages_delete_self_or_staff on public.chat_messages
for delete to authenticated
using (sender_id = auth.uid() or public.is_staff());


grant select on public.chat_threads to authenticated;
grant select on public.chat_thread_members to authenticated;
grant select, insert, delete on public.chat_messages to authenticated;

-- Make Realtime DELETE events include the old message id/thread id so every open chat removes deleted messages instantly.
alter table public.chat_messages replica identity full;
alter table public.comments replica identity full;
alter table public.posts replica identity full;

-- Realtime support for live feed, comments and the floating group messenger.
-- Supabase Broadcast works without this, but Postgres changes need the tables in supabase_realtime.
do $$
begin
  begin
    alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object or undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.posts;
  exception when duplicate_object or undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.comments;
  exception when duplicate_object or undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.encrypted_messages;
  exception when duplicate_object or undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.chat_threads;
  exception when duplicate_object or undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.chat_thread_members;
  exception when duplicate_object or undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.chat_messages;
  exception when duplicate_object or undefined_object then null;
  end;
end $$;

-- Public image bucket for blog images. Supabase Storage handles the actual files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-images',
  'post-images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists post_images_public_read on storage.objects;
create policy post_images_public_read on storage.objects
for select
using (bucket_id = 'post-images');

drop policy if exists post_images_authenticated_upload on storage.objects;
create policy post_images_authenticated_upload on storage.objects
for insert to authenticated
with check (bucket_id = 'post-images');

drop policy if exists post_images_owner_update on storage.objects;
create policy post_images_owner_update on storage.objects
for update to authenticated
using (bucket_id = 'post-images' and owner = auth.uid())
with check (bucket_id = 'post-images' and owner = auth.uid());

drop policy if exists post_images_owner_delete on storage.objects;
create policy post_images_owner_delete on storage.objects
for delete to authenticated
using (bucket_id = 'post-images' and owner = auth.uid());


insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-images',
  'profile-images',
  true,
  3145728,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_images_public_read on storage.objects;
create policy profile_images_public_read on storage.objects
for select
using (bucket_id = 'profile-images');

drop policy if exists profile_images_owner_upload on storage.objects;
create policy profile_images_owner_upload on storage.objects
for insert to authenticated
with check (bucket_id = 'profile-images' and owner = auth.uid());

drop policy if exists profile_images_owner_update on storage.objects;
create policy profile_images_owner_update on storage.objects
for update to authenticated
using (bucket_id = 'profile-images' and owner = auth.uid())
with check (bucket_id = 'profile-images' and owner = auth.uid());

drop policy if exists profile_images_owner_delete on storage.objects;
create policy profile_images_owner_delete on storage.objects
for delete to authenticated
using (bucket_id = 'profile-images' and owner = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-assets',
  'site-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists site_assets_public_read on storage.objects;
create policy site_assets_public_read on storage.objects
for select
using (bucket_id = 'site-assets');

drop policy if exists site_assets_admin_upload on storage.objects;
create policy site_assets_admin_upload on storage.objects
for insert to authenticated
with check (bucket_id = 'site-assets' and public.is_full_admin());

drop policy if exists site_assets_admin_update on storage.objects;
create policy site_assets_admin_update on storage.objects
for update to authenticated
using (bucket_id = 'site-assets' and public.is_full_admin())
with check (bucket_id = 'site-assets' and public.is_full_admin());

drop policy if exists site_assets_admin_delete on storage.objects;
create policy site_assets_admin_delete on storage.objects
for delete to authenticated
using (bucket_id = 'site-assets' and public.is_full_admin());


-- v5.9 editorial upgrades: make old projects accept editor role and article fields.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles drop constraint profiles_role_check;
  end if;
  alter table public.profiles add constraint profiles_role_check check (role in ('member', 'editor', 'moderator', 'admin'));
exception when duplicate_object then null;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'invites_invite_role_check') then
    alter table public.invites drop constraint invites_invite_role_check;
  end if;
  alter table public.invites add constraint invites_invite_role_check check (invite_role in ('member', 'editor', 'moderator', 'admin'));
exception when duplicate_object then null;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'posts_kind_check') then
    alter table public.posts drop constraint posts_kind_check;
  end if;
  alter table public.posts add constraint posts_kind_check check (kind in ('article', 'post', 'news', 'image', 'video'));
exception when duplicate_object then null;
end $$;

alter table public.posts add column if not exists title text;
alter table public.posts add column if not exists category text not null default 'opinion';
alter table public.posts add column if not exists excerpt text;
alter table public.posts add column if not exists status text not null default 'published';

update public.posts set title = left(regexp_replace(content, '\s+', ' ', 'g'), 120) where title is null;
update public.posts set category = 'opinion' where category is null;
update public.posts set status = 'published' where status is null;


do $$
begin
  if exists (select 1 from pg_constraint where conname = 'posts_category_check') then
    alter table public.posts drop constraint posts_category_check;
  end if;
  alter table public.posts add constraint posts_category_check check (category in ('basketball', 'football', 'erasitexnhs', 'volleyball', 'transfers', 'opinion', 'media'));
exception when duplicate_object then null;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'posts_status_check') then
    alter table public.posts drop constraint posts_status_check;
  end if;
  alter table public.posts add constraint posts_status_check check (status in ('draft', 'published'));
exception when duplicate_object then null;
end $$;

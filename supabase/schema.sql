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
  role text not null default 'member' check (role in ('member', 'moderator', 'admin')),
  invite_id uuid,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  constraint profiles_handle_format check (handle ~ '^[a-zA-Z0-9_]{3,24}$'),
  constraint profiles_display_name_len check (char_length(display_name) between 1 and 48),
  constraint profiles_bio_len check (char_length(bio) <= 500)
);

create table if not exists public.invites (
  id uuid primary key default extensions.gen_random_uuid(),
  token_hash text not null unique,
  invite_role text not null default 'member' check (invite_role in ('member', 'moderator', 'admin')),
  created_by uuid references public.profiles(id) on delete set null,
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days'
);

alter table public.invites add column if not exists invite_role text not null default 'member';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invites_invite_role_check'
  ) then
    alter table public.invites
      add constraint invites_invite_role_check check (invite_role in ('member', 'moderator', 'admin'));
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

create table if not exists public.posts (
  id uuid primary key default extensions.gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'post' check (kind in ('post', 'news', 'image', 'video')),
  content text not null,
  image_path text,
  video_url text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_content_len check (char_length(content) between 1 and 12000),
  constraint posts_source_url_len check (source_url is null or char_length(source_url) <= 600),
  constraint posts_video_url_len check (video_url is null or char_length(video_url) <= 600)
);

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

-- Group chat messages are stored only as ciphertext.
-- Decryption happens in the browser with the room passphrase.
create table if not exists public.encrypted_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  salt text not null,
  key_version integer not null default 1,
  created_at timestamptz not null default now()
);

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

-- Backwards-compatible name used by older policies.
create or replace function public.is_admin(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select public.is_staff(check_user);
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

  if new_role not in ('member', 'moderator', 'admin') then
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
grant execute on function public.create_invite(integer) to authenticated;
grant execute on function public.accept_invite(text, text, text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.encrypted_messages enable row level security;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
for select to authenticated
using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Prevent normal users from editing their own role through the browser.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, bio, last_seen) on public.profiles to authenticated;

drop policy if exists invites_select_own on public.invites;
create policy invites_select_own on public.invites
for select to authenticated
using (created_by = auth.uid() or used_by = auth.uid() or public.is_full_admin());

drop policy if exists posts_select_authenticated on public.posts;
create policy posts_select_authenticated on public.posts
for select to authenticated
using (true);

drop policy if exists posts_insert_self on public.posts;
create policy posts_insert_self on public.posts
for insert to authenticated
with check (author_id = auth.uid());

drop policy if exists posts_update_self_or_admin on public.posts;
create policy posts_update_self_or_admin on public.posts
for update to authenticated
using (author_id = auth.uid() or public.is_staff())
with check (author_id = auth.uid() or public.is_staff());

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



-- Realtime support for live feed, comments and the floating encrypted messenger.
-- Supabase Broadcast works without this, but Postgres changes need the tables in supabase_realtime.
do $$
begin
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

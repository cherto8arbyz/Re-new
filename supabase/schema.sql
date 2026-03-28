-- Re:new production schema (Supabase/Postgres)
-- Run in SQL editor after enabling Google provider in Supabase Auth.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  city text,
  region text,
  lat double precision,
  lon double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wardrobe_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in ('base','shirt','sweater','outerwear','accessory','pants','shoes')),
  color text,
  brand text,
  wear_count integer not null default 0,
  cost_per_wear numeric(10,2),
  position jsonb not null default '{"x":15,"y":8,"width":45,"height":28}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wardrobe_items_user_id on public.wardrobe_items(user_id);
create index if not exists idx_wardrobe_items_category on public.wardrobe_items(category);

create table if not exists public.wardrobe_images (
  item_id text primary key references public.wardrobe_items(id) on delete cascade,
  original_url text,
  cutout_url text,
  mask_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.looks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  look_date date not null,
  item_ids text[] not null default '{}',
  style_name text,
  reasoning text,
  trend_context jsonb not null default '{}'::jsonb,
  weather_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_looks_user_date on public.looks(user_id, look_date desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','model','system')),
  message_text text not null,
  tool_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_user_created on public.chat_messages(user_id, created_at desc);

create table if not exists public.trend_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  region text not null,
  signals jsonb not null default '[]'::jsonb,
  source text,
  created_at timestamptz not null default now(),
  unique(snapshot_date, region)
);

alter table public.users enable row level security;
alter table public.wardrobe_items enable row level security;
alter table public.wardrobe_images enable row level security;
alter table public.looks enable row level security;
alter table public.chat_messages enable row level security;
alter table public.trend_snapshots enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
for select using (id = auth.uid());

drop policy if exists "users_upsert_own" on public.users;
create policy "users_upsert_own" on public.users
for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "wardrobe_items_own" on public.wardrobe_items;
create policy "wardrobe_items_own" on public.wardrobe_items
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "wardrobe_images_own" on public.wardrobe_images;
create policy "wardrobe_images_own" on public.wardrobe_images
for all using (
  exists (
    select 1
    from public.wardrobe_items wi
    where wi.id = wardrobe_images.item_id and wi.user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.wardrobe_items wi
    where wi.id = wardrobe_images.item_id and wi.user_id = auth.uid()
  )
);

drop policy if exists "looks_own" on public.looks;
create policy "looks_own" on public.looks
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "chat_messages_own" on public.chat_messages;
create policy "chat_messages_own" on public.chat_messages
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "trend_snapshots_read_authenticated" on public.trend_snapshots;
create policy "trend_snapshots_read_authenticated" on public.trend_snapshots
for select using (auth.role() = 'authenticated');

-- Storage policies for object paths: <auth.uid()>/...
drop policy if exists "storage_read_own_wardrobe" on storage.objects;
create policy "storage_read_own_wardrobe" on storage.objects
for select using (
  bucket_id in ('wardrobe-originals', 'wardrobe-cutouts')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "storage_write_own_wardrobe" on storage.objects;
create policy "storage_write_own_wardrobe" on storage.objects
for insert with check (
  bucket_id in ('wardrobe-originals', 'wardrobe-cutouts')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "storage_update_own_wardrobe" on storage.objects;
create policy "storage_update_own_wardrobe" on storage.objects
for update using (
  bucket_id in ('wardrobe-originals', 'wardrobe-cutouts')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "storage_delete_own_wardrobe" on storage.objects;
create policy "storage_delete_own_wardrobe" on storage.objects
for delete using (
  bucket_id in ('wardrobe-originals', 'wardrobe-cutouts')
  and (storage.foldername(name))[1] = auth.uid()::text
);

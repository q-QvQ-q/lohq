-- Supabase Database Schema for LOHQ - P0 Features
-- Execute this SQL in Supabase SQL Editor after creating your project

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================
-- PROFILES TABLE
-- ============================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '宝宝',
  gender text check (gender in ('male', 'female')),
  avatar_url text,
  email text,
  partner_id uuid references public.profiles(id),
  love_start_date date not null default '2025-01-29',
  pending_start_date date,
  pending_by uuid references public.profiles(id),
  pending_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can view partner profile"
  on public.profiles for select
  using (auth.uid() = partner_id);

-- Auto-create profile on signup (with email sync)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nickname, gender, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nickname', '宝宝'),
    new.raw_user_meta_data->>'gender',
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- SETTINGS TABLE
-- ============================================
create table public.settings (
  id int primary key default 1 check (id = 1),
  start_date date not null default '2025-01-29',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.settings enable row level security;

create policy "Anyone can view settings"
  on public.settings for select
  using (true);

create policy "Users can update settings"
  on public.settings for update
  using (auth.uid() is not null);

-- Insert default settings row
insert into public.settings (id, start_date) values (1, '2025-01-29')
on conflict (id) do nothing;

-- ============================================
-- ANNIVERSARIES TABLE
-- ============================================
create table public.anniversaries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  type text not null default 'love' check (type in ('birthday', 'love', 'holiday', 'other')),
  is_repeat_yearly boolean not null default true,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.anniversaries enable row level security;

create policy "Anniversaries are viewable by authenticated users"
  on public.anniversaries for select
  using (auth.uid() is not null);

create policy "Authenticated users can insert anniversaries"
  on public.anniversaries for insert
  with check (auth.uid() is not null);

create policy "Authenticated users can update anniversaries"
  on public.anniversaries for update
  using (auth.uid() is not null);

create policy "Authenticated users can delete anniversaries"
  on public.anniversaries for delete
  using (auth.uid() is not null);

-- ============================================
-- KNOWLEDGE BASE TABLE
-- ============================================
create table public.knowledge_base (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  keywords text[] not null default '{}',
  tags text[] not null default '{}',
  content_male text,
  content_female text,
  tag text not null default 'other' check (tag in ('quarrel', 'cold_war', 'jealousy', 'communication', 'other')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.knowledge_base enable row level security;

create policy "Knowledge base viewable by authenticated users"
  on public.knowledge_base for select
  using (auth.uid() is not null);

create policy "Authenticated users can insert knowledge base entries"
  on public.knowledge_base for insert
  with check (auth.uid() is not null);

create policy "Authenticated users can update knowledge base"
  on public.knowledge_base for update
  using (auth.uid() is not null);

create policy "Authenticated users can delete knowledge base"
  on public.knowledge_base for delete
  using (auth.uid() is not null);

-- Index for keyword search performance
create index idx_knowledge_base_keywords on public.knowledge_base using gin (keywords);

-- Index for tag search performance
create index idx_knowledge_base_tags on public.knowledge_base using gin (tags);

-- ============================================
-- STORAGE BUCKETS
-- ============================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

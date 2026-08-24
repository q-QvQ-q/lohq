-- Migration: Add approval fields to settings table
-- Execute this SQL in Supabase SQL Editor

alter table public.settings add column if not exists pending_start_date date;
alter table public.settings add column if not exists pending_by uuid references public.profiles(id);
alter table public.settings add column if not exists pending_at timestamptz;

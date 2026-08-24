-- Migration: Add missing fields to profiles table
-- Execute this SQL in Supabase SQL Editor to update existing database

-- Add email field for partner binding
alter table public.profiles add column if not exists email text;

-- Add love_start_date field (if not exists, for older installations)
alter table public.profiles add column if not exists love_start_date date not null default '2025-01-29';

-- Add pending fields for mutual date change confirmation
alter table public.profiles add column if not exists pending_start_date date;
alter table public.profiles add column if not exists pending_by uuid references public.profiles(id);
alter table public.profiles add column if not exists pending_at timestamptz;

-- Sync email from auth.users for existing users
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;
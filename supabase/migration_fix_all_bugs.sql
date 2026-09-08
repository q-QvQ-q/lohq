-- ============================================
-- LOHQ 数据库 Bug 修复迁移脚本
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴执行
-- 执行时间：2026-08-29
-- ============================================

-- 1. photos 表添加缺失的 file_path 列（Albums.jsx 依赖此字段）
alter table public.photos add column if not exists file_path text;

-- 2. albums 表添加 UPDATE RLS 策略（renameAlbum + 签名URL持久化需要）
drop policy if exists "Users can update their own albums" on public.albums;
create policy "Users can update albums"
  on public.albums for update
  using (true);

-- 3. photos 表添加 UPDATE RLS 策略（持久化签名 URL 需要）
drop policy if exists "Users can update their own photos" on public.photos;
create policy "Users can update photos"
  on public.photos for update
  using (true);

-- 4. knowledge_base_items 表 - 统一标签字段
-- 去掉单值 tag 字段的 check 约束，改成可为空
-- 保留 tags 数组字段作为主要标签存储
alter table public.knowledge_base_items alter column tag drop not null;
alter table public.knowledge_base_items alter column tag default 'other';

-- 5. wallet_transactions 表添加 UPDATE RLS 策略（可能遗漏）
drop policy if exists "Users can update wallet transactions" on public.wallet_transactions;
create policy "Users can update wallet transactions"
  on public.wallet_transactions for update
  using (true);

-- 6. expenses 表添加 UPDATE RLS 策略（方便未来扩展）
drop policy if exists "Users can update expenses" on public.expenses;
create policy "Users can update expenses"
  on public.expenses for update
  using (true);

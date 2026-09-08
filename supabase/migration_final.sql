-- ============================================
-- LOHQ 完整修复迁移（一次性执行）
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴全部执行
-- 修复内容：缺失表 + 缺失列 + RLS 强化 + UPDATE 策略 + INSERT 策略
-- ============================================

-- ==================== 第 1 部分：创建缺失的 memo_comments 表 ====================
create table if not exists public.memo_comments (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid not null references public.memos(id) on delete cascade,
  content text not null,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);

alter table public.memo_comments enable row level security;

create index if not exists memo_comments_memo_idx on public.memo_comments(memo_id);

-- memo_comments RLS：双方都能看/写
drop policy if exists "Memo comments viewable by authenticated users" on public.memo_comments;
create policy "Memo comments visible to creator and partner"
  on public.memo_comments for select
  using (
    auth.uid() = author_id 
    or exists (
      select 1 from public.profiles p 
      where p.id = memo_comments.author_id and p.partner_id = auth.uid()
    )
  );

drop policy if exists "Users can create memo comments" on public.memo_comments;
create policy "Users can create their own memo comments"
  on public.memo_comments for insert
  with check (auth.uid() = author_id);

drop policy if exists "Users can delete memo comments" on public.memo_comments;
create policy "Users can delete their own memo comments"
  on public.memo_comments for delete
  using (auth.uid() = author_id);

-- ==================== 第 2 部分：补列（file_path）和补 RLS ====================

-- photos 表添加 file_path 列
alter table public.photos add column if not exists file_path text;

-- wallets 表 INSERT 策略（之前只有 UPDATE，前端 ensureWallets 会失败）
drop policy if exists "Users can create their own wallets" on public.wallets;
create policy "Users can create their own wallets"
  on public.wallets for insert
  with check (auth.uid() = user_id);

-- todos INSERT 策略已存在（auth.uid() = created_by），确保正确
-- wishes INSERT 策略已存在，确保正确

-- todos 有一个 UPDATE 策略 using(true) 允许所有人改，收紧
drop policy if exists "Users can update todos" on public.todos;
create policy "Creator can update own todos"
  on public.todos for update
  using (auth.uid() = created_by);

-- wishes UPDATE 策略收紧
drop policy if exists "Users can update wishes" on public.wishes;
create policy "Creator can update own wishes"
  on public.wishes for update
  using (auth.uid() = created_by);

-- ==================== 第 3 部分：重写全部 SELECT 策略（双方互看 + 正确列名） ====================

-- ---- profiles ----（已有正确策略，不动）

-- ---- todos ----
drop policy if exists "Todos are viewable by authenticated users" on public.todos;
drop policy if exists "Todos visible to creator and partner" on public.todos;
create policy "Todos visible to creator and partner"
  on public.todos for select
  using (
    auth.uid() = created_by 
    or exists (select 1 from public.profiles p where p.id = todos.created_by and p.partner_id = auth.uid())
  );

-- ---- wishes ----
drop policy if exists "Wishes are viewable by authenticated users" on public.wishes;
drop policy if exists "Wishes visible to creator and partner" on public.wishes;
create policy "Wishes visible to creator and partner"
  on public.wishes for select
  using (
    auth.uid() = created_by 
    or exists (select 1 from public.profiles p where p.id = wishes.created_by and p.partner_id = auth.uid())
  );

-- ---- expenses ----
drop policy if exists "Expenses are viewable by authenticated users" on public.expenses;
drop policy if exists "Expenses visible to creator and partner" on public.expenses;
create policy "Expenses visible to creator and partner"
  on public.expenses for select
  using (
    auth.uid() = created_by 
    or exists (select 1 from public.profiles p where p.id = expenses.created_by and p.partner_id = auth.uid())
  );

-- ---- wallet_transactions ----
drop policy if exists "Wallet transactions are viewable by authenticated users" on public.wallet_transactions;
drop policy if exists "Wallet transactions visible to creator and partner" on public.wallet_transactions;
create policy "Wallet transactions visible to creator and partner"
  on public.wallet_transactions for select
  using (
    auth.uid() = created_by 
    or exists (select 1 from public.profiles p where p.id = wallet_transactions.created_by and p.partner_id = auth.uid())
  );

-- ---- albums ----
drop policy if exists "Albums are viewable by authenticated users" on public.albums;
drop policy if exists "Albums visible to creator and partner" on public.albums;
create policy "Albums visible to creator and partner"
  on public.albums for select
  using (
    auth.uid() = created_by 
    or exists (select 1 from public.profiles p where p.id = albums.created_by and p.partner_id = auth.uid())
  );

-- ---- photos ----
drop policy if exists "Photos are viewable by authenticated users" on public.photos;
drop policy if exists "Photos visible to creator and partner" on public.photos;
create policy "Photos visible to creator and partner"
  on public.photos for select
  using (
    auth.uid() = uploaded_by 
    or exists (select 1 from public.profiles p where p.id = photos.uploaded_by and p.partner_id = auth.uid())
  );

-- ---- knowledge_base ----
drop policy if exists "Knowledge base viewable by authenticated users" on public.knowledge_base;
drop policy if exists "Knowledge base visible to creator and partner" on public.knowledge_base;
create policy "Knowledge base visible to creator and partner"
  on public.knowledge_base for select
  using (
    auth.uid() = created_by 
    or exists (select 1 from public.profiles p where p.id = knowledge_base.created_by and p.partner_id = auth.uid())
  );

-- ---- anniversaries ----
drop policy if exists "Anniversaries are viewable by authenticated users" on public.anniversaries;
drop policy if exists "Anniversaries visible to creator and partner" on public.anniversaries;
create policy "Anniversaries visible to creator and partner"
  on public.anniversaries for select
  using (
    auth.uid() = created_by 
    or exists (select 1 from public.profiles p where p.id = anniversaries.created_by and p.partner_id = auth.uid())
  );

-- ---- diaries ----（实际列名是 author_id！不是 created_by！）
drop policy if exists "Diaries are viewable by authenticated users" on public.diaries;
drop policy if exists "Diaries visible to creator and partner" on public.diaries;
create policy "Diaries visible to creator and partner"
  on public.diaries for select
  using (
    auth.uid() = author_id 
    or exists (select 1 from public.profiles p where p.id = diaries.author_id and p.partner_id = auth.uid())
  );

-- diaries INSERT 已正确用 author_id，不动
-- diaries DELETE/UPDATE 已用 author_id，不动

-- ---- memos ----（实际列名是 author_id！不是 created_by！）
drop policy if exists "Memos are viewable by authenticated users" on public.memos;
drop policy if exists "Memos visible to creator and partner" on public.memos;
create policy "Memos visible to creator and partner"
  on public.memos for select
  using (
    auth.uid() = author_id 
    or exists (select 1 from public.profiles p where p.id = memos.author_id and p.partner_id = auth.uid())
  );

-- ---- weekly_summaries ----（列名是 author_id）
drop policy if exists "Weekly summaries are viewable by authenticated users" on public.weekly_summaries;
drop policy if exists "Weekly summaries visible to creator and partner" on public.weekly_summaries;
create policy "Weekly summaries visible to creator and partner"
  on public.weekly_summaries for select
  using (
    auth.uid() = author_id 
    or exists (select 1 from public.profiles p where p.id = weekly_summaries.author_id and p.partner_id = auth.uid())
  );

-- ---- wallets ----
drop policy if exists "Wallets are viewable by authenticated users" on public.wallets;
drop policy if exists "Wallets visible to owner and partner" on public.wallets;
create policy "Wallets visible to owner and partner"
  on public.wallets for select
  using (
    auth.uid() = user_id 
    or exists (select 1 from public.profiles p where p.id = wallets.user_id and p.partner_id = auth.uid())
  );

-- ==================== 第 4 部分：补齐缺失的 UPDATE 策略 ====================

-- albums UPDATE
drop policy if exists "Users can update their own albums" on public.albums;
drop policy if exists "Creator can update own albums" on public.albums;
create policy "Creator can update own albums"
  on public.albums for update using (auth.uid() = created_by);

-- photos UPDATE（持久化签名 URL）
drop policy if exists "Users can update their own photos" on public.photos;
drop policy if exists "Creator can update own photos" on public.photos;
create policy "Creator can update own photos"
  on public.photos for update using (auth.uid() = uploaded_by);

-- expenses UPDATE
drop policy if exists "Users can update expenses" on public.expenses;
drop policy if exists "Creator can update own expenses" on public.expenses;
create policy "Creator can update own expenses"
  on public.expenses for update using (auth.uid() = created_by);

-- wallet_transactions UPDATE
drop policy if exists "Users can update wallet transactions" on public.wallet_transactions;
drop policy if exists "Creator can update own wallet transactions" on public.wallet_transactions;
create policy "Creator can update own wallet transactions"
  on public.wallet_transactions for update using (auth.uid() = created_by);

-- knowledge_base UPDATE
drop policy if exists "Authenticated users can update knowledge base" on public.knowledge_base;
drop policy if exists "Creator can update own knowledge base" on public.knowledge_base;
create policy "Creator can update own knowledge base"
  on public.knowledge_base for update using (auth.uid() = created_by);

-- anniversaries UPDATE
drop policy if exists "Authenticated users can update anniversaries" on public.anniversaries;
drop policy if exists "Creator can update own anniversaries" on public.anniversaries;
create policy "Creator can update own anniversaries"
  on public.anniversaries for update using (auth.uid() = created_by);

-- ==================== 第 5 部分：Storage Bucket 安全提示 ====================
-- 注意：storage.objects 表属于 Supabase 内部扩展，无权限直接改 RLS
-- Storage 安全通过 Dashboard bucket 级别配置实现：
--   → Storage → avatars bucket → 确认 "Public bucket" 开关 = OFF（private）
--   → Storage → photos bucket → 确认 "Public bucket" 开关 = OFF（private）
--   → 前端已使用 createSignedUrl() 生成带时效的签名 URL 访问

-- ==================== 完成 ====================
do $$ begin
  raise notice '====== 全部迁移执行完成！======';
  raise notice '✅ memo_comments 表已创建';
  raise notice '✅ photos.file_path 列已添加';
  raise notice '✅ wallets INSERT 策略已补齐';
  raise notice '✅ 全部 RLS SELECT 策略已强化为双方互看模式';
  raise notice '✅ 全部 UPDATE 策略已收紧为仅创建者可修改';
  raise notice '⚠️  请在 Dashboard 确认 avatars/photos bucket 为 private';
  raise notice '⚠️  请刷新前端页面（Ctrl+Shift+R）测试全部功能';
end $$;

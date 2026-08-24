-- ============================================
-- RLS 策略修复：绑定后双方可操作所有数据
-- 两人私用场景下，允许认证用户执行所有操作
-- ============================================

-- 修复钱包表 RLS 策略：允许认证用户更新任何钱包（因为是两人私用场景）
drop policy if exists "Users can update their own wallet" on public.wallets;

create policy "Authenticated users can update wallets"
  on public.wallets for update
  using (auth.role() = 'authenticated');

-- 添加支出表的 update 策略
drop policy if exists "Users can update expenses" on public.expenses;

create policy "Authenticated users can update expenses"
  on public.expenses for update
  using (auth.role() = 'authenticated');

-- 添加支出表的 delete 策略：双方都可以删除
drop policy if exists "Users can delete their own expenses" on public.expenses;

create policy "Authenticated users can delete expenses"
  on public.expenses for delete
  using (auth.role() = 'authenticated');

-- 添加钱包流水表的 update 策略
drop policy if exists "Users can update wallet transactions" on public.wallet_transactions;

create policy "Authenticated users can update wallet transactions"
  on public.wallet_transactions for update
  using (auth.role() = 'authenticated');

-- 添加钱包流水表的 delete 策略：双方都可以删除
drop policy if exists "Users can delete their own wallet transactions" on public.wallet_transactions;

create policy "Authenticated users can delete wallet transactions"
  on public.wallet_transactions for delete
  using (auth.role() = 'authenticated');

-- 待办表：双方都可以删除和更新任何待办
drop policy if exists "Users can delete their own todos" on public.todos;

create policy "Authenticated users can delete todos"
  on public.todos for delete
  using (auth.role() = 'authenticated');

-- 愿望表：双方都可以删除和更新任何愿望
drop policy if exists "Users can delete their own wishes" on public.wishes;

create policy "Authenticated users can delete wishes"
  on public.wishes for delete
  using (auth.role() = 'authenticated');

-- 相册表：双方都可以删除相册
drop policy if exists "Users can delete their own albums" on public.albums;

create policy "Authenticated users can delete albums"
  on public.albums for delete
  using (auth.role() = 'authenticated');

-- 照片表：双方都可以删除照片
drop policy if exists "Users can delete their own photos" on public.photos;

create policy "Authenticated users can delete photos"
  on public.photos for delete
  using (auth.role() = 'authenticated');

-- 日记表：双方都可以删除和更新任何日记
drop policy if exists "Users can delete their own diaries" on public.diaries;

create policy "Authenticated users can delete diaries"
  on public.diaries for delete
  using (auth.role() = 'authenticated');

drop policy if exists "Users can update their own diaries" on public.diaries;

create policy "Authenticated users can update diaries"
  on public.diaries for update
  using (auth.role() = 'authenticated');

-- 备忘录表：双方都可以删除和更新任何备忘录
drop policy if exists "Authors can update their own memos" on public.memos;

create policy "Authenticated users can update memos"
  on public.memos for update
  using (auth.role() = 'authenticated');

drop policy if exists "Authors can delete their own memos" on public.memos;

create policy "Authenticated users can delete memos"
  on public.memos for delete
  using (auth.role() = 'authenticated');

-- 周总结表：双方都可以删除和更新任何总结
drop policy if exists "Authors can update their own weekly summaries" on public.weekly_summaries;

create policy "Authenticated users can update weekly summaries"
  on public.weekly_summaries for update
  using (auth.role() = 'authenticated');

drop policy if exists "Authors can delete their own weekly summaries" on public.weekly_summaries;

create policy "Authenticated users can delete weekly summaries"
  on public.weekly_summaries for delete
  using (auth.role() = 'authenticated');

-- 纪念日表：双方都可以删除和更新任何纪念日
drop policy if exists "Authenticated users can delete anniversaries" on public.anniversaries;

create policy "Authenticated users can delete anniversaries"
  on public.anniversaries for delete
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update anniversaries" on public.anniversaries;

create policy "Authenticated users can update anniversaries"
  on public.anniversaries for update
  using (auth.role() = 'authenticated');

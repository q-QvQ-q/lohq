-- RPC函数：通过邮箱查找用户profile（用于伴侣绑定）
-- 使用SECURITY DEFINER绕过RLS限制，但只暴露必要字段
create or replace function public.find_profile_by_email(search_email text)
returns table (
  id uuid,
  nickname text,
  email text,
  partner_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select p.id, p.nickname, p.email, p.partner_id
  from public.profiles p
  where p.email = search_email;
end;
$$;

-- 授权所有认证用户可以调用此函数
grant execute on function public.find_profile_by_email(text) to authenticated;
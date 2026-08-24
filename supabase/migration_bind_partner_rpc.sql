-- RPC函数：绑定伴侣（绕过RLS限制）
-- 使用 returns json 简化返回值处理
create or replace function public.bind_partner(
  p_user_id uuid,
  p_partner_email text,
  p_start_date date default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
  v_partner_nickname text;
  v_partner_email text;
  v_start_date date;
  v_result json;
begin
  -- 查找伴侣
  select p.id, p.nickname, p.email
  into v_partner_id, v_partner_nickname, v_partner_email
  from public.profiles p
  where p.email = p_partner_email;
  
  -- 检查伴侣是否存在
  if v_partner_id is null then
    return json_build_object('success', false, 'message', '未找到该账号');
  end if;
  
  -- 检查不能绑定自己
  if v_partner_id = p_user_id then
    return json_build_object('success', false, 'message', '不能绑定自己');
  end if;
  
  -- 检查对方是否已绑定
  if exists (select 1 from public.profiles where id = v_partner_id and partner_id is not null) then
    return json_build_object('success', false, 'message', '该账号已绑定其他伴侣');
  end if;
  
  -- 检查自己是否已绑定
  if exists (select 1 from public.profiles where id = p_user_id and partner_id is not null) then
    return json_build_object('success', false, 'message', '您已绑定伴侣，请先解除绑定');
  end if;
  
  -- 获取默认日期
  v_start_date := p_start_date;
  if v_start_date is null then
    select love_start_date into v_start_date from public.profiles where id = p_user_id;
    if v_start_date is null then
      v_start_date := '2025-01-29';
    end if;
  end if;
  
  -- 更新双方的profile
  update public.profiles
  set partner_id = v_partner_id,
      love_start_date = v_start_date,
      updated_at = now()
  where id = p_user_id;
  
  update public.profiles
  set partner_id = p_user_id,
      love_start_date = v_start_date,
      updated_at = now()
  where id = v_partner_id;
  
  return json_build_object(
    'success', true,
    'message', '绑定成功',
    'partner_id', v_partner_id,
    'partner_nickname', v_partner_nickname,
    'partner_email', v_partner_email
  );
end;
$$;

grant execute on function public.bind_partner(uuid, text, date) to authenticated;

-- RPC函数：解绑伴侣
create or replace function public.unbind_partner(
  p_user_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
begin
  -- 获取伴侣ID
  select partner_id into v_partner_id
  from public.profiles where id = p_user_id;
  
  if v_partner_id is null then
    return json_build_object('success', false, 'message', '您尚未绑定伴侣');
  end if;
  
  -- 更新双方的profile
  update public.profiles
  set partner_id = null,
      pending_start_date = null,
      pending_by = null,
      pending_at = null,
      updated_at = now()
  where id = p_user_id;
  
  update public.profiles
  set partner_id = null,
      pending_start_date = null,
      pending_by = null,
      pending_at = null,
      updated_at = now()
  where id = v_partner_id;
  
  return json_build_object('success', true, 'message', '解绑成功');
end;
$$;

grant execute on function public.unbind_partner(uuid) to authenticated;
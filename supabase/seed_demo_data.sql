-- 示例数据脚本（用于测试演示）
-- 注意：执行前请确认 profiles 表中至少有一个用户

-- 1. 获取第一个用户的ID（用于创建数据）
WITH first_user AS (
  SELECT id FROM public.profiles ORDER BY created_at LIMIT 1
)

-- 2. 添加示例日记
INSERT INTO public.diaries (author_id, mood, content, created_at)
SELECT 
  (SELECT id FROM first_user),
  moods.mood,
  moods.content,
  moods.created_at
FROM (
  SELECT 'happy' as mood, '今天和宝宝一起吃了火锅，好开心呀！🥰' as content, NOW() - INTERVAL '1 day' as created_at
  UNION ALL
  SELECT 'sweet', '宝宝今天做了很多家务，辛苦了！💕' as content, NOW() - INTERVAL '2 day'
  UNION ALL
  SELECT 'normal', '平凡的一天，一起看了一部电影。' as content, NOW() - INTERVAL '3 day'
  UNION ALL
  SELECT 'happy', '收到了宝宝的惊喜礼物，感动哭了！🎁✨' as content, NOW() - INTERVAL '5 day'
  UNION ALL
  SELECT 'sad', '今天和宝宝吵架了，好难过...' as content, NOW() - INTERVAL '7 day'
  UNION ALL
  SELECT 'happy', '周末一起去公园散步，拍了好多照片！📷' as content, NOW() - INTERVAL '10 day'
) moods
WHERE NOT EXISTS (SELECT 1 FROM public.diaries LIMIT 1);

-- 3. 添加示例待办
INSERT INTO public.todos (content, priority, due_date, is_completed, created_by, created_at)
SELECT 
  todos.content,
  todos.priority,
  todos.due_date,
  todos.is_completed,
  (SELECT id FROM first_user),
  todos.created_at
FROM (
  SELECT '给宝宝买生日礼物' as content, 'high' as priority, CURRENT_DATE + 5 as due_date, false as is_completed, NOW() - INTERVAL '1 hour' as created_at
  UNION ALL
  SELECT '下周一起去看电影', 'normal', CURRENT_DATE + 3, false, NOW() - INTERVAL '2 hours'
  UNION ALL
  SELECT '买家庭日用品', 'normal', CURRENT_DATE + 1, true, NOW() - INTERVAL '1 day'
  UNION ALL
  SELECT '预约体检', 'high', CURRENT_DATE + 7, false, NOW() - INTERVAL '30 minutes'
  UNION ALL
  SELECT '整理相册', 'normal', CURRENT_DATE - 1, true, NOW() - INTERVAL '2 day'
) todos
WHERE NOT EXISTS (SELECT 1 FROM public.todos LIMIT 1);

-- 4. 添加示例愿望
INSERT INTO public.wishes (content, note, is_completed, created_by, created_at)
SELECT 
  wishes.content,
  wishes.note,
  wishes.is_completed,
  (SELECT id FROM first_user),
  wishes.created_at
FROM (
  SELECT '一起去看海' as content, '计划今年夏天去' as note, false as is_completed, NOW() - INTERVAL '1 day' as created_at
  UNION ALL
  SELECT '学做对方喜欢的菜', '还在学烹饪中', false, NOW() - INTERVAL '3 day'
  UNION ALL
  SELECT '一起养一只小猫', '等房子装修好', false, NOW() - INTERVAL '5 day'
  UNION ALL
  SELECT '完成一次旅行', '去年去了云南，很开心！', true, NOW() - INTERVAL '30 day'
  UNION ALL
  SELECT '一起读完一本书', '读完了《小王子》', true, NOW() - INTERVAL '60 day'
) wishes
WHERE NOT EXISTS (SELECT 1 FROM public.wishes LIMIT 1);

-- 5. 添加示例纪念日
INSERT INTO public.anniversaries (title, date, type, is_repeat_yearly, created_by, created_at)
SELECT 
  anniv.title,
  anniv.date,
  anniv.type,
  anniv.is_repeat_yearly,
  (SELECT id FROM first_user),
  anniv.created_at
FROM (
  SELECT '宝宝生日' as title, '2000-06-15' as date, 'birthday' as type, true as is_repeat_yearly, NOW() - INTERVAL '30 day' as created_at
  UNION ALL
  SELECT '在一起的日子', '2023-02-14', 'love', true, NOW() - INTERVAL '60 day'
  UNION ALL
  SELECT '圣诞节', '2024-12-25', 'holiday', true, NOW() - INTERVAL '15 day'
) anniv
WHERE NOT EXISTS (SELECT 1 FROM public.anniversaries LIMIT 1);

-- 6. 添加示例相册
INSERT INTO public.albums (name, created_by, created_at)
SELECT 
  albums.name,
  (SELECT id FROM first_user),
  albums.created_at
FROM (
  SELECT '甜蜜日常' as name, NOW() - INTERVAL '7 day' as created_at
  UNION ALL
  SELECT '旅行纪念', NOW() - INTERVAL '30 day'
  UNION ALL
  SELECT '美食记录', NOW() - INTERVAL '14 day'
) albums
WHERE NOT EXISTS (SELECT 1 FROM public.albums LIMIT 1);

-- 完成
SELECT '示例数据已生成！' as message;
-- 러브아카이브 Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run. (여러 번 실행해도 안전)
--
-- 구조: 커플 하나 = couples 한 줄. 앱 데이터 전체(AppState)를 state(jsonb)에 통으로 담는다.
--      저장은 save_state() 로만 — rev 가 그대로일 때만 덮어써서 두 사람이 동시에 고쳐도 서로 지우지 않는다.
--      (충돌하면 앱이 최신 state 를 다시 받아 같은 변경을 다시 적용한다)

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  state jsonb not null,
  rev integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.couple_members (
  couple_id uuid not null references public.couples on delete cascade,
  user_id uuid not null unique references auth.users on delete cascade,
  who text not null check (who in ('a', 'b')),
  primary key (couple_id, who)
);

alter table public.couples enable row level security;
alter table public.couple_members enable row level security;

-- 내가 속한 커플 id (RLS 안에서 쓰려고 security definer)
create or replace function public.my_couple_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select couple_id from public.couple_members where user_id = auth.uid()
$$;

drop policy if exists "read own couple" on public.couples;
create policy "read own couple" on public.couples
  for select to authenticated using (id = public.my_couple_id());

drop policy if exists "read own members" on public.couple_members;
create policy "read own members" on public.couple_members
  for select to authenticated using (couple_id = public.my_couple_id());

-- 쓰기는 아래 함수로만 (insert/update 정책 없음)

create or replace function public.create_couple(initial jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if public.my_couple_id() is not null then raise exception 'already_in_couple'; end if;
  insert into public.couples (state) values (initial) returning id into cid;
  insert into public.couple_members (couple_id, user_id, who) values (cid, auth.uid(), 'a');
  return cid;
end $$;

create or replace function public.join_couple(code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if public.my_couple_id() is not null then raise exception 'already_in_couple'; end if;
  select id into cid from public.couples where invite_code = upper(trim(code));
  if cid is null then raise exception 'invalid_code'; end if;
  if exists (select 1 from public.couple_members where couple_id = cid and who = 'b') then
    raise exception 'couple_full';
  end if;
  insert into public.couple_members (couple_id, user_id, who) values (cid, auth.uid(), 'b');
  return cid;
end $$;

-- rev 가 expected 와 같을 때만 저장하고 새 rev 를 돌려준다. 다르면 null (누가 먼저 고침)
create or replace function public.save_state(expected integer, next jsonb) returns integer
language sql security definer set search_path = '' as $$
  update public.couples set state = next, rev = rev + 1
  where id = public.my_couple_id() and rev = expected
  returning rev
$$;

revoke execute on function public.create_couple(jsonb), public.join_couple(text), public.save_state(integer, jsonb), public.my_couple_id() from anon, public;
grant execute on function public.create_couple(jsonb), public.join_couple(text), public.save_state(integer, jsonb), public.my_couple_id() to authenticated;

-- 실시간: 상대가 저장하면 바로 알림
do $$ begin
  alter publication supabase_realtime add table public.couples;
exception when duplicate_object then null; end $$;

-- 연인이 초대 코드로 들어오면 만든 사람 화면에도 바로 반영
do $$ begin
  alter publication supabase_realtime add table public.couple_members;
exception when duplicate_object then null; end $$;

-- 사진: photos 버킷, 경로 = <couple_id>/<랜덤>.jpg
-- 공개 버킷이라 URL 을 아는 사람은 볼 수 있다 (URL 은 추측 불가능한 랜덤). 올리기·지우기는 커플 본인만.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "couple uploads photos" on storage.objects;
create policy "couple uploads photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_couple_id()::text);

drop policy if exists "couple deletes photos" on storage.objects;
create policy "couple deletes photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_couple_id()::text);

-- 푸시 알림: 기기(브라우저)마다 구독 하나. 상대가 뭘 하면 /api/push 가 내 구독들로 보낸다.
-- 같은 커플이면 서로의 구독을 읽을 수 있다 (상대에게 보내려고). 저장은 아래 함수로만.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users on delete cascade,
  couple_id uuid not null references public.couples on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "read couple subscriptions" on public.push_subscriptions;
create policy "read couple subscriptions" on public.push_subscriptions
  for select to authenticated using (couple_id = public.my_couple_id());

-- 끄기 · 만료된 구독 정리
drop policy if exists "delete couple subscriptions" on public.push_subscriptions;
create policy "delete couple subscriptions" on public.push_subscriptions
  for delete to authenticated using (couple_id = public.my_couple_id());

-- 같은 기기로 다른 계정이 로그인해도 마지막 사람 것으로 바뀐다
create or replace function public.save_push_subscription(sub_endpoint text, sub_p256dh text, sub_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.my_couple_id() is null then raise exception 'no_couple'; end if;
  insert into public.push_subscriptions (endpoint, user_id, couple_id, p256dh, auth)
  values (sub_endpoint, auth.uid(), public.my_couple_id(), sub_p256dh, sub_auth)
  on conflict on constraint push_subscriptions_pkey do update
    set user_id = excluded.user_id, couple_id = excluded.couple_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

revoke execute on function public.save_push_subscription(text, text, text) from anon, public;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- ───────── 채팅 (로드맵 4) ─────────
-- 메시지는 couples.state 와 따로 한 줄씩 저장한다 (state 에 넣으면 쌓일수록 커지고 저장 충돌이 잦아져서).
-- 보내기는 insert 정책으로 (내 커플 + 내 who 로만). 읽음·반응·보내기 취소는 아래 함수로만 바꾼다.
-- 보내기 취소는 지우지 않고 deleted 로 표시한다 (실시간 DELETE 는 커플 필터가 안 걸려서).
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  sender text not null check (sender in ('a', 'b')),
  body text not null default '' check (char_length(body) <= 2000),
  photo text,
  reactions jsonb not null default '{}',
  read_at timestamptz,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  check (deleted or body <> '' or photo is not null)
);

create index if not exists messages_couple_created on public.messages (couple_id, created_at desc);

alter table public.messages enable row level security;

-- 내가 커플에서 a 인지 b 인지
create or replace function public.my_who() returns text
language sql stable security definer set search_path = '' as $$
  select who from public.couple_members where user_id = auth.uid()
$$;

drop policy if exists "read couple messages" on public.messages;
create policy "read couple messages" on public.messages
  for select to authenticated using (couple_id = public.my_couple_id());

drop policy if exists "send own messages" on public.messages;
create policy "send own messages" on public.messages
  for insert to authenticated
  with check (couple_id = public.my_couple_id() and sender = public.my_who() and not deleted and read_at is null and reactions = '{}');

-- 상대가 보낸 메시지를 지금까지 다 읽음으로
create or replace function public.mark_messages_read() returns void
language sql security definer set search_path = '' as $$
  update public.messages set read_at = now()
  where couple_id = public.my_couple_id() and sender <> public.my_who() and read_at is null
$$;

-- 반응 달기 (emoji 가 비면 내 반응 지우기)
create or replace function public.react_message(mid uuid, emoji text) returns void
language sql security definer set search_path = '' as $$
  update public.messages
  set reactions = case when coalesce(emoji, '') = '' then reactions - public.my_who()
                       else reactions || jsonb_build_object(public.my_who(), left(emoji, 16)) end
  where id = mid and couple_id = public.my_couple_id() and not deleted
$$;

-- 내가 보낸 메시지 보내기 취소
create or replace function public.unsend_message(mid uuid) returns void
language sql security definer set search_path = '' as $$
  update public.messages set deleted = true, body = '', photo = null, reactions = '{}'
  where id = mid and couple_id = public.my_couple_id() and sender = public.my_who()
$$;

revoke execute on function public.my_who(), public.mark_messages_read(), public.react_message(uuid, text), public.unsend_message(uuid) from anon, public;
grant execute on function public.my_who(), public.mark_messages_read(), public.react_message(uuid, text), public.unsend_message(uuid) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

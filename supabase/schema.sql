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

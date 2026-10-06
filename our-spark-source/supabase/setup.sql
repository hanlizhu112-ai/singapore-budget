-- Our Spark: GitHub Pages + Supabase, no visitor account required.
-- Safe to run again. Does not remove existing records or reset the creation key.
begin;
create schema if not exists private_spark;
revoke all on schema private_spark from public, anon, authenticated;

create table if not exists private_spark.settings (
  id boolean primary key default true check (id),
  setup_hash text check (setup_hash is null or setup_hash ~ '^[a-f0-9]{64}$')
);
insert into private_spark.settings(id) values (true) on conflict do nothing;
create table if not exists private_spark.rooms (
  id uuid primary key default gen_random_uuid(),
  owner_name text not null check (char_length(owner_name) between 1 and 12),
  partner_name text not null check (char_length(partner_name) between 1 and 12),
  owner_hash text not null unique check (owner_hash ~ '^[a-f0-9]{64}$'),
  partner_hash text not null check (partner_hash ~ '^[a-f0-9]{64}$'),
  invite_key text not null check (invite_key ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
create table if not exists private_spark.checkins (
  room_id uuid not null references private_spark.rooms(id) on delete cascade,
  day date not null,
  role smallint not null check (role in (0,1)),
  created_at timestamptz not null default now(),
  primary key (room_id,day,role)
);
alter table private_spark.settings enable row level security;
alter table private_spark.rooms enable row level security;
alter table private_spark.checkins enable row level security;
revoke all on all tables in schema private_spark from public, anon, authenticated;

create or replace function private_spark.token_hash(p_token text)
returns text language sql immutable strict set search_path = '' as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8')),'hex');
$$;
create or replace function private_spark.day_key(p_now timestamptz)
returns date language sql immutable strict set search_path = '' as $$
  select (p_now at time zone 'Asia/Shanghai')::date;
$$;
create or replace function private_spark.current_streak(p_days date[],p_today date)
returns integer language plpgsql immutable set search_path = '' as $$
declare v_day date; v_count integer := 0;
begin
  v_day := case when p_today = any(coalesce(p_days,'{}'::date[])) then p_today else p_today-1 end;
  while v_day = any(coalesce(p_days,'{}'::date[])) loop
    v_count := v_count+1; v_day := v_day-1;
  end loop;
  return v_count;
end; $$;

create or replace function private_spark.state(p_key text)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_room private_spark.rooms; v_role integer; v_hash text; v_id uuid;
  v_today date := private_spark.day_key(now()); v_days date[];
  v_checked jsonb; v_events jsonb; v_result jsonb;
begin
  if p_key is null or p_key !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[a-f0-9]{64}$' then
    raise exception using errcode='PT401',message='入口无效，请重新打开专属链接。';
  end if;
  v_id := pg_catalog.split_part(p_key,'.',1)::uuid;
  select * into v_room from private_spark.rooms where id=v_id;
  v_hash := private_spark.token_hash(pg_catalog.split_part(p_key,'.',2));
  if not found then
    raise exception using errcode='PT401',message='入口无效，请重新打开专属链接。';
  end if;
  v_role := case when v_hash=v_room.owner_hash then 0 when v_hash=v_room.partner_hash then 1 else -1 end;
  if v_role=-1 then raise exception using errcode='PT401',message='入口无效，请重新打开专属链接。'; end if;
  select coalesce(jsonb_agg(role order by role),'[]'::jsonb) into v_checked
    from private_spark.checkins where room_id=v_id and day=v_today;
  select coalesce(array_agg(day order by day),'{}'::date[]) into v_days from (
    select day from private_spark.checkins where room_id=v_id group by day having count(*)=2
  ) completed;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.day desc,e.created_at desc),'[]'::jsonb) into v_events from (
    select day,role,created_at from private_spark.checkins where room_id=v_id order by day desc,created_at desc limit 8
  ) e;
  v_result := jsonb_build_object(
    'roomId',v_id,'names',jsonb_build_array(v_room.owner_name,v_room.partner_name),
    'role',v_role,'today',v_today,'checked',v_checked,'streak',private_spark.current_streak(v_days,v_today),
    'total',coalesce(array_length(v_days,1),0),'events',v_events,'createdAt',v_room.created_at,'resumeKey',p_key
  );
  if v_role=0 then v_result := v_result || jsonb_build_object('inviteKey',v_id::text||'.'||v_room.invite_key); end if;
  return v_result;
end; $$;

create or replace function public.our_spark_probe()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ok',true,'version','1.1.0','today',private_spark.day_key(now()));
$$;
create or replace function public.our_spark_state(p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private_spark.state(p_key);
$$;
create or replace function public.our_spark_create(
  p_setup_token text,p_owner text,p_partner text,p_owner_token text,p_partner_token text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_expected text;
begin
  if p_owner_token is null or p_partner_token is null or p_owner_token !~ '^[a-f0-9]{64}$' or
     p_partner_token !~ '^[a-f0-9]{64}$' or p_owner_token=p_partner_token then
    raise exception using errcode='PT400',message='创建请求无效，请刷新页面再试。';
  end if;
  if p_owner is null or p_partner is null or char_length(btrim(p_owner)) not between 1 and 12 or
     char_length(btrim(p_partner)) not between 1 and 12 then
    raise exception using errcode='PT400',message='请填写两个人的昵称，每个最多12个字。';
  end if;
  -- One room per pilot project. A private creation key prevents anonymous quota abuse.
  perform pg_catalog.pg_advisory_xact_lock(1467261401);
  select id into v_id from private_spark.rooms where owner_hash=private_spark.token_hash(p_owner_token);
  if found then return private_spark.state(v_id::text||'.'||p_owner_token); end if;
  select setup_hash into v_expected from private_spark.settings where id=true;
  if p_setup_token is null or p_setup_token !~ '^[a-f0-9]{64}$' or v_expected is null or
     private_spark.token_hash(p_setup_token)<>v_expected then
    raise exception using errcode='PT403',message='请使用你的专属创建入口，或打开已保存的房间入口。';
  end if;
  if exists(select 1 from private_spark.rooms) then
    raise exception using errcode='PT409',message='测试空间已经创建，请使用原来的专属入口。';
  end if;
  insert into private_spark.rooms(owner_name,partner_name,owner_hash,partner_hash,invite_key)
    values(btrim(p_owner),btrim(p_partner),private_spark.token_hash(p_owner_token),private_spark.token_hash(p_partner_token),p_partner_token)
    returning id into v_id;
  update private_spark.settings set setup_hash=null where id=true;
  return private_spark.state(v_id::text||'.'||p_owner_token);
end; $$;
create or replace function public.our_spark_checkin(p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_state jsonb; v_changed integer;
begin
  v_state := private_spark.state(p_key);
  insert into private_spark.checkins(room_id,day,role)
    values((v_state->>'roomId')::uuid,private_spark.day_key(now()),(v_state->>'role')::smallint)
    on conflict do nothing;
  get diagnostics v_changed = row_count;
  return private_spark.state(p_key) || jsonb_build_object('added',v_changed>0);
end; $$;
create or replace function public.our_spark_export(p_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_state jsonb; v_events jsonb;
begin
  v_state := private_spark.state(p_key);
  select coalesce(jsonb_agg(to_jsonb(e) order by e.day,e.role),'[]'::jsonb) into v_events from (
    select day,role,created_at from private_spark.checkins where room_id=(v_state->>'roomId')::uuid
  ) e;
  -- Export records only: never export invitation keys, hashes or the creation key.
  return jsonb_build_object('version','1.1.0','names',v_state->'names','createdAt',v_state->'createdAt',
    'exportedAt',now(),'total',v_state->'total','events',v_events);
end; $$;

revoke all on all functions in schema private_spark from public, anon, authenticated;
revoke all on function public.our_spark_probe() from public;
revoke all on function public.our_spark_state(text) from public;
revoke all on function public.our_spark_create(text,text,text,text,text) from public;
revoke all on function public.our_spark_checkin(text) from public;
revoke all on function public.our_spark_export(text) from public;
grant execute on function public.our_spark_probe() to anon,authenticated;
grant execute on function public.our_spark_state(text) to anon,authenticated;
grant execute on function public.our_spark_create(text,text,text,text,text) to anon,authenticated;
grant execute on function public.our_spark_checkin(text) to anon,authenticated;
grant execute on function public.our_spark_export(text) to anon,authenticated;
notify pgrst,'reload schema';
commit;

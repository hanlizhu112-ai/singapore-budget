-- Additive extension: never rewrites rooms, checkins, credentials or streak rules.
create table if not exists private_spark.capsules (
  room_id uuid not null references private_spark.rooms(id) on delete cascade,
  target_day smallint not null check (target_day in (60,100)),
  role smallint not null check (role in (0,1)),
  message text not null check (char_length(btrim(message)) between 1 and 500),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  primary key (room_id,target_day,role)
);
alter table private_spark.capsules enable row level security;
revoke all on private_spark.capsules from public,anon,authenticated;
do $policy$
begin
  if not exists(select 1 from pg_catalog.pg_policies where schemaname='private_spark' and tablename='capsules' and policyname='block_direct_client_access') then
    create policy block_direct_client_access on private_spark.capsules as restrictive for all to anon,authenticated using(false) with check(false);
  end if;
end;
$policy$;

create or replace function private_spark.capsules_state(p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_state jsonb; v_room uuid; v_streak integer; v_capsules jsonb;
begin
  -- Reuse the existing 256-bit room-entry check; no client-supplied identity/date.
  v_state := private_spark.state(p_key);
  v_room := (v_state->>'roomId')::uuid;
  v_streak := (v_state->>'streak')::integer;
  update private_spark.capsules set opened_at=now()
    where room_id=v_room and opened_at is null and target_day<=v_streak;
  select coalesce(jsonb_agg(jsonb_build_object(
    'day',c.target_day,'role',c.role,'createdAt',c.created_at,'openedAt',c.opened_at,
    'message',case when c.opened_at is not null then c.message else null end
  ) order by c.target_day,c.role),'[]'::jsonb) into v_capsules
  from private_spark.capsules c where c.room_id=v_room;
  return jsonb_build_object('role',(v_state->>'role')::integer,'streak',v_streak,'capsules',v_capsules);
end;
$$;

create or replace function private_spark.seal_capsule(p_key text,p_day integer,p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_state jsonb; v_room uuid; v_role smallint; v_message text; v_existing text;
begin
  v_state := private_spark.state(p_key);
  v_room := (v_state->>'roomId')::uuid;
  v_role := (v_state->>'role')::smallint;
  if p_day is null or p_day not in (60,100) then
    raise exception using errcode='PT400',message='请选择60天或100天的时间胶囊。';
  end if;
  v_message := btrim(p_message);
  if v_message is null or char_length(v_message) not between 1 and 500 then
    raise exception using errcode='PT400',message='写下1到500字，再封存这封信。';
  end if;
  -- Serialize retries for this room/day/author. Never lock or edit daily records.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_room::text||':'||p_day::text||':'||v_role::text,0));
  select c.message into v_existing from private_spark.capsules c
    where c.room_id=v_room and c.target_day=p_day and c.role=v_role;
  if found then
    if v_existing=v_message then return private_spark.capsules_state(p_key); end if;
    raise exception using errcode='PT409',message='这封信已经封存，等约定的那一天再打开。';
  end if;
  if (v_state->>'streak')::integer>=p_day then
    raise exception using errcode='PT409',message='这个里程碑已经到达，请写给下一个约定。';
  end if;
  insert into private_spark.capsules(room_id,target_day,role,message)
    values(v_room,p_day,v_role,v_message);
  return private_spark.capsules_state(p_key);
end;
$$;

create or replace function public.our_spark_capsules(p_key text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private_spark.capsules_state(p_key);
$$;
create or replace function public.our_spark_seal_capsule(p_key text,p_day integer,p_message text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private_spark.seal_capsule(p_key,p_day,p_message);
$$;
revoke all on function private_spark.capsules_state(text) from public,anon,authenticated;
revoke all on function private_spark.seal_capsule(text,integer,text) from public,anon,authenticated;
revoke all on function public.our_spark_capsules(text) from public,anon,authenticated;
revoke all on function public.our_spark_seal_capsule(text,integer,text) from public,anon,authenticated;
grant execute on function private_spark.capsules_state(text) to anon,authenticated;
grant execute on function private_spark.seal_capsule(text,integer,text) to anon,authenticated;
grant execute on function public.our_spark_capsules(text) to anon,authenticated;
grant execute on function public.our_spark_seal_capsule(text,integer,text) to anon,authenticated;
notify pgrst,'reload schema';

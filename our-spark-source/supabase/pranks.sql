-- Additive play layer. The original room/state/checkin/capsule implementations stay intact.
create table if not exists private_spark.pranks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references private_spark.rooms(id) on delete cascade,
  sender_role smallint not null check (sender_role in (0,1)),
  kind text not null check (kind in ('popcorn','sneeze','gust')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  triggered_at timestamptz,
  triggered_day date,
  acknowledged_at timestamptz,
  check ((triggered_at is null)=(triggered_day is null)),
  check (acknowledged_at is null or triggered_at is not null)
);
create unique index if not exists pranks_one_pending_per_sender on private_spark.pranks(room_id,sender_role) where triggered_at is null;
create index if not exists pranks_unseen_receipt on private_spark.pranks(room_id,sender_role,triggered_day) where triggered_at is not null and acknowledged_at is null;
alter table private_spark.pranks enable row level security;
revoke all on private_spark.pranks from public,anon,authenticated;
do $policy$
begin
  if not exists(select 1 from pg_catalog.pg_policies where schemaname='private_spark' and tablename='pranks' and policyname='block_direct_client_access') then
    create policy block_direct_client_access on private_spark.pranks as restrictive for all to anon,authenticated using(false) with check(false);
  end if;
end;
$policy$;

create or replace function private_spark.state_with_pranks(p_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_state jsonb; v_room uuid; v_role smallint; v_pending jsonb; v_receipt jsonb;
begin
  v_state:=private_spark.state(p_key);
  v_room:=(v_state->>'roomId')::uuid;v_role:=(v_state->>'role')::smallint;
  -- An author sees their own pending choice. A recipient never sees a future surprise.
  select jsonb_build_object('id',id,'kind',kind,'createdAt',created_at) into v_pending
    from private_spark.pranks where room_id=v_room and sender_role=v_role and triggered_at is null;
  -- Same-day receipts recover a lost checkin response, without triggering anything on refresh.
  select jsonb_build_object('id',id,'kind',kind) into v_receipt
    from private_spark.pranks where room_id=v_room and sender_role=1-v_role
      and triggered_day=(v_state->>'today')::date and acknowledged_at is null
    order by triggered_at desc limit 1;
  return v_state||jsonb_build_object('pendingPrank',v_pending,'prank',v_receipt);
end;
$$;

create or replace function private_spark.set_prank(p_key text,p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_state jsonb;
begin
  v_state:=private_spark.state(p_key);
  if p_kind is null or p_kind not in ('popcorn','sneeze','gust') then
    raise exception using errcode='PT400',message='请选择爆米花、喷嚏或小风。';
  end if;
  insert into private_spark.pranks(room_id,sender_role,kind)
    values((v_state->>'roomId')::uuid,(v_state->>'role')::smallint,p_kind)
    on conflict (room_id,sender_role) where triggered_at is null
    do update set kind=excluded.kind,updated_at=now();
  return private_spark.state_with_pranks(p_key);
end;
$$;

create or replace function private_spark.checkin_with_prank(p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_state jsonb;
begin
  -- Preserve the existing atomic duplicate protection and continuous-day calculation.
  v_state:=private_spark.checkin(p_key);
  if (v_state->>'added')::boolean then
    update private_spark.pranks set triggered_at=now(),triggered_day=(v_state->>'today')::date
      where room_id=(v_state->>'roomId')::uuid and sender_role=1-(v_state->>'role')::smallint and triggered_at is null;
  end if;
  return private_spark.state_with_pranks(p_key)||jsonb_build_object('added',v_state->'added');
end;
$$;

create or replace function private_spark.ack_prank(p_key text,p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_state jsonb;
begin
  v_state:=private_spark.state(p_key);
  update private_spark.pranks set acknowledged_at=coalesce(acknowledged_at,now())
    where id=p_id and room_id=(v_state->>'roomId')::uuid
      and sender_role=1-(v_state->>'role')::smallint and triggered_at is not null;
  if not found then raise exception using errcode='PT403',message='这个机关不属于你的这次添柴。';end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.our_spark_state(p_key text)
returns jsonb language sql stable security invoker set search_path = '' as $$ select private_spark.state_with_pranks(p_key); $$;
create or replace function public.our_spark_checkin(p_key text)
returns jsonb language sql security invoker set search_path = '' as $$ select private_spark.checkin_with_prank(p_key); $$;
create or replace function public.our_spark_set_prank(p_key text,p_kind text)
returns jsonb language sql security invoker set search_path = '' as $$ select private_spark.set_prank(p_key,p_kind); $$;
create or replace function public.our_spark_ack_prank(p_key text,p_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$ select private_spark.ack_prank(p_key,p_id); $$;

revoke all on function private_spark.state_with_pranks(text) from public,anon,authenticated;
revoke all on function private_spark.set_prank(text,text) from public,anon,authenticated;
revoke all on function private_spark.checkin_with_prank(text) from public,anon,authenticated;
revoke all on function private_spark.ack_prank(text,uuid) from public,anon,authenticated;
grant execute on function private_spark.state_with_pranks(text) to anon,authenticated;
grant execute on function private_spark.set_prank(text,text) to anon,authenticated;
grant execute on function private_spark.checkin_with_prank(text) to anon,authenticated;
grant execute on function private_spark.ack_prank(text,uuid) to anon,authenticated;
revoke all on function public.our_spark_state(text) from public,anon,authenticated;
revoke all on function public.our_spark_checkin(text) from public,anon,authenticated;
revoke all on function public.our_spark_set_prank(text,text) from public,anon,authenticated;
revoke all on function public.our_spark_ack_prank(text,uuid) from public,anon,authenticated;
grant execute on function public.our_spark_state(text) to anon,authenticated;
grant execute on function public.our_spark_checkin(text) to anon,authenticated;
grant execute on function public.our_spark_set_prank(text,text) to anon,authenticated;
grant execute on function public.our_spark_ack_prank(text,uuid) to anon,authenticated;
notify pgrst,'reload schema';

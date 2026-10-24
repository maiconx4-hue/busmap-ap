alter table public.location_sessions add column if not exists off_route_count integer not null default 0;

create or replace function public.route_distance_m(p_route uuid, p_lat double precision, p_lng double precision)
returns double precision
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  g jsonb; n int; i int;
  a_x double precision; a_y double precision; b_x double precision; b_y double precision;
  p_x double precision; p_y double precision;
  t double precision; d_x double precision; d_y double precision;
  d double precision; best double precision := null; lat0 double precision;
begin
  select geometry into g from public.routes where id = p_route;
  if g is null or jsonb_typeof(g) <> 'array' then return null; end if;
  n := jsonb_array_length(g);
  if n < 2 then return null; end if;
  lat0 := radians(p_lat);
  p_x := p_lng * cos(lat0) * 111320;
  p_y := p_lat * 110540;
  for i in 0..n-2 loop
    a_x := (g->i->>1)::double precision * cos(lat0) * 111320;
    a_y := (g->i->>0)::double precision * 110540;
    b_x := (g->(i+1)->>1)::double precision * cos(lat0) * 111320;
    b_y := (g->(i+1)->>0)::double precision * 110540;
    d_x := b_x - a_x; d_y := b_y - a_y;
    if d_x = 0 and d_y = 0 then
      t := 0;
    else
      t := greatest(0, least(1, ((p_x - a_x) * d_x + (p_y - a_y) * d_y) / (d_x * d_x + d_y * d_y)));
    end if;
    d := sqrt(((a_x + t * d_x) - p_x) ^ 2 + ((a_y + t * d_y) - p_y) ^ 2);
    if best is null or d < best then best := d; end if;
  end loop;
  return best;
end $$;

create or replace function public.push_update(p_session uuid, p_visitor uuid, p_secret text, p_lat double precision, p_lng double precision, p_accuracy double precision)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s location_sessions; reason text := null; dt double precision; d double precision := 0; spd double precision := null;
  timeout_s numeric := get_setting('session_timeout_s'); others record; new_gid uuid; old_gid uuid;
  rd double precision; off_c int;
begin
  if not verify_visitor(p_visitor, p_secret) then raise exception 'INVALID_VISITOR'; end if;
  select * into s from location_sessions where id = p_session and visitor_id = p_visitor for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status <> 'active' then raise exception 'SESSION_ENDED'; end if;
  if s.last_update_at < now() - make_interval(secs => timeout_s) then
    update location_sessions set status = 'expired', ended_at = last_update_at, end_reason = 'sem_atualizacao' where id = s.id;
    perform finalize_session(s.id); perform recompute_group(s.group_id);
    return json_build_object('accepted', false, 'reason', 'SESSION_EXPIRED', 'ended', true);
  end if;
  if extract(epoch from now() - s.last_update_at) < get_setting('update_min_interval_s') then
    return json_build_object('accepted', false, 'reason', 'RATE_LIMIT');
  end if;

  if p_lat is null or p_lng is null or p_accuracy is null or p_accuracy <= 0 then reason := 'INVALID_COORDS';
  elsif not in_service_area(p_lat, p_lng) then reason := 'OUT_OF_AREA';
  elsif p_accuracy > get_setting('max_accuracy_m') then reason := 'LOW_ACCURACY';
  else
    dt := greatest(extract(epoch from now() - s.last_accepted_at), 1);
    d := haversine_m(s.last_lat, s.last_lng, p_lat, p_lng);
    spd := d / dt * 3.6;
    if spd > get_setting('max_speed_kmh') and d > (p_accuracy + coalesce(s.last_accuracy,0)) then reason := 'IMPOSSIBLE_SPEED'; end if;
  end if;

  insert into gps_updates(session_id, lat, lng, accuracy_m, speed_kmh, accepted, reject_reason)
    values (s.id, coalesce(p_lat,0), coalesce(p_lng,0), coalesce(p_accuracy,0), spd, reason is null, reason);

  if reason is null then
    update location_sessions set update_count = update_count + 1, accepted_count = accepted_count + 1,
      last_update_at = now(), distance_m = distance_m + d,
      max_gap_s = greatest(max_gap_s, extract(epoch from now() - last_accepted_at)),
      last_accepted_at = now(), last_lat = p_lat, last_lng = p_lng, last_accuracy = p_accuracy
      where id = s.id;
    -- split if this contributor diverged from the other active contributors (different bus)
    select count(*) c, avg(last_lat) la, avg(last_lng) lo, max(last_accuracy) acc into others from location_sessions
      where group_id = s.group_id and id <> s.id and status = 'active'
        and last_accepted_at > now() - make_interval(secs => timeout_s);
    if others.c > 0 and haversine_m(others.la, others.lo, p_lat, p_lng) > get_setting('group_split_radius_m') + p_accuracy + others.acc then
      old_gid := s.group_id;
      insert into bus_groups(route_id, lat, lng, accuracy_m, status, last_update)
        values (s.route_id, p_lat, p_lng, p_accuracy, 'active', now()) returning id into new_gid;
      update location_sessions set group_id = new_gid where id = s.id;
      perform recompute_group(old_gid);
      s.group_id := new_gid;
    end if;
    perform recompute_group(s.group_id);
    -- auto-stop when the contributor leaves the route corridor for several consecutive updates
    rd := route_distance_m(s.route_id, p_lat, p_lng);
    if rd is not null and rd > coalesce(get_setting('off_route_radius_m'), 150) + p_accuracy then
      off_c := s.off_route_count + 1;
    else
      off_c := 0;
    end if;
    if off_c <> s.off_route_count then
      update location_sessions set off_route_count = off_c where id = s.id;
    end if;
    if off_c >= coalesce(get_setting('off_route_max_updates'), 3) then
      update location_sessions set status = 'ended', ended_at = now(), end_reason = 'fora_da_rota' where id = s.id;
      perform finalize_session(s.id);
      perform recompute_group(s.group_id);
      return json_build_object('accepted', true, 'reason', 'OFF_ROUTE', 'ended', true, 'group_id', s.group_id, 'contributors', 0);
    end if;
  else
    update location_sessions set update_count = update_count + 1, rejected_count = rejected_count + 1,
      speed_reject_count = speed_reject_count + (reason = 'IMPOSSIBLE_SPEED')::int,
      last_update_at = now() where id = s.id;
  end if;
  update visitors set last_seen_at = now() where id = p_visitor;
  return json_build_object('accepted', reason is null, 'reason', reason, 'group_id', s.group_id,
    'contributors', (select active_contributors from bus_groups where id = s.group_id));
end $$;
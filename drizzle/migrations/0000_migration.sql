
-- ===== Types =====
create type public.app_role as enum ('admin','user');
create type public.route_status as enum ('draft','published','inactive');
create type public.session_status as enum ('active','ended','expired');
create type public.validation_status as enum ('pending','valid','invalid','inconclusive');

-- ===== Settings =====
create table public.settings (
  key text primary key,
  value numeric not null,
  description text not null default '',
  updated_at timestamptz not null default now()
);
grant select on public.settings to anon, authenticated;
grant update on public.settings to authenticated;
grant all on public.settings to service_role;
alter table public.settings enable row level security;

insert into public.settings(key,value,description) values
 ('session_timeout_s',60,'Sessão inativa após N segundos sem atualização'),
 ('update_interval_s',10,'Intervalo recomendado entre envios GPS'),
 ('update_min_interval_s',4,'Intervalo mínimo aceito (limite de requisições)'),
 ('max_contributors',5,'Máximo de colaboradores simultâneos por grupo'),
 ('max_accuracy_m',100,'Precisão GPS máxima aceita (metros)'),
 ('group_join_radius_m',120,'Distância máxima para agrupar com grupo ativo'),
 ('group_split_radius_m',250,'Divergência que separa um colaborador do grupo'),
 ('stale_retention_s',900,'Tempo que a última posição desatualizada fica visível'),
 ('stale_join_radius_m',400,'Distância máxima para retomar grupo desatualizado'),
 ('route_max_distance_m',300,'Distância máxima ao trajeto para associar a grupo antigo'),
 ('max_speed_kmh',110,'Velocidade máxima plausível'),
 ('gps_retention_h',24,'Retenção das coordenadas brutas (horas)'),
 ('min_valid_duration_s',120,'Duração mínima para validar sessão'),
 ('min_valid_updates',6,'Atualizações aceitas mínimas para validar sessão'),
 ('daily_xp_cap',300,'XP máximo por usuário por dia'),
 ('max_sessions_per_10min',8,'Sessões máximas por visitante a cada 10 min');

create or replace function public.get_setting(k text) returns numeric
language sql stable security definer set search_path = public as $$
  select value from public.settings where key = k
$$;

-- ===== Roles =====
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin')
$$;

create policy "admins update settings" on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "settings public read" on public.settings for select to anon, authenticated using (true);

-- ===== Profiles =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text check (nickname is null or char_length(nickname) between 2 and 30),
  is_anonymous boolean not null default true,
  xp integer not null default 0 check (xp >= 0),
  created_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant update (nickname, is_anonymous) on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id) values (new.id) on conflict do nothing;
  -- Creator admin: provisioned only for the confirmed creator e-mail.
  if lower(new.email) = 'maicon.x4@gmail.com' and new.email_confirmed_at is not null then
    insert into public.user_roles(user_id, role) values (new.id, 'admin') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_auth_user();
create trigger on_auth_user_confirmed after update of email_confirmed_at, email on auth.users for each row execute function public.handle_auth_user();

-- ===== Routes =====
create table public.routes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) between 1 and 20),
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  color text not null default '#0e9f8e' check (color ~ '^#[0-9a-fA-F]{6}$'),
  direction text not null default 'ida' check (direction in ('ida','volta','circular')),
  origin_label text not null default '',
  dest_label text not null default '',
  origin_lat double precision, origin_lng double precision,
  dest_lat double precision, dest_lng double precision,
  geometry jsonb not null default '[]'::jsonb check (jsonb_typeof(geometry) = 'array'),
  distance_m double precision not null default 0,
  creation_method text not null default 'manual' check (creation_method in ('osrm','manual')),
  status public.route_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index routes_status_idx on public.routes(status);
grant select on public.routes to anon;
grant select, insert, update, delete on public.routes to authenticated;
grant all on public.routes to service_role;
alter table public.routes enable row level security;
create policy "published routes public" on public.routes for select to anon, authenticated using (status = 'published' or public.is_admin());
create policy "admin insert routes" on public.routes for insert to authenticated with check (public.is_admin());
create policy "admin update routes" on public.routes for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete routes" on public.routes for delete to authenticated using (public.is_admin());

create or replace function public.routes_touch() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then new.published_at := now(); end if;
  if new.status = 'published' and jsonb_array_length(new.geometry) < 2 then
    raise exception 'Rota publicada precisa de pelo menos 2 pontos';
  end if;
  return new;
end $$;
create trigger routes_touch before insert or update on public.routes for each row execute function public.routes_touch();

-- ===== Visitors (anonymous devices) =====
create table public.visitors (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null,
  user_id uuid,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index visitors_user_idx on public.visitors(user_id);
create index visitors_created_idx on public.visitors(created_at);
grant all on public.visitors to service_role;
alter table public.visitors enable row level security;

-- ===== Bus groups (public representative positions) =====
create table public.bus_groups (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision not null default 0,
  divergence_m double precision not null default 0,
  active_contributors integer not null default 0,
  status text not null default 'active' check (status in ('active','stale')),
  signal text not null default 'fraco' check (signal in ('bom','moderado','fraco')),
  confidence text not null default 'baixa' check (confidence in ('alta','media','baixa')),
  top_level text,
  last_update timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index bus_groups_route_idx on public.bus_groups(route_id, status);
grant select on public.bus_groups to anon, authenticated;
grant all on public.bus_groups to service_role;
alter table public.bus_groups enable row level security;
create policy "groups public read" on public.bus_groups for select to anon, authenticated
  using (exists (select 1 from public.routes r where r.id = route_id and r.status = 'published'));

-- ===== Sessions =====
create table public.location_sessions (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(id) on delete cascade,
  user_id uuid,
  route_id uuid not null references public.routes(id) on delete cascade,
  group_id uuid references public.bus_groups(id) on delete set null,
  status public.session_status not null default 'active',
  started_at timestamptz not null default now(),
  last_update_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text,
  update_count integer not null default 0,
  accepted_count integer not null default 0,
  rejected_count integer not null default 0,
  speed_reject_count integer not null default 0,
  distance_m double precision not null default 0,
  first_accepted_at timestamptz,
  last_accepted_at timestamptz,
  max_gap_s double precision not null default 0,
  last_lat double precision, last_lng double precision, last_accuracy double precision,
  validation public.validation_status not null default 'pending',
  validation_notes text,
  xp_awarded integer not null default 0,
  xp_credited boolean not null default false
);
create index sessions_status_idx on public.location_sessions(status, last_update_at);
create index sessions_group_idx on public.location_sessions(group_id) where status = 'active';
create index sessions_visitor_idx on public.location_sessions(visitor_id, started_at);
create index sessions_user_idx on public.location_sessions(user_id, started_at);
grant select on public.location_sessions to authenticated;
grant all on public.location_sessions to service_role;
alter table public.location_sessions enable row level security;
create policy "own sessions read" on public.location_sessions for select to authenticated using (user_id = auth.uid());

-- ===== Raw GPS updates (private, short retention) =====
create table public.gps_updates (
  id bigserial primary key,
  session_id uuid not null references public.location_sessions(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision not null,
  speed_kmh double precision,
  accepted boolean not null,
  reject_reason text,
  created_at timestamptz not null default now()
);
create index gps_updates_session_idx on public.gps_updates(session_id, created_at);
create index gps_updates_created_idx on public.gps_updates(created_at);
grant all on public.gps_updates to service_role;
alter table public.gps_updates enable row level security;

-- ===== Contributions / achievements =====
create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id uuid references public.location_sessions(id) on delete set null,
  xp integer not null check (xp >= 0),
  duration_s integer not null default 0,
  created_at timestamptz not null default now()
);
create index contributions_user_idx on public.contributions(user_id, created_at);
create unique index contributions_session_uniq on public.contributions(session_id);
grant select on public.contributions to authenticated;
grant all on public.contributions to service_role;
alter table public.contributions enable row level security;
create policy "own contributions" on public.contributions for select to authenticated using (user_id = auth.uid());

create table public.achievements (
  code text primary key,
  name text not null,
  description text not null,
  icon text not null default 'medal'
);
grant select on public.achievements to anon, authenticated;
grant all on public.achievements to service_role;
alter table public.achievements enable row level security;
create policy "achievements public" on public.achievements for select to anon, authenticated using (true);
insert into public.achievements values
 ('primeira_viagem','Primeira viagem','Concluiu a primeira sessão validada','bus'),
 ('dez_viagens','Passageiro frequente','10 sessões validadas','repeat'),
 ('uma_hora','Uma hora no ar','60 minutos de compartilhamento validado','clock'),
 ('nivel_prata','Prata','Alcançou o nível Colaborador','medal'),
 ('nivel_ouro','Ouro','Alcançou o nível Explorador','award'),
 ('nivel_platina','Platina','Alcançou o nível Embaixador','crown');

create table public.user_achievements (
  user_id uuid not null,
  code text not null references public.achievements(code) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, code)
);
grant select on public.user_achievements to authenticated;
grant all on public.user_achievements to service_role;
alter table public.user_achievements enable row level security;
create policy "own achievements" on public.user_achievements for select to authenticated using (user_id = auth.uid());

create table public.maintenance_log (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  expired_sessions integer not null default 0,
  deleted_groups integer not null default 0,
  deleted_updates integer not null default 0
);
grant select on public.maintenance_log to authenticated;
grant all on public.maintenance_log to service_role;
alter table public.maintenance_log enable row level security;
create policy "admin read maintenance" on public.maintenance_log for select to authenticated using (public.is_admin());

-- ===== Helpers =====
create or replace function public.haversine_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create or replace function public.level_for_xp(p_xp integer) returns text language sql immutable as $$
  select case when p_xp >= 2000 then 'platina' when p_xp >= 800 then 'ouro' when p_xp >= 200 then 'prata' else 'bronze' end
$$;

create or replace function public.in_service_area(lat double precision, lng double precision) returns boolean
language sql immutable as $$ select lat between -0.35 and 0.40 and lng between -51.45 and -50.85 $$;

-- min distance (m) from a point to the route polyline (equirectangular per segment)
create or replace function public.distance_to_route(p_route uuid, p_lat double precision, p_lng double precision)
returns double precision language plpgsql stable security definer set search_path = public as $$
declare g jsonb; n int; i int; best double precision := null;
  ax double precision; ay double precision; bx double precision; by_ double precision;
  px double precision; py double precision; dx double precision; dy double precision; t double precision; d double precision;
  k double precision := cos(radians(p_lat)) * 111320;
begin
  select geometry into g from routes where id = p_route;
  n := coalesce(jsonb_array_length(g), 0);
  if n = 0 then return null; end if;
  px := p_lng * k; py := p_lat * 110540;
  for i in 0..n-1 loop
    ax := (g->i->>1)::float8 * k; ay := (g->i->>0)::float8 * 110540;
    if i < n-1 then
      bx := (g->(i+1)->>1)::float8 * k; by_ := (g->(i+1)->>0)::float8 * 110540;
    else bx := ax; by_ := ay; end if;
    dx := bx - ax; dy := by_ - ay;
    if dx = 0 and dy = 0 then t := 0; else t := greatest(0, least(1, ((px-ax)*dx + (py-ay)*dy) / (dx*dx + dy*dy))); end if;
    d := sqrt(power(px - (ax + t*dx), 2) + power(py - (ay + t*dy), 2));
    if best is null or d < best then best := d; end if;
  end loop;
  return best;
end $$;

create or replace function public.verify_visitor(p_visitor uuid, p_secret text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.visitors v where v.id = p_visitor
    and p_secret is not null and length(p_secret) = 64
    and v.secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex'))
$$;

-- ===== Group recomputation =====
create or replace function public.recompute_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare timeout_s numeric := get_setting('session_timeout_s');
  cnt int; sw double precision; mlat double precision; mlng double precision; best_acc double precision;
  div double precision; lastu timestamptz; toplvl text;
begin
  if p_group is null then return; end if;
  select count(*), sum(1/power(greatest(last_accuracy,5),2)),
         sum(last_lat/power(greatest(last_accuracy,5),2)), sum(last_lng/power(greatest(last_accuracy,5),2)),
         min(last_accuracy), max(last_accepted_at)
    into cnt, sw, mlat, mlng, best_acc, lastu
  from location_sessions
  where group_id = p_group and status = 'active' and last_accepted_at > now() - make_interval(secs => timeout_s);

  if cnt = 0 then
    update bus_groups set status = 'stale', active_contributors = 0 where id = p_group;
    return;
  end if;
  mlat := mlat / sw; mlng := mlng / sw;
  select max(haversine_m(mlat, mlng, last_lat, last_lng)) into div from location_sessions
   where group_id = p_group and status = 'active' and last_accepted_at > now() - make_interval(secs => timeout_s);
  select level_for_xp(max(p.xp)) into toplvl from location_sessions s join profiles p on p.id = s.user_id
   where s.group_id = p_group and s.status = 'active' and p.is_anonymous = false;

  update bus_groups set lat = mlat, lng = mlng,
    accuracy_m = round(greatest(sqrt(1/sw), coalesce(div,0))::numeric, 1),
    divergence_m = round(coalesce(div,0)::numeric, 1),
    active_contributors = cnt, status = 'active', last_update = lastu,
    signal = case when best_acc <= 20 then 'bom' when best_acc <= 50 then 'moderado' else 'fraco' end,
    confidence = case when cnt >= 2 and div < 50 then 'alta' when div < 150 and best_acc <= 50 then 'media' else 'baixa' end,
    top_level = toplvl
  where id = p_group;
end $$;

-- ===== Achievements / XP credit =====
create or replace function public.award_achievements(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int; dur numeric; x int;
begin
  select count(*), coalesce(sum(duration_s),0) into n, dur from contributions where user_id = p_user and xp > 0;
  select xp into x from profiles where id = p_user;
  if n >= 1 then insert into user_achievements(user_id, code) values (p_user,'primeira_viagem') on conflict do nothing; end if;
  if n >= 10 then insert into user_achievements(user_id, code) values (p_user,'dez_viagens') on conflict do nothing; end if;
  if dur >= 3600 then insert into user_achievements(user_id, code) values (p_user,'uma_hora') on conflict do nothing; end if;
  if x >= 200 then insert into user_achievements(user_id, code) values (p_user,'nivel_prata') on conflict do nothing; end if;
  if x >= 800 then insert into user_achievements(user_id, code) values (p_user,'nivel_ouro') on conflict do nothing; end if;
  if x >= 2000 then insert into user_achievements(user_id, code) values (p_user,'nivel_platina') on conflict do nothing; end if;
end $$;

create or replace function public.credit_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s location_sessions; today_xp int; cap int := get_setting('daily_xp_cap')::int; give int;
begin
  select * into s from location_sessions where id = p_session for update;
  if s.user_id is null or s.xp_credited or s.validation <> 'valid' then return; end if;
  select coalesce(sum(xp),0) into today_xp from contributions c
   join location_sessions ls on ls.id = c.session_id
   where c.user_id = s.user_id and date_trunc('day', ls.started_at) = date_trunc('day', s.started_at);
  give := greatest(0, least(s.xp_awarded, cap - today_xp));
  insert into contributions(user_id, session_id, xp, duration_s)
    values (s.user_id, s.id, give, coalesce(extract(epoch from s.last_accepted_at - s.first_accepted_at),0)::int)
    on conflict (session_id) do nothing;
  update profiles set xp = xp + give where id = s.user_id;
  update location_sessions set xp_credited = true, xp_awarded = give where id = s.id;
  perform award_achievements(s.user_id);
end $$;

create or replace function public.finalize_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s location_sessions; dur double precision; quality double precision; continuity double precision;
  regularity double precision; xp int; notes text; v validation_status;
  min_dur numeric := get_setting('min_valid_duration_s'); min_upd numeric := get_setting('min_valid_updates');
  interval_s numeric := get_setting('update_interval_s'); timeout_s numeric := get_setting('session_timeout_s');
begin
  select * into s from location_sessions where id = p_session for update;
  if s.validation <> 'pending' then return; end if;
  dur := coalesce(extract(epoch from s.last_accepted_at - s.first_accepted_at), 0);
  if s.speed_reject_count > 3 and s.speed_reject_count > s.accepted_count * 0.3 then
    v := 'invalid'; notes := 'Deslocamentos com velocidade impossível'; xp := 0;
  elsif s.accepted_count < min_upd or dur < min_dur then
    v := 'inconclusive'; notes := 'Dados insuficientes para validar (duração ou atualizações)'; xp := 0;
  elsif s.user_id is not null and exists (select 1 from location_sessions o where o.id <> s.id and o.user_id = s.user_id
        and o.group_id = s.group_id and o.started_at < coalesce(s.ended_at, now()) and coalesce(o.ended_at, now()) > s.started_at
        and o.validation = 'valid') then
    v := 'invalid'; notes := 'Sessão duplicada no mesmo grupo'; xp := 0;
  else
    quality := s.accepted_count::float8 / greatest(s.accepted_count + s.rejected_count, 1);
    continuity := 1 - least(s.max_gap_s / greatest(timeout_s,1), 1) * 0.5;
    regularity := least(1, s.accepted_count / greatest(dur / interval_s, 1));
    xp := greatest(1, floor(least(dur/60, 120) * 2 * quality * continuity * regularity))::int;
    v := 'valid'; notes := format('qualidade %s%%, continuidade %s%%, regularidade %s%%',
      round((quality*100)::numeric), round((continuity*100)::numeric), round((regularity*100)::numeric));
  end if;
  update location_sessions set validation = v, validation_notes = notes, xp_awarded = xp where id = s.id;
  if v = 'valid' then perform credit_session(s.id); end if;
end $$;

-- ===== Expiration & cleanup =====
create or replace function public.expire_stale() returns json
language plpgsql security definer set search_path = public as $$
declare timeout_s numeric := get_setting('session_timeout_s'); r record; n_exp int := 0; n_grp int := 0; n_upd int := 0;
begin
  for r in update location_sessions set status = 'expired', ended_at = last_update_at, end_reason = 'sem_atualizacao'
           where status = 'active' and last_update_at < now() - make_interval(secs => timeout_s)
           returning id, group_id loop
    n_exp := n_exp + 1;
    perform finalize_session(r.id);
    perform recompute_group(r.group_id);
  end loop;
  -- groups whose contributors stopped sending accepted positions
  for r in select g.id from bus_groups g where g.status = 'active' and g.last_update < now() - make_interval(secs => timeout_s) loop
    perform recompute_group(r.id);
  end loop;
  delete from bus_groups where status = 'stale' and last_update < now() - make_interval(secs => get_setting('stale_retention_s'));
  get diagnostics n_grp = row_count;
  delete from gps_updates where created_at < now() - make_interval(hours => get_setting('gps_retention_h')::int);
  get diagnostics n_upd = row_count;
  return json_build_object('expired', n_exp, 'deleted_groups', n_grp, 'deleted_updates', n_upd);
end $$;

create or replace function public.run_maintenance() returns void
language plpgsql security definer set search_path = public as $$
declare j json;
begin
  j := expire_stale();
  insert into maintenance_log(expired_sessions, deleted_groups, deleted_updates)
    values ((j->>'expired')::int, (j->>'deleted_groups')::int, (j->>'deleted_updates')::int);
  delete from maintenance_log where ran_at < now() - interval '7 days';
  -- abandoned anonymous devices (no account, unused for 180 days)
  delete from visitors where user_id is null and last_seen_at < now() - interval '180 days';
end $$;

-- ===== Public RPCs =====
create or replace function public.register_visitor() returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare sec text := encode(extensions.gen_random_bytes(32), 'hex'); vid uuid;
begin
  if (select count(*) from visitors where created_at > now() - interval '1 minute') > 120 then
    raise exception 'RATE_LIMIT';
  end if;
  insert into visitors(secret_hash) values (encode(extensions.digest(sec, 'sha256'), 'hex')) returning id into vid;
  return json_build_object('visitor_id', vid, 'secret', sec);
end $$;

create or replace function public.start_session(p_visitor uuid, p_secret text, p_route uuid,
  p_lat double precision, p_lng double precision, p_accuracy double precision, p_target_group uuid default null)
returns json language plpgsql volatile security definer set search_path = public as $$
declare v visitors; sid uuid; gid uuid; g bus_groups; match text := 'new_group'; dist double precision;
  route_dist double precision; old record;
  max_c int := get_setting('max_contributors')::int; join_r numeric := get_setting('group_join_radius_m');
  timeout_s numeric := get_setting('session_timeout_s');
begin
  if not verify_visitor(p_visitor, p_secret) then raise exception 'INVALID_VISITOR'; end if;
  select * into v from visitors where id = p_visitor;
  if not exists (select 1 from routes where id = p_route and status = 'published') then raise exception 'ROUTE_UNAVAILABLE'; end if;
  if p_lat is null or p_lng is null or p_accuracy is null or p_accuracy <= 0 or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'INVALID_COORDS'; end if;
  if not in_service_area(p_lat, p_lng) then raise exception 'OUT_OF_AREA'; end if;
  if p_accuracy > get_setting('max_accuracy_m') then raise exception 'LOW_ACCURACY'; end if;
  if (select count(*) from location_sessions where visitor_id = p_visitor and started_at > now() - interval '10 minutes')
     >= get_setting('max_sessions_per_10min') then raise exception 'RATE_LIMIT'; end if;

  perform expire_stale();

  -- one active session per device
  for old in update location_sessions set status = 'ended', ended_at = now(), end_reason = 'substituida'
             where visitor_id = p_visitor and status = 'active' returning id, group_id loop
    perform finalize_session(old.id); perform recompute_group(old.group_id);
  end loop;

  route_dist := distance_to_route(p_route, p_lat, p_lng);

  if p_target_group is not null then
    select * into g from bus_groups where id = p_target_group and route_id = p_route for update;
    if found then
      dist := haversine_m(g.lat, g.lng, p_lat, p_lng);
      if g.status = 'active' then
        if g.active_contributors >= max_c then raise exception 'GROUP_FULL'; end if;
        if dist <= join_r + least(p_accuracy, 100) + g.accuracy_m then gid := g.id; match := 'joined_active';
        else match := 'target_mismatch'; end if;
      else
        if dist <= get_setting('stale_join_radius_m') + least(p_accuracy, 100)
           and (route_dist is null or route_dist <= get_setting('route_max_distance_m') + least(p_accuracy,100)) then
          gid := g.id; match := 'joined_stale';
        else match := 'target_mismatch'; end if;
      end if;
    else match := 'target_mismatch'; end if;
  end if;

  if gid is null and match <> 'target_mismatch' then
    select * into g from bus_groups where route_id = p_route and status = 'active'
      and haversine_m(lat, lng, p_lat, p_lng) <= join_r + least(p_accuracy,100) + accuracy_m
      order by haversine_m(lat, lng, p_lat, p_lng) limit 1 for update;
    if found then
      if g.active_contributors >= max_c then raise exception 'GROUP_FULL'; end if;
      gid := g.id; match := 'joined_active';
    end if;
  end if;

  if gid is null then
    insert into bus_groups(route_id, lat, lng, accuracy_m, active_contributors, status, last_update)
      values (p_route, p_lat, p_lng, p_accuracy, 0, 'active', now()) returning id into gid;
    if match <> 'target_mismatch' then match := 'new_group'; end if;
  end if;

  insert into location_sessions(visitor_id, user_id, route_id, group_id, update_count, accepted_count,
     first_accepted_at, last_accepted_at, last_lat, last_lng, last_accuracy)
    values (p_visitor, v.user_id, p_route, gid, 1, 1, now(), now(), p_lat, p_lng, p_accuracy) returning id into sid;
  insert into gps_updates(session_id, lat, lng, accuracy_m, accepted) values (sid, p_lat, p_lng, p_accuracy, true);
  update visitors set last_seen_at = now() where id = p_visitor;
  perform recompute_group(gid);

  return json_build_object('session_id', sid, 'group_id', gid, 'match', match,
    'off_route', coalesce(route_dist > get_setting('route_max_distance_m'), false),
    'update_interval_s', get_setting('update_interval_s'), 'timeout_s', timeout_s,
    'contributors', (select active_contributors from bus_groups where id = gid));
end $$;

create or replace function public.push_update(p_session uuid, p_visitor uuid, p_secret text,
  p_lat double precision, p_lng double precision, p_accuracy double precision)
returns json language plpgsql volatile security definer set search_path = public as $$
declare s location_sessions; reason text := null; dt double precision; d double precision := 0; spd double precision := null;
  timeout_s numeric := get_setting('session_timeout_s'); others record; new_gid uuid; old_gid uuid;
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
  else
    update location_sessions set update_count = update_count + 1, rejected_count = rejected_count + 1,
      speed_reject_count = speed_reject_count + (reason = 'IMPOSSIBLE_SPEED')::int,
      last_update_at = now() where id = s.id;
  end if;
  update visitors set last_seen_at = now() where id = p_visitor;
  return json_build_object('accepted', reason is null, 'reason', reason, 'group_id', s.group_id,
    'contributors', (select active_contributors from bus_groups where id = s.group_id));
end $$;

create or replace function public.end_session(p_session uuid, p_visitor uuid, p_secret text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare s location_sessions;
begin
  if not verify_visitor(p_visitor, p_secret) then raise exception 'INVALID_VISITOR'; end if;
  update location_sessions set status = 'ended', ended_at = now(), end_reason = 'usuario'
    where id = p_session and visitor_id = p_visitor and status = 'active' returning * into s;
  if not found then return json_build_object('ended', false); end if;
  perform finalize_session(s.id);
  perform recompute_group(s.group_id);
  select * into s from location_sessions where id = p_session;
  return json_build_object('ended', true, 'validation', s.validation, 'notes', s.validation_notes,
     'xp', s.xp_awarded, 'credited', s.xp_credited);
end $$;

-- link anonymous device to the signed-in account (proof = device secret)
create or replace function public.claim_visitor(p_visitor uuid, p_secret text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid(); v visitors; r record; n int := 0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not verify_visitor(p_visitor, p_secret) then raise exception 'INVALID_VISITOR'; end if;
  select * into v from visitors where id = p_visitor for update;
  if v.user_id is not null and v.user_id <> uid then raise exception 'ALREADY_LINKED'; end if;
  update visitors set user_id = uid where id = p_visitor;
  update location_sessions set user_id = uid where visitor_id = p_visitor and user_id is null;
  for r in select id from location_sessions where visitor_id = p_visitor and validation = 'valid' and not xp_credited loop
    perform credit_session(r.id); n := n + 1;
  end loop;
  return json_build_object('linked', true, 'credited_sessions', n);
end $$;

-- erase personal data before account deletion
create or replace function public.delete_my_data() returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  delete from contributions where user_id = uid;
  delete from user_achievements where user_id = uid;
  update location_sessions set user_id = null where user_id = uid;
  update visitors set user_id = null where user_id = uid;
end $$;

create or replace function public.admin_stats() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return json_build_object(
    'routes_total', (select count(*) from routes),
    'routes_published', (select count(*) from routes where status = 'published'),
    'routes_draft', (select count(*) from routes where status = 'draft'),
    'routes_inactive', (select count(*) from routes where status = 'inactive'),
    'sessions_active', (select count(*) from location_sessions where status = 'active'
        and last_update_at > now() - make_interval(secs => get_setting('session_timeout_s'))),
    'groups_active', (select count(*) from bus_groups where status = 'active'),
    'groups_stale', (select count(*) from bus_groups where status = 'stale'),
    'sessions_24h', (select count(*) from location_sessions where started_at > now() - interval '24 hours'),
    'valid_24h', (select count(*) from location_sessions where started_at > now() - interval '24 hours' and validation = 'valid'),
    'invalid_24h', (select count(*) from location_sessions where started_at > now() - interval '24 hours' and validation = 'invalid'),
    'inconclusive_24h', (select count(*) from location_sessions where started_at > now() - interval '24 hours' and validation = 'inconclusive'),
    'updates_24h', (select count(*) from gps_updates where created_at > now() - interval '24 hours'),
    'rejected_24h', (select count(*) from gps_updates where created_at > now() - interval '24 hours' and not accepted),
    'visitors', (select count(*) from visitors),
    'users', (select count(*) from profiles),
    'last_maintenance', (select max(ran_at) from maintenance_log)
  );
end $$;

-- ===== Function privileges =====
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.register_visitor() to anon, authenticated;
grant execute on function public.start_session(uuid,text,uuid,double precision,double precision,double precision,uuid) to anon, authenticated;
grant execute on function public.push_update(uuid,uuid,text,double precision,double precision,double precision) to anon, authenticated;
grant execute on function public.end_session(uuid,uuid,text) to anon, authenticated;
grant execute on function public.claim_visitor(uuid,text) to authenticated;
grant execute on function public.delete_my_data() to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.level_for_xp(integer) to anon, authenticated;
grant execute on function public.haversine_m(double precision,double precision,double precision,double precision) to anon, authenticated;
grant execute on function public.in_service_area(double precision,double precision) to anon, authenticated;

-- ===== Realtime =====
alter publication supabase_realtime add table public.bus_groups;
alter publication supabase_realtime add table public.routes;

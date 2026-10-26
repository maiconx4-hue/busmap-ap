CREATE TABLE public.group_motion (group_id uuid PRIMARY KEY REFERENCES public.bus_groups(id) ON DELETE CASCADE, geometry_hash text NOT NULL, first_at timestamptz NOT NULL, first_progress_m float8 NOT NULL, last_at timestamptz NOT NULL, last_progress_m float8 NOT NULL, observed_s float8 NOT NULL DEFAULT 0, sample_count int NOT NULL DEFAULT 1, speed_mps float8, total_m float8 NOT NULL, estimate_until timestamptz);
GRANT ALL ON public.group_motion TO service_role;
ALTER TABLE public.group_motion ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.group_motion IS 'Private aggregate of accepted on-route group movement, never raw history or XP.';
CREATE OR REPLACE FUNCTION public.project_route(geom jsonb, plat float8, plng float8) RETURNS TABLE(progress_m float8,total_m float8,distance_m float8,ambiguous boolean) LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE i int; al float8; ao float8; bl float8; bo float8; dx float8; dy float8; px float8; py float8; t float8; seg float8; cum float8:=0; best float8:='Infinity'; d float8; candidate float8; k float8:=cos(radians(plat))*111320;
BEGIN
 IF jsonb_typeof(geom) IS DISTINCT FROM 'array' OR jsonb_array_length(geom)<2 THEN RETURN; END IF;
 ambiguous:=false;
 FOR i IN 0..jsonb_array_length(geom)-2 LOOP
 al:=(geom->i->>0)::float8; ao:=(geom->i->>1)::float8; bl:=(geom->(i+1)->>0)::float8; bo:=(geom->(i+1)->>1)::float8;
 dx:=(bo-ao)*k; dy:=(bl-al)*110540; px:=(plng-ao)*k; py:=(plat-al)*110540;
 t:=CASE WHEN dx*dx+dy*dy=0 THEN 0 ELSE greatest(0,least(1,(px*dx+py*dy)/(dx*dx+dy*dy))) END;
 seg:=haversine_m(al,ao,bl,bo); d:=sqrt(power(px-t*dx,2)+power(py-t*dy,2)); candidate:=cum+t*seg;
 IF abs(d-best)<=10 AND abs(candidate-progress_m)>200 THEN ambiguous:=true; END IF;
 IF d<best THEN IF best-d>10 THEN ambiguous:=false; END IF; best:=d; progress_m:=candidate; END IF;
 cum:=cum+seg;
 END LOOP; total_m:=cum; distance_m:=best; RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.project_route(jsonb,float8,float8) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_route(jsonb,float8,float8) TO service_role;
CREATE OR REPLACE FUNCTION public.route_point_at(geom jsonb, progress float8) RETURNS TABLE(lat float8,lng float8) LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE i int; al float8; ao float8; bl float8; bo float8; seg float8; cum float8:=0; t float8;
BEGIN
 IF jsonb_typeof(geom) IS DISTINCT FROM 'array' OR jsonb_array_length(geom)<2 THEN RETURN; END IF;
 FOR i IN 0..jsonb_array_length(geom)-2 LOOP
 al:=(geom->i->>0)::float8; ao:=(geom->i->>1)::float8; bl:=(geom->(i+1)->>0)::float8; bo:=(geom->(i+1)->>1)::float8; seg:=haversine_m(al,ao,bl,bo);
 IF progress<=cum+seg OR i=jsonb_array_length(geom)-2 THEN t:=CASE WHEN seg=0 THEN 0 ELSE greatest(0,least(1,(progress-cum)/seg)) END; lat:=al+t*(bl-al); lng:=ao+t*(bo-ao); RETURN NEXT; RETURN; END IF; cum:=cum+seg;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.route_point_at(jsonb,float8) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.route_point_at(jsonb,float8) TO service_role;
CREATE OR REPLACE FUNCTION public.record_group_motion(gid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g bus_groups; geom jsonb; p record; m group_motion; dt float8; delta float8; speed float8; hash text;
BEGIN
 SELECT * INTO g FROM bus_groups WHERE id=gid FOR UPDATE;
 IF NOT FOUND OR g.status<>'active' OR g.divergence_m>50 OR g.accuracy_m>50 THEN RETURN; END IF;
 SELECT geometry INTO geom FROM routes WHERE id=g.route_id;
 SELECT * INTO p FROM project_route(geom,g.lat,g.lng);
 IF NOT FOUND OR p.ambiguous OR p.distance_m>150+g.accuracy_m OR p.total_m<=0 THEN RETURN; END IF;
 hash:=md5(geom::text); SELECT * INTO m FROM group_motion WHERE group_id=gid FOR UPDATE;
 IF FOUND AND g.last_update<=m.last_at THEN RETURN; END IF;
 IF m.group_id IS NULL OR m.geometry_hash<>hash OR extract(epoch FROM g.last_update-m.last_at)>get_setting('session_timeout_s') THEN
 INSERT INTO group_motion(group_id,geometry_hash,first_at,first_progress_m,last_at,last_progress_m,total_m) VALUES(gid,hash,g.last_update,p.progress_m,g.last_update,p.progress_m,p.total_m)
 ON CONFLICT(group_id) DO UPDATE SET geometry_hash=excluded.geometry_hash,first_at=excluded.first_at,first_progress_m=excluded.first_progress_m,last_at=excluded.last_at,last_progress_m=excluded.last_progress_m,total_m=excluded.total_m,sample_count=1,observed_s=0,speed_mps=NULL,estimate_until=NULL; RETURN;
 END IF;
 dt:=extract(epoch FROM g.last_update-m.last_at); delta:=p.progress_m-m.last_progress_m;
 IF dt<=0 THEN RETURN; END IF;
 IF abs(delta)/dt>get_setting('max_speed_kmh')/3.6 OR (m.speed_mps IS NOT NULL AND delta*m.speed_mps<0 AND abs(delta)>greatest(50,2*g.accuracy_m)) THEN
 UPDATE group_motion SET first_at=g.last_update,first_progress_m=p.progress_m,last_at=g.last_update,last_progress_m=p.progress_m,sample_count=1,observed_s=0,speed_mps=NULL,estimate_until=NULL WHERE group_id=gid; RETURN;
 END IF;
 dt:=extract(epoch FROM g.last_update-m.first_at); speed:=(p.progress_m-m.first_progress_m)/greatest(dt,1);
 IF dt<180 OR m.sample_count<5 OR abs(p.progress_m-m.first_progress_m)<=greatest(100,4*g.accuracy_m) OR abs(speed)<0.5 THEN speed:=NULL; END IF;
 UPDATE group_motion SET last_at=g.last_update,last_progress_m=p.progress_m,sample_count=sample_count+1,observed_s=dt,speed_mps=speed,total_m=p.total_m,estimate_until=CASE WHEN speed IS NULL THEN NULL ELSE g.last_update+make_interval(secs=>CASE WHEN speed>0 THEN (p.total_m-p.progress_m)/speed ELSE p.progress_m/(-speed) END) END WHERE group_id=gid;
END $$;
REVOKE ALL ON FUNCTION public.record_group_motion(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_group_motion(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.group_estimate(gid uuid, at_time timestamptz DEFAULT now()) RETURNS TABLE(lat float8,lng float8,based_at timestamptz,until_at timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE m group_motion; geom jsonb; progress float8;
BEGIN
 SELECT * INTO m FROM group_motion WHERE group_id=gid;
 IF NOT FOUND OR m.observed_s<180 OR m.speed_mps IS NULL OR at_time>=m.estimate_until THEN RETURN; END IF;
 SELECT r.geometry INTO geom FROM routes r JOIN bus_groups g ON g.route_id=r.id WHERE g.id=gid AND r.status='published';
 IF geom IS NULL OR md5(geom::text)<>m.geometry_hash THEN RETURN; END IF;
 progress:=m.last_progress_m+m.speed_mps*greatest(0,extract(epoch FROM at_time-m.last_at));
 RETURN QUERY SELECT p.lat,p.lng,m.last_at,m.estimate_until FROM route_point_at(geom,progress) p;
END $$;
REVOKE ALL ON FUNCTION public.group_estimate(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.group_estimate(uuid,timestamptz) TO service_role;
CREATE OR REPLACE FUNCTION public.public_map_groups() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(rows)),'[]'::jsonb) FROM (
 SELECT g.id,g.route_id,CASE WHEN a.live THEN g.lat ELSE coalesce(e.lat,g.lat) END lat,CASE WHEN a.live THEN g.lng ELSE coalesce(e.lng,g.lng) END lng,g.accuracy_m,g.divergence_m,CASE WHEN a.live THEN g.active_contributors ELSE 0 END active_contributors,CASE WHEN a.live THEN 'active' ELSE 'stale' END status,g.signal,g.confidence,g.top_level,g.last_update,(NOT a.live AND e.lat IS NOT NULL) estimated,CASE WHEN NOT a.live THEN e.based_at END estimate_based_at,CASE WHEN NOT a.live THEN e.until_at END estimate_until,now() server_now
 FROM bus_groups g JOIN routes r ON r.id=g.route_id AND r.status='published'
 CROSS JOIN LATERAL (SELECT g.status='active' AND g.active_contributors>0 AND g.last_update>=now()-make_interval(secs=>get_setting('session_timeout_s')) live) a
 LEFT JOIN LATERAL group_estimate(g.id,now()) e ON true
 WHERE a.live OR e.lat IS NOT NULL OR g.last_update>=now()-make_interval(secs=>get_setting('stale_retention_s'))
 ORDER BY g.last_update DESC LIMIT 500) rows;
$$;
REVOKE ALL ON FUNCTION public.public_map_groups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_map_groups() TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.group_motion_after_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NEW.status='active' AND (TG_OP='INSERT' OR NEW.last_update IS DISTINCT FROM OLD.last_update) THEN PERFORM record_group_motion(NEW.id); END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.group_motion_after_write() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER group_motion_after_write AFTER INSERT OR UPDATE ON public.bus_groups FOR EACH ROW EXECUTE FUNCTION public.group_motion_after_write();
CREATE OR REPLACE FUNCTION public.recompute_group(p_group uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE timeout_s numeric:=get_setting('session_timeout_s'); cnt int; sw float8; mlat float8; mlng float8; best_acc float8; div float8; lastu timestamptz; toplvl text;
BEGIN
 IF p_group IS NULL THEN RETURN; END IF;
 SELECT count(*),sum(1/power(greatest(last_accuracy,5),2)),sum(last_lat/power(greatest(last_accuracy,5),2)),sum(last_lng/power(greatest(last_accuracy,5),2)),min(last_accuracy),max(last_accepted_at) INTO cnt,sw,mlat,mlng,best_acc,lastu FROM location_sessions WHERE group_id=p_group AND status='active' AND off_route_count=0 AND route_distance_m(route_id,last_lat,last_lng)<=150+last_accuracy AND last_accepted_at>now()-make_interval(secs=>timeout_s);
 IF cnt=0 THEN UPDATE bus_groups SET status='stale',active_contributors=0 WHERE id=p_group; RETURN; END IF;
 mlat:=mlat/sw; mlng:=mlng/sw;
 SELECT max(haversine_m(mlat,mlng,last_lat,last_lng)) INTO div FROM location_sessions WHERE group_id=p_group AND status='active' AND off_route_count=0 AND route_distance_m(route_id,last_lat,last_lng)<=150+last_accuracy AND last_accepted_at>now()-make_interval(secs=>timeout_s);
 SELECT level_for_xp(max(p.xp)) INTO toplvl FROM location_sessions s JOIN profiles p ON p.id=s.user_id WHERE s.group_id=p_group AND s.status='active' AND NOT p.is_anonymous;
 UPDATE bus_groups SET lat=mlat,lng=mlng,accuracy_m=round(greatest(sqrt(1/sw),coalesce(div,0))::numeric,1),divergence_m=round(coalesce(div,0)::numeric,1),active_contributors=cnt,status='active',last_update=lastu,signal=CASE WHEN best_acc<=20 THEN 'bom' WHEN best_acc<=50 THEN 'moderado' ELSE 'fraco' END,confidence=CASE WHEN cnt>=2 AND div<50 THEN 'alta' WHEN div<150 AND best_acc<=50 THEN 'media' ELSE 'baixa' END,top_level=toplvl WHERE id=p_group;
END $$;
DO $patch$
DECLARE definition text; old_section text;
BEGIN
 SELECT pg_get_functiondef('public.push_update(uuid,uuid,text,double precision,double precision,double precision)'::regprocedure) INTO definition;
 old_section:=substring(definition FROM position('    -- auto-stop' IN definition) FOR position(E'\n  else\n    update location_sessions' IN definition)-position('    -- auto-stop' IN definition));
 IF old_section IS NULL OR old_section='' THEN RAISE EXCEPTION 'push_update integration section missing'; END IF;
 definition:=replace(definition,old_section,'');
 definition:=replace(definition,'  insert into gps_updates', $insert$
  if reason is null then
    rd:=public.route_distance_m(s.route_id,p_lat,p_lng);
    if rd is not null and rd>coalesce(get_setting('off_route_radius_m'),150)+p_accuracy then
      off_c:=s.off_route_count+1;
      update public.location_sessions set off_route_count=off_c,last_update_at=now() where id=s.id;
      if off_c>=coalesce(get_setting('off_route_max_updates'),3) then
        update public.location_sessions set status='ended',ended_at=now(),end_reason='fora_da_rota' where id=s.id;
        perform public.finalize_session(s.id); perform public.recompute_group(s.group_id);
        return json_build_object('accepted',false,'reason','OFF_ROUTE','ended',true,'group_id',s.group_id,'contributors',(select active_contributors from public.bus_groups where id=s.group_id));
      end if;
      perform public.recompute_group(s.group_id);
      return json_build_object('accepted',false,'reason','OFF_ROUTE_PENDING','group_id',s.group_id,'contributors',(select active_contributors from public.bus_groups where id=s.group_id));
    end if;
    update public.location_sessions set off_route_count=0 where id=s.id;
  end if;
  insert into gps_updates$insert$);
 EXECUTE definition;
 SELECT pg_get_functiondef('public.start_session(uuid,text,uuid,double precision,double precision,double precision,uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'dist := haversine_m(g.lat, g.lng, p_lat, p_lng);',$match$
 dist := haversine_m(g.lat,g.lng,p_lat,p_lng);
 if g.status<>'active' then
   select public.haversine_m(e.lat,e.lng,p_lat,p_lng) into dist from public.group_estimate(g.id,now()) e;
   if dist is null then dist:=public.haversine_m(g.lat,g.lng,p_lat,p_lng); end if;
 end if;$match$);
 definition:=replace(definition,E'  if gid is null then\n    insert into bus_groups',$match$
  if gid is null and match<>'target_mismatch' and route_dist<=get_setting('route_max_distance_m')+least(p_accuracy,100) then
    select candidate.id into gid from public.bus_groups candidate cross join lateral public.group_estimate(candidate.id,now()) e
      where candidate.route_id=p_route and candidate.status<>'active' and public.haversine_m(e.lat,e.lng,p_lat,p_lng)<=get_setting('stale_join_radius_m')+least(p_accuracy,100)
      order by public.haversine_m(e.lat,e.lng,p_lat,p_lng) limit 1 for update of candidate;
    if gid is not null then match:='joined_stale'; end if;
  end if;
  if gid is null then
    insert into bus_groups$match$);
 EXECUTE definition;
 SELECT pg_get_functiondef('public.expire_stale()'::regprocedure) INTO definition;
 definition:=replace(definition,'delete from bus_groups where status = ''stale'' and last_update < now() - make_interval(secs => get_setting(''stale_retention_s''));','delete from bus_groups g where status=''stale'' and last_update<now()-make_interval(secs=>get_setting(''stale_retention_s'')) and not exists(select 1 from public.group_estimate(g.id,now()));');
 EXECUTE definition;
END $patch$;
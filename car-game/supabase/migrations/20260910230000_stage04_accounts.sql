-- Paper Kart Stage 04: the smallest persistent player profile and race record.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '纸片车手' check (char_length(nickname) between 1 and 12),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  created_at timestamptz not null default now()
);

create table if not exists public.race_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  races integer not null default 0 check (races >= 0),
  wins integer not null default 0 check (wins >= 0 and wins <= races),
  best_finish smallint check (best_finish between 1 and 6),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.race_stats enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.race_stats from anon, authenticated;
grant usage on schema public to authenticated;
grant select on table public.profiles, public.race_stats to authenticated;
grant insert (user_id, nickname, avatar_url) on table public.profiles to authenticated;
grant update (nickname, avatar_url) on table public.profiles to authenticated;

drop policy if exists "Players read their own profile" on public.profiles;
create policy "Players read their own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Players create their own profile" on public.profiles;
create policy "Players create their own profile"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Players update their own profile" on public.profiles;
create policy "Players update their own profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Players read their own race stats" on public.race_stats;
create policy "Players read their own race stats"
on public.race_stats for select to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.handle_new_paper_kart_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id, nickname)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''), '纸片车手'), 12)
  )
  on conflict (user_id) do nothing;

  insert into public.race_stats (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_paper_kart_user() from public;

drop trigger if exists on_auth_user_created_paper_kart on auth.users;
create trigger on_auth_user_created_paper_kart
after insert on auth.users
for each row execute procedure public.handle_new_paper_kart_user();

-- Backfill accounts that existed before this migration was applied.
insert into public.profiles (user_id, nickname, created_at)
select
  id,
  left(coalesce(nullif(trim(raw_user_meta_data ->> 'nickname'), ''), '纸片车手'), 12),
  created_at
from auth.users
on conflict (user_id) do nothing;

insert into public.race_stats (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.record_race_result(finish_position smallint)
returns public.race_stats
language plpgsql
security definer set search_path = ''
as $$
declare
  player_id uuid := auth.uid();
  updated_stats public.race_stats;
begin
  if player_id is null then
    raise exception 'Authentication required';
  end if;
  if finish_position is null or finish_position < 1 or finish_position > 6 then
    raise exception 'Finish position must be between 1 and 6';
  end if;

  insert into public.race_stats (user_id, races, wins, best_finish, updated_at)
  values (player_id, 1, case when finish_position = 1 then 1 else 0 end, finish_position, now())
  on conflict (user_id) do update set
    races = public.race_stats.races + 1,
    wins = public.race_stats.wins + case when finish_position = 1 then 1 else 0 end,
    best_finish = case
      when public.race_stats.best_finish is null then finish_position
      else least(public.race_stats.best_finish, finish_position)
    end,
    updated_at = now()
  returning * into updated_stats;
  return updated_stats;
end;
$$;

revoke all on function public.record_race_result(smallint) from public, anon;
grant execute on function public.record_race_result(smallint) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Paper Kart avatars are publicly readable" on storage.objects;
create policy "Paper Kart avatars are publicly readable"
on storage.objects for select to public
using (bucket_id = 'avatars');

drop policy if exists "Players upload their own avatar" on storage.objects;
create policy "Players upload their own avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and lower(storage.extension(name)) = 'png'
);

drop policy if exists "Players update their own avatar" on storage.objects;
create policy "Players update their own avatar"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and lower(storage.extension(name)) = 'png'
);

drop policy if exists "Players delete their own avatar" on storage.objects;
create policy "Players delete their own avatar"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

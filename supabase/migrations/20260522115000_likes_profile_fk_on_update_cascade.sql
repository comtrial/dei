alter table public.likes
  drop constraint if exists likes_from_profile_fkey,
  drop constraint if exists likes_to_profile_fkey;

alter table public.likes
  add constraint likes_from_profile_fkey
    foreign key (from_user_id)
    references public.profiles(user_id)
    on update cascade
    on delete cascade,
  add constraint likes_to_profile_fkey
    foreign key (to_user_id)
    references public.profiles(user_id)
    on update cascade
    on delete cascade;

ALTER TABLE public.likes
  ADD CONSTRAINT likes_from_profile_fkey
    FOREIGN KEY (from_user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  ADD CONSTRAINT likes_to_profile_fkey
    FOREIGN KEY (to_user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;;

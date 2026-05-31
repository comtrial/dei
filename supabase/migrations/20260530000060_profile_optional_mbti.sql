-- B onboarding/settings: optional MBTI profile field used by S04c/S19.

alter table public.profile
  add column if not exists mbti text
  check (
    mbti is null
    or mbti in (
      'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
      'ISTP', 'ISFP', 'INFP', 'INTP',
      'ESTP', 'ESFP', 'ENFP', 'ENTP',
      'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'
    )
  );

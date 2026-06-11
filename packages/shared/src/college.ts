export const COLLEGE_UNIVERSITY_MAX_LENGTH = 80;
export const COLLEGE_GWATING_MIN_MEMBERS = 2;

export type CollegeProfileInput = {
  isStudent?: boolean | null;
  universityName?: string | null;
};

export type MatchQueueMode = 'normal' | 'college';

export function normalizeUniversityName(value?: string | null) {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

export function collegeProfileCompleted(profile: CollegeProfileInput) {
  if (!profile.isStudent) {
    return false;
  }

  const universityName = normalizeUniversityName(profile.universityName);
  return universityName.length > 0 && universityName.length <= COLLEGE_UNIVERSITY_MAX_LENGTH;
}

export function isMatchQueueMode(value: unknown): value is MatchQueueMode {
  return value === 'normal' || value === 'college';
}

export function toMatchQueueMode(value: unknown): MatchQueueMode {
  return isMatchQueueMode(value) ? value : 'normal';
}

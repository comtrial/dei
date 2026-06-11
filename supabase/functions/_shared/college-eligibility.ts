import {
  collegeProfileCompleted,
  COLLEGE_GWATING_MIN_MEMBERS,
  toMatchQueueMode,
  type MatchQueueMode,
} from '../../../packages/shared/src/college.ts';

export type CollegeEligibilityProfile = {
  is_student: boolean | null;
  nickname: string | null;
  university_name: string | null;
  user_id: string;
};

export type CollegeEligibilityFailureCode = 'COLLEGE_PROFILE_REQUIRED' | 'COLLEGE_TEAM_REQUIRED';

export function getCollegeEligibilityFailure(
  rawMode: unknown,
  profiles: CollegeEligibilityProfile[],
  memberCount = profiles.length,
): CollegeEligibilityFailureCode | null {
  const mode: MatchQueueMode = toMatchQueueMode(rawMode);
  if (mode !== 'college') {
    return null;
  }

  if (memberCount < COLLEGE_GWATING_MIN_MEMBERS) {
    return 'COLLEGE_TEAM_REQUIRED';
  }

  return profiles.every((profile) =>
    collegeProfileCompleted({
      isStudent: profile.is_student,
      universityName: profile.university_name,
    }),
  )
    ? null
    : 'COLLEGE_PROFILE_REQUIRED';
}

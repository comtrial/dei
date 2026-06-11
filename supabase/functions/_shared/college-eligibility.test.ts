import { assertEquals } from 'jsr:@std/assert';

import {
  getCollegeEligibilityFailure,
  type CollegeEligibilityProfile,
} from './college-eligibility.ts';

const baseProfile: CollegeEligibilityProfile = {
  is_student: true,
  nickname: '도경',
  university_name: '한국대학교',
  user_id: 'u1',
};

Deno.test('college eligibility allows normal mode without checking student fields', () => {
  assertEquals(
    getCollegeEligibilityFailure('normal', [
      { ...baseProfile, is_student: false, university_name: null },
    ]),
    null,
  );
});

Deno.test('college eligibility requires every member to be a current student', () => {
  assertEquals(
    getCollegeEligibilityFailure('college', [
      baseProfile,
      { ...baseProfile, is_student: false, user_id: 'u2' },
    ]),
    'COLLEGE_PROFILE_REQUIRED',
  );
});

Deno.test('college eligibility requires every member to have a university name', () => {
  assertEquals(
    getCollegeEligibilityFailure('college', [
      baseProfile,
      { ...baseProfile, university_name: '   ', user_id: 'u2' },
    ]),
    'COLLEGE_PROFILE_REQUIRED',
  );
});

Deno.test('college eligibility requires at least two members', () => {
  assertEquals(
    getCollegeEligibilityFailure('college', [
      baseProfile,
    ]),
    'COLLEGE_TEAM_REQUIRED',
  );
});

Deno.test('college eligibility accepts college mode when all members completed their college profile', () => {
  assertEquals(
    getCollegeEligibilityFailure('college', [
      baseProfile,
      { ...baseProfile, university_name: '다른대학교', user_id: 'u2' },
    ]),
    null,
  );
});

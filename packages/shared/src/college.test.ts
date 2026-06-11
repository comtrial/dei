import { describe, expect, it } from 'vitest';

import {
  COLLEGE_GWATING_MIN_MEMBERS,
  COLLEGE_UNIVERSITY_MAX_LENGTH,
  collegeProfileCompleted,
  normalizeUniversityName,
  toMatchQueueMode,
} from './college';

describe('college profile eligibility', () => {
  it('normalizes university names by trimming and collapsing internal whitespace', () => {
    expect(normalizeUniversityName('  한국   대학교  ')).toBe('한국 대학교');
  });

  it('treats non-students as not college eligible even when a university name exists', () => {
    expect(collegeProfileCompleted({ isStudent: false, universityName: '한국대학교' })).toBe(false);
  });

  it('requires a non-empty university name for students', () => {
    expect(collegeProfileCompleted({ isStudent: true, universityName: null })).toBe(false);
    expect(collegeProfileCompleted({ isStudent: true, universityName: '   ' })).toBe(false);
    expect(collegeProfileCompleted({ isStudent: true, universityName: '한국대학교' })).toBe(true);
  });

  it('rejects university names over the configured maximum length', () => {
    expect(
      collegeProfileCompleted({
        isStudent: true,
        universityName: '가'.repeat(COLLEGE_UNIVERSITY_MAX_LENGTH + 1),
      }),
    ).toBe(false);
  });

  it('uses at least two people for gwating teams', () => {
    expect(COLLEGE_GWATING_MIN_MEMBERS).toBe(2);
  });

  it('falls back to normal matching mode for unknown mode values', () => {
    expect(toMatchQueueMode('college')).toBe('college');
    expect(toMatchQueueMode('invalid')).toBe('normal');
    expect(toMatchQueueMode(null)).toBe('normal');
  });
});

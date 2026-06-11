export type ProfileSessionSnapshot = {
  bio?: string | null;
  birthDate?: string | null;
  birthYear?: number | null;
  gender?: string | null;
  isStudent?: boolean | null;
  lastRoomLeaveAt?: string | null;
  mbti?: string | null;
  nickname?: string | null;
  nicknameChangedAt?: string | null;
  notificationEnabled?: boolean;
  onboardingCompletedAt?: string | null;
  passCount?: number;
  photoDisplayUrl?: string | null;
  photoUrl?: string | null;
  region?: string | null;
  universityName?: string | null;
  userId: string;
};

const profileCache = new Map<string, ProfileSessionSnapshot>();

export function getCachedProfileSnapshot(userId?: string | null): ProfileSessionSnapshot | null {
  if (!userId) return null;
  const cached = profileCache.get(userId);
  return cached ? { ...cached } : null;
}

export function mergeCachedProfileSnapshot(
  userId: string,
  patch: Omit<Partial<ProfileSessionSnapshot>, 'userId'>,
): ProfileSessionSnapshot {
  const next = {
    ...(profileCache.get(userId) ?? { userId }),
    ...patch,
    userId,
  };
  profileCache.set(userId, next);
  return { ...next };
}

export function clearCachedProfileSnapshot(userId?: string | null) {
  if (userId) {
    profileCache.delete(userId);
    return;
  }

  profileCache.clear();
}

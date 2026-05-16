import type { Database } from '@dei/api';
import { logger } from '@dei/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  groupProfileLogsByDate,
  toProfileLogItem,
  type ProfileLogDay,
  type ProfileLogSource,
} from '@/lib/profileLogs';
import { supabase } from '@/lib/supabase';

type PublicProfileRow =
  Database['public']['Functions']['get_public_profile']['Returns'][number];
type PublicProfileLogRow =
  Database['public']['Functions']['get_public_profile_logs']['Returns'][number];
type OwnProfileRow = Pick<
  Database['public']['Tables']['profiles']['Row'],
  | 'created_at'
  | 'gender'
  | 'interest_categories'
  | 'interest_tags'
  | 'intro'
  | 'mbti'
  | 'nickname'
  | 'photo_url'
  | 'region_sido'
  | 'region_sigungu'
  | 'user_id'
>;

export type ProfileMode = 'self' | 'public';

export type ProfileSummary = {
  createdAt: string;
  gender: string | null;
  interestCategories: string[];
  interestTags: string[];
  intro: string | null;
  mbti: string | null;
  nickname: string | null;
  photoUrl: string | null;
  regionSido: string | null;
  regionSigungu: string | null;
  userId: string;
};

type ProfileFeedState = {
  days: ProfileLogDay[];
  error: string | null;
  isBlockedByViewer: boolean;
  isBlocking: boolean;
  isLoading: boolean;
  isReporting: boolean;
  profile: ProfileSummary | null;
};

const initialState: ProfileFeedState = {
  days: [],
  error: null,
  isBlockedByViewer: false,
  isBlocking: false,
  isLoading: true,
  isReporting: false,
  profile: null,
};

function publicStorageUrl(bucket: string, path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

async function signedStorageUrl(bucket: string, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);

  if (error) {
    logger.captureException(error, {
      tags: { feature: 'profile-feed', storageBucket: bucket },
      extra: { path },
    });
    return null;
  }

  return data.signedUrl;
}

function mapPublicProfile(row: PublicProfileRow, photoUrl: string | null): ProfileSummary {
  return {
    createdAt: row.created_at,
    gender: row.gender,
    interestCategories: row.interest_categories ?? [],
    interestTags: row.interest_tags ?? [],
    intro: row.intro,
    mbti: row.mbti,
    nickname: row.nickname,
    photoUrl,
    regionSido: row.region_sido,
    regionSigungu: row.region_sigungu,
    userId: row.profile_user_id,
  };
}

function mapOwnProfile(row: OwnProfileRow, photoUrl: string | null): ProfileSummary {
  return {
    createdAt: row.created_at,
    gender: row.gender,
    interestCategories: row.interest_categories ?? [],
    interestTags: row.interest_tags ?? [],
    intro: row.intro,
    mbti: row.mbti,
    nickname: row.nickname,
    photoUrl,
    regionSido: row.region_sido,
    regionSigungu: row.region_sigungu,
    userId: row.user_id,
  };
}

function toDays(logs: ProfileLogSource[]): ProfileLogDay[] {
  return groupProfileLogsByDate(
    logs.map((log) =>
      toProfileLogItem(log, (path) => publicStorageUrl('logs', path) ?? '')
    )
  );
}

function toProfileLogSource(row: PublicProfileLogRow): ProfileLogSource {
  return {
    created_at: row.created_at,
    duration_sec: row.duration_sec,
    hour_slot: row.hour_slot,
    id: row.id,
    recorded_at: row.recorded_at,
    user_id: row.user_id,
    video_url: row.video_url,
  };
}

async function isProfileBlockedByViewer(profileUserId: string): Promise<boolean> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return false;

  const { data, error } = await supabase
    .from('blocks')
    .select('id')
    .eq('blocker_user_id', user.id)
    .eq('blocked_user_id', profileUserId)
    .is('unblocked_at', null)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export function useProfileFeed(mode: ProfileMode, profileUserId: string | undefined) {
  const [state, setState] = useState<ProfileFeedState>(initialState);

  const load = useCallback(async () => {
    if (!profileUserId) {
      setState({ ...initialState, error: '프로필을 찾을 수 없어요.', isLoading: false });
      return;
    }

    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    try {
      if (mode === 'self') {
        const [profileResult, logsResult] = await Promise.all([
          supabase
            .from('profiles')
            .select(
              'user_id, nickname, gender, region_sido, region_sigungu, intro, mbti, interest_tags, interest_categories, photo_url, created_at'
            )
            .eq('user_id', profileUserId)
            .maybeSingle(),
          supabase
            .from('logs')
            .select('id, user_id, video_url, hour_slot, duration_sec, recorded_at, created_at')
            .eq('user_id', profileUserId)
            .order('recorded_at', { ascending: false }),
        ]);

        if (profileResult.error) throw profileResult.error;
        if (logsResult.error) throw logsResult.error;

        const ownProfile = profileResult.data as OwnProfileRow | null;
        const photoUrl = await signedStorageUrl('profile-images', ownProfile?.photo_url);

        setState((prev) => ({
          ...prev,
          days: toDays((logsResult.data ?? []) as ProfileLogSource[]),
          error: null,
          isBlockedByViewer: false,
          isLoading: false,
          profile: ownProfile ? mapOwnProfile(ownProfile, photoUrl) : null,
        }));
        return;
      }

      const blockedByViewer = await isProfileBlockedByViewer(profileUserId);

      if (blockedByViewer) {
        setState((prev) => ({
          ...prev,
          days: [],
          error: '차단한 프로필입니다.',
          isBlockedByViewer: true,
          isLoading: false,
          profile: null,
        }));
        return;
      }

      const [profileResult, logsResult] = await Promise.all([
        supabase.rpc('get_public_profile', { p_profile_user_id: profileUserId }).maybeSingle(),
        supabase.rpc('get_public_profile_logs', { p_profile_user_id: profileUserId }),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (logsResult.error) throw logsResult.error;

      const publicProfile = profileResult.data;
      const photoUrl = await signedStorageUrl('profile-images', publicProfile?.photo_url);

      setState((prev) => ({
        ...prev,
        days: toDays((logsResult.data ?? []).map(toProfileLogSource)),
        error: null,
        isBlockedByViewer: false,
        isLoading: false,
        profile: publicProfile ? mapPublicProfile(publicProfile, photoUrl) : null,
      }));
    } catch (error) {
      logger.captureException(error, {
        tags: { feature: 'profile-feed', mode },
        extra: { profileUserId },
      });
      setState((prev) => ({
        ...prev,
        error: '프로필을 불러올 수 없어요.',
        isBlockedByViewer: false,
        isLoading: false,
      }));
    }
  }, [mode, profileUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const reportProfile = useCallback(async (): Promise<boolean> => {
    if (!profileUserId || mode !== 'public') return false;

    setState((prev) => ({ ...prev, isReporting: true }));
    try {
      const { error } = await supabase.rpc('create_profile_report', {
        p_description: null,
        p_log_id: null,
        p_reason: '프로필 신고',
        p_reason_category: 'OTHER',
        p_reported_id: profileUserId,
      });

      if (error) throw error;
      return true;
    } catch (error) {
      logger.captureException(error, {
        tags: { feature: 'profile-report' },
        extra: { profileUserId },
      });
      return false;
    } finally {
      setState((prev) => ({ ...prev, isReporting: false }));
    }
  }, [mode, profileUserId]);

  const blockProfile = useCallback(async (): Promise<boolean> => {
    if (!profileUserId || mode !== 'public') return false;

    setState((prev) => ({ ...prev, isBlocking: true }));
    try {
      const { error } = await supabase.rpc('block_profile_user', {
        p_blocked_user_id: profileUserId,
        p_reason: 'profile screen',
      });

      if (error) throw error;
      await load();
      return true;
    } catch (error) {
      logger.captureException(error, {
        tags: { feature: 'profile-block' },
        extra: { profileUserId },
      });
      return false;
    } finally {
      setState((prev) => ({ ...prev, isBlocking: false }));
    }
  }, [load, mode, profileUserId]);

  return useMemo(
    () => ({
      ...state,
      blockProfile,
      refresh: load,
      reportProfile,
    }),
    [blockProfile, load, reportProfile, state]
  );
}

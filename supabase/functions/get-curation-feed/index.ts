// HOME-API1 · POST /functions/v1/get-curation-feed
//
// 홈 화면(H2) 의 무료 큐레이션 추천 풀을 서버 측 알고리즘으로 계산해 반환한다.
//
// **이관 이유**: 기존엔 클라이언트(useHomeScreen.fetchCurationPool)가 profiles/blocks/
// curation_pool 를 4~5단계로 직접 조회하며 매칭 알고리즘(이성 매칭, 차단 필터, 검수
// 필터, 유저별 최신 pool_date, "최소 3명" 룰, 상위 300 한도, 정렬 기준)을 모두 들고
// 있었다. 알고리즘 튜닝/AB 테스트가 앱 빌드와 묶여있었고, 클라 ↔ DB 왕복 4번이라
// 모바일 셀룰러에서 latency 부담도 컸다.
//
// 입력 (JSON body, 선택):
//   seenUserIds:  이미 본 유저 user_id 배열 (제외). 새로고침 호출 시 누적.
//
// 응답:
//   200 { items: CurationFeedRow[] }
//        - 형식은 기존 consume_refresh_item RPC 의 row 와 동일 키 셋 + age/region 추가.
//        - 항상 3명(또는 더 적게면 빈 배열) 단위. "3명 미만이면 풀 비움" 정책 그대로.
//   401 { error, retryable:false }                인증 실패
//   500 { error, retryable:true }                  일시 장애 (클라 재시도 가능)
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

type RequestBody = {
  seenUserIds?: string[];
};

export type CurationFeedRow = {
  display_name: string | null;
  gender: string | null;
  age: number | null;
  region: string | null;
  log_id: string;
  pool_id: string;
  user_id: string;
  video_path: string | null;
  thumbnail_path: string | null;
};

const POOL_CANDIDATE_LIMIT = 300;
const TARGET_USER_COUNT = 3;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('method not allowed', 405, { retryable: false });
  }

  try {
    // 모든 조회는 RLS 가 본인 정책으로 평가돼야 하므로 supabaseAsUser 로 통일.
    // (curation_pool 의 차단_YN/검수_YN 컬럼 필터는 어차피 RLS 와 무관하지만,
    //  profiles/blocks 는 본인 프로필 정책에 의존)
    const { supabaseAsUser, user } = await getAuthenticatedUser(req);

    let body: RequestBody = {};
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      // body 가 없거나 잘못된 JSON 이어도 빈 입력으로 진행 (seenUserIds 만 옵션).
      body = {};
    }

    const seenUserIds = Array.isArray(body.seenUserIds)
      ? body.seenUserIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];

    // ----- Step 0: 본인 성별 → 타겟 성별 -----
    // 이성만 추천 (소개팅 앱 매칭 정책). 본인 성별이 'M'/'F' 외면 풀 비움 (온보딩 미완료).
    const { data: selfProfile, error: selfError } = await supabaseAsUser
      .from('profiles')
      .select('gender')
      .eq('user_id', user.id)
      .maybeSingle();
    if (selfError) {
      return errorResponse(selfError.message, 500, { retryable: true });
    }
    const selfGender = selfProfile?.gender;
    if (selfGender !== 'M' && selfGender !== 'F') {
      return jsonResponse({ items: [] }, { status: 200 });
    }
    const targetGender: 'M' | 'F' = selfGender === 'M' ? 'F' : 'M';

    // ----- Step 0b: 차단 set + 타겟 성별 user_id 목록 (차단 제외) -----
    const [blocksResult, oppositeProfilesResult] = await Promise.all([
      supabaseAsUser
        .from('blocks')
        .select('blocked_user_id, blocker_user_id')
        .is('unblocked_at', null)
        .or(`blocker_user_id.eq.${user.id},blocked_user_id.eq.${user.id}`),
      supabaseAsUser.from('profiles').select('user_id').eq('gender', targetGender),
    ]);

    if (blocksResult.error) {
      return errorResponse(blocksResult.error.message, 500, { retryable: true });
    }
    if (oppositeProfilesResult.error) {
      return errorResponse(oppositeProfilesResult.error.message, 500, { retryable: true });
    }

    const blockedSet = new Set<string>();
    for (const row of (blocksResult.data ?? []) as {
      blocker_user_id: string;
      blocked_user_id: string;
    }[]) {
      blockedSet.add(
        row.blocker_user_id === user.id ? row.blocked_user_id : row.blocker_user_id,
      );
    }
    const allowedUserIds = (oppositeProfilesResult.data ?? [])
      .map((row) => row.user_id)
      .filter((id) => !blockedSet.has(id));
    if (allowedUserIds.length === 0) {
      return jsonResponse({ items: [] }, { status: 200 });
    }

    // ----- Step 1: curation_pool 상위 N → 유저별 최신 pool_date → 3명 선별 -----
    let step1 = supabaseAsUser
      .from('curation_pool')
      .select('user_id, pool_date')
      .neq('user_id', user.id)
      .eq('검수_YN', 'Y')
      .eq('차단_YN', 'N')
      .in('user_id', allowedUserIds)
      .order('pool_date', { ascending: false })
      .limit(POOL_CANDIDATE_LIMIT);

    if (seenUserIds.length > 0) {
      // PostgREST 의 not.in 은 raw 표현으로 넘긴다 ("(uid1,uid2,...)").
      step1 = step1.not('user_id', 'in', `(${seenUserIds.join(',')})`);
    }

    const { data: poolEntries, error: poolError } = await step1;
    if (poolError) {
      return errorResponse(poolError.message, 500, { retryable: true });
    }
    if (!poolEntries || poolEntries.length === 0) {
      return jsonResponse({ items: [] }, { status: 200 });
    }

    // 유저별 최신 pool_date 추출 (정렬이 DESC 이므로 첫 등장이 최신).
    const userLatestDate = new Map<string, string>();
    for (const entry of poolEntries as { user_id: string; pool_date: string }[]) {
      if (!userLatestDate.has(entry.user_id)) {
        userLatestDate.set(entry.user_id, entry.pool_date);
      }
      if (userLatestDate.size === TARGET_USER_COUNT) break;
    }

    // "최소 3명" 정책 — 모자라면 풀 비움 (H3 분기 트리거).
    if (userLatestDate.size < TARGET_USER_COUNT) {
      return jsonResponse({ items: [] }, { status: 200 });
    }

    // ----- Step 2: 각 유저의 최신 pool_date 영상들 전부 (시간 오름차순) -----
    const videoResults = await Promise.all(
      Array.from(userLatestDate.entries()).map(([uid, date]) =>
        supabaseAsUser
          .from('curation_pool')
          .select('id, user_id, log_id, video_path, logs(video_url, thumbnail_path)')
          .eq('user_id', uid)
          .eq('pool_date', date)
          .eq('검수_YN', 'Y')
          .eq('차단_YN', 'N')
          .order('created_at', { ascending: true }),
      ),
    );

    // ----- Step 3: 선별된 user_id 들의 프로필 일괄 조회 -----
    const targetUserIds = Array.from(userLatestDate.keys());
    const { data: profiles, error: profilesError } = await supabaseAsUser
      .from('profiles')
      .select('user_id, nickname, gender, birth_date, region_sido')
      .in('user_id', targetUserIds);
    if (profilesError) {
      return errorResponse(profilesError.message, 500, { retryable: true });
    }
    const profileMap = new Map<
      string,
      {
        user_id: string;
        nickname: string | null;
        gender: string | null;
        birth_date: string | null;
        region_sido: string | null;
      }
    >((profiles ?? []).map((p) => [p.user_id, p]));

    // ----- Step 4: 응답 row 조립 (consume_refresh_item 과 키 셋 정합, age/region 추가) -----
    const items: CurationFeedRow[] = [];
    for (const result of videoResults) {
      const rows = (result.data ?? []) as Array<{
        id: string;
        user_id: string;
        log_id: string;
        video_path: string | null;
        logs: { video_url: string | null; thumbnail_path: string | null } | null;
      }>;
      if (rows.length === 0) continue;

      const uid = rows[0].user_id;
      const profile = profileMap.get(uid);
      const age = profile?.birth_date
        ? Math.floor(
            (Date.now() - new Date(profile.birth_date).getTime()) /
              (365.25 * 24 * 60 * 60 * 1000),
          )
        : null;

      for (const row of rows) {
        items.push({
          display_name: profile?.nickname ?? null,
          gender: profile?.gender ?? null,
          age,
          region: profile?.region_sido ?? null,
          log_id: row.log_id,
          pool_id: row.id,
          user_id: uid,
          video_path: row.video_path ?? row.logs?.video_url ?? null,
          thumbnail_path: row.logs?.thumbnail_path ?? null,
        });
      }
    }

    return jsonResponse({ items }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'failed to fetch curation feed';
    if (/authentication required/i.test(msg)) {
      return errorResponse(msg, 401, { retryable: false });
    }
    return errorResponse(msg, 500, { retryable: true });
  }
});

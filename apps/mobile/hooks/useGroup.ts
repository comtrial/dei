/**
 * useGroup — 본인이 leader 인 forming/queued 그룹과 멤버 가용성.
 *
 * 매칭 진입 직전 화면(`group/[groupId]`)이 이 hook 으로 멤버들의
 * is_in_active_room 을 체크해 "다른 방 사용 중" 안내를 띄운다.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  type GroupMemberView,
  type GroupView,
  fetchGroupMembers,
  fetchMyForming,
} from '@/lib/group/groups-service';

export type GroupAvailability = {
  group: GroupView | null;
  members: GroupMemberView[];
  busyMembers: GroupMemberView[];
  canEnqueue: boolean;
};

export function useMyForming() {
  const [state, setState] = useState<GroupView | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await fetchMyForming();
    setState(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { group: state, loading, refresh };
}

export function useGroup(groupId: string | null | undefined): GroupAvailability & {
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [group, setGroup] = useState<GroupView | null>(null);
  const [members, setMembers] = useState<GroupMemberView[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!groupId) {
      setGroup(null);
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    // 본인 forming 그룹 1개와 일치하면 그것 사용
    const forming = await fetchMyForming();
    setGroup(forming && forming.id === groupId ? forming : null);
    const ms = await fetchGroupMembers(groupId);
    setMembers(ms);
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const busyMembers = members.filter((m) => m.isInActiveRoom);
  const canEnqueue = Boolean(group && group.status === 'forming' && busyMembers.length === 0);

  return {
    group,
    members,
    busyMembers,
    canEnqueue,
    loading,
    refresh,
  };
}

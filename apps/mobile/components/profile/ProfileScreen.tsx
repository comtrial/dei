import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Ban, Flag, MoreVertical } from 'lucide-react-native';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { ProfileLogFeed } from '@/components/profile/ProfileLogFeed';
import { useDeleteLog } from '@/hooks/useDeleteLog';
import {
  useProfileFeed,
  type ProfileMode,
  type ProfileReportInput,
  type ProfileSummary,
} from '@/hooks/useProfileFeed';
import { getProfileLogDateKey, type ProfileLogItem } from '@/lib/profileLogs';

const REPORT_REASONS: { category: ProfileReportInput['reasonCategory']; label: string }[] = [
  { category: 'INAPPROPRIATE', label: '부적절한 콘텐츠' },
  { category: 'FRAUD', label: '사기 또는 허위 프로필' },
  { category: 'ABUSE', label: '괴롭힘 또는 혐오 표현' },
  { category: 'OTHER', label: '기타' },
];

type ProfileScreenProps = {
  mode: ProfileMode;
  profileUserId: string | undefined;
};

function genderLabel(gender: string | null): string | null {
  if (gender === 'M') return '남';
  if (gender === 'F') return '여';
  return gender;
}

function profileMeta(profile: ProfileSummary): string {
  return [
    genderLabel(profile.gender),
    profile.regionSido,
    profile.regionSigungu,
    profile.mbti,
  ]
    .filter(Boolean)
    .join(' · ');
}

function ProfileHeader({ profile }: { profile: ProfileSummary }) {
  const meta = profileMeta(profile);
  const tags = [...profile.interestCategories, ...profile.interestTags].slice(0, 8);

  return (
    <View className="gap-5">
      <View className="flex-row items-center gap-4">
        {profile.photoUrl ? (
          <Image
            accessibilityLabel="프로필 사진"
            className="h-20 w-20 rounded-md bg-muted"
            source={{ uri: profile.photoUrl }}
          />
        ) : (
          <View className="h-20 w-20 items-center justify-center rounded-md bg-muted">
            <Text className="text-2xl font-semibold text-muted-foreground">
              {(profile.nickname ?? 'd').slice(0, 1)}
            </Text>
          </View>
        )}

        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-2xl font-semibold">{profile.nickname ?? '이름 없음'}</Text>
          {meta ? <Text className="text-sm text-muted-foreground">{meta}</Text> : null}
        </View>
      </View>

      {profile.intro ? (
        <Text className="text-base leading-6 text-foreground">{profile.intro}</Text>
      ) : null}

      {tags.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {tags.map((tag) => (
            <View className="rounded-md bg-muted px-2.5 py-1" key={tag}>
              <Text className="text-xs font-semibold text-muted-foreground">{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ProfileScreen({ mode, profileUserId }: ProfileScreenProps) {
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState(REPORT_REASONS[0]);
  const [reportDescription, setReportDescription] = useState('');
  const { deleteLog, pending: isDeletingLog } = useDeleteLog();
  const {
    blockProfile,
    days,
    error,
    isBlockedByViewer,
    isBlocking,
    isLoading,
    isReporting,
    profile,
    refresh,
    reportProfile,
  } = useProfileFeed(mode, profileUserId);

  const handleSubmitReport = async () => {
    const ok = await reportProfile({
      description: reportDescription.trim() || null,
      reason: selectedReason.label,
      reasonCategory: selectedReason.category,
    });

    if (ok) {
      setReportOpen(false);
      setReportDescription('');
    }

    Alert.alert('', ok ? '신고가 접수됐어요.' : '신고를 접수할 수 없어요.');
  };

  const handleBlock = () => {
    setMoreOpen(false);
    Alert.alert('차단', '이 프로필을 차단할까요?', [
      { style: 'cancel', text: '취소' },
      {
        text: '차단',
        style: 'destructive',
        onPress: async () => {
          const ok = await blockProfile();
          Alert.alert('', ok ? '차단했어요.' : '차단할 수 없어요.');
        },
      },
    ]);
  };

  const handleDeleteLog = (log: ProfileLogItem) => {
    if (mode !== 'self' || !profileUserId || isDeletingLog) return;

    Alert.alert('로그 삭제', '이 로그를 삭제할까요?', [
      { style: 'cancel', text: '취소' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const result = await deleteLog({
            date: getProfileLogDateKey(log.recordedAt),
            logId: log.id,
            userId: profileUserId,
            videoUrl: log.videoPath,
          });

          if (result.kind === 'error') {
            Alert.alert('', '로그를 삭제할 수 없어요.');
            return;
          }

          await refresh();
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 px-4 pb-3 pt-14">
        <TouchableOpacity
          accessibilityLabel="뒤로 가기"
          className="h-10 w-10 items-center justify-center rounded-md border border-border bg-background"
          hitSlop={8}
          onPress={() => router.back()}
        >
          <ArrowLeft size={18} color="#171310" />
        </TouchableOpacity>
        <Text className="text-lg font-semibold">
          {mode === 'self' ? '내 프로필' : '프로필'}
        </Text>
        <View className="flex-1" />
        {mode === 'public' ? (
          <TouchableOpacity
            accessibilityLabel="프로필 메뉴"
            className="h-10 w-10 items-center justify-center rounded-md border border-border bg-background"
            hitSlop={8}
            onPress={() => setMoreOpen(true)}
            testID="profile-more-menu"
          >
            <MoreVertical size={18} color="#171310" />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow px-4 pb-8"
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#C0432A" />
          </View>
        ) : profile ? (
          <View className="gap-7">
            <ProfileHeader profile={profile} />

            <ProfileLogFeed
              days={days}
              onDeleteLog={mode === 'self' ? handleDeleteLog : undefined}
            />
          </View>
        ) : isBlockedByViewer ? (
          <View className="flex-1 items-center justify-center rounded-md border border-border bg-card px-5">
            <View className="items-center gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-md bg-muted">
                <Ban size={22} color="#6E6258" />
              </View>
              <View className="gap-1">
                <Text className="text-center text-base font-semibold">
                  차단한 프로필입니다.
                </Text>
                <Text className="text-center text-sm leading-5 text-muted-foreground">
                  차단을 해제하기 전까지 이 프로필과 로그를 볼 수 없어요.
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View className="flex-1 items-center justify-center rounded-md border border-border bg-card px-4">
            <Text className="text-center text-sm text-muted-foreground">
              {error ?? '프로필을 찾을 수 없어요.'}
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal transparent visible={moreOpen} animationType="fade" onRequestClose={() => setMoreOpen(false)}>
        <Pressable className="flex-1 bg-black/20" onPress={() => setMoreOpen(false)}>
          <View className="absolute right-4 top-24 w-44 overflow-hidden rounded-md border border-border bg-background">
            <Pressable
              className="flex-row items-center gap-2 px-4 py-3"
              disabled={isReporting}
              onPress={() => {
                setMoreOpen(false);
                setReportOpen(true);
              }}
              testID="profile-report-menu-item"
            >
              <Flag size={16} color="#171310" />
              <Text>신고하기</Text>
            </Pressable>
            <View className="h-px bg-border" />
            <Pressable
              className="flex-row items-center gap-2 px-4 py-3"
              disabled={isBlocking}
              onPress={handleBlock}
              testID="profile-block-menu-item"
            >
              <Ban size={16} color="#C0432A" />
              <Text className="text-destructive">차단하기</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setReportOpen(false)}
        transparent
        visible={reportOpen}
      >
        <View className="flex-1 justify-end bg-black/45">
          <Pressable className="absolute inset-0" onPress={() => setReportOpen(false)} />
          <View className="gap-5 rounded-t-lg border border-border bg-background px-5 pb-8 pt-5">
            <View className="gap-1">
              <Text className="text-xl font-semibold text-foreground">신고하기</Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                신고 사유를 선택하고 필요한 내용을 입력해주세요.
              </Text>
            </View>

            <View className="gap-2">
              {REPORT_REASONS.map((reason) => (
                <Pressable
                  className={
                    selectedReason.category === reason.category
                      ? 'rounded-md border border-primary bg-primary/10 px-3 py-3'
                      : 'rounded-md border border-border bg-card px-3 py-3'
                  }
                  key={reason.category}
                  onPress={() => setSelectedReason(reason)}
                  testID={`profile-report-reason-${reason.category}`}
                >
                  <Text className="text-sm font-semibold text-foreground">{reason.label}</Text>
                </Pressable>
              ))}
            </View>

            <Input
              className="h-24 items-start py-3"
              multiline
              onChangeText={setReportDescription}
              placeholder="상세 내용을 입력해주세요"
              value={reportDescription}
            />

            <View className="flex-row gap-2">
              <Button className="flex-1" onPress={() => setReportOpen(false)} variant="outline">
                <Text>취소</Text>
              </Button>
              <Button
                className="flex-1"
                disabled={isReporting}
                onPress={handleSubmitReport}
                variant="destructive"
                testID="profile-report-submit"
              >
                <Text>{isReporting ? '접수 중' : '제출'}</Text>
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/**
 * Activation funnel 계측: profile.tsx 의 signup_completed.
 *
 * P3 관심사 선택 후 completeProfile(서버 가입)이 성공하면
 * signup_completed 가 total_interest_count / selected_categories 와 함께
 * 단 한 번 capture 되는지 검증한다. 실패 경로에서는 안 잡혀야 한다.
 */
import { analytics } from '@dei/shared';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockCompleteProfile = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('@/providers/account-gate-provider', () => ({
  useAccountGate: () => ({ completeProfile: mockCompleteProfile }),
}));

// selectedProfileImage 가 없으면 사진 업로드 경로(supabase) 는 타지 않는다.
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: jest.fn() }, storage: { from: jest.fn() } },
}));

const captureSpy = jest.spyOn(analytics, 'capture').mockImplementation(() => undefined);

import ProfileScreen from '@/app/(onboarding)/profile';

type Utils = ReturnType<typeof render>;

// SelectionField(Modal) 를 열어 옵션을 선택한다. options>8 이면 검색창이 떠서 좁힌 뒤 누른다.
const selectFromPicker = (
  utils: Utils,
  triggerLabel: string,
  optionLabel: string,
  search?: string,
) => {
  fireEvent.press(utils.getByText(triggerLabel));
  if (search) {
    fireEvent.changeText(utils.getByPlaceholderText('검색'), search);
  }
  fireEvent.press(utils.getByText(optionLabel));
};

const fillBasicStep = (utils: Utils) => {
  fireEvent.changeText(utils.getByPlaceholderText('서연'), '서연');
  fireEvent.press(utils.getByText('여성'));

  selectFromPicker(utils, '연도 선택', '2000년', '2000');
  selectFromPicker(utils, '월', '6월');
  selectFromPicker(utils, '일', '15일');

  selectFromPicker(utils, '시/도 선택', '서울', '서울');
  selectFromPicker(utils, '시/군/구 선택', '강남구', '강남');
};

const submitProfileFlow = (utils: Utils) => {
  fillBasicStep(utils);

  // basic → detail.
  fireEvent.press(utils.getByText('다음'));
  // detail → interests (bio 비어 있어도 detailComplete=true).
  fireEvent.press(utils.getByText('다음'));

  // 관심사 3개 선택 (운동·스포츠 탭이 기본 활성: 러닝/헬스/요가).
  fireEvent.press(utils.getByText('러닝'));
  fireEvent.press(utils.getByText('헬스'));
  fireEvent.press(utils.getByText('요가'));

  // 제출.
  fireEvent.press(utils.getByText('다음'));
};

describe('profile.tsx signup_completed 계측', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('completeProfile 성공 시 signup_completed 가 관심사 수/카테고리와 함께 한 번 capture 된다', async () => {
    mockCompleteProfile.mockResolvedValue({ next_step: 'log_intro' });

    const utils = render(<ProfileScreen />);
    submitProfileFlow(utils);

    await waitFor(() => {
      expect(mockCompleteProfile).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(captureSpy).toHaveBeenCalledWith('signup_completed', {
        total_interest_count: 3,
        selected_categories: ['운동·스포츠'],
      });
    });
    expect(captureSpy.mock.calls.filter((c) => c[0] === 'signup_completed')).toHaveLength(1);
  });

  it('completeProfile 실패 시 signup_completed 를 capture 하지 않는다', async () => {
    mockCompleteProfile.mockRejectedValue(new Error('서버 오류'));

    const utils = render(<ProfileScreen />);
    submitProfileFlow(utils);

    await waitFor(() => {
      expect(mockCompleteProfile).toHaveBeenCalledTimes(1);
    });
    expect(captureSpy).not.toHaveBeenCalledWith('signup_completed', expect.anything());
  });
});

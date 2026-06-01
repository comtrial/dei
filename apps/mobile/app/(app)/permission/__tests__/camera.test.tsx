import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockGetPermissionState = jest.fn();
const mockRequestPermission = jest.fn();
const mockOpenSystemSettings = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: () => undefined,
}));

jest.mock('@/lib/permissions', () => ({
  getPermissionState: (...args: unknown[]) => mockGetPermissionState(...args),
  requestPermission: (...args: unknown[]) => mockRequestPermission(...args),
  openSystemSettings: (...args: unknown[]) => mockOpenSystemSettings(...args),
}));

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import CameraPermissionScreen from '../camera';

describe('CameraPermissionScreen (S11a)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('denied 상태 — PermissionGate 렌더 + 텍스트 확인', async () => {
    mockGetPermissionState.mockResolvedValue('denied');

    render(<CameraPermissionScreen />);

    await waitFor(() => {
      expect(screen.getByText('카메라 권한이 필요해요')).toBeTruthy();
    });
    expect(screen.getByText('설정에서 카메라 켜기')).toBeTruthy();
    expect(screen.getByText('나중에 하기')).toBeTruthy();
  });

  it('× 탭 — router.back 호출', async () => {
    mockGetPermissionState.mockResolvedValue('denied');

    render(<CameraPermissionScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText('닫기')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('닫기'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('"설정에서 카메라 켜기" 탭 — openSystemSettings 호출', async () => {
    mockGetPermissionState.mockResolvedValue('denied');

    render(<CameraPermissionScreen />);

    await waitFor(() => {
      expect(screen.getByText('설정에서 카메라 켜기')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('설정에서 카메라 켜기'));
    expect(mockOpenSystemSettings).toHaveBeenCalledTimes(1);
  });
});

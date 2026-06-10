import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockInvoke = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ roomId: '11111111-1111-4111-8111-111111111111' }),
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
}));

jest.mock('@dei/shared', () => ({
  POLICY: {
    payment: {
      instantRematchProductId: 'instant-rematch',
    },
  },
  logger: {
    captureException: jest.fn(),
    withErrorCapture: jest.fn((_name: string, fn: () => unknown) => Promise.resolve(fn())),
  },
}));

jest.mock('@dei/ui', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native');

  return {
    AlertDialog: () => null,
    Banner: ({ children, title }: { children?: React.ReactNode; title?: string }) => (
      <View>
        {title ? <Text>{title}</Text> : null}
        {children}
      </View>
    ),
    BottomSheet: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    ChoiceList: ({
      onChange,
      options,
      value,
    }: {
      onChange: (value: string) => void;
      options: { label: string; value: string }[];
      value: string | null;
    }) => (
      <View>
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: value === option.value }}
            testID={`leave-reason-${option.value}`}
            onPress={() => onChange(option.value)}
          >
            <Text>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
    SlideToConfirm: ({
      disabled,
      label,
      onConfirm,
      testID,
    }: {
      disabled?: boolean;
      label?: string;
      onConfirm?: () => void;
      testID?: string;
    }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        testID={testID}
        onPress={onConfirm}
      >
        <Text>{label ?? '밀어서 방 나가기'}</Text>
      </Pressable>
    ),
    Text: ({ children }: { children?: React.ReactNode }) => <Text>{children}</Text>,
    Textarea: () => null,
  };
});

jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

// eslint-disable-next-line import/first -- mocks must be registered before SUT import
import RoomLeaveConfirmScreen from '../leave-confirm';

describe('RoomLeaveConfirmScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvoke.mockResolvedValue({ error: null });
  });

  it('uses slide confirm for leaving and calls the existing leave-room function', async () => {
    render(<RoomLeaveConfirmScreen />);

    const slide = screen.getByTestId('room-leave-slide-confirm');
    expect(slide.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText('밀어서 방 나가기')).toBeTruthy();

    fireEvent.press(screen.getByTestId('leave-reason-mood'));
    fireEvent.press(slide);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('leave-room', {
        body: {
          detail: undefined,
          reason: 'mood',
          roomId: '11111111-1111-4111-8111-111111111111',
        },
      });
    });
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });
});

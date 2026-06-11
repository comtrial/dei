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
    Button: ({
      children,
      disabled,
      onPress,
      testID,
    }: {
      children?: React.ReactNode;
      disabled?: boolean;
      onPress?: () => void;
      testID?: string;
    }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        testID={testID}
        onPress={onPress}
      >
        <Text>{children}</Text>
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

  it('uses a button for leaving and calls the existing leave-room function', async () => {
    render(<RoomLeaveConfirmScreen />);

    const leaveButton = screen.getByTestId('room-leave-submit');
    expect(leaveButton.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText('방 나가기')).toBeTruthy();

    fireEvent.press(screen.getByTestId('leave-reason-mood'));
    fireEvent.press(leaveButton);

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

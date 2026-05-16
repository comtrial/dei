import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from './text';

interface Props {
  message: string;
  subMessage?: string;
  visible: boolean;
  onHide: () => void;
  duration?: number;
}

export function Toast({ message, subMessage, visible, onHide, duration = 2500 }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(duration - 400),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onHide());
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={{ opacity, position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 999 }}
    >
      <SafeAreaView edges={['bottom']}>
        <Animated.View className="mx-4 mb-4 bg-foreground rounded-xl px-4 py-3">
          <Text className="text-background font-medium text-center text-sm">{message}</Text>
          {subMessage && (
            <Text className="text-background/70 text-xs text-center mt-1">{subMessage}</Text>
          )}
        </Animated.View>
      </SafeAreaView>
    </Animated.View>
  );
}

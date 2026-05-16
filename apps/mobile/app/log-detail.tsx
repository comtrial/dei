import { Stack, useLocalSearchParams } from 'expo-router';

import { LogDetailOther } from '@/components/log-detail/LogDetailOther';
import { LogDetailSelf } from '@/components/log-detail/LogDetailSelf';
import { useAuth } from '@/providers/auth-provider';

export default function LogDetailRoute() {
  const { user } = useAuth();
  const { userId, date, logId } = useLocalSearchParams<{
    userId: string;
    date: string;
    logId?: string;
  }>();

  const isSelf = user?.id === userId;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          animation: 'fade',
        }}
      />
      {isSelf ? (
        <LogDetailSelf userId={userId} date={date} startLogId={logId} />
      ) : (
        <LogDetailOther userId={userId} date={date} startLogId={logId} />
      )}
    </>
  );
}

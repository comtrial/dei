import { View } from 'react-native';

function SkeletonRow() {
  return (
    <View className="flex-row items-center px-4 py-3 gap-3">
      <View className="w-14 h-14 rounded-full bg-muted" />
      <View className="flex-1 gap-2">
        <View className="h-4 w-32 rounded bg-muted" />
        <View className="h-3 w-24 rounded bg-muted" />
      </View>
    </View>
  );
}

export function LikesListSkeleton() {
  return (
    <View className="flex-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}

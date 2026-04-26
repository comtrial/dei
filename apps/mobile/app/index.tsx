import { ActivityIndicator, View } from 'react-native';

export default function IndexScreen() {
  return (
    <View className="bg-background flex-1 items-center justify-center">
      <ActivityIndicator />
    </View>
  );
}

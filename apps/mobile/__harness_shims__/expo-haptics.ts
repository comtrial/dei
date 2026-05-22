/**
 * expo-haptics stub — Playwright web harness only.
 * expo-haptics 는 TurboModuleRegistry 를 import 해 react-native-web Vite 빌드를
 * 깨뜨린다. web 에선 햅틱이 의미 없으므로 no-op.
 */
export enum ImpactFeedbackStyle {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
}
export async function impactAsync(_style?: ImpactFeedbackStyle): Promise<void> {}
export async function notificationAsync(): Promise<void> {}
export async function selectionAsync(): Promise<void> {}

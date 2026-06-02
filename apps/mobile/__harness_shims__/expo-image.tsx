/**
 * expo-image stub — Playwright web harness only.
 *
 * @dei/ui Avatar 가 `expo-image` 의 `Image`(photoUrl 디코딩)를 쓰는데, expo-image
 * 는 react-native 의 raw flow 소스(Libraries/Image/resolveAssetSource)를 끌어와
 * esbuild/RN-web 번들에서 파싱이 깨진다. 하네스에서는 이미지 디코딩이 load-bearing
 * 이 아니므로 RN-web 의 기본 Image 로 대체한다(testID 'av-photo' 등 DOM 계약 유지).
 */
import { Image as RNWebImage, type ImageProps } from 'react-native';

export const Image = RNWebImage;
export type { ImageProps };
export default { Image: RNWebImage };

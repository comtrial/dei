import '@testing-library/jest-native/extend-expect';

// expo-image 는 네이티브 모듈(`src/index.ts`) 이라 jest-expo transform 대상이
// 아니다. 컴포넌트 테스트에선 RN `Image` 호스트로 모킹해 source/className/testID
// 가 prop 으로 그대로 보이도록 한다(실제 디코딩은 앱 런타임 책임).
jest.mock('expo-image', () => {
  const React = require('react');
  const { Image } = require('react-native');
  const Mocked = React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
    React.createElement(Image, { ...props, ref }),
  );
  Mocked.displayName = 'ExpoImageMock';
  return { Image: Mocked };
});

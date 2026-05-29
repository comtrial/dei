/**
 * Babel config used ONLY by @dei/ui Jest component tests.
 *
 * nativewind/babel 변환을 의도적으로 제외한다 — 이 패키지 단위 테스트는
 * `className` 이 호스트 컴포넌트에 plain prop 으로 남아야 토큰 className
 * 적용을 검증할 수 있기 때문(스타일 컴파일은 앱 빌드 시 NativeWind 가 담당).
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};

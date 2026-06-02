// plugins/withoutApsEnvironment.js
// expo-notifications 가 설치돼 있으면 prebuild 가 iOS entitlements 에
// `aps-environment` 를 자동 주입한다. 그러면 EAS 가 Push Notifications capability
// 가 포함된 provisioning profile 을 요구하는데, 현재 프로필엔 그 capability 가
// 없어 Xcode 서명 단계가 깨진다(XCODE_BUILD_ERROR: aps-environment entitlement).
//
// 이 플러그인은 prebuild 시 iOS entitlements 에서 aps-environment 를 제거해
// 푸시 capability 없이도 서명·빌드가 되게 한다(검증 빌드용). 실제 멘션 푸시를
// 켜려면 Apple bundle id 에 Push Notifications capability 등록 후 이 플러그인을
// 제거하면 된다. (Android 푸시·런타임 expo-notifications 는 영향 없음.)
const { withEntitlementsPlist } = require('@expo/config-plugins');

module.exports = function withoutApsEnvironment(config) {
  return withEntitlementsPlist(config, (cfg) => {
    if (cfg.modResults && 'aps-environment' in cfg.modResults) {
      delete cfg.modResults['aps-environment'];
    }
    return cfg;
  });
};

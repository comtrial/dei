// Patches AppDelegate.swift so UIKit honors react-native-orientation-turbo's
// runtime lock. Required because manual AppDelegate edits don't survive — this
// project keeps ios/ gitignored (CNG: prebuild regenerates it on every EAS/CI).
//
// Idempotent: includes() guards make re-runs no-ops.
// Android: orientation-turbo README states no setup needed (auto-syncs with manifest).
// Anchors below are tied to the Expo SDK 53+ Swift AppDelegate template — if
// the template changes, errors point at the broken anchor.

const { withAppDelegate } = require('@expo/config-plugins');

const IMPORT_ANCHOR = 'import ReactAppDependencyProvider';
const IMPORT_LINE = 'import OrientationTurbo';

const METHOD_ANCHOR = '  // Linking API';
const METHOD_BLOCK = `  public override func application(
    _ application: UIApplication,
    supportedInterfaceOrientationsFor window: UIWindow?
  ) -> UIInterfaceOrientationMask {
    return OrientationTurbo.shared.getSupportedInterfaceOrientations()
  }

`;

function addImport(contents) {
  if (contents.includes(IMPORT_LINE)) return contents;
  if (!contents.includes(IMPORT_ANCHOR)) {
    throw new Error(
      `[with-orientation-turbo] Could not find anchor "${IMPORT_ANCHOR}" in AppDelegate.swift. ` +
        'Expo template changed — update this plugin.',
    );
  }
  return contents.replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}\n${IMPORT_LINE}`);
}

function addOrientationMethod(contents) {
  if (contents.includes('supportedInterfaceOrientationsFor')) return contents;
  if (!contents.includes(METHOD_ANCHOR)) {
    throw new Error(
      `[with-orientation-turbo] Could not find anchor "${METHOD_ANCHOR}" in AppDelegate.swift. ` +
        'Expo template changed — update this plugin.',
    );
  }
  return contents.replace(METHOD_ANCHOR, `${METHOD_BLOCK}${METHOD_ANCHOR}`);
}

const withOrientationTurbo = (config) => {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error(
        `[with-orientation-turbo] Expected Swift AppDelegate, got "${cfg.modResults.language}". ` +
          'This plugin assumes Expo SDK 53+ Swift template.',
      );
    }
    let contents = cfg.modResults.contents;
    contents = addImport(contents);
    contents = addOrientationMethod(contents);
    cfg.modResults.contents = contents;
    return cfg;
  });
};

module.exports = withOrientationTurbo;

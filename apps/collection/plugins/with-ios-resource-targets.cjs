/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports -- Expo loads config plugins through CommonJS. */
const { withPodfile } = require("expo/config-plugins");

module.exports = function withIosResourceTargets(config) {
  return withPodfile(config, (config) => {
    const marker =
      "# Align resource bundles with React Native's minimum iOS version.";
    if (config.modResults.contents.includes(marker)) return config;
    const hook = "post_install do |installer|";
    if (!config.modResults.contents.includes(hook)) {
      throw new Error(
        "Cannot find the Podfile post_install hook for resource deployment targets.",
      );
    }
    // React Native clamps native pod targets, but leaves resource bundle targets behind.
    // Keep higher targets intact and use RN's minimum instead of introducing a new app requirement.
    config.modResults.contents = config.modResults.contents.replace(
      hook,
      `${hook}
    ${marker}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] || min_ios_version_supported
        build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = [Gem::Version.new(current), Gem::Version.new(min_ios_version_supported)].max.to_s
      end
    end
`,
    );
    return config;
  });
};

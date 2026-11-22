/* global require, module, __dirname */
/* eslint @typescript-eslint/no-require-imports: off */
const { withXcodeProject } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");
const targetName = "LovatWatch";

function configureProject(project, { bundleIdentifier, version, buildNumber }) {
  const existing = Object.entries(project.pbxNativeTargetSection()).find(
    ([, target]) =>
      typeof target === "object" &&
      target.name?.replaceAll('"', "") === targetName,
  );
  const target = existing
    ? { uuid: existing[0], pbxNativeTarget: existing[1] }
    : project.addTarget(
        targetName,
        "watch2_app",
        targetName,
        `${bundleIdentifier}.watchkitapp`,
      );
  // Expo templates can omit these sections. Without them node-xcode silently
  // skips target dependencies, so the phone tries to embed an unbuilt watch app.
  const objects = project.hash.project.objects;
  objects.PBXTargetDependency ??= {};
  objects.PBXContainerItemProxy ??= {};
  const hostTarget = project.getFirstTarget();
  const hasDependency = hostTarget.firstTarget.dependencies.some(
    ({ value }) => objects.PBXTargetDependency[value]?.target === target.uuid,
  );
  if (!hasDependency)
    project.addTargetDependency(hostTarget.uuid, [target.uuid]);

  // A modern single-target watch app compiles its own executable. The legacy
  // watchapp2 type injects a stub executable and causes duplicate build output.
  target.pbxNativeTarget.productType = '"com.apple.product-type.application"';
  if (!existing) {
    project.addBuildPhase([], "PBXSourcesBuildPhase", "Sources", target.uuid);
    project.addBuildPhase(
      [],
      "PBXResourcesBuildPhase",
      "Resources",
      target.uuid,
    );
    project.addBuildPhase(
      [],
      "PBXFrameworksBuildPhase",
      "Frameworks",
      target.uuid,
    );
    const sources = fs
      .readdirSync(path.join(__dirname, "../watch/Sources"))
      .filter((file) => file.endsWith(".swift"));
    const group = project.addPbxGroup([], targetName, targetName);
    project.addToPbxGroup(
      group.uuid,
      project.getFirstProject().firstProject.mainGroup,
    );
    for (const source of sources)
      project.addSourceFile(source, { target: target.uuid }, group.uuid);
    const asset = project.addFile("Assets.xcassets", group.uuid);
    asset.uuid = project.generateUuid();
    asset.target = target.uuid;
    project.addToPbxBuildFileSection(asset);
    project.addToPbxResourcesBuildPhase(asset);
  }
  const configurations =
    project.pbxXCConfigurationList()[
      target.pbxNativeTarget.buildConfigurationList
    ];
  for (const { value } of configurations.buildConfigurations) {
    const configuration = project.pbxXCBuildConfigurationSection()[value];
    Object.assign(configuration.buildSettings, {
      SDKROOT: "watchos",
      SUPPORTED_PLATFORMS: '"watchos watchsimulator"',
      WATCHOS_DEPLOYMENT_TARGET: "10.0",
      TARGETED_DEVICE_FAMILY: "4",
      SWIFT_VERSION: "5.0",
      SWIFT_OPTIMIZATION_LEVEL:
        configuration.name === "Debug" ? '"-Onone"' : '"-O"',
      GENERATE_INFOPLIST_FILE: "NO",
      INFOPLIST_FILE: '"LovatWatch/Info.plist"',
      PRODUCT_BUNDLE_IDENTIFIER: `"${bundleIdentifier}.watchkitapp"`,
      MARKETING_VERSION: `"${version}"`,
      CURRENT_PROJECT_VERSION: `"${buildNumber}"`,
      CODE_SIGN_STYLE: "Automatic",
      ENABLE_BITCODE: "NO",
      ASSETCATALOG_COMPILER_APPICON_NAME: '"AppIcon"',
    });
    const host = project.getFirstTarget().firstTarget;
    const hostList =
      project.pbxXCConfigurationList()[host.buildConfigurationList];
    const hostConfiguration = hostList.buildConfigurations
      .map(({ value }) => project.pbxXCBuildConfigurationSection()[value])
      .find((item) => item.name === configuration.name);
    if (hostConfiguration?.buildSettings.DEVELOPMENT_TEAM) {
      configuration.buildSettings.DEVELOPMENT_TEAM =
        hostConfiguration.buildSettings.DEVELOPMENT_TEAM;
    }
  }
}

module.exports = function withLovatWatch(config) {
  // EAS collects signing credentials before prebuild creates native targets.
  // Declare the companion while preserving existing project and extension config.
  config.extra ??= {};
  config.extra.eas ??= {};
  config.extra.eas.build ??= {};
  config.extra.eas.build.experimental ??= {};
  config.extra.eas.build.experimental.ios ??= {};
  const signing = config.extra.eas.build.experimental.ios;
  signing.appExtensions = [
    ...(signing.appExtensions ?? []).filter(
      (entry) => entry.targetName !== targetName,
    ),
    {
      targetName,
      bundleIdentifier: `${config.ios.bundleIdentifier}.watchkitapp`,
      entitlements: {},
    },
  ];
  return withXcodeProject(config, (mod) => {
    const destination = path.join(
      mod.modRequest.platformProjectRoot,
      targetName,
    );
    fs.mkdirSync(destination, { recursive: true });
    fs.cpSync(path.join(__dirname, "../watch/Sources"), destination, {
      recursive: true,
    });
    const bundleIdentifier = config.ios.bundleIdentifier;
    const version = config.version ?? "1.0.0";
    const buildNumber = config.ios.buildNumber ?? "1";
    fs.writeFileSync(
      path.join(destination, "Info.plist"),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>Lovat</string>
<key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
<key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
<key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>
<key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>
<key>WKApplication</key><true/>
<key>WKCompanionAppBundleIdentifier</key><string>${bundleIdentifier}</string>
</dict></plist>`,
    );
    const icons = path.join(destination, "Assets.xcassets/AppIcon.appiconset");
    fs.mkdirSync(icons, { recursive: true });
    fs.copyFileSync(
      path.join(mod.modRequest.projectRoot, "assets/icon.png"),
      path.join(icons, "AppIcon.png"),
    );
    fs.writeFileSync(
      path.join(icons, "Contents.json"),
      JSON.stringify({
        images: [
          {
            filename: "AppIcon.png",
            idiom: "universal",
            platform: "watchos",
            size: "1024x1024",
          },
        ],
        info: { author: "xcode", version: 1 },
      }),
    );
    configureProject(mod.modResults, {
      bundleIdentifier,
      version,
      buildNumber,
    });
    return mod;
  });
};
module.exports.configureProject = configureProject;

/* global require, module, __dirname */
/* eslint-disable @typescript-eslint/no-require-imports -- Expo config plugins use CommonJS. */
const fs = require("node:fs");
const path = require("node:path");
const {
  withInfoPlist,
  withEntitlementsPlist,
  withXcodeProject,
} = require("expo/config-plugins");

module.exports = function withLiveActivities(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSSupportsLiveActivities = true;
    return mod;
  });
  config = withEntitlementsPlist(config, (mod) => {
    // EAS selects the matching development/production entitlement when signing.
    mod.modResults["aps-environment"] ??= "development";
    return mod;
  });

  const name = "ScoutingLiveActivity";
  const bundleIdentifier = `${config.ios.bundleIdentifier}.${name}`;
  config.extra ??= {};
  config.extra.eas ??= {};
  config.extra.eas.build ??= {};
  config.extra.eas.build.experimental ??= {};
  config.extra.eas.build.experimental.ios ??= {};
  const extensions =
    config.extra.eas.build.experimental.ios.appExtensions ?? [];
  if (!extensions.some((item) => item.targetName === name)) {
    extensions.push({ targetName: name, bundleIdentifier, entitlements: {} });
  }
  config.extra.eas.build.experimental.ios.appExtensions = extensions;

  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const directory = path.join(mod.modRequest.platformProjectRoot, name);
    fs.mkdirSync(directory, { recursive: true });
    fs.cpSync(
      path.join(__dirname, "live-activities/Assets.xcassets"),
      path.join(directory, "Assets.xcassets"),
      { recursive: true },
    );
    const demo = require("./live-activities/widget-demo.json");
    for (const [colorName, hex] of Object.entries(demo.colors)) {
      const colorDirectory = path.join(
        directory,
        "Assets.xcassets",
        `${colorName}.colorset`,
      );
      fs.mkdirSync(colorDirectory, { recursive: true });
      const channel = (offset) =>
        (parseInt(hex.slice(offset, offset + 2), 16) / 255).toFixed(6);
      fs.writeFileSync(
        path.join(colorDirectory, "Contents.json"),
        JSON.stringify(
          {
            info: { author: "xcode", version: 1 },
            colors: [
              {
                idiom: "universal",
                color: {
                  "color-space": "srgb",
                  components: {
                    red: channel(1),
                    green: channel(3),
                    blue: channel(5),
                    alpha: "1.000000",
                  },
                },
              },
            ],
          },
          null,
          2,
        ),
      );
    }
    for (const [source, destination] of [
      [
        path.join(__dirname, "live-activities/ScoutingLiveActivity.swift"),
        "ScoutingLiveActivity.swift",
      ],
      [
        path.join(__dirname, "live-activities/ScoutingHomeWidgets.swift"),
        "ScoutingHomeWidgets.swift",
      ],
      [
        path.join(__dirname, "live-activities/widget-demo.json"),
        "widget-demo.json",
      ],
      [
        path.join(__dirname, "../assets/fonts/Heebo-Medium.ttf"),
        "Heebo-Medium.ttf",
      ],
      [
        path.join(
          __dirname,
          "../modules/lovat-live-activities/ios/ScoutingActivityAttributes.swift",
        ),
        "ScoutingActivityAttributes.swift",
      ],
    ]) {
      fs.copyFileSync(source, path.join(directory, destination));
    }
    fs.writeFileSync(
      path.join(directory, "Info.plist"),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>Scouting shift</string>
<key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
<key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
<key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
<key>CFBundlePackageType</key><string>XPC!</string>
<key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>
<key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>
<key>UIAppFonts</key><array><string>Heebo-Medium.ttf</string></array>
<key>NSExtension</key><dict><key>NSExtensionPointIdentifier</key><string>com.apple.widgetkit-extension</string></dict>
</dict></plist>`,
    );

    const existing = Object.entries(project.pbxNativeTargetSection()).find(
      ([, target]) =>
        typeof target === "object" && target.name?.replace(/"/g, "") === name,
    );
    const addFiles = (targetId, groupId) => {
      for (const filename of [
        "ScoutingLiveActivity.swift",
        "ScoutingHomeWidgets.swift",
        "ScoutingActivityAttributes.swift",
      ]) {
        if (!project.hasFile(filename))
          project.addSourceFile(filename, { target: targetId }, groupId);
      }
      for (const filename of ["widget-demo.json", "Heebo-Medium.ttf"]) {
        if (!project.hasFile(filename))
          project.addResourceFile(filename, { target: targetId }, groupId);
      }
    };
    if (existing) {
      if (
        !existing[1].buildPhases.some((phase) => phase.comment === "Resources")
      ) {
        project.addBuildPhase(
          [`${name}/Assets.xcassets`],
          "PBXResourcesBuildPhase",
          "Resources",
          existing[0],
        );
      }
      addFiles(existing[0], project.findPBXGroupKey({ name }));
      return mod;
    }

    const target = project.addTarget(
      name,
      "app_extension",
      name,
      bundleIdentifier,
    );
    const group = project.addPbxGroup([], name, name);
    project.addToPbxGroup(
      group.uuid,
      project.getFirstProject().firstProject.mainGroup,
    );
    project.addBuildPhase([], "PBXSourcesBuildPhase", "Sources", target.uuid);
    project.addBuildPhase(
      [`${name}/Assets.xcassets`],
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
    addFiles(target.uuid, group.uuid);
    const list =
      project.pbxXCConfigurationList()[
        target.pbxNativeTarget.buildConfigurationList
      ];
    for (const entry of list.buildConfigurations) {
      const settings =
        project.pbxXCBuildConfigurationSection()[entry.value].buildSettings;
      Object.assign(settings, {
        INFOPLIST_FILE: `${name}/Info.plist`,
        IPHONEOS_DEPLOYMENT_TARGET: "16.2",
        SWIFT_VERSION: "5.0",
        APPLICATION_EXTENSION_API_ONLY: "YES",
        TARGETED_DEVICE_FAMILY: '"1,2"',
        CODE_SIGN_STYLE: "Automatic",
        MARKETING_VERSION: config.version,
        CURRENT_PROJECT_VERSION: config.ios.buildNumber,
        GENERATE_INFOPLIST_FILE: "NO",
      });
    }
    return mod;
  });
};

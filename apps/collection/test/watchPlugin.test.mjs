import assert from "node:assert/strict";
import { test } from "node:test";
import xcode from "xcode";
import withLovatWatch from "../plugins/withLovatWatch.cjs";

// Expo's one-target template can omit dependency sections entirely. Exercise the
// real project writer with that shape so the phone cannot embed an unbuilt app.
function phoneProject() {
  const project = xcode.project("unused.pbxproj");
  project.hash = {
    project: {
      rootObject: "ROOT",
      rootObject_comment: "Project object",
      objects: {
        PBXProject: {
          ROOT: {
            isa: "PBXProject",
            mainGroup: "MAIN",
            productRefGroup: "PRODUCTS",
            targets: [{ value: "PHONE", comment: "Collection" }],
          },
        },
        PBXNativeTarget: {
          PHONE: {
            isa: "PBXNativeTarget",
            name: "Collection",
            buildConfigurationList: "PHONE_CONFIGS",
            buildPhases: [],
            dependencies: [],
          },
        },
        PBXGroup: {
          MAIN: { isa: "PBXGroup", children: [{ value: "PRODUCTS" }] },
          PRODUCTS: { isa: "PBXGroup", name: "Products", children: [] },
        },
        PBXBuildFile: {},
        PBXFileReference: {},
        XCConfigurationList: {
          PHONE_CONFIGS: {
            isa: "XCConfigurationList",
            buildConfigurations: [{ value: "DEBUG" }, { value: "RELEASE" }],
          },
        },
        XCBuildConfiguration: {
          DEBUG: {
            isa: "XCBuildConfiguration",
            name: "Debug",
            buildSettings: { DEVELOPMENT_TEAM: "EXISTING_TEAM" },
          },
          RELEASE: {
            isa: "XCBuildConfiguration",
            name: "Release",
            buildSettings: { DEVELOPMENT_TEAM: "EXISTING_TEAM" },
          },
        },
      },
    },
  };
  return project;
}

test("builds the watch before embedding it and survives repeated prebuilds", () => {
  const project = phoneProject();
  const options = {
    bundleIdentifier: "com.example.collection",
    version: "1.2.3",
    buildNumber: "4",
  };
  withLovatWatch.configureProject(project, options);
  const objects = project.hash.project.objects;
  const watch = Object.entries(objects.PBXNativeTarget).find(
    ([, target]) => target.name === '"LovatWatch"',
  );
  assert.ok(watch);
  const [watchID, target] = watch;
  assert.equal(target.productType, '"com.apple.product-type.application"');
  const dependencies = objects.PBXNativeTarget.PHONE.dependencies.map(
    ({ value }) => objects.PBXTargetDependency[value].target,
  );
  assert.deepEqual(dependencies, [watchID]);
  const configurations =
    objects.XCConfigurationList[target.buildConfigurationList];
  for (const { value } of configurations.buildConfigurations) {
    const settings = objects.XCBuildConfiguration[value].buildSettings;
    assert.equal(settings.SDKROOT, "watchos");
    assert.equal(settings.DEVELOPMENT_TEAM, "EXISTING_TEAM");
    assert.equal(
      settings.PRODUCT_BUNDLE_IDENTIFIER,
      '"com.example.collection.watchkitapp"',
    );
  }
  assert.ok(
    Object.values(objects.PBXCopyFilesBuildPhase).some(
      (phase) =>
        typeof phase === "object" && phase.name === '"Embed Watch Content"',
    ),
  );
  const first = project.writeSync();
  withLovatWatch.configureProject(project, options);
  assert.equal(project.writeSync(), first);
});

test("declares watch signing metadata while preserving existing EAS ownership and targets", () => {
  const config = {
    name: "Collection",
    slug: "collection",
    ios: { bundleIdentifier: "com.example.collection" },
    extra: {
      eas: {
        projectId: "existing-project",
        build: {
          experimental: {
            ios: {
              appExtensions: [
                {
                  targetName: "ExistingExtension",
                  bundleIdentifier: "com.example.existing",
                },
              ],
            },
          },
        },
      },
    },
  };
  const result = withLovatWatch(withLovatWatch(config));
  assert.equal(result.extra.eas.projectId, "existing-project");
  assert.equal(result.ios.bundleIdentifier, "com.example.collection");
  assert.deepEqual(result.extra.eas.build.experimental.ios.appExtensions, [
    {
      targetName: "ExistingExtension",
      bundleIdentifier: "com.example.existing",
    },
    {
      targetName: "LovatWatch",
      bundleIdentifier: "com.example.collection.watchkitapp",
      entitlements: {},
    },
  ]);
});

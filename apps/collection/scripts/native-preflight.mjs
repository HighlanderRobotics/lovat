#!/usr/bin/env node
import process from "node:process";
import console from "node:console";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function preflight(target, options = {}) {
  if (!["tooling", "ios", "android", "all"].includes(target)) {
    throw new Error("Choose tooling, ios, android, or all.");
  }
  const {
    node = process.versions.node,
    platform = process.platform,
    env = process.env,
    home = homedir(),
    exists = existsSync,
    run = (command, args) => {
      const result = spawnSync(command, args, {
        encoding: "utf8",
        timeout: 30000,
        env,
      });
      return {
        ok: result.status === 0,
        text: `${result.stdout ?? ""}${result.stderr ?? ""}`,
      };
    },
  } = options;
  const checks = [];
  const check = (name, ok, fix) => checks.push({ name, ok: Boolean(ok), fix });
  check(
    "Node 24.6.0",
    node === "24.6.0",
    "Run nvm install 24.6.0 && nvm use 24.6.0.",
  );
  const npm = run("npm", ["--version"]);
  check(
    "npm 11.5.1",
    npm.ok && npm.text.trim() === "11.5.1",
    "With Node 24.6.0 active, run npm install --global npm@11.5.1.",
  );
  if (target === "ios" || target === "all") {
    check(
      "macOS",
      platform === "darwin",
      "Use a Mac for local iOS builds, or use the EAS training-testflight cloud profile.",
    );
    if (platform === "darwin") {
      const xcode = run("xcodebuild", ["-version"]);
      check(
        "Xcode 27",
        xcode.ok && /Xcode 27\./.test(xcode.text),
        "Install Xcode 27, then run sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer.",
      );
      check(
        "Xcode first launch",
        run("xcodebuild", ["-checkFirstLaunchStatus"]).ok,
        "Open Xcode and finish setup, or run sudo xcodebuild -runFirstLaunch.",
      );
      check(
        "iOS SDK",
        run("xcrun", ["--sdk", "iphoneos", "--show-sdk-path"]).ok,
        "In Xcode Settings > Components, install the iOS 27 platform.",
      );
      check(
        "CocoaPods",
        run("pod", ["--version"]).ok,
        "Install CocoaPods with brew install cocoapods.",
      );
      const runtimes = run("xcrun", [
        "simctl",
        "list",
        "runtimes",
        "available",
      ]);
      check(
        "iOS 27 simulator",
        runtimes.ok && /iOS 27\./.test(runtimes.text),
        "Install an iOS 27 simulator runtime in Xcode Settings > Components, or run on a connected device.",
      );
    }
  }
  if (target === "android" || target === "all") {
    const java = run(env.JAVA_HOME ? join(env.JAVA_HOME, "bin/java") : "java", [
      "-version",
    ]);
    check(
      "JDK 21",
      java.ok && /version "21[."]/.test(java.text),
      "Install JDK 21 and set JAVA_HOME to its home directory (Android Studio's JBR 21 is supported).",
    );
    const sdk =
      env.ANDROID_HOME ||
      env.ANDROID_SDK_ROOT ||
      join(home, platform === "darwin" ? "Library/Android/sdk" : "Android/Sdk");
    check(
      "Android SDK",
      exists(sdk),
      `Install Android Studio's SDK, then set ANDROID_HOME=${sdk}.`,
    );
    check(
      "adb",
      exists(join(sdk, "platform-tools/adb")),
      "Install Android SDK Platform-Tools in Android Studio > SDK Manager.",
    );
    const manager = join(sdk, "cmdline-tools/latest/bin/sdkmanager");
    check(
      "sdkmanager",
      exists(manager),
      "In Android Studio > SDK Manager > SDK Tools, install Android SDK Command-line Tools (latest).",
    );
    for (const [path, pkg] of [
      ["platforms/android-37", "platforms;android-37"],
      ["build-tools/37.0.0", "build-tools;37.0.0"],
      ["ndk/27.1.12297006", "ndk;27.1.12297006"],
    ]) {
      check(pkg, exists(join(sdk, path)), `Run "${manager}" "${pkg}".`);
    }
    check(
      "Android licenses",
      exists(join(sdk, "licenses/android-sdk-license")),
      `Review and accept SDK licenses with "${manager}" --licenses. Gradle will identify any additional package license required.`,
    );
    check(
      "Android device or emulator",
      run(join(sdk, "platform-tools/adb"), ["devices"])
        .text?.split("\n")
        .some((line) => /\sdevice\s*$/.test(line)),
      "Start an Android Studio virtual device, or connect a USB-debugging-enabled phone and authorize it, then run adb devices.",
    );
  }
  return checks;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: npm run preflight -- [tooling|ios|android|all] [--json]\nRead-only checks; no SDK installation or license acceptance.",
    );
  } else {
    try {
      const checks = preflight(args.find((arg) => arg !== "--json") ?? "all");
      console.log(
        args.includes("--json")
          ? JSON.stringify(checks, null, 2)
          : checks
              .map(
                ({ name, ok, fix }) =>
                  `${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `\n  ${fix}`}`,
              )
              .join("\n"),
      );
      process.exitCode = checks.every(({ ok }) => ok) ? 0 : 1;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}

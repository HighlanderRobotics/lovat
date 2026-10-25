/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports -- Expo loads config plugins through CommonJS. */
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

module.exports = function withIosMenuAvailability(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const directory = path.join(
        config.modRequest.projectRoot,
        "node_modules/react-native-ios-context-menu/ios/RNIContextMenu",
      );
      const patches = [
        [
          "RNIMenuActionItem.swift",
          "if #available(iOS 15.0, *) {\n      action.subtitle",
          "if #available(iOS 16.0, *) {\n      action.subtitle",
        ],
        [
          "RNIMenuItem.swift",
          "if #available(iOS 15.0, *),\n       let subtitle = self.menuSubtitle",
          "if #available(iOS 16.0, *),\n       let subtitle = self.menuSubtitle",
        ],
      ];
      for (const [file, previous, corrected] of patches) {
        const filename = path.join(directory, file);
        const source = await fs.readFile(filename, "utf8");
        if (source.includes(corrected)) continue;
        if (!source.includes(previous))
          throw new Error(
            `Context-menu availability patch no longer matches ${file}; review the dependency before building.`,
          );
        await fs.writeFile(filename, source.replace(previous, corrected));
      }
      return config;
    },
  ]);
};

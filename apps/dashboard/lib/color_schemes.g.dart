import 'package:flutter/material.dart';
import 'package:magnolia_ui/magnolia_ui.dart';

// Keep existing widget imports while the canonical palette lives in Magnolia.
const lightColorScheme = magnoliaLightColorScheme;
const darkColorScheme = magnoliaDarkColorScheme;

extension ColorSchemeExtension on ColorScheme {
  MagnoliaFrc get _frc => MagnoliaFrc.forBrightness(brightness);
  Color get redAlliance => _frc.redAlliance;
  Color get blueAlliance => _frc.blueAlliance;
  Color get onRedAlliance => _frc.onRedAlliance;
  Color get onBlueAlliance => _frc.onBlueAlliance;

  Color get warningText => brightness == Brightness.light
      ? const Color.fromARGB(255, 223, 235, 97)
      : const Color(0xFFE7EC00);

  Color get bodyText => brightness == Brightness.light
      ? onSurfaceVariant
      : const Color(0xFFB8B8B8);
}

import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magnolia_ui/magnolia_ui.dart';
import 'package:scouting_dashboard_app/color_schemes.g.dart';

void main() {
  test('shared themes preserve Dashboard palette and alliance getter contracts',
      () {
    final light = MagnoliaTheme.light();
    final dark = MagnoliaTheme.dark();
    expect(light.brightness, Brightness.light);
    expect(dark.brightness, Brightness.dark);
    expect(light.colorScheme.primary, const Color(0xFF350868));
    expect(dark.colorScheme.primary, const Color(0xFFB59AFF));
    for (final scheme in [light.colorScheme, dark.colorScheme]) {
      final text = scheme.bodyText.computeLuminance();
      final background = scheme.surface.computeLuminance();
      expect(
          (math.max(text, background) + 0.05) /
              (math.min(text, background) + 0.05),
          greaterThanOrEqualTo(4.5));
    }
    expect(lightColorScheme, light.colorScheme);
    expect(darkColorScheme, dark.colorScheme);
    expect(darkColorScheme.redAlliance, const Color(0xFF793F3F));
    expect(darkColorScheme.onBlueAlliance, const Color(0xFFA2A7D0));
    expect(light.extension<MagnoliaFrc>()!.redAlliance,
        lightColorScheme.redAlliance);
    expect(dark.extension<MagnoliaFrc>()!.blueAlliance,
        darkColorScheme.blueAlliance);
  });

  testWidgets('Dashboard can use shared Material controls with doubled text',
      (tester) async {
    var pressed = false;
    await tester.pumpWidget(MaterialApp(
      theme: MagnoliaTheme.light(),
      home: MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(2)),
        child: Scaffold(
            body: Center(
                child: FilledButton(
          onPressed: () => pressed = true,
          child: const Text('Open picklist'),
        ))),
      ),
    ));
    expect(tester.getSize(find.byType(FilledButton)).height,
        greaterThanOrEqualTo(48));
    await tester.tap(find.text('Open picklist'));
    expect(pressed, isTrue);
    expect(tester.takeException(), isNull);
  });
}

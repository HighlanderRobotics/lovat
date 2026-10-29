import 'dart:convert';
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scouting_dashboard_app/pages/ocr_match.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_ocr_match.dart';
import 'package:scouting_dashboard_app/reusable/match_analysis_badges.dart';
import 'package:scouting_dashboard_app/reusable/stale_refresh_builder.dart';

class MatchAPI extends LovatAPI {
  MatchAPI(this.response) : super('https://example.invalid');
  final Map<String, dynamic> response;
  final paths = <String>[];
  @override
  Future<http.Response?> get(String path, {Map<String, String>? query}) async {
    paths.add(path);
    return http.Response(jsonEncode(response), 200);
  }
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    QueryCache.clearAll();
  });
  test('cursor does not interpolate or bridge missing OCR', () {
    const samples = [OcrSample(0, 0), OcrSample(2, 5), OcrSample(20, 10)];
    expect(ocrCountAt(samples, 3), 5);
    expect(ocrCountAt(samples, 8), isNull);
    expect(ocrCountAt(samples, 20), 10);
    expect(ocrCountAt(samples, 24), isNull);
  });
  testWidgets(
      'schedule statuses have spaced hit targets and the eye opens the match',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: MatchAnalysisBadges(
                scouted: true,
                ocrAnalyzed: true,
                fullyScouted: true,
                onOcrPressed: () => Navigator.of(
                        tester.element(find.byType(MatchAnalysisBadges)))
                    .pushNamed('/ocr_match?matchKey=2026test_qm3'))),
        onGenerateRoute: (settings) => MaterialPageRoute(
            settings: settings, builder: (_) => Text(settings.name!))));
    final chip = tester.getRect(find.text('Scouted')),
        eye = tester.getRect(find.byTooltip('OCR analyzed'));
    expect(eye.left - chip.right, greaterThanOrEqualTo(6));
    expect(eye.height, 40);
    await tester.tap(find.byTooltip('OCR analyzed'));
    await tester.pumpAndSettle();
    expect(find.text('/ocr_match?matchKey=2026test_qm3'), findsOneWidget);
  });
  for (final width in [320.0, 1280.0]) {
    testWidgets('OCR match timeline fits $width and preserves data gaps',
        (tester) async {
      tester.view.physicalSize = Size(width, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final samples = [
        for (int i = 0; i <= 163; i++)
          if (i < 60 || i > 90) OcrSample(i, i)
      ];
      final data = OcrMatchData(
          available: true,
          matchKey: '2026test_qm3',
          label: 'QM3',
          tournamentName: 'Synthetic',
          redScore: 9999,
          blueScore: 9999,
          red: samples,
          blue: samples,
          teams: const [
            OcrMatchTeam(8033, 'RED', 100, -5, 95),
            OcrMatchTeam(1967, 'BLUE', 90, 10, 100)
          ]);
      await tester.pumpWidget(
          MaterialApp(home: Scaffold(body: OcrMatchTimeline(data: data))));
      await tester.pump();
      expect(find.text('Fuel timeline'), findsOneWidget);
      final chart = tester.widget<LineChart>(find.byType(LineChart));
      expect(chart.data.lineBarsData.length, 4);
      final slider = find.byKey(const Key('ocr-time-slider'));
      await tester.ensureVisible(slider);
      await tester.drag(slider, const Offset(70, 0));
      await tester.pump();
      expect(tester.widget<Slider>(slider).value, greaterThan(0));
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('unavailable match is explicit and does not show another match',
      (tester) async {
    final api = MatchAPI({'available': false, 'matchKey': '2026test_qm3'});
    await tester.pumpWidget(
        MaterialApp(home: OcrMatchPage(matchKey: '2026test_qm3', api: api)));
    await tester.pumpAndSettle();
    expect(find.text('No OCR timeline available'), findsOneWidget);
    expect(api.paths, ['/v1/analysis/estimates/match/2026test_qm3']);
  });
}

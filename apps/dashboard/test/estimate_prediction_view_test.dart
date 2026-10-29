import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scouting_dashboard_app/reusable/estimate_prediction_view.dart';
import 'package:scouting_dashboard_app/reusable/match_analysis_badges.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_alliance_analysis.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_match_prediction.dart';

AllianceAnalysis alliance(int first, {bool missing = false}) =>
    AllianceAnalysis(
      teams: List.generate(
          3,
          (i) => AllianceTeam(
              team: first + i,
              averagePoints: 25,
              scoutAverage: missing ? null : 30,
              ocrAdjustment: missing ? null : -5)),
      totalPoints: 80,
      robotPoints: 75,
      foulPoints: 5,
      autoPoints: 20,
      teleopPoints: 55,
      l1StartTime: const [null, null, null],
      l2StartTime: const [null, null, null],
      l3StartTime: const [null, null, null],
      totalFuelOutputted: 60,
      totalBallThroughput: null,
    );
void main() {
  for (final width in [320.0, 417.0, 1280.0]) {
    testWidgets('estimate table fits $width without prose or overflow',
        (tester) async {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(MaterialApp(
          home: Scaffold(
              body: EstimatePredictionView(
                  prediction: MatchPrediction(
                      redWinning: .6,
                      blueWinning: .4,
                      redAlliance: alliance(100),
                      blueAlliance: alliance(200))))));
      expect(find.text('OCR Δ'), findsNWidgets(2));
      expect(find.text('Reports'), findsNWidgets(2));
      expect(find.text('Fouls'), findsNWidgets(2));
      expect(find.text('−5'), findsNWidgets(6));
      expect(find.text('+5'), findsNWidgets(2));
      expect(find.text('OCR + report estimates only'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets(
      'missing baselines remain unknown and do not become zero corrections',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: EstimatePredictionView(
                prediction: MatchPrediction(
                    redWinning: .5,
                    blueWinning: .5,
                    redAlliance: alliance(100, missing: true),
                    blueAlliance: alliance(200))))));
    expect(find.text('—'), findsNWidgets(14));
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'match analysis badges are independent, labeled, and absent when false',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
        home: MatchAnalysisBadges(ocrAnalyzed: true, fullyScouted: true)));
    expect(find.byTooltip('OCR analyzed'), findsOneWidget);
    expect(find.byTooltip('Fully scouted'), findsOneWidget);
    expect(find.byIcon(Icons.fact_check_outlined), findsOneWidget);
    await tester.pumpWidget(const MaterialApp(
        home: MatchAnalysisBadges(ocrAnalyzed: false, fullyScouted: false)));
    expect(find.byTooltip('OCR analyzed'), findsNothing);
    expect(find.byTooltip('Fully scouted'), findsNothing);
  });
}

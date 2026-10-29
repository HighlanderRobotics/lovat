import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/team_lookup/get_team_estimates.dart';
import 'package:scouting_dashboard_app/reusable/stale_refresh_builder.dart';
import 'package:scouting_dashboard_app/pages/team_lookup/tabs/team_lookup_estimates.dart';

class EstimateAPI extends LovatAPI {
  EstimateAPI(this.payload) : super('https://example.invalid');
  final Map<String, dynamic> payload;
  final paths = <String>[];
  @override
  Future<http.Response?> get(String path, {Map<String, String>? query}) async {
    paths.add(path);
    return http.Response(jsonEncode(payload), 200);
  }
}

Map<String, dynamic> sample({bool empty = false}) => {
      'scoreSource': 'combined',
      'team': 8033,
      'sampleCount': empty ? 0 : 1,
      'averagePoints': 70.5,
      'autoPoints': 20,
      'teleopPoints': 50.5,
      'matches': empty
          ? []
          : [
              {
                'matchKey': '2026cacg_qm3',
                'label': 'QM3',
                'tournamentName': 'CalGames',
                'totalPoints': 70.5,
                'scoutAverage': 80,
                'ocrAdjustment': -9.5
              }
            ]
    };
void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    QueryCache.clearAll();
  });
  test('rejects report-only server and uses a team-specific endpoint',
      () async {
    expect(
        () => TeamEstimates.fromJson({...sample(), 'scoreSource': 'reports'}),
        throwsA(isA<LovatAPIException>()));
    final api = EstimateAPI(sample());
    final result = await api.teamEstimatesQuery(8033).queryFn();
    expect(result.sampleCount, 1);
    expect(api.paths, ['/v1/analysis/estimates/team/8033']);
  });
  testWidgets(
      'shows report average and signed OCR adjustment on a narrow screen',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: TeamLookupEstimatesTab(
                team: 8033, api: EstimateAPI(sample())))));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('QM3'), findsOneWidget);
    expect(find.text('80'), findsOneWidget);
    expect(find.text('−9.5'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'empty estimates stay explicit without falling back to scout scores',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: TeamLookupEstimatesTab(
                team: 8033, api: EstimateAPI(sample(empty: true))))));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('No OCR estimates'), findsOneWidget);
    expect(find.text('Refresh'), findsOneWidget);
    expect(find.text('80'), findsNothing);
  });
}

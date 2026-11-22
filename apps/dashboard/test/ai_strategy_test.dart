import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/pages/ai_strategy.dart';
import 'package:scouting_dashboard_app/reusable/tournament_key_picker.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/ai_strategy.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';

Map<String, dynamic> contextJson({String? draft}) => {
      'teamNumber': 8033,
      'match': {'key': '2026test_qm10'},
      'reportCount': 3,
      'collectedAt': '2026-03-01T10:00:00Z',
      'teams': [
        {'teamNumber': 8033, 'alliance': 'RED', 'reportCount': 3},
        {'teamNumber': 1, 'alliance': 'BLUE', 'reportCount': 0},
      ],
      if (draft != null) 'draft': draft,
    };

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Tournament.clearCurrent();
    PackageInfo.setMockInitialValues(
        appName: 'Test',
        packageName: 'test',
        version: '1',
        buildNumber: '1',
        buildSignature: '');
  });
  test('loads tournament-specific context and sends only match and briefing',
      () async {
    final requests = <http.Request>[];
    final api = LovatAPI('https://example.invalid',
        tokenProvider: () async => 'test-token',
        client: MockClient((request) async {
          requests.add(request);
          return http.Response(
              jsonEncode(contextJson(
                  draft: request.method == 'POST' ? 'Play defense' : null)),
              200);
        }));
    final context = await api.getStrategyContext('2026test');
    expect(context.teamNumber, 8033);
    expect(context.teams.last.reportCount, 0);
    final result = await api.draftStrategy('2026test',
        matchKey: context.matchKey, briefing: 'Intake damaged');
    expect(result.draft, 'Play defense');
    expect(requests.first.url.path, '/v1/manager/ai-strategy/2026test');
    expect(jsonDecode(requests.last.body), {
      'matchKey': '2026test_qm10',
      'briefing': 'Intake damaged',
    });
    api.dispose();
  });

  test('shows server errors for stale matches and missing configuration',
      () async {
    for (final status in [409, 422, 503]) {
      final api = LovatAPI('https://example.invalid',
          tokenProvider: () async => 'test-token',
          client: MockClient((_) async => http.Response(
              jsonEncode({'message': 'Refresh the next match'}), status)));
      await expectLater(
          api.draftStrategy('2026test', matchKey: 'old', briefing: ''),
          throwsA(isA<LovatAPIException>().having(
              (error) => error.message, 'message', 'Refresh the next match')));
      api.dispose();
    }
  });

  test('handles non-JSON failures with a readable error', () async {
    final api = LovatAPI('https://example.invalid',
        tokenProvider: () async => 'test-token',
        client: MockClient((_) async => http.Response('Bad gateway', 502)));
    await expectLater(
        api.getStrategyContext('2026test'), throwsA(isA<LovatAPIException>()));
    api.dispose();
  });
  testWidgets(
      'selecting a different event clears its draft and loads new coverage',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final previousApi = lovatAPI;
    final requests = <http.Request>[];
    final api = LovatAPI('https://example.invalid',
        tokenProvider: () async => 'test',
        client: MockClient((request) async {
          requests.add(request);
          if (request.url.path.endsWith('/profile')) {
            return http.Response(
                jsonEncode({'email': 'test@example.invalid'}), 200);
          }
          if (request.url.path.endsWith('/tournaments')) {
            return http.Response(
                jsonEncode({
                  'tournaments': [
                    {'key': '2026test', 'name': 'Test event'},
                    {'key': '2026other', 'name': 'Other event'},
                  ],
                  'count': 2
                }),
                200);
          }
          return http.Response(
              jsonEncode(contextJson(
                  draft: request.method == 'POST'
                      ? 'Draft for first event'
                      : null)),
              200);
        }));
    lovatAPI = api;
    addTearDown(() {
      lovatAPI = previousApi;
      api.dispose();
    });
    await Tournament('2026test', 'Test event').storeAsCurrent();
    await tester.pumpWidget(MaterialApp(home: AiStrategyPage(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Team 8033 · 3 sourced reports'), findsOneWidget);
    await tester.ensureVisible(find.text('Draft next-match strategy'));
    await tester.tap(find.text('Draft next-match strategy'));
    await tester.pumpAndSettle();
    expect(find.text('Draft for first event'), findsOneWidget);
    // Invoke the picker callback to exercise the same page transition as a choice.
    tester
        .widget<TournamentKeyPicker>(find.byType(TournamentKeyPicker))
        .onChanged!(Tournament('2026other', 'Other event'));
    await tester.pumpAndSettle();
    expect(find.text('Draft for first event'), findsNothing);
    expect(requests.last.url.path, '/v1/manager/ai-strategy/2026other');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await api.cache.flush();
  });
  testWidgets(
      'NorCal example uses a separate endpoint and never changes the current tournament',
      (tester) async {
    final previousApi = lovatAPI;
    final requests = <http.Request>[];
    final api = LovatAPI('https://example.invalid',
        tokenProvider: () async => 'test',
        client: MockClient((request) async {
          requests.add(request);
          if (request.url.path.endsWith('/profile')) {
            return http.Response(
                jsonEncode({'email': 'test@example.invalid'}), 200);
          }
          if (request.url.path.endsWith('/tournaments')) {
            return http.Response(
                jsonEncode({
                  'tournaments': [
                    {'key': '2026test', 'name': 'Actual tournament'},
                  ],
                  'count': 1
                }),
                200);
          }
          final data = contextJson(
              draft: request.method == 'POST'
                  ? 'EXAMPLE ONLY — sample draft'
                  : null);
          data['isExample'] = true;
          data['match'] = {'key': '2026norcaldemo_qm4'};
          data['reportCount'] = 18;
          data['teams'] = [8033, 1323, 4414, 254, 1678, 971]
              .asMap()
              .entries
              .map((entry) => {
                    'teamNumber': entry.value,
                    'alliance': entry.key < 3 ? 'RED' : 'BLUE',
                    'reportCount': 3,
                  })
              .toList();
          return http.Response(jsonEncode(data), 200,
              headers: {'content-type': 'application/json; charset=utf-8'});
        }));
    lovatAPI = api;
    addTearDown(() {
      lovatAPI = previousApi;
      api.dispose();
    });
    await tester.pumpWidget(MaterialApp(home: AiStrategyPage(api: api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Try NorCal REBUILT example'));
    await tester.pumpAndSettle();
    expect(find.text('NorCal Championship · REBUILT example'), findsOneWidget);
    expect(find.text('Team 8033 · 18 sample reports'), findsOneWidget);
    expect(await Tournament.getCurrent(), isNull);
    expect(find.byType(TournamentKeyPicker), findsNothing);
    await tester.ensureVisible(find.text('Draft next-match strategy'));
    await tester.tap(find.text('Draft next-match strategy'));
    await tester.pumpAndSettle();
    expect(find.text('EXAMPLE ONLY — sample draft'), findsOneWidget);
    expect(requests.last.url.path, '/v1/manager/ai-strategy-example');
    expect(jsonDecode(requests.last.body),
        {'matchKey': '2026norcaldemo_qm4', 'briefing': ''});
    await tester.ensureVisible(find.text('Use my tournament data'));
    await tester.tap(find.text('Use my tournament data'));
    await tester.pumpAndSettle();
    expect(find.text('EXAMPLE ONLY — sample draft'), findsNothing);
    expect(find.byType(TournamentKeyPicker), findsOneWidget);
    expect(await Tournament.getCurrent(), isNull);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await api.cache.flush();
  });
}

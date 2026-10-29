import 'dart:async';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:scouting_dashboard_app/pages/match_predictor.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_match_prediction.dart';
import 'package:scouting_dashboard_app/reusable/stale_refresh_builder.dart';

class PredictorAPI extends LovatAPI {
  PredictorAPI() : super('https://example.invalid');
  final queries = <Map<String, String>>[];
  final responses = <Completer<http.Response?>>[];
  @override
  Future<http.Response?> get(String path, {Map<String, String>? query}) {
    queries.add({...?query});
    final response = Completer<http.Response?>();
    responses.add(response);
    return response.future;
  }
}

void main() {
  for (final estimatesOnly in [false, true]) {
    test(
        'team errors identify setup requirements in either score mode '
        '(estimates: $estimatesOnly)', () async {
      final cases = [
        (401, 'No team', predictorTeamRequiredMessage),
        (
          403,
          'Your team has not been verified yet',
          predictorTeamVerificationMessage
        ),
      ];
      for (final (status, body, message) in cases) {
        final api = PredictorAPI();
        final request = api
            .matchPredictionQuery(1, 2, 3, 4, 5, 6,
                estimatesOnly: estimatesOnly)
            .queryFn();
        api.responses.single.complete(http.Response(body, status));
        await expectLater(
            request,
            throwsA(isA<LovatAPIException>()
                .having((error) => error.message, 'message', message)));
      }
      final api = PredictorAPI();
      final request = api
          .matchPredictionQuery(1, 2, 3, 4, 5, 6, estimatesOnly: estimatesOnly)
          .queryFn();
      api.responses.single.complete(http.Response('Unauthorized', 401));
      await expectLater(request, throwsA(isNot(isA<LovatAPIException>())));
    });
  }

  testWidgets('missing team offers onboarding instead of a failing retry',
      (tester) async {
    QueryCache.clearAll();
    final api = PredictorAPI();
    await tester.pumpWidget(MaterialApp(
      routes: {
        '/loading': (_) => const Scaffold(body: Text('Team setup')),
      },
      onGenerateRoute: (_) => MaterialPageRoute(
        settings: const RouteSettings(arguments: {
          'red1': '1',
          'red2': '2',
          'red3': '3',
          'blue1': '4',
          'blue2': '5',
          'blue3': '6',
        }),
        builder: (_) => MatchPredictorPage(api: api),
      ),
    ));
    await tester.pump();
    api.responses.single.complete(http.Response('No team', 401));
    await tester.pump();
    await tester.pump();
    expect(find.text(predictorTeamRequiredMessage), findsOneWidget);
    expect(find.text('Retry'), findsNothing);
    // Use the application's route table for the setup destination.
    await tester.tap(find.text('Set up team'));
    await tester.pumpAndSettle();
    expect(find.text('Team setup'), findsOneWidget);
  });

  testWidgets('estimate toggle works while loading and after missing data',
      (tester) async {
    QueryCache.clearAll();
    final api = PredictorAPI();
    await tester.pumpWidget(MaterialApp(
        onGenerateRoute: (_) => MaterialPageRoute(
              settings: const RouteSettings(arguments: {
                'red1': '1',
                'red2': '2',
                'red3': '3',
                'blue1': '4',
                'blue2': '5',
                'blue3': '6'
              }),
              builder: (_) => MatchPredictorPage(api: api),
            )));
    await tester.pump();
    expect(api.queries.single['scoreSource'], isNull);
    await tester.tap(find.byTooltip('Use OCR + report estimates only'));
    await tester.pump();
    await tester.pump();
    expect(api.queries.last['scoreSource'], 'combined');
    expect(find.text('Match Predictor · Estimates'), findsOneWidget);
    api.responses.last.complete(http.Response('not enough data', 200));
    await tester.pump();
    await tester.pump();
    expect(find.textContaining('Report scores are not used in this mode.'),
        findsOneWidget);
    await tester.tap(find.byTooltip('Use scout report scores'));
    await tester.pump();
    await tester.pump();
    expect(api.queries.last['scoreSource'], isNull);
    expect(find.text('Match Predictor'), findsOneWidget);
    for (final response in api.responses) {
      if (!response.isCompleted) {
        response.complete(http.Response('not enough data', 200));
      }
    }
    await tester.pump();
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'estimate mode rejects report responses from an old server and cache',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final api = PredictorAPI();
    final query =
        api.matchPredictionQuery(1, 2, 3, 4, 5, 6, estimatesOnly: true);
    final request = query.queryFn();
    api.responses.single.complete(http.Response('{}', 200));
    await expectLater(request, throwsA(isA<LovatAPIException>()));
    api.cache.put(
        api.cacheKeyFor('/v1/analysis/matchprediction',
            query: api.queries.single),
        '{}');
    expect(query.cacheReader!(), isNull);
    await tester.pump(const Duration(milliseconds: 600));
  });

  testWidgets('combined responses parse nullable report-only metrics',
      (tester) async {
    final api = PredictorAPI();
    final query =
        api.matchPredictionQuery(1, 2, 3, 4, 5, 6, estimatesOnly: true);
    final request = query.queryFn();
    final alliance = {
      'teams': <dynamic>[
        {
          'team': 1,
          'averagePoints': 20,
          'estimateSamples': 2,
          'archivedSamples': 1
        }
      ],
      'totalPoints': 20,
      'autoPoints': 5,
      'teleopPoints': 15,
      'l1StartTime': [null, null, null],
      'l2StartTime': [null, null, null],
      'l3StartTime': [null, null, null],
      'totalFuelOutputted': 10,
      'totalBallThroughput': null
    };
    api.responses.single.complete(http.Response(
        jsonEncode({
          'scoreSource': 'combined',
          'redWinning': .5,
          'blueWinning': .5,
          'redAlliance': alliance,
          'blueAlliance': alliance
        }),
        200));
    final prediction = await request;
    expect(prediction.redAlliance.autoPoints, 5);
    expect(prediction.redAlliance.totalBallThroughput, isNull);
    expect(prediction.redAlliance.teams.single.archivedSamples, 1);
  });
}

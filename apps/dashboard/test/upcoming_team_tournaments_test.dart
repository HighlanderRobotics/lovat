import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/upcoming_team_tournaments.dart';

class EventAPI extends LovatAPI {
  EventAPI() : super('https://example.invalid');
  int status = 200;
  List<Map<String, dynamic>> events = [];
  @override
  Future<http.Response?> get(String path, {Map<String, String>? query}) async =>
      http.Response(jsonEncode(events), status);
}

void main() {
  testWidgets('two future events appear side by side at phone width',
      (tester) async {
    final api = EventAPI()
      ..events = [
        {
          'key': 'first',
          'name': 'San Francisco Regional',
          'city': 'San Francisco',
          'week': 2
        },
        {
          'key': 'second',
          'name': 'Orange County Regional',
          'city': 'Irvine',
          'week': 6
        },
      ];
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: SizedBox(
                width: 320, child: UpcomingTeamTournaments(api: api)))));
    await tester.pumpAndSettle();
    final first = find.text('San Francisco Regional');
    final second = find.text('Orange County Regional');
    expect(first, findsOneWidget);
    expect(second, findsOneWidget);
    expect(find.text('San Francisco · Week 2'), findsOneWidget);
    expect(tester.getTopLeft(first).dy, tester.getTopLeft(second).dy);
    expect(
        tester.getTopLeft(second).dx, greaterThan(tester.getTopLeft(first).dx));
    expect(tester.takeException(), isNull);
  });
  testWidgets('handles no events and retries failed requests', (tester) async {
    final api = EventAPI()..status = 502;
    await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: UpcomingTeamTournaments(api: api))));
    await tester.pumpAndSettle();
    expect(find.text('Could not load upcoming entered tournaments.'),
        findsOneWidget);
    api.status = 200;
    await tester.tap(find.text('Retry entered tournaments'));
    await tester.pumpAndSettle();
    expect(
        find.text('No future entered tournaments listed on The Blue Alliance.'),
        findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

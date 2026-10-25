import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/upcoming_tournaments.dart';

void main() {
  test(
      'this week includes ongoing events and excludes ended and next-week events',
      () {
    Tournament event(String key, String start, String end) =>
        Tournament(key, key,
            date: DateTime.parse(start), endDate: DateTime.parse(end));
    final events = [
      event('next-week', '2026-10-26', '2026-10-28'),
      event('sunday', '2026-10-25', '2026-10-25'),
      event('ended', '2026-10-19', '2026-10-21'),
      event('ongoing', '2026-10-18', '2026-10-23'),
      event('weekend', '2026-10-24', '2026-10-26'),
      Tournament('unknown', 'Unknown'),
    ];
    expect(
      tournamentsThisWeek(events, DateTime(2026, 10, 22))
          .map((event) => event.key),
      ['ongoing', 'weekend', 'sunday'],
    );
    expect(
      tournamentsThisWeek(events, DateTime(2026, 10, 25))
          .map((event) => event.key),
      ['weekend', 'sunday'],
    );
    expect(
      tournamentsThisWeek(events, DateTime(2026, 10, 26))
          .map((event) => event.key),
      ['weekend', 'next-week'],
    );
  });

  test('API dates retain date-only boundaries and accept missing dates', () {
    final event = Tournament.fromJson({
      'key': 'boundary',
      'name': 'Boundary',
      'date': '2026-10-27',
      'startDate': '2026-10-25T00:00:00.000Z',
      'endDate': '2026-10-25T00:00:00.000Z',
      'location': 'Glendale',
    });
    expect(tournamentsThisWeek([event], DateTime(2026, 10, 25)), [event]);
    expect(event.location, 'Glendale');
    final unknown = Tournament.fromJson({'key': 'unknown', 'name': 'Unknown'});
    expect(unknown.date, isNull);
    expect(tournamentsThisWeek([unknown], DateTime(2026, 10, 25)), isEmpty);
  });

  testWidgets('renders API name, date range and location', (tester) async {
    final api = TournamentListAPI();
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
      body: UpcomingWeekTournaments(api: api, now: DateTime(2026, 10, 22)),
    )));
    await tester.pumpAndSettle();
    expect(find.text('API Weekend Event'), findsOneWidget);
    expect(find.text('Oct 24 – Oct 25'), findsOneWidget);
    expect(find.text('Glendale'), findsOneWidget);
    expect(find.text('Outside this week'), findsNothing);
    expect(api.requestedPath, '/v1/manager/tournaments');
    expect(tester.takeException(), isNull);
  });

  testWidgets('empty list and request failures have distinct states and retry',
      (tester) async {
    final api = TournamentListAPI()..statusCode = 500;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
      body: UpcomingWeekTournaments(api: api, now: DateTime(2026, 10, 22)),
    )));
    await tester.pumpAndSettle();
    expect(find.text('Could not load tournaments this week.'), findsOneWidget);
    api.statusCode = 200;
    api.events = [];
    await tester.tap(find.text('Retry tournaments'));
    await tester.pumpAndSettle();
    expect(find.text('No upcoming tournaments this week.'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

class TournamentListAPI extends LovatAPI {
  TournamentListAPI() : super('https://example.invalid');

  int statusCode = 200;
  String? requestedPath;
  List<Map<String, dynamic>> events = [
    {
      'key': '2026fixture',
      'name': 'API Weekend Event',
      'date': '2026-10-24',
      'startDate': '2026-10-24T00:00:00.000Z',
      'endDate': '2026-10-25T00:00:00.000Z',
      'location': 'Glendale',
    },
    {
      'key': '2026later',
      'name': 'Outside this week',
      'date': '2026-10-26',
    },
  ];

  @override
  Future<http.Response?> get(String path, {Map<String, String>? query}) async {
    requestedPath = path;
    return http.Response(
        jsonEncode({'tournaments': events, 'count': events.length}),
        statusCode);
  }
}

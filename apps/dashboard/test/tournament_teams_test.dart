import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/pages/tournament_teams.dart';
import 'package:scouting_dashboard_app/reusable/team_card.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';

class TeamsAPI extends LovatAPI {
  TeamsAPI() : super('https://example.invalid');
  int status = 200;
  bool rankingsMissing = false;
  String? requested;
  List<Map<String, dynamic>> teams = List.generate(
      7,
      (i) => {
            'number': 100 + i,
            'rank': i == 0 ? null : 8 - i,
            'rankingPoints': 20,
            'matchesPlayed': 6,
          });
  @override
  Future<http.Response?> get(String path, {Map<String, String>? query}) async {
    requested = path;
    if (rankingsMissing && path.endsWith('/rankedTeams')) {
      return http.Response('Not found', 404);
    }
    if (rankingsMissing && path.endsWith('/teams')) {
      return http.Response(
          jsonEncode([
            {'number': 8033, 'name': 'Actual team'}
          ]),
          200);
    }
    return http.Response(jsonEncode(teams), status);
  }
}

void main() {
  testWidgets(
      'roster remains visible when the production rankings route returns 404',
      (tester) async {
    final api = TeamsAPI()..rankingsMissing = true;
    await tester.pumpWidget(MaterialApp(
        home: TournamentTeamsPage(
            api: api, tournament: Tournament('real', 'Real event'))));
    await tester.pumpAndSettle();
    expect(find.byType(TeamCard), findsOneWidget);
    expect(find.text('8033'), findsOneWidget);
    expect(find.text('—'), findsOneWidget);
    expect(api.requested, '/v1/manager/tournament/real/teams');
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'shows all tournament teams in rank order including unranked teams',
      (tester) async {
    final api = TeamsAPI();
    await tester.pumpWidget(MaterialApp(
        home: TournamentTeamsPage(
            api: api, tournament: Tournament('demo', 'Demo'))));
    await tester.pumpAndSettle();
    expect(api.requested, '/v1/manager/tournament/demo/rankedTeams');
    expect(find.byType(TeamCard), findsNWidgets(7));
    final cards = tester.widgetList<TeamCard>(find.byType(TeamCard)).toList();
    expect(cards.map((c) => c.rank), ['2', '3', '4', '5', '6', '7', '—']);
    expect(cards.last.teamNumber, '100');
    expect(find.text('Team rankings'), findsOneWidget);
    final first = tester.getRect(find.byType(TeamCard).at(0));
    final second = tester.getRect(find.byType(TeamCard).at(1));
    expect(first.left, second.left);
    expect(first.width, second.width);
    expect(first.height, 53);
    expect(second.top - first.bottom, 10);
    expect(find.byType(GridView), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'request failures retry and empty tournaments show an empty state',
      (tester) async {
    final api = TeamsAPI()..status = 500;
    await tester.pumpWidget(MaterialApp(
        home: TournamentTeamsPage(
            api: api, tournament: Tournament('demo', 'Demo'))));
    await tester.pumpAndSettle();
    expect(
        find.text('Could not load teams at this tournament.'), findsOneWidget);
    api.status = 200;
    api.teams = [];
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('No teams are available for this tournament yet.'),
        findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_team_rankings.dart';
import 'package:scouting_dashboard_app/reusable/team_search.dart';

TeamRanking team(int number, {int? rank}) => TeamRanking(
      number: number,
      rank: rank,
      rankingPoints: rank == null ? null : 30 - rank,
      matchesPlayed: 6,
    );

void main() {
  final teams = [team(8033, rank: 3), team(80, rank: 9), team(254, rank: 1)];

  test('matches tournament teams by number prefix', () {
    expect(searchTeams(teams, '8').map((r) => r.number), [8, 80, 8033]);
    expect(searchTeams(teams, '80').map((r) => r.number), [80, 8033]);
    expect(searchTeams(teams, '8033').map((r) => r.number), [8033]);
    expect(searchTeams(teams, '8033').single.ranking, isNotNull);
  });

  test('offers any valid team number not at the tournament', () {
    final results = searchTeams(teams, '1678');
    expect(results.single.number, 1678);
    expect(results.single.ranking, isNull);
  });

  test('ignores empty and non-numeric queries', () {
    expect(searchTeams(teams, ''), isEmpty);
    expect(searchTeams(teams, 'abc'), isEmpty);
    expect(searchTeams(teams, '0'), isEmpty);
  });

  test('profile initials use the first and last name', () {
    expect(profileInitials('Collin Cameron'), 'CC');
    expect(profileInitials(' ted  e '), 'TE');
    expect(profileInitials('sam'), 'S');
    expect(profileInitials(null), '');
  });

  testWidgets('results show tournament teams and pick a team', (tester) async {
    int? picked;
    await tester.pumpWidget(MaterialApp(
      // InkSparkle's shader cannot load in tests.
      theme: ThemeData(splashFactory: InkRipple.splashFactory),
      home: Scaffold(
        body: TeamSearchResults(
          query: '80',
          teams: teams,
          onSelected: (team) => picked = team,
        ),
      ),
    ));
    expect(find.text('80'), findsOneWidget);
    expect(find.text('8033'), findsOneWidget);
    expect(find.text('Rank 3 · 27 RP'), findsOneWidget);
    await tester.tap(find.text('8033'));
    expect(picked, 8033);

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: TeamSearchResults(query: 'abc', teams: teams, onSelected: (_) {}),
      ),
    ));
    expect(find.text('Team numbers only contain digits'), findsOneWidget);
  });
}

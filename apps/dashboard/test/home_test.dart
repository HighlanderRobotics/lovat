import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_test/flutter_test.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/pages/home.dart';
import 'package:scouting_dashboard_app/pages/match_schedule.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_team_rankings.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_matches.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_tournament_status.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/models/scout_schedule.dart';

void main() {
  testWidgets(
      'Teams opens the selected tournament page and weekly heading is not tappable',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final tournament = Tournament('test-event', 'Test Event');
    await tournament.storeAsCurrent();
    final api = TournamentTestAPI();
    Map<String, dynamic>? arguments;
    await tester.pumpWidget(MaterialApp(
      home: HomePage(api: api),
      routes: {
        '/tournament_teams': (context) {
          arguments = ModalRoute.of(context)!.settings.arguments
              as Map<String, dynamic>;
          return Scaffold(
              appBar: AppBar(), body: const Text('All tournament teams'));
        }
      },
    ));
    await tester.pumpAndSettle();
    final weekly = find.text('Tournaments this week');
    expect(find.ancestor(of: weekly, matching: find.byType(GestureDetector)),
        findsNothing);
    await tester.ensureVisible(find.text('Teams'));
    await tester.tap(find.text('Teams'));
    await tester.pumpAndSettle();
    expect(find.text('All tournament teams'), findsOneWidget);
    expect(arguments?['tournament'], same(tournament));
    expect(arguments?['api'], same(api));
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Teams'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await Tournament.clearCurrent();
  });

  testWidgets('top bar search opens team lookup for the typed team',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    await Tournament('test-event', 'Test Event').storeAsCurrent();
    Object? arguments;
    await tester.pumpWidget(MaterialApp(
      theme: ThemeData(splashFactory: InkRipple.splashFactory),
      home: HomePage(api: TournamentTestAPI()),
      routes: {
        '/team_lookup': (context) {
          arguments = ModalRoute.of(context)!.settings.arguments;
          return Scaffold(
              appBar: AppBar(), body: const Text('Team lookup page'));
        },
      },
    ));
    await tester.pumpAndSettle();
    expect(find.text('Lovat'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);

    await tester.tap(find.byTooltip('Search teams'));
    await tester.pumpAndSettle();
    expect(find.text('Lovat'), findsNothing);
    await tester.enterText(find.byType(TextField), '1678');
    await tester.pumpAndSettle();
    expect(find.text('Look up team'), findsOneWidget);

    // Closing search clears it and shows the home page again.
    await tester.tap(find.byTooltip('Close search'));
    await tester.pumpAndSettle();
    expect(find.text('Lovat'), findsOneWidget);
    expect(find.text('Look up team'), findsNothing);

    await tester.tap(find.byTooltip('Search teams'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '1678');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(find.text('Team lookup page'), findsOneWidget);
    expect(arguments, {'team': 1678});

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Lovat'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await Tournament.clearCurrent();
  });

  testWidgets('status tiles stay equal and compact on a phone', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 320,
          child: Row(children: [
            Expanded(
                child: HomeStatusTile(value: Text('3'), label: Text('Rank'))),
            SizedBox(width: 8),
            Expanded(
                child: HomeStatusTile(value: Text('20'), label: Text('RP'))),
            SizedBox(width: 8),
            Expanded(
                child: HomeStatusTile(
                    value: Text('9/12'), label: Text('Matches Played'))),
          ]),
        ),
      ),
    ));
    final tiles = find.byType(HomeStatusTile);
    final size = tester.getSize(tiles.first);
    expect(size.height, 60);
    for (var i = 1; i < 3; i++) {
      expect(tester.getSize(tiles.at(i)), size);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('empty and populated match cards have matching dimensions',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 320,
          child: Column(children: [
            HomePageMatch(
                match1:
                    MatchScheduleMatch.fromJson(matchFixture(0, 1), 'demo')),
            const HomePageMatch(match1: null, isTeamMatch: true),
          ]),
        ),
      ),
    ));
    final blue = tester.widgetList<AllianceRow>(find.byType(AllianceRow)).first;
    expect(blue.alliance, Alliance.blue);
    expect(blue.items.map((item) => item.longMatchKey.split('_').last),
        ['3', '4', '5']);
    final cards = find.byType(HomePageMatch);
    expect(tester.getSize(cards.first), tester.getSize(cards.last));
    final corners = tester
        .widgetList<ClipRRect>(
            find.descendant(of: cards, matching: find.byType(ClipRRect)))
        .toList();
    expect(corners.length, 2);
    expect(corners.first.borderRadius, corners.last.borderRadius);
    expect(tester.takeException(), isNull);
  });

  testWidgets('scouter cards show who is up next by inclusive shift ranges',
      (tester) async {
    const alexKim = Scout(name: 'Alex Kim', id: 'first');
    const alexLee = Scout(name: 'Alex Lee', id: 'second');
    const sam = Scout(name: 'Sam', id: 'third');
    ServerScoutingShift shift(String id, int start, int end, List<Scout> a,
            [List<Scout> b = const []]) =>
        ServerScoutingShift(
          id: id,
          start: start,
          end: end,
          team1: a,
          team2: b,
          team3: [],
          team4: [],
          team5: [],
          team6: [],
        );
    final schedule = ServerScoutSchedule(hash: 'test', shifts: [
      shift('one', 1, 2, [alexKim], [alexKim, alexLee]),
      shift('two', 3, 4, [alexLee]),
      shift('three', 6, 7, [alexKim, sam]),
    ]);

    Future<void> showMatch(int? ordinal, {bool hasSchedule = true}) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: HomeScouters(
            schedule: hasSchedule ? schedule : null,
            nextMatchOrdinal: ordinal,
          ),
        ),
      ));
    }

    // Scouters on duty for the match being played are left out.
    await showMatch(1);
    expect(find.byType(HomeScouterCard), findsOneWidget);
    expect(find.text('Sam'), findsOneWidget);
    expect(find.text('Up in 5 matches'), findsOneWidget);
    await showMatch(3);
    expect(find.text('Alex K'), findsOneWidget);
    expect(find.text('Sam'), findsOneWidget);
    expect(find.text('Alex L'), findsNothing);
    expect(find.text('Up in 3 matches'), findsNWidgets(2));
    await showMatch(5);
    expect(find.text('Up in 1 match'), findsNWidgets(2));
    await showMatch(8);
    expect(find.text('No more scouting shifts.'), findsOneWidget);
    await showMatch(3, hasSchedule: false);
    expect(find.text('The scouter schedule is unavailable.'), findsOneWidget);
    await showMatch(null);
    expect(find.text('No upcoming matches.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('ordinal ranks', () {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal), [
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '101st',
      '111th'
    ]);
  });

  test('scouter names shorten to first name and last initial', () {
    expect(shortScouterName('Collin Cameron'), 'Collin C');
    expect(shortScouterName('  Leo  van Kirk '), 'Leo K');
    expect(shortScouterName('Sam'), 'Sam');
  });

  test('rankings sort with null ranks last', () {
    TeamRanking ranking(int number, int? rank) => TeamRanking(
          number: number,
          rank: rank,
          matchesPlayed: null,
          rankingPoints: null,
        );
    final teams = [
      ranking(1, null),
      ranking(2, 2),
      ranking(3, null),
      ranking(4, 1),
    ]..sort(TeamRanking.compareByRank);
    expect(teams.map((team) => team.rank), [1, 2, null, null]);
    expect(<TeamRanking>[]..sort(TeamRanking.compareByRank), isEmpty);
  });

  test('team status accepts missing ranking information', () {
    final status = TeamTournamentStatus.fromJson({
      'number': 8033,
      'name': 'Highlander Robotics',
      'rank': null,
      'rankingPoints': null,
      'matchesPlayed': null,
      'matchesTotal': null,
    });
    expect(status.rank, isNull);
    expect(status.rankingPoints, isNull);
    expect(status.matchesPlayed, isNull);
    expect(status.matchesTotal, isNull);
  });

  testWidgets('team cards show only the top four ranked teams in order',
      (tester) async {
    TeamRanking ranking(int number, int? rank, int? rp) => TeamRanking(
        number: number, rank: rank, rankingPoints: rp, matchesPlayed: 10);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
          body: TournamentTopTeams(rankings: [
        ranking(5000, 5, 10),
        ranking(3000, 3, 20),
        ranking(6000, null, null),
        ranking(1000, 1, 30),
        ranking(4000, 4, null),
        ranking(2000, 2, 25),
      ])),
    ));
    final cards = tester.widgetList<TeamCard>(find.byType(TeamCard)).toList();
    expect(
        cards.map((card) => card.teamNumber), ['1000', '2000', '3000', '4000']);
    expect(cards.map((card) => card.rank), ['1', '2', '3', '4']);
    expect(cards.map((card) => card.score),
        ['30 RP / 10 QM', '25 RP / 10 QM', '20 RP / 10 QM', 'RP unavailable']);
    expect(find.text('5000'), findsNothing);
    expect(find.text('6000'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'unranked event keeps actual teams visible with an unavailable message',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
          body: TournamentTopTeams(rankings: [
        TeamRanking(
            number: 8033, rank: null, matchesPlayed: null, rankingPoints: null),
      ])),
    ));
    expect(find.byType(TeamCard), findsOneWidget);
    expect(find.text('8033'), findsOneWidget);
    expect(find.text('Rankings are not available for this tournament yet.'),
        findsOneWidget);
  });

  testWidgets('missing or malformed team image uses the fallback icon',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
          body: TeamCard(
        teamNumber: '8033',
        rank: '1st',
        score: '30 RP',
        color: Colors.black,
        image: 'data:image/png;base64,%%%',
      )),
    ));
    expect(find.byIcon(Icons.groups), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('empty match schedule displays an empty state', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: HomePageMatch(match1: null)),
    ));
    expect(find.text('No matches available.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('completed tournament keeps the last match only for the tournament card',
      () {
    final matches = [
      MatchScheduleMatch.fromJson(
          matchFixture(0, 7, finished: true), 'test-event'),
      MatchScheduleMatch.fromJson(
          matchFixture(1, 1, finished: true), 'test-event'),
      MatchScheduleMatch.fromJson(
          matchFixture(1, 2, finished: true, includesTeam: false),
          'test-event'),
    ];
    expect(selectHomeMatch(matches), same(matches.last));
    final teamMatches = matches.where(
        (match) => match.allTeamInfo.any((info) => info.teamNumber == 8033));
    expect(selectHomeMatch(teamMatches, includeLastCompleted: false), isNull);
    expect(selectHomeMatch([]), isNull);
  });

  test('live tournament prefers the first unfinished match for each team', () {
    final matches = [
      MatchScheduleMatch.fromJson(
          matchFixture(0, 7, finished: true), 'test-event'),
      MatchScheduleMatch.fromJson(
          matchFixture(0, 8, includesTeam: false), 'test-event'),
      MatchScheduleMatch.fromJson(matchFixture(0, 9), 'test-event'),
    ];
    expect(selectHomeMatch(matches), same(matches[1]));
    final teamMatches = matches.where(
        (match) => match.allTeamInfo.any((info) => info.teamNumber == 8033));
    expect(selectHomeMatch(teamMatches), same(matches.last));
  });

  testWidgets(
      'match status changes from Completed to Now playing in the same badge',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HomePageMatch(
          match1: MatchScheduleMatch.fromJson(
              matchFixture(1, 2, finished: true), 'test-event'),
        ),
      ),
    ));
    expect(find.text('COMPLETED'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HomePageMatch(
          match1: MatchScheduleMatch.fromJson(matchFixture(0, 8), 'test-event'),
        ),
      ),
    ));
    expect(find.text('COMPLETED'), findsNothing);
    expect(find.text('NOW PLAYING'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('team match badge names the team', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HomePageMatch(
          match1: MatchScheduleMatch.fromJson(matchFixture(0, 9), 'test-event'),
          isTeamMatch: true,
          teamNumber: 8033,
        ),
      ),
    ));
    expect(find.text('NEXT FOR 8033'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('team empty tile hides completed match data', (tester) async {
    for (final match in <MatchScheduleMatch?>[
      null,
      MatchScheduleMatch.fromJson(
          matchFixture(1, 2, finished: true), 'test-event'),
    ]) {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: HomePageMatch(match1: match, isTeamMatch: true),
        ),
      ));
      expect(find.byType(NoUpcomingTeamMatches), findsOneWidget);
      expect(
          find.text('No more upcoming matches for your team'), findsOneWidget);
      expect(find.textContaining('at test-event'), findsNothing);
      expect(find.text('8033'), findsNothing);
      expect(find.text('COMPLETED'), findsNothing);
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('changing tournaments tolerates missing event data',
      (tester) async {
    tester.view.physicalSize = const Size(1600, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({});
    await Tournament.clearCurrent();
    final api = TournamentTestAPI();
    await Tournament('test-cal-games', 'Cal Games').storeAsCurrent();
    await tester.pumpWidget(MaterialApp(home: HomePage(api: api)));
    await tester.pumpAndSettle();

    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.text('Your team is not entered in this tournament.'),
        findsOneWidget);
    expect(find.textContaining('Rankings are not available'), findsOneWidget);
    expect(tester.takeException(), isNull);

    api.statusCode = 500;
    api.scheduleCode = 404;
    await Tournament('test-throwdown', '10th Street Throwdown')
        .storeAsCurrent();
    await tester.pumpAndSettle();

    expect(api.paths,
        contains('/v1/manager/tournament/test-throwdown/rankedTeams'));
    expect(find.text('10th Street Throwdown'), findsWidgets);
    expect(find.text("Your team's tournament status is unavailable."),
        findsOneWidget);
    expect(find.text('The match schedule is unavailable for this tournament.'),
        findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.text('Could not load the home page. Please try again.'),
        findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('match cards follow selection and ignore an older response',
      (tester) async {
    tester.view.physicalSize = const Size(1600, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({});
    await Tournament.clearCurrent();
    final api = TournamentTestAPI()..showMatches = true;
    await Tournament('old-event', 'Old event').storeAsCurrent();
    await tester.pumpWidget(MaterialApp(home: HomePage(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Match 1 - Upper Bracket - Round 1'), findsWidgets);

    // Start a slow refresh, then select another event before it completes.
    final pending = Completer<http.Response?>();
    api.pendingSchedule = pending;
    await tester.tap(find.text('Retry unavailable data'));
    await tester.pump();
    api.pendingSchedule = null;
    await Tournament('new-event', 'New event').storeAsCurrent();
    await tester.pumpAndSettle();
    // The team plays in the current match and has none after it.
    expect(find.text('Qualifier 7'), findsOneWidget);
    expect(find.byType(NoUpcomingTeamMatches), findsOneWidget);
    expect(find.textContaining('at old-event'), findsNothing);

    pending.complete(http.Response(jsonEncode([matchFixture(1, 1)]), 200));
    await tester.pumpAndSettle();
    // The team plays in the current match and has none after it.
    expect(find.text('Qualifier 7'), findsOneWidget);
    expect(find.byType(NoUpcomingTeamMatches), findsOneWidget);
    expect(find.textContaining('at old-event'), findsNothing);

    await Tournament.clearCurrent();
    await tester.pumpAndSettle();
    expect(find.textContaining('No tournament selected.'), findsOneWidget);
    expect(find.byType(HomePageMatch), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('missing tournament stops loading and supports retry',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    await Tournament.clearCurrent();
    await tester.pumpWidget(const MaterialApp(home: HomePage()));
    await tester.pumpAndSettle();
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.textContaining('No tournament selected.'), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.text('Retry'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

class TournamentTestAPI extends LovatAPI {
  TournamentTestAPI() : super('https://example.invalid');

  bool showMatches = false;
  Completer<http.Response?>? pendingSchedule;
  int statusCode = 404;
  int scheduleCode = 200;
  final List<String> paths = [];

  @override
  Future<http.Response?> get(String path, {Map<String, String>? query}) async {
    paths.add(path);
    if (path == '/v1/manager/tournaments') {
      return http.Response('{"tournaments":[],"count":0}', 200);
    }
    if (path == '/v1/manager/profile') {
      return http.Response(
          jsonEncode({
            'email': 'test@example.invalid',
            'team': {
              'team': {'number': 8033, 'name': 'Highlander Robotics'}
            },
          }),
          200);
    }
    if (path == '/v1/manager/team-tournament-status') {
      return http.Response('Status unavailable', statusCode);
    }
    if (path.endsWith('/rankedTeams')) {
      return http.Response('Tournament or teams not found', 404);
    }
    if (path.startsWith('/v1/manager/matches/')) {
      if (pendingSchedule != null) return pendingSchedule!.future;
      if (showMatches) {
        return http.Response(
            jsonEncode([
              path.endsWith('/old-event')
                  ? matchFixture(1, 1)
                  : matchFixture(0, 7),
            ]),
            200);
      }
      return http.Response(
          scheduleCode == 200 ? '[]' : 'No matches', scheduleCode);
    }
    throw StateError('Unexpected request: $path');
  }
}

Map<String, dynamic> matchFixture(int type, int number,
        {bool finished = false, bool includesTeam = true}) =>
    {
      'matchType': type,
      'matchNumber': number,
      'scouted': false,
      'finished': finished,
      for (var i = 1; i <= 6; i++)
        'team$i': {
          'number': i == 1 && includesTeam ? 8033 : i,
          'scouters': [],
          'externalReports': 0,
        },
    };

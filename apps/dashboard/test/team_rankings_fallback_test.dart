import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:scouting_dashboard_app/reusable/lovat_api/get_team_rankings.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';

class LegacyRankingsAPI extends LovatAPI {
  LegacyRankingsAPI() : super('https://example.invalid');
  int statusCalls = 0;
  int active = 0;
  int maxActive = 0;
  bool bulkHasRanks = false;
  bool failAll = false;
  @override
  Future<http.Response?> get(String path, {Map<String, String>? query}) async {
    if (path.endsWith('/rankedTeams')) {
      return http.Response(
          jsonEncode(List.generate(
              7,
              (i) => {
                    'number': 100 + i,
                    'rank': bulkHasRanks ? i + 1 : null,
                    'rankingPoints': null,
                    'matchesPlayed': null,
                  })),
          200);
    }
    statusCalls++;
    active++;
    if (active > maxActive) maxActive = active;
    await Future<void>.delayed(Duration.zero);
    active--;
    final number = int.parse(query!['teamNumber']!);
    if (failAll || number == 103) return http.Response('Unavailable', 500);
    return http.Response(
        jsonEncode({
          'number': number,
          'name': 'Team $number',
          'rank': number - 99,
          'rankingPoints': 30,
          'matchesPlayed': 6,
          'matchesTotal': 12,
        }),
        200);
  }
}

void main() {
  test(
      'existing per-team endpoint supplies ranks with bounded concurrency and caching',
      () async {
    final api = LegacyRankingsAPI();
    final teams = await api.getTeamRankings('event');
    expect(teams.length, 7);
    expect(teams.first.rank, 1);
    expect(teams.first.rankingPoints, 30);
    expect(teams.first.matchesPlayed, 6);
    expect(teams[3].rank, isNull);
    expect(api.maxActive, lessThanOrEqualTo(4));
    expect(api.statusCalls, 7);
    teams.clear();
    expect((await api.getTeamRankings('event')).length, 7);
    expect(api.statusCalls, 7);
    await api.getTeamRankings('another-event');
    expect(api.statusCalls, 14);
  });
  test('bulk ranks avoid per-team requests', () async {
    final api = LegacyRankingsAPI()..bulkHasRanks = true;
    expect((await api.getTeamRankings('event')).first.rank, 1);
    expect(api.statusCalls, 0);
  });
  test('failed fallback keeps teams and can retry immediately', () async {
    final api = LegacyRankingsAPI()..failAll = true;
    expect((await api.getTeamRankings('event')).length, 7);
    api.failAll = false;
    expect((await api.getTeamRankings('event')).first.rank, 1);
    expect(api.statusCalls, 14);
  });
}

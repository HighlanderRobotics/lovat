import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_tournaments.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_team_rankings.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_flags.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/picklists/get_picklist_analysis.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/picklists/mutable/get_mutable_picklist_by_id.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('browser fixtures decode through the actual API extensions', () async {
    SharedPreferences.setMockInitialValues({});
    PackageInfo.setMockInitialValues(
        appName: 'Synthetic',
        packageName: 'test.example',
        version: '1.0.0',
        buildNumber: '1',
        buildSignature: '');
    final fixtures = jsonDecode(File('tool/fixtures.json').readAsStringSync())
        as Map<String, dynamic>;
    final responses = {
      '/v1/manager/tournaments': fixtures['tournaments'],
      '/v1/manager/tournament/synthetic-event/rankedTeams':
          fixtures['rankedTeams'],
      '/v1/analysis/picklist': fixtures['analysis'],
      '/v1/manager/mutablepicklists/synthetic-picklist': fixtures['picklist'],
      '/v1/analysis/flag/team/1234': fixtures['flags'],
    };
    final api = LovatAPI('https://fixture.invalid',
        tokenProvider: () async => 'synthetic',
        client: MockClient((r) async {
          expect(responses.containsKey(r.url.path), isTrue, reason: r.url.path);
          return http.Response(jsonEncode(responses[r.url.path]), 200);
        }));
    addTearDown(api.dispose);
    final tournaments = await api.getTournaments();
    expect(tournaments.tournaments.single.localized, 'Synthetic Event');
    await tournaments.tournaments.single.storeAsCurrent();
    expect((await api.getTeamRankings('synthetic-event')).map((t) => t.number),
        [1234, 5678]);
    expect(
        (await api.picklistAnalysisQuery([], []).queryFn())
            .map((t) => t.teamNumber),
        [1234, 5678]);
    expect((await api.getMutablePicklistById('synthetic-picklist')).teams,
        [1234, 5678]);
    expect(await api.getFlags([], 1234), isEmpty);
    await Tournament.clearCurrent();
  });
}

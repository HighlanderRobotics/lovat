import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scouting_dashboard_app/pages/picklist/picklist_models.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/picklists/get_picklist_analysis.dart';
import 'helpers/contract_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    PackageInfo.setMockInitialValues(
        appName: 'Synthetic',
        packageName: 'test.example',
        version: '1.0.0',
        buildNumber: '1',
        buildSignature: '');
  });
  test(
      'decodes the retained Server analysis response and independently expected rankings',
      () async {
    final fixtures = contractFixtures();
    final actualPath = Platform.environment['LOVAT_CONTRACT_SERVER_RESPONSE'];
    final body = actualPath == null
        ? jsonEncode(fixtures['expected']['analysis'])
        : File(actualPath).readAsStringSync();
    expect(jsonDecode(body), fixtures['expected']['analysis']);
    final api = LovatAPI('https://fixture.invalid',
        tokenProvider: () async => 'synthetic',
        client: MockClient((request) async {
          expect(request.url.path, '/v1/analysis/picklist');
          return http.Response(body, 200);
        }));
    addTearDown(api.dispose);
    final teams = await api.picklistAnalysisQuery([],
        [PicklistWeight('totalPoints', 'Total Points', value: 1)]).queryFn();
    expect(teams.map((t) => t.teamNumber),
        fixtures['expected']['analysis']['teams'].map((t) => t['team']));
    expect(teams.map((t) => t.result), [1.0, -1.0]);
  });
  test(
      'retained configured and mutable picklists preserve authors, weights and ordering',
      () {
    final fixtures = contractFixtures();
    final configured = ConfiguredPicklist.fromJSON(
        jsonEncode(fixtures['expected']['configuredPicklist']));
    expect(configured.weights.single.value, 1);
    expect(configured.author, 'Fictional Alpha Analyst');
    final mutable = MutablePicklist.fromJSON(
        jsonEncode(fixtures['expected']['mutablePicklist']));
    expect(mutable.teams, [1900000002, 1900000001]);
    expect(jsonDecode(configured.toJSON()),
        fixtures['expected']['configuredPicklist']);
  });
}

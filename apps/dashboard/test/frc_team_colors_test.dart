import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:scouting_dashboard_app/reusable/frc_team_colors.dart';

void main() {
  test('uses the primary FRC color and shares requests for the same team',
      () async {
    var requests = 0;
    final colors = FrcTeamColors(client: MockClient((request) async {
      requests++;
      expect(request.url.toString(), 'https://api.frc-colors.com/v1/team/8033');
      return http.Response(
          '{"primaryHex":"#350868","secondaryHex":"#ffffff"}', 200);
    }));
    final results = await Future.wait(
        [colors.primaryColor('8033'), colors.primaryColor('8033')]);
    expect(results, [const Color(0xFF350868), const Color(0xFF350868)]);
    expect(await colors.primaryColor('8033'), const Color(0xFF350868));
    expect(requests, 1);
  });

  test('missing or invalid colors leave the avatar without a glow', () async {
    for (final body in [
      'null',
      '{}',
      '{"primaryHex":null}',
      '{"primaryHex":"purple"}',
      'invalid json'
    ]) {
      final colors = FrcTeamColors(
          client: MockClient((_) async => http.Response(body, 200)));
      expect(await colors.primaryColor('8033'), isNull);
    }
    final unavailable = FrcTeamColors(
        client: MockClient((_) async => http.Response('Unavailable', 503)));
    expect(await unavailable.primaryColor('8033'), isNull);
    final offline = FrcTeamColors(
        client: MockClient((_) async => throw http.ClientException('offline')));
    expect(await offline.primaryColor('8033'), isNull);
  });
}

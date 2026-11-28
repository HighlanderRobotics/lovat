import 'package:flutter_test/flutter_test.dart';
import 'package:scouting_dashboard_app/reusable/models/match.dart';

void main() {
  test('parses Lovat match keys', () {
    final match = GameMatchIdentity.fromLongKey('2022cc_qm14_1');
    expect(match.type, MatchType.qualifier);
    expect(match.number, 14);
    expect(match.toMediumKey(), '2022cc_qm14');
  });

  test("parses The Blue Alliance's playoff keys", () {
    final semi = GameMatchIdentity.fromLongKey('2026mttd_sf3m1_4');
    expect(semi.type, MatchType.elimination);
    expect(semi.number, 3);
    final finals = GameMatchIdentity.fromLongKey('2026mttd_f1m2');
    expect(finals.getSpecificName(), 'Match 15 - Finals 2');
  });
}

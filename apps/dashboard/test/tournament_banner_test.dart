import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/reusable/images/city_photo.dart';
import 'package:scouting_dashboard_app/reusable/tournament_banner.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:http/http.dart' as http;

class NoLocationAPI extends LovatAPI {
  NoLocationAPI() : super('https://example.invalid');
  @override
  Future<http.Response?> get(String path, {Map<String, String>? query}) async =>
      http.Response('{"tournaments": [], "count": 0}', 200);
}

void main() {
  testWidgets(
      'small screens retain the title when a location photo is unavailable',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 400));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: TournamentBanner(
      tournament:
          Tournament('qa', 'A very long tournament name that needs two lines'),
      api: NoLocationAPI(),
    ))));
    await tester.pumpAndSettle();
    expect(find.textContaining('A very long tournament'), findsOneWidget);
    expect(tester.takeException(), isNull);
    expect(find.byType(Image), findsNothing);
    expect(find.byType(AspectRatio), findsOneWidget);
  });

  testWidgets('reports no photo to the host when none is available',
      (tester) async {
    final reports = <(CityPhoto?, String?)>[];
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: TournamentBanner(
      tournament: Tournament('qa', 'Example tournament'),
      api: NoLocationAPI(),
      onPhotoResolved: (photo, location) => reports.add((photo, location)),
    ))));
    await tester.pumpAndSettle();
    expect(reports, [(null, null)]);
  });
}

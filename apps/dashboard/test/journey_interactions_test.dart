import 'dart:convert';
import 'package:dropdown_search/dropdown_search.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/pages/picklist/mutable_picklist.dart';
import 'package:scouting_dashboard_app/pages/picklist/picklist_models.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/tournament_key_picker.dart';

void main() {
  late LovatAPI original;
  List<int>? saved;
  setUp(() {
    SharedPreferences.setMockInitialValues({'picklist_flags': <String>[]});
    PackageInfo.setMockInitialValues(
        appName: 'Synthetic',
        packageName: 'test.example',
        version: '1.0.0',
        buildNumber: '1',
        buildSignature: '');
    saved = null;
    original = lovatAPI;
    lovatAPI = LovatAPI('https://fixture.invalid',
        tokenProvider: () async => 'synthetic',
        client: MockClient((request) async {
          if (request.url.path.startsWith('/v1/analysis/flag/team/')) {
            return http.Response('[]', 200);
          }
          if (request.method == 'PUT') {
            saved = List<int>.from(jsonDecode(request.body)['teams']);
            return http.Response('{}', 200);
          }
          return http.Response(
              jsonEncode({
                'tournaments': [
                  {'key': 'synthetic-event', 'name': 'Synthetic Event'}
                ],
                'count': 1
              }),
              200);
        }));
  });
  tearDown(() {
    lovatAPI.dispose();
    lovatAPI = original;
  });
  testWidgets('opens the actual tournament field and persists its selection',
      (tester) async {
    await Tournament.clearCurrent();
    await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: TournamentKeyPicker())));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(DropdownSearch<Tournament>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Synthetic Event').last);
    await tester.pumpAndSettle();
    expect((await Tournament.getCurrent())!.key, 'synthetic-event');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
  for (final platform in [TargetPlatform.linux, TargetPlatform.android]) {
    testWidgets('reorders a mutable picklist with the $platform gesture',
        (tester) async {
      var callbacks = 0;
      await tester.pumpWidget(MaterialApp(
          onGenerateRoute: (_) => MaterialPageRoute<void>(
              settings: RouteSettings(arguments: {
                'picklist': MutablePicklist(
                    uuid: 'synthetic',
                    name: 'Synthetic strategy',
                    teams: [1234, 5678]),
                'callback': () {
                  callbacks++;
                }
              }),
              builder: (_) => const MutablePicklistPage())));
      await tester.pumpAndSettle();
      final row = find.byKey(const Key('1234'));
      final handles = find.byType(ReorderableDragStartListener);
      final gesture = await tester.startGesture(
          tester.getCenter(handles.evaluate().isEmpty ? row : handles.first));
      await tester.pump(const Duration(milliseconds: 600));
      await gesture.moveBy(const Offset(0, 20));
      await tester.pump();
      await gesture.moveBy(const Offset(0, 100));
      await tester.pump(const Duration(milliseconds: 600));
      await gesture.up();
      await tester.pumpAndSettle();
      expect(saved, [5678, 1234]);
      expect(callbacks, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(MaterialApp(
        key: UniqueKey(),
        onGenerateRoute: (_) => MaterialPageRoute<void>(
          settings: RouteSettings(arguments: {
            'picklist': MutablePicklist(
                uuid: 'synthetic', name: 'Synthetic strategy', teams: saved!),
            'callback': () {},
          }),
          builder: (_) => const MutablePicklistPage(),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await lovatAPI.cache.flush();
    }, variant: TargetPlatformVariant({platform}));
  }
}

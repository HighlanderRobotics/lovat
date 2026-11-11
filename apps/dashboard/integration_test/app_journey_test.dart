import 'package:flutter/material.dart';
import 'package:dropdown_search/dropdown_search.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/pages/tournament_teams.dart';
import 'package:scouting_dashboard_app/pages/picklist/mutable_picklist.dart';
import 'package:scouting_dashboard_app/pages/picklist/picklist_models.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/picklists/mutable/get_mutable_picklist_by_id.dart';
import 'package:scouting_dashboard_app/reusable/tournament_key_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('select tournament, load analysis, reorder and reload strategy', (
    tester,
  ) async {
    // This entrypoint is compiled only by flutter drive/test. Production main
    // retains Auth0 and its default API. Use disposable browser/device storage.
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    await prefs.setStringList('picklist_flags', []);
    final original = lovatAPI;
    lovatAPI = LovatAPI(
      const String.fromEnvironment(
        'LOVAT_API_BASE',
        defaultValue: 'http://127.0.0.1:9878',
      ),
      tokenProvider: () async => 'synthetic-dashboard',
    );
    addTearDown(() {
      lovatAPI.dispose();
      lovatAPI = original;
    });
    await Tournament.clearCurrent();
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: TournamentKeyPicker())),
    );
    await tester.pumpAndSettle();
    expect(find.byType(DropdownSearch<Tournament>), findsOneWidget);
    await tester.tap(find.byType(DropdownSearch<Tournament>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Synthetic Event').last);
    await tester.pumpAndSettle();
    expect((await Tournament.getCurrent())!.key, 'synthetic-event');
    await tester.pumpWidget(
      MaterialApp(home: TournamentTeamsPage(api: lovatAPI)),
    );
    await tester.pumpAndSettle();
    expect(find.text('1234'), findsOneWidget);
    expect(find.text('5678'), findsOneWidget);
    final configured = ConfiguredPicklist(
      'Synthetic strategy',
      [],
      'synthetic-config',
    );
    expect(await configured.fetchTeamRankings(), [1234, 5678]);
    var saved = 0;
    Future<void> openPicklist() async {
      final picklist = await lovatAPI.getMutablePicklistById(
        'synthetic-picklist',
      );
      await tester.pumpWidget(
        MaterialApp(
          key: UniqueKey(),
          onGenerateRoute: (_) => MaterialPageRoute<void>(
            settings: RouteSettings(
              arguments: {
                'picklist': picklist,
                'callback': () {
                  saved++;
                },
              },
            ),
            builder: (_) => const MutablePicklistPage(),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    await openPicklist();
    final row = find.byKey(const Key('1234'));
    // Long-press drag works with mobile handles and desktop default handles.
    final handles = find.byType(ReorderableDragStartListener);
    final gesture = await tester.startGesture(
      tester.getCenter(handles.evaluate().isEmpty ? row : handles.first),
    );
    await tester.pump(const Duration(milliseconds: 600));
    await gesture.moveBy(const Offset(0, 20));
    await tester.pump();
    await gesture.moveBy(const Offset(0, 100));
    await tester.pump(const Duration(milliseconds: 600));
    await gesture.up();
    await tester.pumpAndSettle();
    for (var attempt = 0; saved == 0 && attempt < 100; attempt++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(saved, 1);
    expect(
      (await lovatAPI.getMutablePicklistById('synthetic-picklist')).teams,
      [5678, 1234],
    );
    await tester.pumpWidget(const SizedBox());
    await openPicklist();
    final tiles = tester.widgetList<ListTile>(find.byType(ListTile)).toList();
    expect((tiles[0].title as Text).data, '5678');
    expect((await Tournament.getCurrent())!.key, 'synthetic-event');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}

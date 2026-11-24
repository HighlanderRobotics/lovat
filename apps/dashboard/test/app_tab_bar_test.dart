import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/reusable/app_tab_bar.dart';
import 'package:shared_preferences/shared_preferences.dart';

Widget page(String name, AppTab tab) => Scaffold(
      body: Text('$name page'),
      bottomNavigationBar: AppTabBar(current: tab),
    );

Widget app() => MaterialApp(
      // InkSparkle's shader cannot load in tests.
      theme: ThemeData(splashFactory: InkRipple.splashFactory),
      initialRoute: '/home',
      routes: {
        '/home': (_) => page('Home', AppTab.home),
        '/match_schedule': (_) => page('Match schedule', AppTab.scouting),
        '/picklists': (_) => page('Picklists', AppTab.picklists),
        '/match_predictor_opener': (_) => page('Strategy', AppTab.strategy),
      },
    );

void main() {
  testWidgets('shows the five tabs and switches pages', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await Tournament('test-event', 'Test Event').storeAsCurrent();
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();

    for (final label in [
      'Home',
      'Scouting',
      'Forms',
      'Picklists',
      'Strategy'
    ]) {
      expect(find.text(label), findsOneWidget);
    }
    final home = tester.widget<Text>(find.text('Home'));
    final forms = tester.widget<Text>(find.text('Forms'));
    expect(home.style?.color, const Color(0xFFB59AFF));
    // Selected tabs are highlighted by the blob, not by bigger text.
    expect(home.style?.fontSize, forms.style?.fontSize);
    expect(home.style?.fontWeight, forms.style?.fontWeight);
    expect(tester.getSize(find.text('Home')).height,
        tester.getSize(find.text('Forms')).height);
    BoxDecoration blob(String tab) => tester
        .widget<AnimatedContainer>(find.byKey(ValueKey('tab-blob-$tab')))
        .decoration! as BoxDecoration;
    expect(blob('home').color, const Color(0x2EB59AFF));
    expect(blob('forms').color!.a, 0);

    await tester.tap(find.text('Picklists'));
    await tester.pumpAndSettle();
    expect(find.text('Picklists page'), findsOneWidget);
    // Tabs replace the stack instead of piling pages up.
    expect(find.byType(BackButton), findsNothing);

    await tester.tap(find.text('Scouting'));
    await tester.pumpAndSettle();
    expect(find.text('Match schedule page'), findsOneWidget);

    await tester.tap(find.text('Strategy'));
    await tester.pumpAndSettle();
    expect(find.text('Strategy page'), findsOneWidget);

    await tester.tap(find.text('Home'));
    await tester.pumpAndSettle();
    expect(find.text('Home page'), findsOneWidget);
    await Tournament.clearCurrent();
  });

  testWidgets('switching tabs does not slide', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await Tournament('test-event', 'Test Event').storeAsCurrent();
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();

    await tester.tap(find.text('Strategy'));
    // One frame later the new page is fully in place and the old one gone.
    await tester.pump();
    expect(find.text('Strategy page'), findsOneWidget);
    expect(find.text('Home page'), findsNothing);
    expect(tester.getTopLeft(find.text('Strategy page')).dx, 0);
    expect(
        ModalRoute.of(tester.element(find.text('Strategy page')))
            ?.settings
            .name,
        '/match_predictor_opener');
    await Tournament.clearCurrent();
  });

  testWidgets('Forms is not built yet', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Forms'));
    await tester.pump();
    expect(find.text('Forms is coming soon.'), findsOneWidget);
    expect(find.text('Home page'), findsOneWidget);
  });

  testWidgets('tournament tabs wait for a selected tournament', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await Tournament.clearCurrent();
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Picklists'));
    await tester.pump();
    expect(find.text('Choose a tournament in Settings first.'), findsOneWidget);
    expect(find.text('Home page'), findsOneWidget);

    await tester.tap(find.text('Strategy'));
    await tester.pumpAndSettle();
    expect(find.text('Strategy page'), findsOneWidget);
  });
}

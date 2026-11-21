import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/pages/initial_loader.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('restores saved settings before opening Home', (tester) async {
    SharedPreferences.setMockInitialValues({
      'onboardingVersion': 1,
      'api_base_url': 'https://saved.example.invalid',
    });
    await Tournament('demo', 'Demo event').storeAsCurrent();
    final originalBaseUrl = lovatAPI.baseUrl;
    addTearDown(() async {
      lovatAPI.baseUrl = originalBaseUrl;
      await Tournament.clearCurrent();
    });

    String? homeBaseUrl;
    await tester.pumpWidget(MaterialApp(
      initialRoute: '/loading',
      routes: {
        '/loading': (context) => const InitialLoaderPage(),
        '/home': (context) {
          homeBaseUrl = lovatAPI.baseUrl;
          return const Scaffold(body: Text('Initialized Home'));
        },
      },
    ));
    await tester.pumpAndSettle();

    expect(find.text('Initialized Home'), findsOneWidget);
    expect(homeBaseUrl, 'https://saved.example.invalid');
    final preferences = await SharedPreferences.getInstance();
    expect(preferences.getStringList('picklists'), isNotNull);
    expect(tester.takeException(), isNull);
  });
}

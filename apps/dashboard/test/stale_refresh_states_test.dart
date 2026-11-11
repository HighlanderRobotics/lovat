import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scouting_dashboard_app/reusable/stale_refresh_builder.dart';
import 'package:scouting_dashboard_app/reusable/friendly_error_view.dart';

void main() {
  setUp(QueryCache.clearAll);
  testWidgets('loading, failure, retry and empty/success states are visible', (
    tester,
  ) async {
    var request = Completer<List<int>>();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StaleRefreshBuilder<List<int>>(
            query: CachedQuery(
              queryKey: ['teams'],
              queryFn: () => request.future,
              label: 'teams',
            ),
            builder: (context, result) => result.error != null
                ? FriendlyErrorView.result(result)
                : result.data == null
                    ? const Text('Loading teams')
                    : Text(
                        result.data!.isEmpty
                            ? 'No teams'
                            : result.data!.join(','),
                      ),
          ),
        ),
      ),
    );
    expect(find.text('Loading teams'), findsOneWidget);
    request.completeError(Exception('Synthetic offline'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Synthetic offline'), findsOneWidget);
    request = Completer<List<int>>();
    await tester.tap(find.text('Retry'));
    await tester.pump();
    request.complete([]);
    await tester.pumpAndSettle();
    expect(find.text('No teams'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'cached data survives refresh failure with an explicit stale message',
    (tester) async {
      QueryCache.write(['teams'], [1234], timestamp: DateTime(2026));
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StaleRefreshBuilder<List<int>>(
              query: CachedQuery(
                queryKey: ['teams'],
                queryFn: () async => throw Exception('offline'),
                label: 'teams',
              ),
              builder: (context, result) =>
                  Text(result.data?.join(',') ?? 'Loading'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('1234'), findsOneWidget);
      expect(find.text('Failed to get teams.'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    },
  );
  testWidgets('old requests do not replace a newly selected query', (
    tester,
  ) async {
    final old = Completer<String>();
    Widget build(String key, Future<String> Function() request) => MaterialApp(
          home: StaleRefreshBuilder<String>(
            query:
                CachedQuery(queryKey: [key], queryFn: request, label: 'value'),
            builder: (context, result) => Text(result.data ?? 'loading'),
          ),
        );
    await tester.pumpWidget(build('old', () => old.future));
    await tester.pumpWidget(build('new', () async => 'new result'));
    await tester.pumpAndSettle();
    old.complete('old result');
    await tester.pumpAndSettle();
    expect(find.text('new result'), findsOneWidget);
    expect(find.text('old result'), findsNothing);
  });
  testWidgets('long error text and retry action fit a narrow phone', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    var retries = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: FriendlyErrorView(
              errorMessage: List.filled(
                8,
                'Synthetic long failure message ',
              ).join(),
              onRetry: () => retries++,
            ),
          ),
        ),
      ),
    );
    await tester.ensureVisible(find.text('Retry'));
    await tester.tap(find.text('Retry'));
    expect(retries, 1);
    expect(tester.takeException(), isNull);
  });
}

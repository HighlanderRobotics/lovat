import 'package:flutter_test/flutter_test.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_matches.dart';
import 'package:scouting_dashboard_app/reusable/stale_data.dart';

import 'home_test.dart' show matchFixture;

MatchScheduleMatch match(int number, {bool finished = false}) =>
    MatchScheduleMatch.fromJson(
        matchFixture(0, number, finished: finished), 'test-event');

void main() {
  final now = DateTime(2026, 3, 14, 12);
  final event = Tournament('test-event', 'Test Event',
      date: DateTime(2026, 3, 13), endDate: DateTime(2026, 3, 15));

  group('tournamentIsLive', () {
    test('live once a match has finished and others remain', () {
      expect(tournamentIsLive(event, [match(1, finished: true), match(2)], now),
          isTrue);
    });

    test('not started when no match has finished', () {
      expect(tournamentIsLive(event, [match(1), match(2)], now), isFalse);
      expect(tournamentIsLive(event, [], now), isFalse);
    });

    test('over when every match has finished', () {
      expect(
          tournamentIsLive(
              event, [match(1, finished: true), match(2, finished: true)], now),
          isFalse);
    });

    test('outside the event dates is never live', () {
      final mixed = [match(1, finished: true), match(2)];
      expect(tournamentIsLive(event, mixed, DateTime(2026, 3, 12)), isFalse);
      expect(tournamentIsLive(event, mixed, DateTime(2026, 3, 16)), isFalse);
      expect(tournamentIsLive(event, mixed, DateTime(2026, 3, 15, 23)), isTrue);
      // Unknown dates fall back to the matches alone.
      expect(tournamentIsLive(Tournament('k', 'No dates'), mixed, now), isTrue);
    });
  });

  test('stale only while live and after five minutes', () {
    final loaded = now.subtract(staleAfter);
    expect(isDataStale(loadedAt: loaded, live: true, now: now), isTrue);
    expect(
        isDataStale(
            loadedAt: now.subtract(const Duration(minutes: 4)),
            live: true,
            now: now),
        isFalse);
    expect(isDataStale(loadedAt: loaded, live: false, now: now), isFalse);
    expect(isDataStale(loadedAt: null, live: true, now: now), isFalse);
  });
}

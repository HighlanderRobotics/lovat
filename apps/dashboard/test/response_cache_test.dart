import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/response_cache.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
    'flush and reload preserve body, ETag and deterministic timestamp',
    () async {
      final cache = ResponseCache(now: () => 1234);
      addTearDown(cache.dispose);
      await cache.load();
      cache.put('event', '{"team":1234}', etag: 'revision-one');
      await cache.flush();
      final restored = ResponseCache();
      addTearDown(restored.dispose);
      await restored.load();
      expect(restored.get('event')!.toJson(), {
        'body': '{"team":1234}',
        'etag': 'revision-one',
        'ts': 1234,
      });
      restored.remove('event');
      restored.remove('missing');
      await restored.flush();
      expect(restored.get('event'), isNull);
    },
  );
  test(
    'malformed records do not hide subsequent valid persisted entries',
    () async {
      SharedPreferences.setMockInitialValues({
        'lovat_api_cache': jsonEncode({
          'broken': {'body': 42},
          'valid': {'body': '[]', 'etag': null, 'ts': 10},
        }),
      });
      final cache = ResponseCache();
      addTearDown(cache.dispose);
      await cache.load();
      await cache.load();
      expect(cache.get('broken'), isNull);
      expect(cache.get('valid')!.body, '[]');
    },
  );
  test(
    'invalid JSON falls back to an empty cache and remains writable',
    () async {
      SharedPreferences.setMockInitialValues({'lovat_api_cache': 'not json'});
      final cache = ResponseCache();
      addTearDown(cache.dispose);
      await cache.load();
      expect(cache.get('missing'), isNull);
      cache.put('new', '{}');
      await cache.flush();
      cache.clear();
      await cache.flush();
      expect(cache.get('new'), isNull);
    },
  );
  test(
    'a replacement response without an ETag removes the old validator',
    () async {
      final cache = ResponseCache();
      addTearDown(cache.dispose);
      cache.put('event', 'old', etag: 'old');
      cache.put('event', 'new');
      expect(cache.get('event')!.etag, isNull);
      await cache.flush();
    },
  );
}

import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/stale_refresh_builder.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    QueryCache.clearAll();
    PackageInfo.setMockInitialValues(
      appName: 'Synthetic',
      packageName: 'test.example',
      version: '1.2.3',
      buildNumber: '4',
      buildSignature: '',
    );
  });
  test(
    'GET sends identity/version headers and reuses an ETag/304 body',
    () async {
      final requests = <http.Request>[];
      final api = LovatAPI(
        'https://fixture.invalid',
        tokenProvider: () async => 'synthetic-a',
        client: MockClient((request) async {
          requests.add(request);
          return requests.length == 1
              ? http.Response('{"team":1234}', 200, headers: {'etag': 'v1'})
              : http.Response('', 304);
        }),
      );
      addTearDown(api.dispose);
      expect((await api.get('/event'))!.statusCode, 200);
      expect((await api.get('/event'))!.body, '{"team":1234}');
      expect(requests.first.headers['authorization'], 'Bearer synthetic-a');
      expect(requests.first.headers['x-app-version'], '1.2.3');
      expect(requests[1].headers['if-none-match'], 'v1');
      expect(
        api.getCachedData<int>('/event', parser: (json) => json['team'] as int),
        1234,
      );
      expect(api.getCachedTimestamp('/event'), isNotNull);
    },
  );
  test(
    '304 without cached data is not fabricated into a successful response',
    () async {
      final api = LovatAPI(
        'https://fixture.invalid',
        tokenProvider: () async => null,
        client: MockClient((_) async => http.Response('', 304)),
      );
      addTearDown(api.dispose);
      expect((await api.get('/missing'))!.statusCode, 304);
      expect(api.getCachedResponse('/missing'), isNull);
    },
  );
  test(
    'failed responses are not cached and malformed cached JSON is safe',
    () async {
      var status = 503;
      final api = LovatAPI(
        'https://fixture.invalid',
        tokenProvider: () async => 'synthetic',
        client: MockClient((_) async => http.Response('not json', status)),
      );
      addTearDown(api.dispose);
      await api.get('/event');
      expect(api.getCachedResponse('/event'), isNull);
      status = 200;
      await api.get('/event');
      expect(
        api.getCachedData<int>('/event', parser: (json) => json as int),
        isNull,
      );
    },
  );
  test(
    'changing identity or Server URL invalidates API and query caches',
    () async {
      var token = 'synthetic-a';
      final requests = <http.Request>[];
      final api = LovatAPI(
        'https://first.invalid',
        tokenProvider: () async => token,
        client: MockClient((r) async {
          requests.add(r);
          return http.Response('{}', 200, headers: {'etag': 'v1'});
        }),
      );
      addTearDown(api.dispose);
      await api.get('/event');
      QueryCache.write(['identity'], 1234);
      token = 'synthetic-b';
      await api.get('/event');
      expect(requests.last.headers['if-none-match'], isNull);
      expect(QueryCache.read<int>(['identity']), isNull);
      api.baseUrl = 'https://second.invalid';
      expect(api.getCachedResponse('/event'), isNull);
      await api.get('/event');
      expect(requests.last.url.host, 'second.invalid');
      expect(requests.last.headers['if-none-match'], isNull);
    },
  );
  test(
    'an old in-flight response cannot repopulate a changed identity cache',
    () async {
      final pending = Completer<http.Response>();
      var token = 'synthetic-a';
      var calls = 0;
      final api = LovatAPI(
        'https://fixture.invalid',
        tokenProvider: () async => token,
        client: MockClient((_) async {
          calls++;
          if (calls == 1) return await pending.future;
          return http.Response('{"owner":"b"}', 200);
        }),
      );
      addTearDown(api.dispose);
      final first = api.get('/event');
      while (calls == 0) {
        await Future<void>.delayed(Duration.zero);
      }
      token = 'synthetic-b';
      await api.get('/event');
      pending.complete(http.Response('{"owner":"a"}', 200));
      await first;
      expect(
        api.getCachedData<String>(
          '/event',
          parser: (json) => json['owner'] as String,
        ),
        'b',
      );
    },
  );
  test(
    'mutations preserve the exact JSON body, query and error response',
    () async {
      final requests = <http.Request>[];
      final api = LovatAPI(
        'https://fixture.invalid',
        tokenProvider: () async => 'synthetic',
        client: MockClient((r) async {
          requests.add(r);
          return http.Response('validation error', 400);
        }),
      );
      addTearDown(api.dispose);
      expect(
        (await api.post(
          '/picklist',
          body: {
            'teams': [2, 1],
          },
          query: {'event': 'test'},
        ))!
            .statusCode,
        400,
      );
      await api.put('/picklist', body: {'name': 'Updated'});
      await api.delete('/picklist', body: {'uuid': 'test'});
      expect(requests.map((r) => r.method), ['POST', 'PUT', 'DELETE']);
      expect(jsonDecode(requests.first.body), {
        'teams': [2, 1],
      });
      expect(requests.first.url.queryParameters, {'event': 'test'});
      expect(requests.first.headers['content-type'], 'application/json');
    },
  );
}

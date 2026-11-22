import 'dart:convert';
import 'package:apple_strategy/apple_strategy.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/pages/ai_strategy.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'ai_strategy_test.dart' show contextJson;

class TestAppleModel extends AppleStrategyModel {
  bool fail = false;
  String? prompt;
  @override
  Future<AppleStrategyAvailability> availability() async =>
      const AppleStrategyAvailability(true, 'Ready on device');
  @override
  Future<String> generate(
      {required String prompt, required String briefing}) async {
    this.prompt = prompt;
    if (fail) {
      throw PlatformException(
          code: 'GENERATION_FAILED', message: 'Local model unavailable');
    }
    return 'Local strategy from the loaded snapshot';
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Tournament.clearCurrent();
    PackageInfo.setMockInitialValues(
        appName: 'Test',
        packageName: 'test',
        version: '1',
        buildNumber: '1',
        buildSignature: '');
  });
  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(AppleStrategyModel.channel, null);
  });

  test('checks native readiness and passes evidence to the on-device channel',
      () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    final calls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(AppleStrategyModel.channel, (call) async {
      calls.add(call);
      return call.method == 'availability'
          ? {'available': true, 'message': 'Ready'}
          : 'Generated locally';
    });
    const model = AppleStrategyModel();
    expect((await model.availability()).available, isTrue);
    expect(
        await model.generate(
            prompt: 'Scoped evidence', briefing: 'Feed partners'),
        'Generated locally');
    expect(calls.last.arguments,
        {'prompt': 'Scoped evidence', 'briefing': 'Feed partners'});
  });

  test(
      'returns a useful unsupported-device status without requiring native code',
      () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    expect(
        (await const AppleStrategyModel().availability()).available, isFalse);
  });

  for (final fail in [false, true]) {
    testWidgets(
        'local generation ${fail ? 'failure stays local' : 'uses loaded evidence without a cloud request'}',
        (tester) async {
      final previousApi = lovatAPI;
      var posts = 0;
      var gets = 0;
      final api = LovatAPI('https://example.invalid',
          tokenProvider: () async => 'test',
          client: MockClient((request) async {
            if (request.method == 'POST') {
              posts++;
              throw StateError('No cloud requests allowed');
            }
            gets++;
            if (request.url.path.endsWith('/profile')) {
              return http.Response(
                  jsonEncode({'email': 'test@example.invalid'}), 200);
            }
            if (request.url.path.endsWith('/tournaments')) {
              return http.Response(
                  jsonEncode({
                    'tournaments': [
                      {'key': '2026test', 'name': 'Test'}
                    ],
                    'count': 1
                  }),
                  200);
            }
            final json = contextJson()
              ..['localPrompt'] = 'Only authorized scouting evidence';
            return http.Response(jsonEncode(json), 200);
          }));
      lovatAPI = api;
      addTearDown(() {
        lovatAPI = previousApi;
        api.dispose();
      });
      final model = TestAppleModel()..fail = fail;
      await Tournament('2026test', 'Test').storeAsCurrent();
      await tester.pumpWidget(
          MaterialApp(home: AiStrategyPage(api: api, localModel: model)));
      await tester.pumpAndSettle();
      expect(find.text('Apple Intelligence · On device'), findsOneWidget);
      final loadedGets = gets;
      await tester.ensureVisible(find.text('Draft next-match strategy'));
      await tester.tap(find.text('Draft next-match strategy'));
      await tester.pumpAndSettle();
      expect(model.prompt, 'Only authorized scouting evidence');
      expect(posts, 0);
      expect(gets, loadedGets);
      expect(
          find.text(fail
              ? 'Local model unavailable'
              : 'Local strategy from the loaded snapshot'),
          findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await api.cache.flush();
    });
  }
}

import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scouting_dashboard_app/pages/picklist/picklist_models.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(
    () => SharedPreferences.setMockInitialValues({'picklists': <String>[]}),
  );
  test(
    'configured picklists preserve weights, author, UUID and order after storage reload',
    () async {
      final first = ConfiguredPicklist(
        'Synthetic',
        [PicklistWeight('totalPoints', 'Points', value: 2.5)],
        'fixture-a',
        author: 'Test Scout',
      );
      final second = ConfiguredPicklist('Second', [], 'fixture-b');
      await setPicklists([second, first]);
      final restored = await getPicklists();
      expect(restored.map((p) => p.id), ['fixture-b', 'fixture-a']);
      expect(restored.last.weights.first.value, 2.5);
      expect(restored.last.author, 'Test Scout');
      expect(jsonDecode(restored.last.toJSON())['uuid'], 'fixture-a');
    },
  );
  test(
    'legacy configured picklists get an ID and optional authors stay absent',
    () {
      final model = ConfiguredPicklist.fromJSON('{"title":"Old","weights":[]}');
      expect(model.id, isNotEmpty);
      expect(model.author, isNull);
      expect(jsonDecode(model.toJSON()).containsKey('userName'), isFalse);
    },
  );
  test(
    'mutable ordering and explicit weights round-trip without sorting teams',
    () {
      final mutable = MutablePicklist.fromJSON(
        '{"uuid":"fixture","name":"Manual","teams":[9,2,7],"userName":"Scout"}',
      );
      expect(mutable.teams, [9, 2, 7]);
      expect(mutable.meta.uuid, 'fixture');
      expect(mutable.meta.author, 'Scout');
      final configured = ConfiguredPicklist.fromServerJSON(
        '{"uuid":"fixture","name":"Server","totalPoints":3}',
      );
      expect(
        configured.weights.firstWhere((w) => w.path == 'totalPoints').value,
        3,
      );
    },
  );
  test(
    'malformed JSON is rejected rather than silently inventing a picklist',
    () {
      expect(
        () => ConfiguredPicklist.fromJSON('broken'),
        throwsFormatException,
      );
      expect(
        () => MutablePicklist.fromJSON('{"teams":"bad"}'),
        throwsA(isA<TypeError>()),
      );
    },
  );
}

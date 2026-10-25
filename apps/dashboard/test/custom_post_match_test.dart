import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scouting_dashboard_app/pages/custom_post_match_settings.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/models/custom_post_match.dart';

void main() {
  test(
      'old reports have no custom answers and snapshots preserve wording and multiline text',
      () {
    expect(CustomPostMatchAnswer.parseList(null), isEmpty);
    final answers = CustomPostMatchAnswer.parseList([
      {
        'question': 'Original wording',
        'answer': 'First line, details\nSecond line'
      },
      {'question': 'Unanswered', 'answer': ''},
    ]);
    expect(answers.first.question, 'Original wording');
    expect(answers.first.answer, 'First line, details\nSecond line');
    expect(answers.last.answer, '');
  });

  testWidgets(
      'editor exposes three fields and sends trimmed nonempty questions',
      (tester) async {
    List<String>? saved;
    await tester.pumpWidget(MaterialApp(
        home: CustomPostMatchSettingsPage(
      loadQuestions: () async => ['First?', 'Second?'],
      saveQuestions: (value) async {
        saved = value;
      },
    )));
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsNWidgets(3));
    await tester.enterText(find.byType(TextField).at(0), '  Revised?  ');
    await tester.enterText(find.byType(TextField).at(1), '');
    await tester.enterText(find.byType(TextField).at(2), 'Third?');
    await tester.ensureVisible(find.text('Save questions'));
    await tester.tap(find.text('Save questions'));
    await tester.pumpAndSettle();
    expect(saved, ['Revised?', 'Third?']);
  });

  testWidgets('duplicate questions are rejected without sending an update',
      (tester) async {
    var writes = 0;
    await tester.pumpWidget(MaterialApp(
        home: CustomPostMatchSettingsPage(
      loadQuestions: () async => [],
      saveQuestions: (_) async {
        writes++;
      },
    )));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), 'Same?');
    await tester.enterText(find.byType(TextField).at(1), ' Same? ');
    await tester.ensureVisible(find.text('Save questions'));
    await tester.tap(find.text('Save questions'));
    await tester.pumpAndSettle();
    expect(writes, 0);
    expect(find.text('Each question must be different.'), findsOneWidget);
  });

  testWidgets(
      'a failed load cannot overwrite existing questions with an empty list',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: CustomPostMatchSettingsPage(
      loadQuestions: () async => throw Exception('offline'),
      saveQuestions: (_) async => fail('Must not save after a failed load'),
    )));
    await tester.pumpAndSettle();
    expect(find.text('Could not load custom questions.'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull);
  });

  testWidgets(
      'permission failures keep the editor open and preserve typed questions',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: CustomPostMatchSettingsPage(
      loadQuestions: () async => ['Existing?'],
      saveQuestions: (_) async => throw const LovatAPIException(
          'Only scouting leads can edit custom questions.'),
    )));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Save questions'));
    await tester.tap(find.text('Save questions'));
    await tester.pumpAndSettle();
    expect(find.text('Only scouting leads can edit custom questions.'),
        findsOneWidget);
    expect(find.text('Existing?'), findsOneWidget);
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:chips_input/chips_input.dart';

void main() {
  testWidgets('selects suggestions, prevents duplicates and deletes a chip', (
    tester,
  ) async {
    List<String> selected = [];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ChipsInput<String>(
            initialValue: const ['Alpha'],
            maxChips: 2,
            findSuggestions: (query) async => ['Alpha', 'Beta', 'Gamma']
                .where((s) => s.toLowerCase().contains(query.toLowerCase()))
                .toList(),
            onChanged: (values) => selected = List.of(values),
            chipBuilder: (context, state, value) => InputChip(
              label: Text(value),
              onDeleted: () => state.deleteChip(value),
            ),
            suggestionBuilder: (context, value) => ListTile(title: Text(value)),
          ),
        ),
      ),
    );
    await tester.enterText(find.byType(TextField), 'Bet');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Beta'));
    await tester.pumpAndSettle();
    expect(selected, ['Alpha', 'Beta']);
    expect(find.text('Alpha'), findsOneWidget);
    expect(find.text('Beta'), findsOneWidget);
    await tester.tap(find.byTooltip('Delete').first);
    await tester.pumpAndSettle();
    expect(selected, ['Beta']);
    expect(tester.takeException(), isNull);
  });
}

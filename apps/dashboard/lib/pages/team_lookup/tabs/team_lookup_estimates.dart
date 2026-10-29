import 'package:flutter/material.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/team_lookup/get_team_estimates.dart';
import 'package:scouting_dashboard_app/reusable/stale_refresh_builder.dart';
import 'package:scouting_dashboard_app/reusable/stale_refresh_indicator.dart';
import 'package:scouting_dashboard_app/reusable/friendly_error_view.dart';

class TeamLookupEstimatesTab extends StatelessWidget {
  const TeamLookupEstimatesTab({super.key, required this.team, this.api});
  final int team;
  final LovatAPI? api;
  String number(num? n, {bool signed = false}) {
    if (n == null) return '—';
    final text = n.abs().toStringAsFixed(1).replaceFirst(RegExp(r'\.0$'), '');
    return n < 0
        ? '−$text'
        : signed && n > 0
            ? '+$text'
            : text;
  }

  @override
  Widget build(BuildContext context) => StaleRefreshBuilder(
      query: (api ?? lovatAPI).teamEstimatesQuery(team),
      builder: (context, result) {
        final data = result.data;
        if (data == null) {
          return result.error != null
              ? FriendlyErrorView.result(result)
              : const Center(child: CircularProgressIndicator());
        }
        if (data.matches.isEmpty) {
          return Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('No OCR estimates'),
            const SizedBox(height: 12),
            TextButton(onPressed: result.refetch, child: const Text('Refresh'))
          ]));
        }
        final theme = Theme.of(context);
        final multipleEvents =
            data.matches.map((m) => m.tournamentName).toSet().length > 1;
        Widget stat(String label, num? n) => Expanded(
            child: Card(
                child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(children: [
                      FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(number(n),
                              style: theme.textTheme.titleLarge)),
                      const SizedBox(height: 6),
                      Text(label)
                    ]))));
        return RefreshIndicator(
            onRefresh: () async => result.refetch(),
            child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(24),
                child: Center(
                    child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 900),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              StaleRefreshIndicator.result(result),
                              Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Expanded(
                                        child: Text('OCR estimates',
                                            style: theme.textTheme.titleLarge)),
                                    Text('${data.sampleCount} matches')
                                  ]),
                              const SizedBox(height: 12),
                              Row(children: [
                                stat('Auto', data.autoPoints),
                                stat('Teleop', data.teleopPoints),
                                stat('Total', data.averagePoints)
                              ]),
                              const SizedBox(height: 16),
                              Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 12),
                                  decoration: BoxDecoration(
                                      color: theme
                                          .colorScheme.surfaceContainerHighest,
                                      borderRadius: BorderRadius.circular(8)),
                                  child: Table(
                                      columnWidths: const {
                                        0: FlexColumnWidth(1.3),
                                        1: FlexColumnWidth(),
                                        2: FlexColumnWidth(),
                                        3: FlexColumnWidth()
                                      },
                                      defaultVerticalAlignment:
                                          TableCellVerticalAlignment.middle,
                                      children: [
                                        TableRow(
                                            children: [
                                          'Match',
                                          'Reports',
                                          'OCR Δ',
                                          'Total'
                                        ]
                                                .map((s) => Padding(
                                                    padding: const EdgeInsets
                                                        .symmetric(
                                                        vertical: 14,
                                                        horizontal: 3),
                                                    child: Text(s,
                                                        style: theme.textTheme
                                                            .labelSmall,
                                                        textAlign: s == 'Match'
                                                            ? TextAlign.left
                                                            : TextAlign.right)))
                                                .toList()),
                                        for (final match in data.matches)
                                          TableRow(children: [
                                            Tooltip(
                                                message:
                                                    '${match.tournamentName} ${match.label}',
                                                child: Padding(
                                                    padding: const EdgeInsets
                                                        .symmetric(
                                                        vertical: 14,
                                                        horizontal: 3),
                                                    child: Text(multipleEvents
                                                        ? '${match.tournamentName}\n${match.label}'
                                                        : match.label))),
                                            for (final value in [
                                              number(match.scoutAverage),
                                              number(match.ocrAdjustment,
                                                  signed: true),
                                              number(match.totalPoints)
                                            ])
                                              Padding(
                                                  padding: const EdgeInsets
                                                      .symmetric(
                                                      vertical: 14,
                                                      horizontal: 3),
                                                  child: Text(value,
                                                      textAlign:
                                                          TextAlign.right)),
                                          ]),
                                      ])),
                            ])))));
      });
}

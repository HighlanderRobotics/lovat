import 'package:flutter/material.dart';
import 'package:scouting_dashboard_app/color_schemes.g.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_alliance_analysis.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_match_prediction.dart';

String _points(num? value, {bool signed = false}) {
  if (value == null) return '—';
  final text = value.abs().toStringAsFixed(1).replaceFirst(RegExp(r'\.0$'), '');
  return value < 0
      ? '−$text'
      : signed && value > 0
          ? '+$text'
          : text;
}

class EstimatePredictionView extends StatelessWidget {
  const EstimatePredictionView({super.key, required this.prediction});
  final MatchPrediction prediction;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final blue = scheme.blueAlliance;
    final red = scheme.redAlliance;
    final probability =
        (prediction.blueWinning ?? .5).toDouble().clamp(0.0, 1.0);
    return DecoratedBox(
      decoration: BoxDecoration(
          gradient: LinearGradient(
        colors: [
          blue.withValues(alpha: .38),
          Theme.of(context).scaffoldBackgroundColor,
          red.withValues(alpha: .25)
        ],
      )),
      child: LayoutBuilder(builder: (context, bounds) {
        final panels = [
          _AlliancePanel(
              name: 'Blue', data: prediction.blueAlliance, color: blue),
          _AlliancePanel(name: 'Red', data: prediction.redAlliance, color: red),
        ];
        return SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Center(
              child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1120),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Blue ${(probability * 100).toStringAsFixed(0)}%'),
                        Text(
                            'Red ${((1 - probability) * 100).toStringAsFixed(0)}%'),
                      ]),
                  const SizedBox(height: 10),
                  Semantics(
                    label: 'Alliance win probability',
                    value:
                        'Blue ${(probability * 100).round()}%, Red ${((1 - probability) * 100).round()}%',
                    child: Container(
                      height: 16,
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(100),
                          border: Border.all(
                              color: scheme.onSurface.withValues(alpha: .3),
                              width: 2)),
                      child: LayoutBuilder(
                          builder: (_, bar) => Row(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    SizedBox(
                                        width: bar.maxWidth * probability,
                                        child: ColoredBox(color: blue)),
                                    Expanded(child: ColoredBox(color: red)),
                                  ])),
                    ),
                  ),
                  const SizedBox(height: 24),
                  if (bounds.maxWidth >= 800)
                    Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(child: panels[0]),
                          const SizedBox(width: 20),
                          Expanded(child: panels[1])
                        ])
                  else ...[panels[0], const SizedBox(height: 24), panels[1]],
                ]),
          )),
        );
      }),
    );
  }
}

class _AlliancePanel extends StatelessWidget {
  const _AlliancePanel(
      {required this.name, required this.data, required this.color});
  final String name;
  final AllianceAnalysis data;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final surface = theme.colorScheme.onSurface.withValues(alpha: .09);
    Widget tile(String label, num? value) => Expanded(
            child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
              color: surface, borderRadius: BorderRadius.circular(7)),
          child: Column(children: [
            Text(_points(value), style: theme.textTheme.titleLarge),
            const SizedBox(height: 6),
            Text(label, style: theme.textTheme.bodySmall)
          ]),
        ));
    final complete = data.teams
        .every((t) => t.scoutAverage != null && t.ocrAdjustment != null);
    final scout = complete
        ? data.teams.fold<double>(0, (sum, t) => sum + t.scoutAverage!)
        : null;
    final adjustment = complete
        ? data.teams.fold<double>(0, (sum, t) => sum + t.ocrAdjustment!)
        : null;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(name, style: theme.textTheme.titleLarge),
        Text(_points(data.totalPoints), style: theme.textTheme.headlineSmall),
      ]),
      const SizedBox(height: 14),
      Row(children: [
        tile('Auto', data.autoPoints),
        const SizedBox(width: 10),
        tile('Teleop', data.teleopPoints)
      ]),
      const SizedBox(height: 10),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
            color: surface, borderRadius: BorderRadius.circular(7)),
        child: DefaultTextStyle.merge(
          style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
          child: Table(
            columnWidths: const {
              0: FlexColumnWidth(1.15),
              1: FlexColumnWidth(),
              2: FlexColumnWidth(),
              3: FlexColumnWidth(.85),
              4: FlexColumnWidth()
            },
            defaultVerticalAlignment: TableCellVerticalAlignment.middle,
            children: [
              _row(context, ['Team', 'Reports', 'OCR Δ', 'Fouls', 'Total'],
                  header: true),
              for (final team in data.teams)
                _row(
                    context,
                    [
                      team.team.toString(),
                      _points(team.scoutAverage),
                      _points(team.ocrAdjustment, signed: true),
                      '—',
                      _points(team.averagePoints)
                    ],
                    team: team.team),
              _row(
                  context,
                  [
                    'Alliance',
                    _points(scout),
                    _points(adjustment, signed: true),
                    _points(data.foulPoints, signed: true),
                    _points(data.totalPoints)
                  ],
                  total: true),
            ],
          ),
        ),
      ),
    ]);
  }

  TableRow _row(BuildContext context, List<String> values,
      {bool header = false, bool total = false, int? team}) {
    final theme = Theme.of(context);
    const hints = [
      '',
      'Scout report score average over the same estimated matches.',
      'Combined estimate minus the scout report average.',
      'TBA foul credit is awarded to the alliance; robot attribution is unavailable.',
      ''
    ];
    return TableRow(
      decoration: total
          ? BoxDecoration(
              border: Border(top: BorderSide(color: theme.dividerColor)))
          : null,
      children: List.generate(values.length, (i) {
        Widget cell = Padding(
            padding: const EdgeInsets.symmetric(vertical: 13, horizontal: 2),
            child: Text(values[i],
                textAlign: i == 0 ? TextAlign.left : TextAlign.right,
                style: (header
                        ? theme.textTheme.labelSmall
                        : theme.textTheme.bodyMedium)
                    ?.copyWith(
                        fontWeight: total ? FontWeight.w600 : null,
                        color: header
                            ? theme.colorScheme.onSurfaceVariant
                            : null)));
        if (header && hints[i].isNotEmpty) {
          cell = Tooltip(message: hints[i], child: cell);
        }
        if (team != null && i == 0) {
          cell = InkWell(
              onTap: () => Navigator.of(context)
                  .pushNamed('/team_lookup', arguments: {'team': team}),
              child: cell);
        }
        return cell;
      }),
    );
  }
}

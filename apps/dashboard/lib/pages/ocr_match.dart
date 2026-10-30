import 'dart:math' as math;
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:scouting_dashboard_app/color_schemes.g.dart';
import 'package:scouting_dashboard_app/reusable/friendly_error_view.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_ocr_match.dart';
import 'package:scouting_dashboard_app/reusable/stale_refresh_builder.dart';

class OcrMatchPage extends StatelessWidget {
  const OcrMatchPage({super.key, required this.matchKey, this.api});
  final String? matchKey;
  final LovatAPI? api;
  @override
  Widget build(BuildContext context) {
    if (matchKey == null) {
      return Scaffold(
          appBar: AppBar(title: const Text('OCR Match')),
          body: Center(
              child: TextButton(
                  onPressed: () =>
                      Navigator.of(context).pushNamed('/match_schedule'),
                  child: const Text('Match Schedule'))));
    }
    return StaleRefreshBuilder(
        query: (api ?? lovatAPI).ocrMatchQuery(matchKey!),
        builder: (context, result) {
          final data = result.data;
          return Scaffold(
              appBar: AppBar(
                  title: Text(data?.available == true
                      ? '${data!.tournamentName} · ${data.label}'
                      : 'OCR Match')),
              body: data == null
                  ? (result.error != null
                      ? FriendlyErrorView.result(result)
                      : const Center(child: CircularProgressIndicator()))
                  : !data.available
                      ? const Center(child: Text('No OCR timeline available'))
                      : RefreshIndicator(
                          onRefresh: () async => result.refetch(),
                          child: OcrMatchTimeline(data: data)));
        });
  }
}

class OcrMatchTimeline extends StatefulWidget {
  const OcrMatchTimeline({super.key, required this.data});
  final OcrMatchData data;
  @override
  State<OcrMatchTimeline> createState() => _OcrMatchTimelineState();
}

class _OcrMatchTimelineState extends State<OcrMatchTimeline> {
  int cursor = 0;
  String clock(int n) => '${n ~/ 60}:${(n % 60).toString().padLeft(2, '0')}';
  String points(num? n, {bool signed = false}) {
    if (n == null) return '—';
    final s = n.abs().toStringAsFixed(1).replaceFirst(RegExp(r'\.0$'), '');
    return n < 0
        ? '−$s'
        : signed && n > 0
            ? '+$s'
            : s;
  }

  List<LineChartBarData> series(List<OcrSample> samples, Color color) {
    final segments = <List<FlSpot>>[];
    for (final sample in samples) {
      if (segments.isEmpty || sample.time - segments.last.last.x > 3) {
        segments.add([]);
      }
      segments.last
          .add(FlSpot(sample.time.toDouble(), sample.count.toDouble()));
    }
    return segments
        .map((spots) => LineChartBarData(
            spots: spots,
            color: color,
            barWidth: 2,
            isCurved: false,
            isStepLineChart: true,
            lineChartStepData: const LineChartStepData(
                stepDirection: LineChartStepData.stepDirectionForward),
            dotData: FlDotData(show: spots.length == 1),
            belowBarData: BarAreaData(show: false)))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final data = widget.data,
        theme = Theme.of(context),
        blue = theme.colorScheme.onBlueAlliance,
        red = theme.colorScheme.onRedAlliance;
    final maxCount = [...data.red, ...data.blue]
        .fold<int>(0, (n, s) => math.max(n, s.count));
    Widget score(String label, num? value, Color color) => Expanded(
        child: Card(
            child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(label, style: TextStyle(color: color)),
                      Flexible(
                          child: FittedBox(
                              fit: BoxFit.scaleDown,
                              child: Text(points(value),
                                  style: theme.textTheme.headlineMedium)))
                    ]))));
    Widget teamTable(String alliance, Color color) {
      final teams = data.teams.where((t) => t.alliance == alliance);
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(alliance == 'RED' ? 'Red' : 'Blue',
            style: theme.textTheme.titleMedium?.copyWith(color: color)),
        const SizedBox(height: 8),
        Card(
            child: Padding(
                padding: const EdgeInsets.all(12),
                child: Table(
                    columnWidths: const {
                      0: FlexColumnWidth(),
                      1: FlexColumnWidth(),
                      2: FlexColumnWidth(),
                      3: FlexColumnWidth()
                    },
                    defaultVerticalAlignment: TableCellVerticalAlignment.middle,
                    children: [
                      TableRow(
                          children: ['Team', 'Reports', 'OCR Δ', 'Total']
                              .map((s) => Padding(
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 10),
                                  child: Text(s,
                                      style: theme.textTheme.labelSmall,
                                      textAlign: s == 'Team'
                                          ? TextAlign.left
                                          : TextAlign.right)))
                              .toList()),
                      for (final team in teams)
                        TableRow(children: [
                          TextButton(
                              style: TextButton.styleFrom(
                                  alignment: Alignment.centerLeft,
                                  padding: EdgeInsets.zero),
                              onPressed: () => Navigator.of(context)
                                      .pushNamed('/team_lookup', arguments: {
                                    'team': team.number,
                                    'estimatesOnly': true
                                  }),
                              child: Text('${team.number}')),
                          for (final n in [
                            points(team.scoutAverage),
                            points(team.adjustment, signed: true),
                            points(team.total)
                          ])
                            Padding(
                                padding:
                                    const EdgeInsets.symmetric(vertical: 12),
                                child: Text(n, textAlign: TextAlign.right))
                        ])
                    ])))
      ]);
    }

    return SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(24),
        child: Center(
            child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1120),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(children: [
                        score('Blue', data.blueScore, blue),
                        const SizedBox(width: 12),
                        score('Red', data.redScore, red)
                      ]),
                      const SizedBox(height: 24),
                      Text('Fuel timeline', style: theme.textTheme.titleLarge),
                      const SizedBox(height: 12),
                      Wrap(spacing: 16, runSpacing: 8, children: [
                        Text('Blue', style: TextStyle(color: blue)),
                        Text('Red', style: TextStyle(color: red)),
                        const Text('Auto 0:00–0:20'),
                        const Text('Teleop 0:23–2:43')
                      ]),
                      const SizedBox(height: 20),
                      SizedBox(
                          height: 260,
                          child: LineChart(
                              LineChartData(
                                  minX: 0,
                                  maxX: 163,
                                  minY: 0,
                                  maxY: math
                                      .max(10, (maxCount / 50).ceil() * 50)
                                      .toDouble(),
                                  clipData: const FlClipData.all(),
                                  lineTouchData:
                                      const LineTouchData(enabled: false),
                                  borderData: FlBorderData(show: false),
                                  gridData: const FlGridData(
                                      show: true, drawVerticalLine: false),
                                  titlesData: FlTitlesData(
                                      topTitles: const AxisTitles(),
                                      rightTitles: const AxisTitles(),
                                      leftTitles: const AxisTitles(
                                          sideTitles: SideTitles(
                                              showTitles: true,
                                              reservedSize: 40)),
                                      bottomTitles: AxisTitles(
                                          sideTitles: SideTitles(
                                              showTitles: true,
                                              reservedSize: 28,
                                              interval: 40,
                                              maxIncluded: false,
                                              getTitlesWidget: (value, meta) =>
                                                  Text(clock(value.round()),
                                                      style: theme.textTheme
                                                          .labelSmall)))),
                                  rangeAnnotations: RangeAnnotations(
                                      verticalRangeAnnotations: [
                                        VerticalRangeAnnotation(
                                            x1: 0,
                                            x2: 20,
                                            color: theme.colorScheme.primary
                                                .withValues(alpha: .08))
                                      ]),
                                  extraLinesData:
                                      ExtraLinesData(verticalLines: [
                                    VerticalLine(
                                        x: cursor.toDouble(),
                                        color: theme.colorScheme.onSurface
                                            .withValues(alpha: .5),
                                        strokeWidth: 1,
                                        dashArray: [4, 4])
                                  ]),
                                  lineBarsData: [
                                    ...series(data.blue, blue),
                                    ...series(data.red, red)
                                  ]),
                              duration: Duration.zero)),
                      Slider(
                          key: const Key('ocr-time-slider'),
                          value: cursor.toDouble(),
                          min: 0,
                          max: 163,
                          divisions: 163,
                          label: clock(cursor),
                          onChanged: (value) =>
                              setState(() => cursor = value.round())),
                      Wrap(
                          alignment: WrapAlignment.spaceBetween,
                          spacing: 16,
                          runSpacing: 8,
                          children: [
                            Text(clock(cursor),
                                style: theme.textTheme.titleMedium),
                            Text('Blue ${ocrCountAt(data.blue, cursor) ?? '—'}',
                                style: TextStyle(color: blue)),
                            Text('Red ${ocrCountAt(data.red, cursor) ?? '—'}',
                                style: TextStyle(color: red))
                          ]),
                      const SizedBox(height: 28),
                      LayoutBuilder(
                          builder: (context, bounds) => bounds.maxWidth >= 760
                              ? Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                      Expanded(child: teamTable('BLUE', blue)),
                                      const SizedBox(width: 20),
                                      Expanded(child: teamTable('RED', red))
                                    ])
                              : Column(children: [
                                  teamTable('BLUE', blue),
                                  const SizedBox(height: 20),
                                  teamTable('RED', red)
                                ]))
                    ]))));
  }
}

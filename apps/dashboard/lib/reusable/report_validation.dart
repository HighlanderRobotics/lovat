import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';

/// Raw evidence remains visible even when a lead excludes an event from metrics.
class ReportValidation extends StatefulWidget {
  const ReportValidation(
      {super.key, required this.reportUuid, required this.onReviewed});
  final String reportUuid;
  final Future<void> Function() onReviewed;
  @override
  State<ReportValidation> createState() => _ReportValidationState();
}

class _ReportValidationState extends State<ReportValidation> {
  Map<String, dynamic>? data;
  String? error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final response = await lovatAPI
          .get('/v1/manager/scoutreports/${widget.reportUuid}/validation');
      if (response?.statusCode != 200) {
        throw Exception('Could not load validation evidence');
      }
      if (mounted) {
        setState(() {
          data = jsonDecode(response!.body) as Map<String, dynamic>;
          error = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          error = 'Could not load validation evidence.';
        });
      }
    }
  }

  Future<void> review(String uuid, String status) async {
    if (busy) return;
    setState(() {
      busy = true;
    });
    try {
      final response = await lovatAPI.post(
          '/v1/manager/scoutreports/${widget.reportUuid}/validation/$uuid',
          body: {'status': status});
      if (response?.statusCode != 200) throw Exception('Review failed');
      await load();
      await widget.onReviewed();
    } catch (_) {
      if (mounted) {
        setState(() {
          error = 'Could not save the review. Please retry.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (data == null && error == null) {
      return const Center(child: CircularProgressIndicator());
    }
    final flags = (data?['flags'] as List?) ?? [];
    final events = (data?['events'] as List?) ?? [];
    return ListView(padding: const EdgeInsets.all(24), children: [
      Text('Scoreboard validation',
          style: Theme.of(context).textTheme.headlineSmall),
      const Text(
          'Review suggestions compare a scoring run with the whole alliance’s fuel increase. Overlapping shooters cannot be attributed to a single robot.'),
      if (error != null)
        ListTile(
            title: Text(error!),
            trailing: TextButton(onPressed: load, child: const Text('Retry'))),
      if (busy) const LinearProgressIndicator(),
      if (data?['analysisExcluded'] == true)
        const ListTile(
            leading: Icon(Icons.warning_amber),
            title: Text(
                'This report is excluded from analysis. Original data is preserved.')),
      if (data != null && flags.isEmpty)
        const ListTile(
            title: Text(
                'No validation flags. This does not imply that a video was available or validated.')),
      for (final flag in flags)
        Card(
            child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                          flag['status'] == 'ACTIVE'
                              ? 'Excluded from analysis'
                              : flag['status'] == 'RESTORED'
                                  ? 'Restored by a lead'
                                  : 'Needs lead review',
                          style: Theme.of(context).textTheme.titleMedium),
                      Text(flag['reason'] as String),
                      Text('Rule: ${flag['rule']}'),
                      if (flag['evidence'] is Map)
                        Text('Evidence: ${jsonEncode(flag['evidence'])}'),
                      if (flag['reviewedAt'] != null)
                        Text('Reviewed: ${flag['reviewedAt']}'),
                      if (data?['canReview'] == true)
                        Wrap(spacing: 12, children: [
                          if (flag['status'] != 'ACTIVE')
                            TextButton(
                                onPressed: busy
                                    ? null
                                    : () => review(
                                        flag['uuid'] as String, 'ACTIVE'),
                                child: const Text('Exclude event')),
                          if (flag['status'] != 'RESTORED')
                            TextButton(
                                onPressed: busy
                                    ? null
                                    : () => review(
                                        flag['uuid'] as String, 'RESTORED'),
                                child: Text(flag['status'] == 'ACTIVE'
                                    ? 'Undo strike'
                                    : 'Keep event')),
                        ]),
                    ]))),
      const SizedBox(height: 16),
      Text('Original events', style: Theme.of(context).textTheme.titleLarge),
      for (final event in events)
        ListTile(
            leading: Icon(
                event['analysisExcluded'] == true ? Icons.block : Icons.check),
            title: Text(
                '${event['time']}s · ${event['action']} · ${event['quantity'] ?? '—'} fuel'),
            subtitle: event['analysisExcluded'] == true
                ? const Text('Excluded from metrics; preserved in this report')
                : null),
    ]);
  }
}

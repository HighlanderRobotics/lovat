import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_tournaments.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';

DateTime _calendarDate(DateTime value) =>
    DateTime(value.year, value.month, value.day);

/// Upcoming and ongoing events through Sunday, using calendar dates so that
/// UTC date-only API values do not shift to the previous day in local time.
List<Tournament> tournamentsThisWeek(
    Iterable<Tournament> tournaments, DateTime now) {
  final today = _calendarDate(now);
  final nextMonday =
      DateTime(today.year, today.month, today.day + 8 - today.weekday);
  final events = tournaments.where((event) {
    final start = event.date;
    if (start == null) return false;
    final end = event.endDate ?? start;
    return _calendarDate(start).isBefore(nextMonday) &&
        !_calendarDate(end).isBefore(today);
  }).toList();
  events.sort((a, b) {
    final order = a.date!.compareTo(b.date!);
    return order != 0 ? order : a.localized.compareTo(b.localized);
  });
  return events;
}

class UpcomingWeekTournaments extends StatefulWidget {
  const UpcomingWeekTournaments({super.key, this.api, this.now});

  final LovatAPI? api;
  final DateTime? now;

  @override
  State<UpcomingWeekTournaments> createState() =>
      _UpcomingWeekTournamentsState();
}

class _UpcomingWeekTournamentsState extends State<UpcomingWeekTournaments> {
  late Future<PartialTournamentList> _request;

  Future<PartialTournamentList> _load() => (widget.api ?? lovatAPI)
      .getTournaments()
      .timeout(const Duration(seconds: 30));

  @override
  void initState() {
    super.initState();
    _request = _load();
  }

  @override
  void didUpdateWidget(UpcomingWeekTournaments oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.api != widget.api) _request = _load();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<PartialTournamentList>(
      future: _request,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const LinearProgressIndicator();
        }
        if (snapshot.hasError) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text("Could not load tournaments this week."),
              TextButton(
                onPressed: () {
                  setState(() {
                    _request = _load();
                  });
                },
                child: const Text("Retry tournaments"),
              ),
            ],
          );
        }
        final tournaments = tournamentsThisWeek(
            snapshot.data?.tournaments ?? [], widget.now ?? DateTime.now());
        if (tournaments.isEmpty) {
          return const Text("No upcoming tournaments this week.");
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final tournament in tournaments)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: UpcomingTournamentCard(tournament: tournament),
              ),
          ],
        );
      },
    );
  }
}

class UpcomingTournamentCard extends StatelessWidget {
  const UpcomingTournamentCard({super.key, required this.tournament});

  final Tournament tournament;

  @override
  Widget build(BuildContext context) {
    final start = tournament.date!;
    final end = tournament.endDate;
    final format = DateFormat('MMM d');
    final date = end != null && _calendarDate(end) != _calendarDate(start)
        ? "${format.format(start)} – ${format.format(end)}"
        : format.format(start);
    return Container(
      constraints: const BoxConstraints(minHeight: 56),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Text(
              tournament.localized,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: DefaultTextStyle(
              style: TextStyle(
                fontSize: 11,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (tournament.location?.trim().isNotEmpty == true) ...[
                    Text(tournament.location!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.right),
                    const SizedBox(height: 3),
                  ],
                  FittedBox(fit: BoxFit.scaleDown, child: Text(date)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

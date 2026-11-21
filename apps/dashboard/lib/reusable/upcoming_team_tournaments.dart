import 'package:flutter/material.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_upcoming_team_tournaments.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';

class UpcomingTeamTournaments extends StatefulWidget {
  const UpcomingTeamTournaments({super.key, this.api});
  final LovatAPI? api;

  @override
  State<UpcomingTeamTournaments> createState() =>
      _UpcomingTeamTournamentsState();
}

class _UpcomingTeamTournamentsState extends State<UpcomingTeamTournaments> {
  late Future<List<UpcomingTeamTournament>> _request;
  Future<List<UpcomingTeamTournament>> _load() => (widget.api ?? lovatAPI)
      .getUpcomingTeamTournaments()
      .timeout(const Duration(seconds: 30));

  @override
  void initState() {
    super.initState();
    _request = _load();
  }

  @override
  void didUpdateWidget(UpcomingTeamTournaments oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.api != widget.api) _request = _load();
  }

  @override
  Widget build(BuildContext context) =>
      FutureBuilder<List<UpcomingTeamTournament>>(
        future: _request,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const LinearProgressIndicator();
          }
          if (snapshot.hasError) {
            return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Could not load upcoming entered tournaments.'),
                  TextButton(
                      onPressed: () => setState(() {
                            _request = _load();
                          }),
                      child: const Text('Retry entered tournaments')),
                ]);
          }
          final events = snapshot.data ?? [];
          if (events.isEmpty) {
            return const Text(
                'No future entered tournaments listed on The Blue Alliance.');
          }
          return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            for (var i = 0; i < events.take(2).length; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              Expanded(child: _TournamentCard(event: events[i])),
            ],
            if (events.length == 1) ...[
              const SizedBox(width: 8),
              const Expanded(child: SizedBox())
            ],
          ]);
        },
      );
}

class _TournamentCard extends StatelessWidget {
  const _TournamentCard({required this.event});
  final UpcomingTeamTournament event;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final details = [
      if (event.city?.trim().isNotEmpty == true) event.city!,
      if (event.week != null) 'Week ${event.week}',
    ].join(' · ');
    return Container(
      height: 78,
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(8)),
      child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(event.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style:
                    const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
            if (details.isNotEmpty) ...[
              const SizedBox(height: 3),
              Text(details,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style:
                      TextStyle(fontSize: 10, color: scheme.onSurfaceVariant)),
            ],
          ]),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/reusable/friendly_error_view.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_team_rankings.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_teams_at_tournament.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/team_card.dart';

class TournamentTeamsPage extends StatefulWidget {
  const TournamentTeamsPage({super.key, this.tournament, this.api});
  final Tournament? tournament;
  final LovatAPI? api;

  @override
  State<TournamentTeamsPage> createState() => _TournamentTeamsPageState();
}

class _TournamentTeamsPageState extends State<TournamentTeamsPage> {
  late Future<List<TeamRanking>> _request;
  Tournament? _tournament;

  Future<List<TeamRanking>> _load() async {
    final tournament = widget.tournament ?? await Tournament.getCurrent();
    if (!mounted) return [];
    setState(() {
      _tournament = tournament;
    });
    if (tournament == null) return [];
    final teams = await (widget.api ?? lovatAPI)
        .getTeamRankings(tournament.key)
        .timeout(const Duration(seconds: 30));
    if (teams.isEmpty) {
      final roster = await (widget.api ?? lovatAPI)
          .getTeamsAtTournament(tournament.key)
          .timeout(const Duration(seconds: 30));
      teams.addAll(roster.map((team) => TeamRanking(
            number: team.number,
            rank: null,
            matchesPlayed: null,
            rankingPoints: null,
          )));
    }
    teams.sort((a, b) {
      final rank = TeamRanking.compareByRank(a, b);
      return rank == 0 ? a.number.compareTo(b.number) : rank;
    });
    return teams;
  }

  @override
  void initState() {
    super.initState();
    _request = _load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: const Color(0xFF1F1F1F),
        appBar: AppBar(
          backgroundColor: const Color(0xFF292929),
          foregroundColor: const Color(0xFFE0E0E0),
          surfaceTintColor: Colors.transparent,
          toolbarHeight: 64,
          centerTitle: true,
          elevation: 0,
          scrolledUnderElevation: 0,
          shape: const Border(
              bottom: BorderSide(color: Color(0xFF424242), width: 2)),
          leadingWidth: 60,
          leading: Padding(
            padding: const EdgeInsets.only(left: 14),
            child: Align(
              alignment: Alignment.centerLeft,
              child: SizedBox.square(
                  dimension: 32,
                  child: IconButton(
                    padding: EdgeInsets.zero,
                    tooltip: 'Back',
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: SvgPicture.asset(
                        'assets/images/team_rankings_back.svg',
                        width: 32,
                        height: 32),
                  )),
            ),
          ),
          title: const Text('Team rankings',
              style: TextStyle(
                fontFamily: 'Heebo',
                fontSize: 20,
                fontWeight: FontWeight.w500,
                height: 32 / 20,
                color: Color(0xFFE0E0E0),
              )),
        ),
        body: FutureBuilder<List<TeamRanking>>(
          future: _request,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return FriendlyErrorView(
                errorMessage: 'Could not load teams at this tournament.',
                onRetry: () async {
                  setState(() {
                    _request = _load();
                  });
                },
              );
            }
            if (_tournament == null) {
              return const Center(
                  child: Text('Select a tournament to see its teams.'));
            }
            final teams = snapshot.data ?? [];
            if (teams.isEmpty) {
              return const Center(
                  child:
                      Text('No teams are available for this tournament yet.'));
            }
            return SafeArea(
              top: false,
              child: Semantics(
                label: 'Teams at ${_tournament!.localized}',
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(26, 16, 26, 26),
                  itemCount: teams.length,
                  separatorBuilder: (context, index) =>
                      const SizedBox(height: 10),
                  itemBuilder: (context, index) => SizedBox(
                    height: 53,
                    child: TeamCard.fromRanking(teams[index]),
                  ),
                ),
              ),
            );
          },
        ),
      );
}

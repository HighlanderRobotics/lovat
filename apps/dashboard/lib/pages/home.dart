import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/pages/match_schedule.dart';
import 'package:scouting_dashboard_app/reusable/friendly_error_view.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_matches.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_user_profile.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/scouter_schedule/get_scouter_schedule.dart';
import 'package:scouting_dashboard_app/reusable/models/scout_schedule.dart';
import 'package:scouting_dashboard_app/reusable/navigation_drawer.dart';
import 'package:scouting_dashboard_app/reusable/scrollable_page_body.dart';
import 'package:scouting_dashboard_app/reusable/upcoming_tournaments.dart';
import 'package:scouting_dashboard_app/reusable/team_card.dart';
export 'package:scouting_dashboard_app/reusable/team_card.dart' show TeamCard;
import 'package:scouting_dashboard_app/reusable/upcoming_team_tournaments.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_team_rankings.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_tournament_status.dart';

// Set to true to show the team's upcoming entered tournaments on Home.
const bool showUpcomingEnteredTournaments = false;

class HomePage extends StatefulWidget {
  const HomePage({super.key, this.api});

  final LovatAPI? api;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int _loadGeneration = 0;
  bool dataLoaded = false;

  Tournament? t;
  int? team;
  String? error;
  List<String> notices = [];
  MatchScheduleMatch? match1;
  MatchScheduleMatch? match2;
  MatchScheduleMatch? lastCompletedMatch;
  int? nextMatchOrdinal;
  TeamTournamentStatus? teamTournamentStatus;
  List<TeamRanking> topTeams = [];
  Tournament? selectedTournament;
  ServerScoutSchedule? schedule;

  @override
  void initState() {
    super.initState();
    Tournament.currentChanges.addListener(_onTournamentChanged);
    fetchData();
  }

  void _onTournamentChanged() {
    fetchData();
  }

  @override
  void dispose() {
    Tournament.currentChanges.removeListener(_onTournamentChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: Theme.of(context).copyWith(
        textTheme: Theme.of(context).textTheme.apply(fontFamily: 'Heebo'),
      ),
      child: Builder(
          builder: (context) => Scaffold(
                appBar: AppBar(
                  title: const Text("Home"),
                ),
                drawer: const GlobalNavigationDrawer(),
                body: error != null
                    ? FriendlyErrorView(errorMessage: error, onRetry: fetchData)
                    : !dataLoaded
                        ? const Center(child: CircularProgressIndicator())
                        : ScrollablePageBody(
                            padding: const EdgeInsets.all(26),
                            children: [
                              Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    Text(
                                        t?.localized ??
                                            "No Selected Tournament",
                                        style: const TextStyle(
                                            fontSize: 24,
                                            height: 32 / 24,
                                            fontWeight: FontWeight.w500)),
                                    const SizedBox(height: 10),
                                    for (final notice in notices)
                                      Padding(
                                        padding:
                                            const EdgeInsets.only(bottom: 8),
                                        child: Text(notice),
                                      ),
                                    if (notices.isNotEmpty)
                                      Align(
                                        alignment: Alignment.centerLeft,
                                        child: TextButton(
                                          onPressed: fetchData,
                                          child: const Text(
                                              "Retry unavailable data"),
                                        ),
                                      ),
                                    Text(
                                      team == null
                                          ? "Team status"
                                          : "$team's status",
                                      style: const TextStyle(
                                        fontSize: 20,
                                        height: 1.6,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    Row(
                                        spacing: 10,
                                        mainAxisAlignment:
                                            MainAxisAlignment.spaceEvenly,
                                        children: [
                                          Expanded(
                                              child: HomeStatusTile(
                                                  label: const Text("Rank"),
                                                  value: Text(
                                                      (teamTournamentStatus
                                                                  ?.rank ??
                                                              "N/A")
                                                          .toString()))),
                                          Expanded(
                                              child: HomeStatusTile(
                                                  label: const Text(
                                                      "Ranking points"),
                                                  value: Text((teamTournamentStatus
                                                              ?.rankingPoints ??
                                                          "N/A")
                                                      .toString()))),
                                          Expanded(
                                              child: HomeStatusTile(
                                                  label: const Text(
                                                      "Matches played"),
                                                  value: Text(
                                                      "${teamTournamentStatus?.matchesPlayed ?? 'N/A'} of ${teamTournamentStatus?.matchesTotal ?? 'N/A'}"))),
                                        ]),
                                    const SizedBox(height: 10),
                                    GestureDetector(
                                      onTap: () {
                                        Navigator.pushNamedAndRemoveUntil(
                                            context,
                                            "/match_schedule",
                                            (route) => false);
                                      },
                                      child: const Row(
                                        children: [
                                          Text("Matches",
                                              style: TextStyle(
                                                fontSize: 20,
                                                height: 1.6,
                                                fontWeight: FontWeight.w500,
                                              )),
                                          SizedBox(width: 3),
                                          HomeSectionChevron(),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    HomePageMatch(match1: match1),
                                    const SizedBox(height: 14),
                                    HomePageMatch(
                                      match1: match2,
                                      isTeamMatch: true,
                                      teamNumber: team,
                                    ),
                                    const SizedBox(height: 10),
                                    GestureDetector(
                                      onTap: () {
                                        Navigator.pushNamed(
                                            context, "/tournament_teams",
                                            arguments: {
                                              "tournament": t,
                                              "api": widget.api
                                            });
                                      },
                                      child: const Row(
                                        children: [
                                          Text("Teams",
                                              style: TextStyle(
                                                fontSize: 20,
                                                height: 1.6,
                                                fontWeight: FontWeight.w500,
                                              )),
                                          SizedBox(width: 3),
                                          HomeSectionChevron(),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    TournamentTopTeams(rankings: topTeams),
                                    const SizedBox(height: 10),
                                    GestureDetector(
                                      onTap: () {
                                        Navigator.pushNamedAndRemoveUntil(
                                            context,
                                            "/scouters",
                                            (route) => false);
                                      },
                                      child: const Row(
                                        children: [
                                          Text("Scouters",
                                              style: TextStyle(
                                                fontSize: 20,
                                                height: 1.6,
                                                fontWeight: FontWeight.w500,
                                              )),
                                          SizedBox(width: 3),
                                          HomeSectionChevron(),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    Row(
                                      children: [
                                        Expanded(
                                          child: ScoutersCard(
                                            onDuty: true,
                                            lastCompletedMatch:
                                                lastCompletedMatch,
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: ScoutersCard(
                                            onDuty: false,
                                            lastCompletedMatch:
                                                lastCompletedMatch,
                                            schedule: schedule,
                                            nextMatchOrdinal: nextMatchOrdinal,
                                          ),
                                        ),
                                      ],
                                    ),
                                    if (showUpcomingEnteredTournaments) ...[
                                      const SizedBox(height: 10),
                                      GestureDetector(
                                        onTap: () {
                                          Navigator.pushNamedAndRemoveUntil(
                                              context,
                                              "/match_schedule",
                                              (route) => false);
                                        },
                                        child: const Row(
                                          children: [
                                            Text("Upcoming Entered Tournaments",
                                                style: TextStyle(
                                                  fontSize: 20,
                                                  height: 1.6,
                                                  fontWeight: FontWeight.w500,
                                                )),
                                            SizedBox(width: 3),
                                            HomeSectionChevron(),
                                          ],
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      UpcomingTeamTournaments(api: widget.api),
                                    ],
                                    const SizedBox(height: 10),
                                    const Text(
                                      "Upcoming Tournaments This Week",
                                      style: TextStyle(
                                          fontSize: 20,
                                          height: 1.6,
                                          fontWeight: FontWeight.w500),
                                    ),
                                    const SizedBox(height: 8),
                                    UpcomingWeekTournaments(api: widget.api),
                                  ]),
                            ],
                          ),
              )),
    );
  }

  Future<void> fetchData() async {
    if (!mounted) return;
    final generation = ++_loadGeneration;
    bool isCurrentLoad() => mounted && generation == _loadGeneration;
    setState(() {
      dataLoaded = false;
      error = null;
      t = Tournament.currentSync;
      match1 = null;
      match2 = null;
      lastCompletedMatch = null;
      nextMatchOrdinal = null;
      teamTournamentStatus = null;
      notices = [];
      schedule = null;
    });

    const timeout = Duration(seconds: 30);
    try {
      final tournament = await Tournament.getCurrent().timeout(timeout);
      if (!isCurrentLoad()) return;
      if (tournament == null) {
        throw const LovatAPIException(
            "No tournament selected. Choose a tournament from the navigation menu.");
      }

      if (!isCurrentLoad()) return;
      setState(() {
        t = tournament;
      });
      final api = widget.api ?? lovatAPI;
      final profile = await api.getUserProfile().timeout(timeout);
      final teamNumber = profile.team?.number;
      final messages = <String>[];
      List<MatchScheduleMatch> matches = [];
      try {
        matches = await api.getMatches(tournament.key).timeout(timeout);
      } catch (_) {
        messages.add("The match schedule is unavailable for this tournament.");
      }
      ServerScoutSchedule? shifts;
      try {
        shifts = await api
            .scouterScheduleQuery(tournament.key)
            .queryFn()
            .timeout(timeout);
      } catch (_) {
        messages
            .add("The scouter schedule is unavailable for this tournament.");
      }
      List<TeamRanking> teams = [];
      try {
        teams = await api.getTeamRankings(tournament.key).timeout(timeout);
        teams.sort(TeamRanking.compareByRank);
      } catch (_) {
        messages.add("Rankings could not be loaded for this tournament.");
      }
      TeamTournamentStatus? status;
      if (teamNumber != null) {
        try {
          status = await api
              .getTeamTournamentStatus(
                team: teamNumber,
                tournamentKey: tournament.key,
              )
              .timeout(timeout);
          if (status == null) {
            messages.add("Your team is not entered in this tournament.");
          }
        } catch (_) {
          messages.add("Your team's tournament status is unavailable.");
        }
      }
      final teamMatches = matches.where((match) =>
          match.allTeamInfo.any((info) => info.teamNumber == teamNumber));
      MatchScheduleMatch? latestCompleted;
      for (final match in matches) {
        if (match.isFinished) latestCompleted = match;
      }
      // Shift ranges use one-based play order across qualifiers and eliminations.
      final nextMatchIndex = matches.indexWhere((match) => !match.isFinished);

      if (!isCurrentLoad()) return;
      setState(() {
        t = tournament;
        team = teamNumber;
        teamTournamentStatus = status;
        notices = messages;
        topTeams = teams;
        schedule = shifts;
        lastCompletedMatch = latestCompleted;
        nextMatchOrdinal = nextMatchIndex < 0 ? null : nextMatchIndex + 1;
        match1 = selectHomeMatch(matches);
        match2 = selectHomeMatch(teamMatches, includeLastCompleted: false);
        dataLoaded = true;
      });
    } catch (e) {
      if (!isCurrentLoad()) return;
      setState(() {
        error = e is LovatAPIException
            ? e.message
            : e is TimeoutException
                ? "Loading the home page timed out. Please try again."
                : "Could not load the home page. Please try again.";
      });
    }
  }
}

/// The API supplies matches in play order. Keep live/upcoming matches first,
/// falling back to the last completed match after this schedule ends.
MatchScheduleMatch? selectHomeMatch(Iterable<MatchScheduleMatch> matches,
    {bool includeLastCompleted = true}) {
  MatchScheduleMatch? last;
  for (final match in matches) {
    if (!match.isFinished) return match;
    last = match;
  }
  return includeLastCompleted ? last : null;
}

class HomeStatusTile extends StatelessWidget {
  const HomeStatusTile({super.key, required this.value, required this.label});
  final Widget value;
  final Widget label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      height: 60,
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 7),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(7),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            child: DefaultTextStyle(
              style: const TextStyle(
                  fontFamily: 'Heebo',
                  fontSize: 20,
                  height: 1.6,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFFE0E0E0)),
              child: value,
            ),
          ),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: DefaultTextStyle(
              style: const TextStyle(
                  fontFamily: 'Heebo',
                  fontSize: 12,
                  height: 14 / 12,
                  color: Color(0xFFB8B8B8)),
              child: label,
            ),
          ),
        ],
      ),
    );
  }
}

class HomePageMatch extends StatelessWidget {
  const HomePageMatch({
    super.key,
    required this.match1,
    this.isTeamMatch = false,
    this.teamNumber,
  });

  final MatchScheduleMatch? match1;
  final bool isTeamMatch;
  final int? teamNumber;

  @override
  Widget build(BuildContext context) {
    if (isTeamMatch && (match1 == null || match1!.isFinished)) {
      return const NoUpcomingTeamMatches();
    }
    if (match1 == null) {
      return const Text("No matches available.");
    }
    return SizedBox(
      height: 122,
      width: double.infinity,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(7),
        child: ColoredBox(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          child: Theme(
            data: Theme.of(context).copyWith(
                textTheme: Theme.of(context).textTheme.copyWith(
                      titleLarge: const TextStyle(
                          fontFamily: 'Heebo',
                          fontSize: 16,
                          height: 1.5,
                          color: Color(0xFFE0E0E0)),
                    )),
            child: Column(
              children: [
                SizedBox(
                  height: 46,
                  child: Row(
                    children: [
                      Expanded(
                          child: Row(children: [
                        Flexible(
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
                            child: Text(
                              match1!.identity.getLocalizedDescription(
                                includeTournament: false,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 14, fontWeight: FontWeight.w500),
                            ),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 7,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: Theme.of(context)
                                .colorScheme
                                .secondaryContainer,
                            borderRadius: BorderRadius.circular(5),
                          ),
                          child: Text(
                            match1!.isFinished
                                ? "Completed"
                                : isTeamMatch && teamNumber != null
                                    ? "Up next for $teamNumber"
                                    : "Up next",
                            style: TextStyle(
                              fontSize: 10,
                              letterSpacing: 0.4,
                              fontWeight: FontWeight.w500,
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSecondaryContainer,
                            ),
                          ),
                        ),
                      ])),
                      IconButton(
                        onPressed: () {
                          Navigator.of(context).pushNamed(
                            "/match_predictor",
                            arguments: {
                              'red1': match1!.red1.teamNumber.toString(),
                              'red2': match1!.red2.teamNumber
                                  .toString(), //match1!.red2.scouters.length.toString(),
                              'red3': match1!.red3.teamNumber.toString(),
                              'blue1': match1!.blue1.teamNumber.toString(),
                              'blue2': match1!.blue2.teamNumber.toString(),
                              'blue3': match1!.blue3.teamNumber.toString(),
                            },
                          );
                        },
                        icon: const HomeSectionChevron(),
                        visualDensity: VisualDensity.compact,
                        padding: EdgeInsets.zero,
                        constraints:
                            const BoxConstraints(minWidth: 32, minHeight: 40),
                        tooltip: "Match Predictor",
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: AllianceRow(
                    alliance: Alliance.blue,
                    items: [
                      AllianceRowItem(
                        matchIdentity: match1!.identity,
                        longMatchKey: "${match1!.identity.toMediumKey()}_3",
                        teamInfo: match1!.blue1,
                      ),
                      AllianceRowItem(
                        matchIdentity: match1!.identity,
                        longMatchKey: "${match1!.identity.toMediumKey()}_4",
                        teamInfo: match1!.blue2,
                      ),
                      AllianceRowItem(
                        matchIdentity: match1!.identity,
                        longMatchKey: "${match1!.identity.toMediumKey()}_5",
                        teamInfo: match1!.blue3,
                      ),
                    ],
                    isScoutingLead: true,
                    showDetails: false,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                  ),
                ),
                Expanded(
                  child: AllianceRow(
                    alliance: Alliance.red,
                    items: [
                      AllianceRowItem(
                        matchIdentity: match1!.identity,
                        longMatchKey: "${match1!.identity.toMediumKey()}_0",
                        teamInfo: match1!.red1,
                      ),
                      AllianceRowItem(
                        matchIdentity: match1!.identity,
                        longMatchKey: "${match1!.identity.toMediumKey()}_1",
                        teamInfo: match1!.red2,
                      ),
                      AllianceRowItem(
                        matchIdentity: match1!.identity,
                        longMatchKey: "${match1!.identity.toMediumKey()}_2",
                        teamInfo: match1!.red3,
                      ),
                    ],
                    isScoutingLead: true,
                    showDetails: false,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class NoUpcomingTeamMatches extends StatelessWidget {
  const NoUpcomingTeamMatches({super.key});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(7),
      child: SizedBox(
        height: 122,
        width: double.infinity,
        child: ColoredBox(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                "No more upcoming matches for your team",
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class TournamentTopTeams extends StatelessWidget {
  const TournamentTopTeams({super.key, required this.rankings});

  final List<TeamRanking> rankings;

  @override
  Widget build(BuildContext context) {
    final ranked = rankings.where((team) => (team.rank ?? 0) > 0).toList()
      ..sort(TeamRanking.compareByRank);
    final topFour = ranked.take(4).toList();
    if (rankings.isEmpty) {
      return const Text("Rankings are not available for this tournament yet.");
    }
    if (topFour.isEmpty) {
      final teams = rankings.toList()
        ..sort((a, b) => a.number.compareTo(b.number));
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text("Rankings are not available for this tournament yet."),
          const SizedBox(height: 8),
          TournamentTeamsGrid(
              rankings: teams.take(4).toList(), shrinkWrap: true),
        ],
      );
    }
    return TournamentTeamsGrid(rankings: topFour, shrinkWrap: true);
  }
}

class ScoutersCard extends StatelessWidget {
  const ScoutersCard({
    super.key,
    required this.onDuty,
    required this.lastCompletedMatch,
    this.schedule,
    this.nextMatchOrdinal,
  });
  final bool onDuty;
  final MatchScheduleMatch? lastCompletedMatch;
  final ServerScoutSchedule? schedule;
  final int? nextMatchOrdinal;

  @override
  Widget build(BuildContext context) {
    final completedMatchCount = lastCompletedMatch?.allTeamInfo
            .expand((team) => team.scouters)
            .map((scouter) => scouter.name)
            .toSet()
            .length ??
        0;
    final nextMatchScouterIds = <String>{};
    if (!onDuty && schedule != null && nextMatchOrdinal != null) {
      for (final shift in schedule!.shifts) {
        if (shift.start <= nextMatchOrdinal! &&
            nextMatchOrdinal! <= shift.end) {
          nextMatchScouterIds.addAll([
            ...shift.team1,
            ...shift.team2,
            ...shift.team3,
            ...shift.team4,
            ...shift.team5,
            ...shift.team6,
          ].map((scouter) => scouter.id));
        }
      }
    }
    final String countText;
    if (onDuty) {
      countText = lastCompletedMatch == null
          ? "No completed matches"
          : "$completedMatchCount Scouters";
    } else if (nextMatchOrdinal == null) {
      countText = "No upcoming matches";
    } else if (schedule == null) {
      countText = "Schedule unavailable";
    } else {
      countText = "${nextMatchScouterIds.length} Scouters";
    }

    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(7),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    onDuty ? "On Duty" : "Next Match",
                    style: const TextStyle(
                      fontSize: 16,
                      height: 18 / 16,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Text(
                    countText,
                    style: const TextStyle(
                      fontSize: 10,
                      color: Color(0xFFB8B8B8),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class HomeSectionChevron extends StatelessWidget {
  const HomeSectionChevron({super.key});

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
        'assets/images/home_section_chevron.svg',
        width: 18,
        height: 18,
        excludeFromSemantics: true,
      );
}

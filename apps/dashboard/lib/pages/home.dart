import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/pages/match_schedule.dart';
import 'package:scouting_dashboard_app/pages/picklist/picklist_models.dart';
import 'package:scouting_dashboard_app/reusable/emphasized_container.dart';
import 'package:scouting_dashboard_app/reusable/friendly_error_view.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_matches.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_user_profile.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/navigation_drawer.dart';
import 'package:scouting_dashboard_app/reusable/scrollable_page_body.dart';
import 'package:scouting_dashboard_app/reusable/value_tile.dart';
import 'package:scouting_dashboard_app/reusable/upcoming_tournaments.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_team_rankings.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_tournament_status.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key, this.api});

  final LovatAPI? api;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int _loadGeneration = 0;
  bool dataLoaded = false;
  bool colorsReady = false;

  Tournament? t;
  int? team;
  String? error;
  List<String> notices = [];
  MatchScheduleMatch? match1;
  MatchScheduleMatch? match2;
  List<ConfiguredPicklistMeta>? sharedPicklists;
  List<MutablePicklistMeta>? mutablePicklists;
  TeamTournamentStatus? teamTournamentStatus;
  List<TeamRanking> topTeams = [];
  List<dynamic> displayPicklists = [];
  Tournament? selectedTournament;

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
    return Scaffold(
      appBar: AppBar(
        title: Text(t?.localized ?? "No Selected Tournament"),
        //actions: const [CodeViewerButton()],
      ),
      drawer: const GlobalNavigationDrawer(),
      body: error != null
          ? FriendlyErrorView(errorMessage: error, onRetry: fetchData)
          : !dataLoaded
              ? const Center(child: CircularProgressIndicator())
              : ScrollablePageBody(
                  children: [
                    Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(t?.localized ?? "No Selected Tournament",
                              style: Theme.of(context).textTheme.titleLarge),
                          const SizedBox(height: 16),
                          for (final notice in notices)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Text(notice),
                            ),
                          if (notices.isNotEmpty)
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton(
                                onPressed: fetchData,
                                child: const Text("Retry unavailable data"),
                              ),
                            ),
                          GestureDetector(
                            onTap: () {
                              Navigator.pushNamedAndRemoveUntil(
                                  context, "/team_lookup", (route) => false);
                            },
                            child: Row(
                              children: [
                                Text(
                                    team == null
                                        ? "Team status"
                                        : "$team's status",
                                    style: const TextStyle(
                                      fontSize: 17.0,
                                    )),
                                const Icon(Icons.chevron_right),
                              ],
                            ),
                          ),
                          const SizedBox(height: 5),
                          Row(
                              spacing: 8,
                              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                              children: [
                                Expanded(
                                    child: ValueTile(
                                        label: const Text("Rank"),
                                        value: Text(
                                            (teamTournamentStatus?.rank ??
                                                    "N/A")
                                                .toString()))),
                                Expanded(
                                    child: ValueTile(
                                        label: const Text("RP"),
                                        value: Text((teamTournamentStatus
                                                    ?.rankingPoints ??
                                                "N/A")
                                            .toString()))),
                                Expanded(
                                    child: ValueTile(
                                        label: const Text("Matches Played"),
                                        value: Text(
                                            "${teamTournamentStatus?.matchesPlayed ?? 'N/A'}/${teamTournamentStatus?.matchesTotal ?? 'N/A'}"))),
                              ]),
                          const SizedBox(height: 15),
                          GestureDetector(
                            onTap: () {
                              Navigator.pushNamedAndRemoveUntil(
                                  context, "/match_schedule", (route) => false);
                            },
                            child: const Row(
                              children: [
                                Text("Matches",
                                    style: TextStyle(
                                      fontSize: 17.0,
                                    )),
                                Icon(Icons.chevron_right),
                              ],
                            ),
                          ),
                          const SizedBox(height: 5),
                          HomePageMatch(match1: match1),
                          const SizedBox(height: 12),
                          HomePageMatch(
                            match1: match2,
                            isTeamMatch: true,
                            teamNumber: team,
                          ),
                          const SizedBox(height: 15),
                          GestureDetector(
                            onTap: () {
                              Navigator.pushNamedAndRemoveUntil(
                                  context, "/team_lookup", (route) => false);
                            },
                            child: const Row(
                              children: const [
                                Text("Teams",
                                    style: const TextStyle(
                                      fontSize: 17.0,
                                    )),
                                Icon(Icons.chevron_right),
                              ],
                            ),
                          ),
                          const SizedBox(height: 5),
                          TournamentTopTeams(rankings: topTeams),
                          const SizedBox(height: 15),
                          GestureDetector(
                            onTap: () {
                              Navigator.pushNamedAndRemoveUntil(
                                  context, "/picklists", (route) => false);
                            },
                            child: const Row(
                              children: const [
                                Text("Picklist",
                                    style: const TextStyle(
                                      fontSize: 17.0,
                                    )),
                                Icon(Icons.chevron_right),
                              ],
                            ),
                          ),
                          GridView.count(
                            crossAxisCount: 2,
                            crossAxisSpacing: 8,
                            mainAxisSpacing: 5,
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            childAspectRatio: 2.3,
                            children: const [
                              PicklistCard(
                                  rank: "First Pick", ReportedUser: "John Doe"),
                              PicklistCard(
                                  rank: "Second Pick",
                                  ReportedUser: "Jane Smith"),
                            ],
                          ),
                          const SizedBox(height: 15),
                          GestureDetector(
                            onTap: () {
                              Navigator.pushNamedAndRemoveUntil(
                                  context, "/scouters", (route) => false);
                            },
                            child: const Row(
                              children: const [
                                Text("Scouters",
                                    style: const TextStyle(
                                      fontSize: 17.0,
                                    )),
                                Icon(Icons.chevron_right),
                              ],
                            ),
                          ),
                          GridView.count(
                            crossAxisCount: 2,
                            crossAxisSpacing: 8,
                            mainAxisSpacing: 5,
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            childAspectRatio: 2.5,
                            children: const [
                              ScouterUpNextCard(
                                  ScouterName: "John Doe",
                                  ScouterUpIn: "In 2 hours"),
                              ScouterUpNextCard(
                                  ScouterName: "Jane Smith",
                                  ScouterUpIn: "In 4 hours"),
                            ],
                          ),
                          const SizedBox(height: 15),
                          GestureDetector(
                            onTap: () {
                              Navigator.pushNamedAndRemoveUntil(
                                  context, "/match_schedule", (route) => false);
                            },
                            child: const Row(
                              children: const [
                                Text("Upcoming Entered Tournaments",
                                    style: const TextStyle(
                                      fontSize: 17.0,
                                    )),
                                Icon(Icons.chevron_right),
                              ],
                            ),
                          ),
                          const SizedBox(height: 15),
                          const Text(
                            "Upcoming Tournaments This Week",
                            style: TextStyle(fontSize: 17),
                          ),
                          const SizedBox(height: 8),
                          UpcomingWeekTournaments(api: widget.api),
                        ]),

                    /*
              text(tournment name)
              text number satus with status with arrow
              row of 3 value tiles
              
              
              team matches icons->
              match scheduls, match
              schedul match

              text(teams ->)
              row of 2 icons with teams number, icons, rank, last match, ranking points
              row of 2 icons with teams number, icons, rank, last match, ranking points


              text(picklist ->)
              row of 2 icons, first pick and second pick

              Scouters ->
              row of 2 tiles, both has their names(or number if on diff team), with a text of what ever

              tournments ->
              box with name and city and tiem in left
              box with name and city and tiem in left



              */
                  ],
                ),
    );
  }

  SizedBox versionText() {
    return SizedBox(
      height: 42,
      child: Center(
        child: FutureBuilder(
            future: PackageInfo.fromPlatform(),
            builder: (context, snapshot) => snapshot.hasData
                ? Text(
                    "Version ${snapshot.data!.version} • Build ${snapshot.data!.buildNumber}",
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: const Color(0xFFB8B8B8),
                        ),
                    textAlign: TextAlign.center,
                  )
                : Container()),
      ),
    );
  }

  EmphasizedContainer customApiConfig(BuildContext context) {
    return EmphasizedContainer(
        child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // const SizedBox(width: 7),
        Text(
          "URL",
          style: Theme.of(context).textTheme.labelLarge,
        ),
        Text(
          lovatAPI.baseUrl,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.bodyMedium!.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
        const SizedBox(height: 10),
        FilledButton(
          onPressed: () async {
            final prefs = await SharedPreferences.getInstance();

            await prefs.setString('api_base_url', kDefaultBaseUrl);

            lovatAPI.baseUrl = kDefaultBaseUrl;

            if (mounted && context.mounted) {
              Navigator.of(context)
                  .pushNamedAndRemoveUntil("/loading", (route) => false);
            }
          },
          style: const ButtonStyle(visualDensity: VisualDensity.compact),
          child: const Text("Use default server"),
        ),
      ],
    ));
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
      teamTournamentStatus = null;
      notices = [];
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

      if (!isCurrentLoad()) return;
      setState(() {
        t = tournament;
        team = teamNumber;
        teamTournamentStatus = status;
        notices = messages;
        topTeams = teams;
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
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 13, 10, 13),
                child: Text(
                  match1!.identity
                      .getLocalizedDescription(includeTournament: true),
                  style: Theme.of(context).textTheme.labelMedium,
                ),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.secondaryContainer,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                  match1!.isFinished
                      ? "Completed"
                      : isTeamMatch && teamNumber != null
                          ? "Up next for $teamNumber"
                          : "Up next",
                  style: TextStyle(
                      color:
                          Theme.of(context).colorScheme.onSecondaryContainer)),
            ),
            if (match1!.isScouted) const ScoutedFlag(),
            IconButton(
              onPressed: () {
                Navigator.of(context).pushNamed(
                  "/match_predictor",
                  arguments: {
                    'red1': match1!.red1.teamNumber.toString(),
                    'red2': match1!.red2.teamNumber.toString(),
                    'red3': match1!.red3.teamNumber.toString(),
                    'blue1': match1!.blue1.teamNumber.toString(),
                    'blue2': match1!.blue2.teamNumber.toString(),
                    'blue3': match1!.blue3.teamNumber.toString(),
                  },
                );
              },
              icon: const Icon(Icons.psychology),
              tooltip: "Match Predictor",
            ),
          ],
        ),
        AllianceRow(
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
        ),
        AllianceRow(
          alliance: Alliance.blue,
          items: [
            AllianceRowItem(
              matchIdentity: match1!.identity,
              longMatchKey: "${match1!.identity.toMediumKey()}_0",
              teamInfo: match1!.blue1,
            ),
            AllianceRowItem(
              matchIdentity: match1!.identity,
              longMatchKey: "${match1!.identity.toMediumKey()}_1",
              teamInfo: match1!.blue2,
            ),
            AllianceRowItem(
              matchIdentity: match1!.identity,
              longMatchKey: "${match1!.identity.toMediumKey()}_2",
              teamInfo: match1!.blue3,
            ),
          ],
          isScoutingLead: true,
        ),
      ],
    );
  }
}

class NoUpcomingTeamMatches extends StatelessWidget {
  const NoUpcomingTeamMatches({super.key});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 192,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: [
          const Column(
            children: [
              Expanded(
                  child: ColoredBox(
                      color: Color(0xFF321D20), child: SizedBox.expand())),
              Expanded(
                  child: ColoredBox(
                      color: Color(0xFF1C203B), child: SizedBox.expand())),
            ],
          ),
          Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                "No more upcoming matches for your team",
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: Colors.white, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
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
    if (topFour.isEmpty) {
      return const Text("Rankings are not available for this tournament yet.");
    }
    const colors = [
      Color(0xFF263B53),
      Color(0xFF234338),
      Color(0xFF4C3038),
      Color(0xFF494027),
    ];
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 8,
        mainAxisSpacing: 5,
        mainAxisExtent: 82,
      ),
      itemCount: topFour.length,
      itemBuilder: (context, index) {
        final team = topFour[index];
        final rank = team.rank!;
        final suffix = rank % 100 >= 11 && rank % 100 <= 13
            ? "th"
            : {1: "st", 2: "nd", 3: "rd"}[rank % 10] ?? "th";
        return TeamCard(
          teamNumber: team.number.toString(),
          rank: "$rank$suffix",
          score: team.rankingPoints == null
              ? "RP unavailable"
              : "${team.rankingPoints} RP",
          color: colors[index],
          image: team.avatar,
        );
      },
    );
  }
}

class TeamCard extends StatelessWidget {
  const TeamCard({
    super.key,
    required this.teamNumber,
    required this.rank,
    required this.score,
    required this.color,
    this.image,
  });

  final String teamNumber;
  final String rank;
  final String score;
  final Color color;
  final String? image;

  Widget teamImage() {
    const fallback = Icon(Icons.groups, color: Colors.white70, size: 30);
    final avatar = image;
    if (avatar == null || !avatar.startsWith("data:image/")) return fallback;
    try {
      return Image.memory(
        base64Decode(avatar.substring(avatar.indexOf(',') + 1)),
        fit: BoxFit.contain,
        errorBuilder: (context, error, stackTrace) => fallback,
        semanticLabel: "Team $teamNumber image",
      );
    } on FormatException {
      return fallback;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        children: [
          SizedBox(width: 36, height: 36, child: teamImage()),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(teamNumber,
                    style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.white)),
                Text(score,
                    style:
                        const TextStyle(fontSize: 12, color: Colors.white70)),
              ],
            ),
          ),
          Text(rank, style: const TextStyle(fontSize: 16, color: Colors.white)),
        ],
      ),
    );
  }
}

class PicklistCard extends StatelessWidget {
  const PicklistCard({
    super.key,
    required this.rank,
    required this.ReportedUser,
  });

  final String rank;
  final String ReportedUser;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(0, 16, 16, 16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.start,
          children: [
            Text(
              rank,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.bold,
              ),
            ),
            Text(
              ReportedUser,
              style: const TextStyle(
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ScouterUpNextCard extends StatelessWidget {
  const ScouterUpNextCard({
    super.key,
    required this.ScouterName,
    required this.ScouterUpIn,
  });

  final String ScouterName;
  final String ScouterUpIn;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    ScouterName,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    ScouterUpIn,
                    style: TextStyle(
                      fontSize: 10,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
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

class EnterUpTournamentCard extends StatelessWidget {
  const EnterUpTournamentCard(
      {super.key,
      required this.EnterUpTournName,
      required this.EnterUpTournDate,
      required this.EnterUpTournlocal});

  final String EnterUpTournName;
  final String EnterUpTournDate;
  final String EnterUpTournlocal;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      EnterUpTournName,
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const Spacer(),
            Row(
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      EnterUpTournDate,
                      style: const TextStyle(
                        fontSize: 10,
                        overflow: TextOverflow.ellipsis,
                      ),
                      maxLines: 2,
                    ),
                  ],
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      EnterUpTournlocal,
                      style: const TextStyle(
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

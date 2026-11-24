import 'package:scouting_dashboard_app/reusable/app_tab_bar.dart';
import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/pages/match_schedule.dart';
import 'package:scouting_dashboard_app/pages/team_lookup/team_lookup.dart';
import 'package:scouting_dashboard_app/reusable/friendly_error_view.dart';
import 'package:scouting_dashboard_app/reusable/images/city_photo.dart';
import 'package:scouting_dashboard_app/reusable/tournament_banner.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_matches.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_tournaments.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_user_profile.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/scouter_schedule/get_scouter_schedule.dart';
import 'package:scouting_dashboard_app/reusable/models/scout_schedule.dart';
import 'package:scouting_dashboard_app/reusable/navigation_drawer.dart';
import 'package:scouting_dashboard_app/reusable/scrollable_page_body.dart';
import 'package:scouting_dashboard_app/reusable/stale_data.dart';
import 'package:scouting_dashboard_app/reusable/upcoming_tournaments.dart';
import 'package:scouting_dashboard_app/reusable/team_card.dart';
import 'package:scouting_dashboard_app/reusable/team_search.dart';
export 'package:scouting_dashboard_app/reusable/team_card.dart' show TeamCard;
import 'package:scouting_dashboard_app/reusable/upcoming_team_tournaments.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_team_rankings.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_tournament_status.dart';
import 'package:url_launcher/url_launcher.dart';

// Set to true to show the team's upcoming entered tournaments on Home.
const bool showUpcomingEnteredTournaments = false;

class HomePage extends StatefulWidget {
  const HomePage({super.key, this.api, this.teamLookupBuilder, this.now});

  final LovatAPI? api;

  /// Builds the team lookup shown after a search; defaults to
  /// [TeamLookupView]. Tests replace it to avoid live requests.
  final Widget Function(int team)? teamLookupBuilder;

  /// Clock for the out-of-date check; tests replace it.
  final DateTime Function()? now;

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
  int? nextMatchOrdinal;
  TeamTournamentStatus? teamTournamentStatus;
  List<TeamRanking> topTeams = [];
  Tournament? selectedTournament;
  ServerScoutSchedule? schedule;
  CityPhoto? cityPhoto;
  String? cityPhotoLocation;
  String initials = '';
  bool searching = false;

  /// Team shown in place of the home content after a search.
  int? lookupTeam;
  final searchController = TextEditingController();
  final scaffoldKey = GlobalKey<ScaffoldState>();

  /// When the shown data finished loading, and whether the tournament was
  /// being played then. Old data is only flagged during a live tournament.
  DateTime? loadedAt;
  bool tournamentLive = false;
  bool refreshing = false;
  Timer? staleCheck;

  DateTime get now => widget.now?.call() ?? DateTime.now();

  bool get dataStale =>
      !refreshing &&
      isDataStale(loadedAt: loadedAt, live: tournamentLive, now: now);

  /// Reloads without hiding the page; used by pull to refresh.
  Future<void> refresh() => fetchData(keepContent: true);

  @override
  void initState() {
    super.initState();
    searchController.addListener(() => setState(() {}));
    Tournament.currentChanges.addListener(_onTournamentChanged);
    fetchData();
    // Re-check whether the data has aged past [staleAfter].
    staleCheck = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted && tournamentLive) setState(() {});
    });
  }

  void _onTournamentChanged() {
    fetchData();
  }

  @override
  void dispose() {
    Tournament.currentChanges.removeListener(_onTournamentChanged);
    searchController.dispose();
    staleCheck?.cancel();
    super.dispose();
  }

  /// Closes search and any team lookup, returning to the home content.
  void closeSearch() {
    setState(() {
      searching = false;
      lookupTeam = null;
      searchController.clear();
    });
  }

  /// Shows team lookup for [team] on this page, under the search bar.
  void openTeam(int team) {
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      lookupTeam = team;
      searchController.text = '$team';
    });
  }

  /// While searching or looking up a team, show search results unless the
  /// field still holds the team being shown.
  bool get showingResults {
    final query = searchController.text.trim();
    return searching && query.isNotEmpty && query != lookupTeam?.toString();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !searching,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) closeSearch();
      },
      child: Theme(
        data: Theme.of(context).copyWith(
          textTheme: Theme.of(context).textTheme.apply(fontFamily: 'Heebo'),
        ),
        child: Builder(
            builder: (context) => Scaffold(
                  key: scaffoldKey,
                  appBar: HomeTopBar(
                    initials: initials,
                    searching: searching,
                    controller: searchController,
                    onAvatarPressed: () =>
                        scaffoldKey.currentState?.openDrawer(),
                    onSearchOpened: () => setState(() => searching = true),
                    onSearchClosed: closeSearch,
                    onSubmitted: (value) {
                      final team = int.tryParse(value.trim());
                      if (team != null && team > 0) openTeam(team);
                    },
                  ),
                  drawer: const GlobalNavigationDrawer(),
                  bottomNavigationBar: const AppTabBar(current: AppTab.home),
                  body: showingResults
                      ? TeamSearchResults(
                          query: searchController.text,
                          teams: topTeams,
                          onSelected: openTeam,
                        )
                      : searching && lookupTeam != null
                          ? KeyedSubtree(
                              key: ValueKey('lookup-$lookupTeam'),
                              child:
                                  widget.teamLookupBuilder?.call(lookupTeam!) ??
                                      TeamLookupView(team: lookupTeam!),
                            )
                          : error != null
                              ? FriendlyErrorView(
                                  errorMessage: error, onRetry: fetchData)
                              : !dataLoaded
                                  ? const Center(
                                      child: CircularProgressIndicator())
                                  : Stack(
                                      children: [
                                        RefreshIndicator(
                                          // Only offered while the tournament is
                                          // being played; see tournamentIsLive.
                                          notificationPredicate:
                                              (notification) =>
                                                  tournamentLive &&
                                                  notification.depth == 0,
                                          color: const Color(0xFFB59AFF),
                                          onRefresh: refresh,
                                          // Lets a mouse drag pull to refresh
                                          // on desktop, like a trackpad.
                                          child: ScrollConfiguration(
                                            behavior:
                                                ScrollConfiguration.of(context)
                                                    .copyWith(dragDevices: {
                                              ...ScrollConfiguration.of(context)
                                                  .dragDevices,
                                              PointerDeviceKind.mouse,
                                            }),
                                            child: ScrollablePageBody(
                                              physics:
                                                  const AlwaysScrollableScrollPhysics(),
                                              padding:
                                                  const EdgeInsets.fromLTRB(
                                                      26, 10, 26, 26),
                                              children: [
                                                Column(
                                                    crossAxisAlignment:
                                                        CrossAxisAlignment
                                                            .stretch,
                                                    children: [
                                                      if (t != null)
                                                        TournamentBanner(
                                                          tournament: t!,
                                                          api: widget.api ??
                                                              lovatAPI,
                                                          onPhotoResolved:
                                                              (photo,
                                                                  location) {
                                                            setState(() {
                                                              cityPhoto = photo;
                                                              cityPhotoLocation =
                                                                  location;
                                                            });
                                                          },
                                                        )
                                                      else
                                                        const Text(
                                                            "No Selected Tournament"),
                                                      const SizedBox(
                                                          height: 10),
                                                      for (final notice
                                                          in notices)
                                                        Padding(
                                                          padding:
                                                              const EdgeInsets
                                                                  .only(
                                                                  bottom: 8),
                                                          child: Text(notice),
                                                        ),
                                                      if (notices.isNotEmpty)
                                                        Align(
                                                          alignment: Alignment
                                                              .centerLeft,
                                                          child: TextButton(
                                                            onPressed:
                                                                fetchData,
                                                            child: const Text(
                                                                "Retry unavailable data"),
                                                          ),
                                                        ),
                                                      GestureDetector(
                                                        onTap: team == null
                                                            ? null
                                                            : () {
                                                                Navigator.of(
                                                                        context)
                                                                    .pushNamed(
                                                                        "/team_lookup",
                                                                        arguments: {
                                                                      'team':
                                                                          team
                                                                    });
                                                              },
                                                        child: Row(
                                                          children: [
                                                            Text(
                                                              team == null
                                                                  ? "Team status"
                                                                  : "$team's status",
                                                              style:
                                                                  const TextStyle(
                                                                fontSize: 20,
                                                                height: 1.6,
                                                                fontWeight:
                                                                    FontWeight
                                                                        .w500,
                                                              ),
                                                            ),
                                                            if (team !=
                                                                null) ...const [
                                                              SizedBox(
                                                                  width: 3),
                                                              HomeSectionChevron(),
                                                            ],
                                                          ],
                                                        ),
                                                      ),
                                                      const SizedBox(height: 8),
                                                      Row(
                                                          spacing: 10,
                                                          mainAxisAlignment:
                                                              MainAxisAlignment
                                                                  .spaceEvenly,
                                                          children: [
                                                            Expanded(
                                                                child: HomeStatusTile(
                                                                    label: const Text(
                                                                        "Rank"),
                                                                    value: Text(teamTournamentStatus?.rank ==
                                                                            null
                                                                        ? "N/A"
                                                                        : ordinal(
                                                                            teamTournamentStatus!.rank!)))),
                                                            Expanded(
                                                                child: HomeStatusTile(
                                                                    label: const Text(
                                                                        "Ranking points"),
                                                                    value: Text((teamTournamentStatus?.rankingPoints ??
                                                                            "N/A")
                                                                        .toString()))),
                                                            Expanded(
                                                                child: HomeStatusTile(
                                                                    label: const Text(
                                                                        "Matches played"),
                                                                    value: Text(
                                                                        "${teamTournamentStatus?.matchesPlayed ?? 'N/A'} of ${teamTournamentStatus?.matchesTotal ?? 'N/A'}"))),
                                                          ]),
                                                      const SizedBox(
                                                          height: 10),
                                                      GestureDetector(
                                                        onTap: () {
                                                          Navigator
                                                              .pushNamedAndRemoveUntil(
                                                                  context,
                                                                  "/match_schedule",
                                                                  (route) =>
                                                                      false);
                                                        },
                                                        child: const Row(
                                                          children: [
                                                            Text("Matches",
                                                                style:
                                                                    TextStyle(
                                                                  fontSize: 20,
                                                                  height: 1.6,
                                                                  fontWeight:
                                                                      FontWeight
                                                                          .w500,
                                                                )),
                                                            SizedBox(width: 3),
                                                            HomeSectionChevron(),
                                                          ],
                                                        ),
                                                      ),
                                                      const SizedBox(height: 8),
                                                      HomePageMatch(
                                                          match1: match1),
                                                      const SizedBox(
                                                          height: 14),
                                                      HomePageMatch(
                                                        match1: match2,
                                                        isTeamMatch: true,
                                                        teamNumber: team,
                                                      ),
                                                      const SizedBox(
                                                          height: 10),
                                                      GestureDetector(
                                                        onTap: () {
                                                          Navigator.pushNamed(
                                                              context,
                                                              "/tournament_teams",
                                                              arguments: {
                                                                "tournament": t,
                                                                "api":
                                                                    widget.api
                                                              });
                                                        },
                                                        child: const Row(
                                                          children: [
                                                            Text("Teams",
                                                                style:
                                                                    TextStyle(
                                                                  fontSize: 20,
                                                                  height: 1.6,
                                                                  fontWeight:
                                                                      FontWeight
                                                                          .w500,
                                                                )),
                                                            SizedBox(width: 3),
                                                            HomeSectionChevron(),
                                                          ],
                                                        ),
                                                      ),
                                                      const SizedBox(height: 8),
                                                      TournamentTopTeams(
                                                          rankings: topTeams),
                                                      const SizedBox(
                                                          height: 10),
                                                      GestureDetector(
                                                        onTap: () {
                                                          Navigator
                                                              .pushNamedAndRemoveUntil(
                                                                  context,
                                                                  "/scouters",
                                                                  (route) =>
                                                                      false);
                                                        },
                                                        child: const Row(
                                                          children: [
                                                            Text("Scouters",
                                                                style:
                                                                    TextStyle(
                                                                  fontSize: 20,
                                                                  height: 1.6,
                                                                  fontWeight:
                                                                      FontWeight
                                                                          .w500,
                                                                )),
                                                            SizedBox(width: 3),
                                                            HomeSectionChevron(),
                                                          ],
                                                        ),
                                                      ),
                                                      const SizedBox(height: 8),
                                                      HomeScouters(
                                                        schedule: schedule,
                                                        nextMatchOrdinal:
                                                            nextMatchOrdinal,
                                                      ),
                                                      if (showUpcomingEnteredTournaments) ...[
                                                        const SizedBox(
                                                            height: 10),
                                                        GestureDetector(
                                                          onTap: () {
                                                            Navigator
                                                                .pushNamedAndRemoveUntil(
                                                                    context,
                                                                    "/match_schedule",
                                                                    (route) =>
                                                                        false);
                                                          },
                                                          child: const Row(
                                                            children: [
                                                              Text(
                                                                  "Upcoming Entered Tournaments",
                                                                  style:
                                                                      TextStyle(
                                                                    fontSize:
                                                                        20,
                                                                    height: 1.6,
                                                                    fontWeight:
                                                                        FontWeight
                                                                            .w500,
                                                                  )),
                                                              SizedBox(
                                                                  width: 3),
                                                              HomeSectionChevron(),
                                                            ],
                                                          ),
                                                        ),
                                                        const SizedBox(
                                                            height: 8),
                                                        UpcomingTeamTournaments(
                                                            api: widget.api),
                                                      ],
                                                      const SizedBox(
                                                          height: 10),
                                                      const Text(
                                                        "Tournaments this week",
                                                        style: TextStyle(
                                                            fontSize: 20,
                                                            height: 1.6,
                                                            fontWeight:
                                                                FontWeight
                                                                    .w500),
                                                      ),
                                                      const SizedBox(height: 8),
                                                      UpcomingWeekTournaments(
                                                          api: widget.api),
                                                      if (cityPhoto !=
                                                          null) ...[
                                                        const SizedBox(
                                                            height: 24),
                                                        Align(
                                                          alignment: Alignment
                                                              .centerRight,
                                                          child: TextButton(
                                                            style: TextButton
                                                                .styleFrom(
                                                              padding:
                                                                  const EdgeInsets
                                                                      .symmetric(
                                                                      vertical:
                                                                          2),
                                                              minimumSize:
                                                                  Size.zero,
                                                              tapTargetSize:
                                                                  MaterialTapTargetSize
                                                                      .shrinkWrap,
                                                              visualDensity:
                                                                  VisualDensity
                                                                      .compact,
                                                            ),
                                                            onPressed: () =>
                                                                launchUrl(Uri.parse(
                                                                    cityPhoto!
                                                                        .source)),
                                                            child: Text(
                                                              cityPhotoLocation ==
                                                                      null
                                                                  ? 'Photo: ${cityPhoto!.credit}'
                                                                  : 'Photo of $cityPhotoLocation: ${cityPhoto!.credit}',
                                                              textAlign:
                                                                  TextAlign
                                                                      .right,
                                                              style:
                                                                  const TextStyle(
                                                                      fontSize:
                                                                          10,
                                                                      height:
                                                                          1.2),
                                                            ),
                                                          ),
                                                        ),
                                                      ],
                                                    ]),
                                              ],
                                            ),
                                          ),
                                        ),
                                        Positioned(
                                          top: 8,
                                          left: 0,
                                          right: 0,
                                          child: Center(
                                            child: StaleDataBanner(
                                              visible: dataStale,
                                              onRefresh: refresh,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                )),
      ),
    );
  }

  /// Loads Home's data. With [keepContent], the current page stays on screen
  /// while reloading and a failed reload keeps it rather than showing an
  /// error page.
  Future<void> fetchData({bool keepContent = false}) async {
    if (!mounted) return;
    final generation = ++_loadGeneration;
    bool isCurrentLoad() => mounted && generation == _loadGeneration;
    keepContent = keepContent && dataLoaded && error == null;
    if (keepContent) {
      setState(() => refreshing = true);
    } else {
      setState(() {
        dataLoaded = false;
        loadedAt = null;
        tournamentLive = false;
        error = null;
        t = Tournament.currentSync;
        match1 = null;
        match2 = null;
        nextMatchOrdinal = null;
        teamTournamentStatus = null;
        notices = [];
        schedule = null;
        cityPhoto = null;
        cityPhotoLocation = null;
      });
    }

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
      if (isCurrentLoad()) {
        setState(() => initials = profileInitials(profile.username));
      }
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
      // Saved selections only keep the key and name; the live check needs
      // the event dates, so look them up when they are missing.
      var event = tournament;
      if (tournament.date == null) {
        try {
          final found =
              await api.getTournaments(filter: tournament.key).timeout(timeout);
          for (final candidate in found.tournaments) {
            if (candidate.key == tournament.key) event = candidate;
          }
        } catch (_) {
          // Without dates the live check falls back to the match schedule.
        }
      }
      final teamMatches = matches.where((match) =>
          match.allTeamInfo.any((info) => info.teamNumber == teamNumber));
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
        nextMatchOrdinal = nextMatchIndex < 0 ? null : nextMatchIndex + 1;
        final current = selectHomeMatch(matches);
        match1 = current;
        // When the team is in the match being played, show its following one.
        match2 = selectHomeMatch(
            teamMatches.where((match) => !identical(match, current)),
            includeLastCompleted: false);
        dataLoaded = true;
        loadedAt = now;
        tournamentLive = tournamentIsLive(event, matches, now);
        refreshing = false;
      });
    } catch (e) {
      if (!mounted || !isCurrentLoad()) return;
      if (keepContent) {
        setState(() => refreshing = false);
        ScaffoldMessenger.maybeOf(context)?.showSnackBar(const SnackBar(
            content: Text("Couldn't refresh. Pull down to try again.")));
        return;
      }
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

/// 1 -> "1st", 2 -> "2nd", 11 -> "11th", 23 -> "23rd".
String ordinal(int n) {
  final lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return '${n}th';
  return switch (n % 10) {
    1 => '${n}st',
    2 => '${n}nd',
    3 => '${n}rd',
    _ => '${n}th',
  };
}

/// Badge text for a home match card.
String homeMatchBadge(MatchScheduleMatch match,
    {required bool isTeamMatch, int? teamNumber}) {
  if (match.isFinished) return "Completed";
  if (isTeamMatch) {
    return teamNumber == null ? "Next for your team" : "Next for $teamNumber";
  }
  return "Now playing";
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
                            color: const Color(0xFF424242),
                            borderRadius: BorderRadius.circular(5),
                          ),
                          child: Text(
                            homeMatchBadge(match1!,
                                    isTeamMatch: isTeamMatch,
                                    teamNumber: teamNumber)
                                .toUpperCase(),
                            style: const TextStyle(
                              fontSize: 10,
                              height: 1,
                              letterSpacing: 0.4,
                              fontWeight: FontWeight.w500,
                              color: Color(0xFFE0E0E0),
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

/// A scouter whose next shift has not started yet.
class UpcomingScouter {
  const UpcomingScouter({required this.scout, required this.matchesAway});

  final Scout scout;

  /// Matches between the one being played and the start of the shift.
  final int matchesAway;
}

/// Scouters who are off duty for [currentMatchOrdinal], ordered by how soon
/// their next shift starts. Shift ranges are one-based and inclusive.
List<UpcomingScouter> upcomingScouters(
    ScoutSchedule schedule, int currentMatchOrdinal) {
  List<Scout> scoutsIn(ScoutingShift shift) => [
        ...shift.team1,
        ...shift.team2,
        ...shift.team3,
        ...shift.team4,
        ...shift.team5,
        ...shift.team6,
      ];

  final onDuty = <String>{};
  final soonest = <String, UpcomingScouter>{};
  for (final shift in schedule.shifts) {
    final scouts = scoutsIn(shift);
    if (shift.start <= currentMatchOrdinal &&
        currentMatchOrdinal <= shift.end) {
      onDuty.addAll(scouts.map((scout) => scout.id));
    } else if (shift.start > currentMatchOrdinal) {
      final away = shift.start - currentMatchOrdinal;
      for (final scout in scouts) {
        final existing = soonest[scout.id];
        if (existing == null || away < existing.matchesAway) {
          soonest[scout.id] = UpcomingScouter(scout: scout, matchesAway: away);
        }
      }
    }
  }
  return soonest.values
      .where((scouter) => !onDuty.contains(scouter.scout.id))
      .toList()
    ..sort((a, b) {
      final order = a.matchesAway.compareTo(b.matchesAway);
      return order != 0 ? order : a.scout.name.compareTo(b.scout.name);
    });
}

/// "Collin Cameron" -> "Collin C".
String shortScouterName(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.length < 2 || parts.last.isEmpty) return name.trim();
  return '${parts.first} ${parts.last[0]}';
}

class HomeScouters extends StatelessWidget {
  const HomeScouters({
    super.key,
    required this.schedule,
    required this.nextMatchOrdinal,
  });

  final ServerScoutSchedule? schedule;

  /// One-based play order of the match being played, if any remain.
  final int? nextMatchOrdinal;

  @override
  Widget build(BuildContext context) {
    final String? emptyText;
    var scouters = <UpcomingScouter>[];
    if (schedule == null) {
      emptyText = "The scouter schedule is unavailable.";
    } else if (nextMatchOrdinal == null) {
      emptyText = "No upcoming matches.";
    } else {
      scouters = upcomingScouters(schedule!, nextMatchOrdinal!);
      emptyText = scouters.isEmpty ? "No more scouting shifts." : null;
    }
    if (emptyText != null) {
      return HomeScouterCard(title: emptyText);
    }
    final shown = scouters.take(2).toList();
    return Row(
      spacing: 10,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final scouter in shown)
          Expanded(
            child: HomeScouterCard(
              title: shortScouterName(scouter.scout.name),
              subtitle: scouter.matchesAway == 1
                  ? "Up in 1 match"
                  : "Up in ${scouter.matchesAway} matches",
            ),
          ),
        if (shown.length == 1) const Expanded(child: SizedBox()),
      ],
    );
  }
}

class HomeScouterCard extends StatelessWidget {
  const HomeScouterCard({super.key, required this.title, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(7),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 16,
              height: 18 / 16,
              fontWeight: FontWeight.w500,
              color: Color(0xFFE0E0E0),
            ),
          ),
          if (subtitle != null)
            Text(
              subtitle!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 10, color: Color(0xFFB8B8B8)),
            ),
        ],
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

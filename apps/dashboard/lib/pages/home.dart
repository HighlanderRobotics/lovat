import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_team_rankings.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_tournament_status.dart';

String teamnum = "empty";

class HomePage extends StatefulWidget {
  const HomePage({Key? key}) : super(key: key);

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  bool dataLoaded = false;
  bool colorsReady = false;

  Tournament? t;
  int? team;
  String? error;
  MatchScheduleMatch? match1;
  MatchScheduleMatch? match2;
  List<ConfiguredPicklistMeta>? sharedPicklists;
  List<MutablePicklistMeta>? mutablePicklists;
  TeamTournamentStatus? teamTournamentStatus;
  List<TeamRanking>? topTeams = [];
  List<dynamic> displayPicklists = [];
  Tournament? selectedTournament;

  

  @override
  void initState() {
    super.initState();
    fetchData();
  }

  @override
  Widget build(BuildContext context) {
    return dataLoaded ? Scaffold(
      appBar: AppBar(
        title:  Text(t?.localized ?? "No Selected Tournament"),
        //actions: const [CodeViewerButton()],
      ),
      drawer: const GlobalNavigationDrawer(),
      body: ScrollablePageBody(
        children: [
          Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(selectedTournament?.localized ?? "Tournament Name",
                style: Theme.of(context).textTheme.titleLarge),
            SizedBox(height: 16),

            GestureDetector(
              onTap: () {
                Navigator.pushNamedAndRemoveUntil(
                    context, "/team_lookup", (route) => false);
              },
              child: Row(
                children: [
                  Text("$teamnum's status",
                      style: TextStyle(
                        fontSize: 17.0,
                      )),
                  Icon(Icons.chevron_right),
                ],
              ),
            ),
            SizedBox(height: 5),
            Row(
                spacing: 8,
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                   Expanded(
                      child:
                          ValueTile(label: const Text("Rank"), value: Text((topTeams?[0].rank ?? "N/A").toString()))),
                  const Expanded(
                      child: ValueTile(label: Text("RP"), value: Text("10"))),
                  const Expanded(
                      child: ValueTile(
                          label: Text("Matches Played"), value: Text("5/12"))),
                ]),
            SizedBox(height: 15),
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
            //HomePageMatch(match1: ),
            SizedBox(height: 5),
            Text("Insert current match"),
            SizedBox(height: 5),
            HomePageMatch(match1: match1),
            
            Text(
                "Insert next match for the team(idk if the current match is for the team)"),
              
            SizedBox(height: 15),
            GestureDetector(
              onTap: () {
                Navigator.pushNamedAndRemoveUntil(
                    context, "/team_lookup", (route) => false);
              },
              child: Row(
                children: [
                  Text("Teams",
                      style: TextStyle(
                        fontSize: 17.0,
                      )),
                  Icon(Icons.chevron_right),
                ],
              ),
            ),
            SizedBox(height: 5),
            GridView.count(
              crossAxisCount: 2,
              crossAxisSpacing: 8,
              mainAxisSpacing: 5,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 2.8,
              children: [
                TeamCard(
                    teamNumber: "1234",
                    rank: "1st",
                    score: "100 RP",
                    color: Colors.blue,
                    image: "assets/images/8033_logo.png"),
                TeamCard(
                    teamNumber: "5678",
                    rank: "2nd",
                    score: "80 RP",
                    color: Colors.green,
                    image: "assets/images/8033_logo.png"),
                TeamCard(
                    teamNumber: "9012",
                    rank: "3rd",
                    score: "60 RP",
                    color: Colors.red,
                    image: "assets/images/8033_logo.png"),
                TeamCard(
                    teamNumber: "3456",
                    rank: "4th",
                    score: "50 RP",
                    color: Colors.yellow,
                    image: "assets/images/8033_logo.png")
              ],
            ),
            SizedBox(height: 15),
            GestureDetector(
              onTap: () {
                Navigator.pushNamedAndRemoveUntil(
                    context, "/picklists", (route) => false);
              },
              child: Row(
                children: [
                  Text("Picklist",
                      style: TextStyle(
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
              children: [
                PicklistCard(rank: "First Pick", ReportedUser: "John Doe"),
                PicklistCard(rank: "Second Pick", ReportedUser: "Jane Smith"),
              ],
            ),

            SizedBox(height: 15),
            GestureDetector(
              onTap: () {
                Navigator.pushNamedAndRemoveUntil(
                    context, "/scouters", (route) => false);
              },
              child: Row(
                children: [
                  Text("Scouters",
                      style: TextStyle(
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
              children: [
                ScouterUpNextCard(
                    ScouterName: "John Doe", ScouterUpIn: "In 2 hours"),
                ScouterUpNextCard(
                    ScouterName: "Jane Smith", ScouterUpIn: "In 4 hours"),
              ],
            ),
            SizedBox(height: 15),
            GestureDetector(
              onTap: () {
                Navigator.pushNamedAndRemoveUntil(
                    context, "/match_schedule", (route) => false);
              },
              child: Row(
                children: [
                  Text("Upcoming Entered Tournaments",
                      style: TextStyle(
                        fontSize: 17.0,
                      )),
                  Icon(Icons.chevron_right),
                ],
              ),
            ),

            SizedBox(height: 15),
            GestureDetector(
              onTap: () {
                Navigator.pushNamedAndRemoveUntil(
                    context, "/match_schedule", (route) => false);
              },
              child: Row(
                children: [
                  Text("Upcoming Tournaments This Week",
                      style: TextStyle(
                        fontSize: 17.0,
                      )),
                  Icon(Icons.chevron_right),
                ],
              ),
            ),

            SizedBox(height: 8),
            UpTournamentCard(
                UpTournName: "San Francisco District Championship 2026",
                UpTournDate: "2026",
                UpTournlocal: "CA"),
            SizedBox(height: 8),
            UpTournamentCard(
                UpTournName: "Insert a upcoming tournament",
                UpTournDate: "2026",
                UpTournlocal: "NY"),
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
     //) : FriendlyErrorView(onRetry: () async => await fetchData());
    ) : const Center(child: CircularProgressIndicator());
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
    try {
      setState(() {
        error = null;
      });
      final t = await Tournament.getCurrent();
      if (t == null) {
        setState(() {
          error = "No Tournament Selected";
        });
        return;
      }
      final teams = await lovatAPI.getTeamRankings(t.key);
      final profile = await lovatAPI.getUserProfile();
      final thisTeamNumber = profile.team?.number;
      final matches = await lovatAPI.getMatches(
        t!.key,
      );
      final teamMatches = await lovatAPI.getMatches(t.key,);
      
      final teamTournamentStatus = await lovatAPI.getTeamTournamentStatus(
        team: thisTeamNumber!,
        tournamentKey: t.key,
      );

      topTeams = teams;
      setState(() {
        this.t = t;
        this.teamTournamentStatus = teamTournamentStatus;
        team = thisTeamNumber;
         List<MatchScheduleMatch> upcoming = matches.where((match) {
          return !match.isFinished;
        }).toList();
        match1 = upcoming.isNotEmpty ? upcoming[0] : null;

        List<MatchScheduleMatch> upcomingTeam = teamMatches.where((match) {
          return !match.isFinished;
        }).toList();
        match2 = upcomingTeam.isNotEmpty ? upcomingTeam[1] : null;

        this.topTeams!.sort((a, b) => a.rank!.compareTo(b.rank!));
      dataLoaded = true;
      });
    } on LovatAPIException catch (e) {
      // Handle LovatAPIException here 
      setState(() {
        error = e.message;
      });
    }
   catch (_) {}
  }
}

class HomePageMatch extends StatelessWidget {
  const HomePageMatch({
    super.key,
    required this.match1,
  });

  final MatchScheduleMatch? match1;

  @override
  Widget build(BuildContext context) {
    return Column(
      
      children: [
        /*Container(
      width: double.infinity,
    decoration: BoxDecoration(
    color: const Color(0xFF292929),
    borderRadius: BorderRadius.circular(14),
    border: const Border(
      bottom: BorderSide(
        color: Color(0xFF454B70),
        width: 3,
      ),
    ),
  ),
  padding: const EdgeInsets.symmetric(
    horizontal: 20,
    vertical: 4,
  ),
  child: Row(
    children: [
      Text(
        (topTeams?[0]. ?? "N/A").toString(),
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: Colors.white.withValues(alpha: 0.85),
        ),
      ),
      const SizedBox(width: 14),
      Container(
        padding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 10,
        ),
        decoration: BoxDecoration(
          color: const Color(0xFF414141),
          borderRadius: BorderRadius.circular(10),
        ),
        child: const Text(
          "NOW PLAYING",
          style: TextStyle(
            fontSize: 8,
           fontWeight: FontWeight.w600,
            letterSpacing: 0.5,
            color: Color(0xFFD6D6D6),
          ),
        ),
      ),
      const Spacer(),
      Icon(
        Icons.chevron_right,
        size: 18,
        color: Colors.white.withValues(alpha: 0.9),
      ),
    ],
  ),
),*/
      Row(
                            children: [
                              Padding(
                                padding:
                                    const EdgeInsets.fromLTRB(10, 13, 10, 13),
                                child: Text(
                                  match1!.identity.getLocalizedDescription(
                                      includeTournament: true),
                                  style:
                                      Theme.of(context).textTheme.labelMedium,
                                ),
                              ),
                              if (match1!.isScouted) const ScoutedFlag(),
                              const Spacer(),
                              IconButton(
                                onPressed: () {
                                  Navigator.of(context).pushNamed(
                                    "/match_predictor",
                                    arguments: {
                                      'red1': match1!.red1.teamNumber.toString(),
                                      'red2': match1!.red2.teamNumber.toString(),
                                      'red3': match1!.red3.teamNumber.toString(),
                                      'blue1':
                                          match1!.blue1.teamNumber.toString(),
                                      'blue2':
                                          match1!.blue2.teamNumber.toString(),
                                      'blue3':
                                          match1!.blue3.teamNumber.toString(),
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

class TeamCard extends StatefulWidget {
  const TeamCard({
    super.key,
    required this.teamNumber,
    required this.rank,
    required this.score,
    required this.color,
    required this.image,
  });

  final String teamNumber;
  final String rank;
  final String score;
  final Color color;
  final String image;

  @override
  State<TeamCard> createState() => _TeamCardState();
}

class _TeamCardState extends State<TeamCard> {
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: widget.color,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        children: [
          // Team logo
          Container(
            width: 30,
            height: 30,
            margin: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: widget.color,
              borderRadius: BorderRadius.circular(3),
            ),
            child: Image.asset(
              widget.image,
              fit: BoxFit.cover,
            ),
          ),

          // Team number + score
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.teamNumber,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  widget.score,
                  style: TextStyle(
                    fontSize: 8,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),

          // Ranking number
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Text(
              widget.rank,
              style: TextStyle(
                fontSize: 12,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
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

class UpTournamentCard extends StatelessWidget {
  const UpTournamentCard(
      {super.key,
      required this.UpTournName,
      required this.UpTournDate,
      required this.UpTournlocal});

  final String UpTournName;
  final String UpTournDate;
  final String UpTournlocal;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Row(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  UpTournName,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            Spacer(),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  UpTournDate,
                  style: TextStyle(
                    fontSize: 10,
                  ),
                ),
                Text(
                  UpTournlocal,
                  style: TextStyle(
                    fontSize: 10,
                  ),
                ),
              ],
            )
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
        padding: EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      EnterUpTournName,
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            Spacer(),
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
                SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      EnterUpTournlocal,
                      style: TextStyle(
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









 

 


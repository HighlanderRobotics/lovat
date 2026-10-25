import 'dart:convert';

import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/models/team.dart';

extension GetTeamTournamentStatus on LovatAPI {
Future<TeamTournamentStatus> getTeamTournamentStatus(
{required String tournamentKey, required num team}) async {
final response = await get(
'/v1/manager/team-tournament-status',
query: {
'tournamentKey': tournamentKey,
'teamNumber': team.toString(),
},
);

if (response?.statusCode != 200) {
throw Exception('Failed to get tournament status');
}

final json = jsonDecode(response!.body) as Map<String, dynamic>;
return TeamTournamentStatus.fromJson(json);
}
}

class TeamTournamentStatus {
final int rankingPoints;
final Team team;
final int rank;
final int matchesPlayed;
final int matchesTotal;

const TeamTournamentStatus({
required this.rankingPoints,
required this.matchesPlayed,
required this.matchesTotal,
required this.rank,
required this.team,
});

static TeamTournamentStatus fromJson(Map<String, dynamic> json) {
return TeamTournamentStatus(
rankingPoints: json["rankingPoints"],
matchesPlayed: json["matchesPlayed"],
matchesTotal: json["matchesTotal"],
rank: json['rank'],
team: Team(name: json['name'], number: json['number']));
}
}

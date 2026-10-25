import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';

extension GetTeamRankings on LovatAPI {
  Future<List<TeamRanking>> getTeamRankings(String tournamentKey) async {
    final response =
        await get("/v1/manager/tournament/$tournamentKey/rankedTeams");

    if (response?.statusCode == 404) return [];

    if (response?.statusCode != 200) {
      debugPrint(response?.body ?? '');
      throw Exception('Failed to get team rankings at tournament');
    }

    final json = jsonDecode(response!.body) as List<dynamic>;

    return json.map((e) => TeamRanking.fromJson(e)).toList();
  }
}

class TeamRanking {
  const TeamRanking({
    required this.matchesPlayed,
    required this.number,
    required this.rank,
    required this.rankingPoints,
    this.avatar,
  });

  final int? matchesPlayed;
  final int number;
  final int? rank;
  final int? rankingPoints;
  final String? avatar;

  /// Events may not have rankings yet; keep unranked teams at the end.
  static int compareByRank(TeamRanking a, TeamRanking b) {
    final aRank = a.rank;
    final bRank = b.rank;
    if (aRank == null) return bRank == null ? 0 : 1;
    if (bRank == null) return -1;
    return aRank.compareTo(bRank);
  }

  factory TeamRanking.fromJson(Map<String, dynamic> json) => TeamRanking(
        number: json['number'],
        matchesPlayed: json['matchesPlayed'],
        rank: json['rank'],
        rankingPoints: json['rankingPoints'],
        avatar: json['avatar'] as String?,
      );
}

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_tournament_status.dart';

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

    final teams = json.map((e) => TeamRanking.fromJson(e)).toList();
    if (teams.isEmpty || teams.any((team) => (team.rank ?? 0) > 0)) {
      return teams;
    }
    // Older backends provide ranks through the per-team status endpoint.
    final cache = _fallbackRankings[this] ??= {};
    final cacheKey = '$baseUrl/$tournamentKey';
    final existing = cache[cacheKey];
    if (existing != null &&
        DateTime.now().difference(existing.created) <
            const Duration(minutes: 1)) {
      return List.of(await existing.request);
    }
    final request = _loadStatusRankings(tournamentKey, teams);
    cache[cacheKey] = _FallbackRankings(DateTime.now(), request);
    final result = await request;
    if (!result.any((team) => (team.rank ?? 0) > 0)) cache.remove(cacheKey);
    return List.of(result);
  }

  Future<List<TeamRanking>> _loadStatusRankings(
      String tournamentKey, List<TeamRanking> teams) async {
    final results = teams.toList();
    var nextIndex = 0;
    final deadline = DateTime.now().add(const Duration(seconds: 20));
    Future<void> worker() async {
      while (nextIndex < teams.length && DateTime.now().isBefore(deadline)) {
        final index = nextIndex++;
        final team = teams[index];
        try {
          final remaining = deadline.difference(DateTime.now());
          final status = await getTeamTournamentStatus(
            tournamentKey: tournamentKey,
            team: team.number,
          ).timeout(remaining < const Duration(seconds: 5)
              ? remaining
              : const Duration(seconds: 5));
          if (status != null) {
            results[index] = TeamRanking(
              number: team.number,
              rank: status.rank,
              rankingPoints: status.rankingPoints,
              matchesPlayed: status.matchesPlayed,
              avatar: team.avatar,
            );
          }
        } catch (_) {
          // A missing rank must not hide this team or the rest of the roster.
        }
      }
    }

    await Future.wait(List.generate(4, (_) => worker()));
    return results;
  }
}

final _fallbackRankings = Expando<Map<String, _FallbackRankings>>();

class _FallbackRankings {
  const _FallbackRankings(this.created, this.request);
  final DateTime created;
  final Future<List<TeamRanking>> request;
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

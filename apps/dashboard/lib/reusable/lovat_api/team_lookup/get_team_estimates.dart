import 'dart:convert';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/stale_refresh_builder.dart';

class TeamEstimateMatch {
  const TeamEstimateMatch(
      {required this.matchKey,
      required this.label,
      required this.tournamentName,
      required this.totalPoints,
      this.scoutAverage,
      this.ocrAdjustment});
  final String matchKey, label, tournamentName;
  final num totalPoints;
  final num? scoutAverage, ocrAdjustment;
  factory TeamEstimateMatch.fromJson(Map<String, dynamic> json) =>
      TeamEstimateMatch(
          matchKey: json['matchKey'],
          label: json['label'],
          tournamentName: json['tournamentName'],
          totalPoints: json['totalPoints'],
          scoutAverage: json['scoutAverage'],
          ocrAdjustment: json['ocrAdjustment']);
}

class TeamEstimates {
  const TeamEstimates(
      {required this.team,
      required this.sampleCount,
      required this.matches,
      this.averagePoints,
      this.autoPoints,
      this.teleopPoints});
  final int team, sampleCount;
  final num? averagePoints, autoPoints, teleopPoints;
  final List<TeamEstimateMatch> matches;
  factory TeamEstimates.fromJson(Map<String, dynamic> json) {
    if (json['scoreSource'] != 'combined') {
      throw const LovatAPIException(
          'OCR estimates are unavailable on this server');
    }
    return TeamEstimates(
        team: json['team'],
        sampleCount: json['sampleCount'],
        averagePoints: json['averagePoints'],
        autoPoints: json['autoPoints'],
        teleopPoints: json['teleopPoints'],
        matches: (json['matches'] as List<dynamic>)
            .map((m) => TeamEstimateMatch.fromJson(m as Map<String, dynamic>))
            .toList());
  }
}

extension GetTeamEstimates on LovatAPI {
  CachedQuery<TeamEstimates> teamEstimatesQuery(int team) {
    final path = '/v1/analysis/estimates/team/$team';
    return CachedQuery(
        queryKey: ['teamOcrEstimates', team],
        label: 'OCR estimates',
        queryFn: () async {
          final response = await get(path);
          if (response?.statusCode != 200) {
            throw const LovatAPIException('Could not load OCR estimates');
          }
          return TeamEstimates.fromJson(
              jsonDecode(response!.body) as Map<String, dynamic>);
        },
        cacheReader: () => getCachedData(path,
            parser: (json) =>
                TeamEstimates.fromJson(json as Map<String, dynamic>)),
        cacheTimestampReader: () => getCachedTimestamp(path));
  }
}

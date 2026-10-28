import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_alliance_analysis.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/stale_refresh_builder.dart';

class MatchPrediction {
  const MatchPrediction({
    required this.redWinning,
    required this.blueWinning,
    required this.redAlliance,
    required this.blueAlliance,
  });

  final num? redWinning;
  final num? blueWinning;
  final AllianceAnalysis redAlliance;
  final AllianceAnalysis blueAlliance;

  factory MatchPrediction.fromJson(Map<String, dynamic> json) {
    return MatchPrediction(
      redWinning: json['redWinning'] as num?,
      blueWinning: json['blueWinning'] as num?,
      redAlliance: AllianceAnalysis.fromJson(
        json['redAlliance'] as Map<String, dynamic>,
      ),
      blueAlliance: AllianceAnalysis.fromJson(
        json['blueAlliance'] as Map<String, dynamic>,
      ),
    );
  }
}

extension MatchPredictionQuery on LovatAPI {
  CachedQuery<MatchPrediction> matchPredictionQuery(
    int red1,
    int red2,
    int red3,
    int blue1,
    int blue2,
    int blue3, {
    bool estimatesOnly = false,
  }) {
    const path = '/v1/analysis/matchprediction';
    final query = {
      'red1': red1.toString(),
      'red2': red2.toString(),
      'red3': red3.toString(),
      'blue1': blue1.toString(),
      'blue2': blue2.toString(),
      'blue3': blue3.toString(),
      if (estimatesOnly) 'scoreSource': 'combined',
    };
    MatchPrediction parsePrediction(dynamic value) {
      final json = value as Map<String, dynamic>;
      if (estimatesOnly && json['scoreSource'] != 'combined') {
        throw const LovatAPIException(
          'OCR + report estimates are not available on this server',
        );
      }
      return MatchPrediction.fromJson(json);
    }

    return CachedQuery(
      queryKey: [
        'matchPrediction',
        red1,
        red2,
        red3,
        blue1,
        blue2,
        blue3,
        estimatesOnly
      ],
      label: 'match prediction',
      queryFn: () async {
        final response = await get(path, query: query);

        if (response?.statusCode != 200) {
          debugPrint(response?.body ?? '');
          throw Exception('Failed to get match prediction');
        }

        if (response?.body == 'not enough data') {
          throw const LovatAPIException('Not enough data');
        }

        return parsePrediction(jsonDecode(response!.body));
      },
      cacheReader: () => getCachedData(
        path,
        query: query,
        parser: parsePrediction,
      ),
      cacheTimestampReader: () => getCachedTimestamp(path, query: query),
    );
  }
}

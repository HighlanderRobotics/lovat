import 'dart:convert';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/stale_refresh_builder.dart';

class OcrSample {
  const OcrSample(this.time, this.count);
  final int time, count;
  factory OcrSample.fromJson(Map<String, dynamic> json) =>
      OcrSample(json['time'], json['count']);
}

int? ocrCountAt(List<OcrSample> samples, int time) {
  OcrSample? previous;
  for (final sample in samples) {
    if (sample.time > time) break;
    previous = sample;
  }
  return previous == null || time - previous.time > 3 ? null : previous.count;
}

class OcrMatchTeam {
  const OcrMatchTeam(this.number, this.alliance, this.scoutAverage,
      this.adjustment, this.total);
  final int number;
  final String alliance;
  final num? scoutAverage, adjustment, total;
  factory OcrMatchTeam.fromJson(Map<String, dynamic> json) => OcrMatchTeam(
      json['teamNumber'],
      json['alliance'],
      json['scoutAverage'],
      json['ocrAdjustment'],
      json['totalPoints']);
}

class OcrMatchData {
  const OcrMatchData(
      {required this.available,
      required this.matchKey,
      this.label = '',
      this.tournamentName = '',
      this.redScore,
      this.blueScore,
      this.red = const [],
      this.blue = const [],
      this.teams = const []});
  final bool available;
  final String matchKey, label, tournamentName;
  final num? redScore, blueScore;
  final List<OcrSample> red, blue;
  final List<OcrMatchTeam> teams;
  factory OcrMatchData.fromJson(Map<String, dynamic> json) {
    if (json['available'] is! bool) {
      throw const LovatAPIException(
          'OCR timeline is unavailable on this server');
    }
    List<OcrSample> samples(String color) =>
        (json['timeline']?[color] as List<dynamic>? ?? [])
            .map((r) => OcrSample.fromJson(r as Map<String, dynamic>))
            .toList();
    return OcrMatchData(
        available: json['available'],
        matchKey: json['matchKey'],
        label: json['label'] ?? '',
        tournamentName: json['tournamentName'] ?? '',
        redScore: json['redScore'],
        blueScore: json['blueScore'],
        red: samples('red'),
        blue: samples('blue'),
        teams: (json['teams'] as List<dynamic>? ?? [])
            .map((r) => OcrMatchTeam.fromJson(r as Map<String, dynamic>))
            .toList());
  }
}

extension GetOcrMatch on LovatAPI {
  CachedQuery<OcrMatchData> ocrMatchQuery(String key) {
    final path = '/v1/analysis/estimates/match/${Uri.encodeComponent(key)}';
    return CachedQuery(
        queryKey: ['ocrMatch', key],
        label: 'OCR match',
        queryFn: () async {
          final response = await get(path);
          if (response?.statusCode != 200) {
            throw const LovatAPIException('Could not load OCR match');
          }
          return OcrMatchData.fromJson(
              jsonDecode(response!.body) as Map<String, dynamic>);
        },
        cacheReader: () => getCachedData(path,
            parser: (json) =>
                OcrMatchData.fromJson(json as Map<String, dynamic>)),
        cacheTimestampReader: () => getCachedTimestamp(path));
  }
}

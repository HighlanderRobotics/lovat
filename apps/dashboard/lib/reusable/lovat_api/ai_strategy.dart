import 'dart:convert';

import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';

class StrategyTeam {
  const StrategyTeam(this.number, this.alliance, this.reportCount, [this.name]);
  final String? name;
  final int number;
  final String alliance;
  final int reportCount;
}

class StrategyContext {
  StrategyContext.fromJson(Map<String, dynamic> json)
      : isExample = json['isExample'] == true,
        matchKey = json['match']['key'] as String,
        teamNumber = json['teamNumber'] as int,
        reportCount = json['reportCount'] as int,
        collectedAt = DateTime.parse(json['collectedAt'] as String),
        teams = (json['teams'] as List<dynamic>)
            .map((team) => StrategyTeam(
                team['teamNumber'] as int,
                team['alliance'] as String,
                team['reportCount'] as int,
                team['name'] as String?))
            .toList(),
        localPrompt = json['localPrompt'] as String?,
        draft = json['draft'] as String?;

  final bool isExample;
  final String matchKey;
  final int teamNumber;
  final int reportCount;
  final DateTime collectedAt;
  final List<StrategyTeam> teams;
  final String? localPrompt;
  final String? draft;

  StrategyContext withDraft(String text) => StrategyContext.fromJson({
        'isExample': isExample,
        'match': {'key': matchKey},
        'teamNumber': teamNumber,
        'reportCount': reportCount,
        'collectedAt': collectedAt.toIso8601String(),
        'teams': teams
            .map((team) => {
                  'teamNumber': team.number,
                  'alliance': team.alliance,
                  'reportCount': team.reportCount,
                  'name': team.name,
                })
            .toList(),
        'localPrompt': localPrompt,
        'draft': text,
      });
}

extension AiStrategyApi on LovatAPI {
  Future<StrategyContext> getStrategyContext(String tournamentKey,
      {bool example = false, bool local = false}) async {
    final response = await get(
      example
          ? '/v1/manager/ai-strategy-example'
          : '/v1/manager/ai-strategy/${Uri.encodeComponent(tournamentKey)}',
      query: {if (local) 'local': 'true'},
    ).timeout(const Duration(seconds: 30));
    return _parseStrategy(response?.statusCode, response?.body);
  }

  Future<StrategyContext> draftStrategy(String tournamentKey,
      {required String matchKey,
      required String briefing,
      bool example = false}) async {
    final response = await post(
      example
          ? '/v1/manager/ai-strategy-example'
          : '/v1/manager/ai-strategy/${Uri.encodeComponent(tournamentKey)}',
      body: {'matchKey': matchKey, 'briefing': briefing},
    ).timeout(const Duration(seconds: 60));
    return _parseStrategy(response?.statusCode, response?.body);
  }
}

StrategyContext _parseStrategy(int? status, String? body) {
  dynamic json;
  try {
    json = jsonDecode(body ?? '');
  } catch (_) {
    throw const LovatAPIException('Unable to load AI strategy. Please retry.');
  }
  if (status != 200) {
    throw LovatAPIException(json is Map && json['message'] is String
        ? json['message'] as String
        : 'Unable to load AI strategy. Please retry.');
  }
  return StrategyContext.fromJson(json as Map<String, dynamic>);
}

import 'dart:convert';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';

class UpcomingTeamTournament {
  const UpcomingTeamTournament(
      {required this.key, required this.name, this.city, this.week});
  final String key;
  final String name;
  final String? city;
  final int? week;
}

extension GetUpcomingTeamTournaments on LovatAPI {
  Future<List<UpcomingTeamTournament>> getUpcomingTeamTournaments() async {
    final response = await get('/v1/manager/upcoming-entered-tournaments');
    if (response?.statusCode != 200) {
      throw Exception('Could not load entered tournaments');
    }
    return (jsonDecode(response!.body) as List)
        .map((event) => UpcomingTeamTournament(
              key: event['key'] as String,
              name: event['name'] as String,
              city: event['city'] as String?,
              week: event['week'] as int?,
            ))
        .toList();
  }
}

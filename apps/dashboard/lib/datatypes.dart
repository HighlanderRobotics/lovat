import 'package:flutter/material.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_matches.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_teams_at_tournament.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:scouting_dashboard_app/reusable/models/team.dart';
import 'package:shared_preferences/shared_preferences.dart';

class Tournament {
  Tournament(this.key, this._name,
      {this.date, this.endDate, this.location, this.isParticipant = false});

  String key;
  String _name;
  DateTime? date;
  DateTime? endDate;
  String? location;
  bool isParticipant;

  String get localized => date?.year == DateTime.now().year
      ? _name
      : "${date?.year ?? ''} $_name".trim();

  static Tournament? _currentCache;

  /// Notify open pages after the active tournament is saved or cleared.
  static final ValueNotifier<Tournament?> currentChanges = ValueNotifier(null);

  @override
  String toString() => localized;

  factory Tournament.fromJson(Map<String, dynamic> json) {
    final date =
        DateTime.tryParse((json['startDate'] ?? json['date']) as String? ?? '');
    return Tournament(
      json['key'],
      json['name'],
      date: date,
      endDate: DateTime.tryParse(json['endDate'] as String? ?? ''),
      location: json['location'] as String?,
      isParticipant: json['isParticipant'] as bool? ?? false,
    );
  }

  Future<void> storeAsCurrent() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('tournament', key);
    await prefs.setString('tournament_localized', localized);
    _currentCache = this;
    currentChanges.value = this;
  }

  static Tournament? get currentSync => _currentCache;

  static Future<Tournament?> getCurrent() async {
    if (_currentCache != null) return _currentCache;

    final prefs = await SharedPreferences.getInstance();
    final key = prefs.getString('tournament');
    final name = prefs.getString('tournament_localized');

    if (key == null || name == null) {
      return null;
    }

    _currentCache = Tournament(key, name);
    return _currentCache;
  }

  static Future<void> clearCurrent() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('tournament');
    await prefs.remove('tournament_localized');
    _currentCache = null;
    currentChanges.value = null;
  }

  Future<List<MatchScheduleMatch>> getMatches() async {
    return await lovatAPI.getMatches(key);
  }

  Future<List<Team>> getTeams() async {
    return await lovatAPI.getTeamsAtTournament(key);
  }
}

extension ListSpaceBetweenExtension on List<Widget> {
  List<Widget> withWidgetBetween(Widget separator) => [
        for (int i = 0; i < length; i++) ...[
          if (i > 0) separator,
          this[i],
        ],
      ];

  List<Widget> withSpaceBetween({double? width, double? height}) =>
      withWidgetBetween(SizedBox(width: width, height: height));
}

extension NumListExtension on List<num> {
  num sum() => isEmpty ? 0 : reduce((value, element) => value + element);

  num average() => sum() / length;
}

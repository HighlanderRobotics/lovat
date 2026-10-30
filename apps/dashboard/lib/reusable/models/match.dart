import 'package:flutter/material.dart';

class GameMatchIdentity {
  GameMatchIdentity(
    this.type,
    this.number,
    this.tournamentKey, {
    this.tournamentName,
  });

  String tournamentKey;
  String? tournamentName;
  MatchType type;
  int number;

  String get localizedTournament => tournamentName ?? tournamentKey;

  /// Create a shorter user-readable description of the match
  String getShortLocalizedDescription() =>
      "${type.shortName.toUpperCase()}$number";

  String getSpecificName() {
    if (type == MatchType.qualifier) {
      return "Qualifier $number";
    }
    String bracket = "";
    String round = "";

    if ([1, 2, 3, 4, 7, 8, 11, 12].contains(number)) {
      bracket = "Upper Bracket - ";
    } else if (number < 14) {
      bracket = "Lower Bracket - ";
    }

    if (number < 5) {
      round = "Round 1";
    } else if (number <= 8) {
      round = "Round 2";
    } else if (number <= 10) {
      round = "Round 3";
    } else if (number <= 12) {
      round = "Round 4";
    } else if (number == 13) {
      round = "Round 5";
    } else {
      round = "Finals";
    }

    return round != "Finals"
        ? "Match $number - $bracket$round"
        : "Match $number - $round ${number - 13}";
  }

  /// Create a user-readable description of the match
  String getLocalizedDescription({
    bool includeType = true,
    bool includeNumber = true,
    bool includeTournament = true,
    bool abbreviateName = false,
  }) {
    final typedMatchName =
        abbreviateName ? getShortLocalizedDescription() : getSpecificName();

    if (includeType && !includeNumber && !includeTournament) {
      return "${type.localizedDescriptionPlural} match";
    }
    if (includeType && !includeNumber && includeTournament) {
      return "${type.localizedDescriptionPlural} match at $localizedTournament";
    }
    if (includeType && includeNumber && !includeTournament) {
      return typedMatchName;
    }
    if (!includeType && includeNumber && includeTournament) {
      return "Match #$number at $localizedTournament";
    }
    if (!includeType && includeNumber && !includeTournament) {
      return "Match #$number";
    }
    if (!includeType && !includeNumber && includeTournament) {
      return "Match at $localizedTournament";
    }
    if (!includeType && !includeNumber && !includeTournament) return "Match";
    if (includeType && includeNumber && includeTournament) {
      return "$typedMatchName at $localizedTournament";
    }

    return "Match";
  }

  /// Create a match from a long match key such as `2022cc_qm14_1`
  factory GameMatchIdentity.fromLongKey(String longKey,
      {String? tournamentName}) {
    List<String> elements = longKey.split("_");

    return GameMatchIdentity(
      MatchTypeExtension.fromShortName(
          elements[1].replaceAll(RegExp('\\d'), "")),
      int.parse(elements[1].replaceAll(RegExp('[a-zA-Z]'), "")),
      elements[0],
      tournamentName: tournamentName,
    );
  }

  String toMediumKey() => "${tournamentKey}_${type.shortName}$number";
}

enum MatchType {
  qualifier,
  elimination,
}

extension MatchTypeExtension on MatchType {
  String get otherName {
    switch (this) {
      case MatchType.qualifier:
        return "QUALIFICATION";
      case MatchType.elimination:
        return "ELIMINATION";
    }
  }

  String get localizedDescriptionPlural {
    switch (this) {
      case MatchType.qualifier:
        return "Qualifiers";
      case MatchType.elimination:
        return "Eliminations";
    }
  }

  String get localizedDescriptionSingular {
    switch (this) {
      case MatchType.qualifier:
        return "Qualifier";
      case MatchType.elimination:
        return "Elimination";
    }
  }

  String get shortName {
    switch (this) {
      case MatchType.qualifier:
        return "qm";
      case MatchType.elimination:
        return "em";
    }
  }

  IconData get icon {
    switch (this) {
      case MatchType.qualifier:
        return Icons.leaderboard_outlined;
      case MatchType.elimination:
        return Icons.emoji_events_outlined;
    }
  }

  static MatchType fromShortName(String shortName) =>
      MatchType.values.firstWhere((element) => element.shortName == shortName);

  static MatchType fromOtherName(String name) =>
      MatchType.values.firstWhere((element) => element.otherName == name);
}

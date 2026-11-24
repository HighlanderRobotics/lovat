import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_matches.dart';

/// How long Home's data stays fresh while a tournament is being played.
const staleAfter = Duration(minutes: 5);

DateTime _day(DateTime value) => DateTime(value.year, value.month, value.day);

/// Whether [tournament] is being played right now, which is the only time
/// Home warns about old data and offers pull to refresh.
///
/// - Not started: no match has finished yet, or the start date is ahead.
/// - Over: every match has finished, or the end date has passed.
/// - Otherwise it is live.
bool tournamentIsLive(
  Tournament? tournament,
  List<MatchScheduleMatch> matches,
  DateTime now,
) {
  final start = tournament?.date;
  final end = tournament?.endDate ?? start;
  if (start != null && _day(now).isBefore(_day(start))) return false;
  if (end != null && _day(now).isAfter(_day(end))) return false;
  final started = matches.any((match) => match.isFinished);
  final over = matches.isNotEmpty && matches.every((match) => match.isFinished);
  return started && !over;
}

/// Whether data loaded at [loadedAt] should be flagged as out of date.
bool isDataStale({
  required DateTime? loadedAt,
  required bool live,
  required DateTime now,
}) =>
    live && loadedAt != null && now.difference(loadedAt) >= staleAfter;

/// Small pill shown at the top of a page when its data may be out of date.
/// It slides in from the top; tapping it refreshes for mouse users who
/// cannot pull down.
class StaleDataBanner extends StatelessWidget {
  const StaleDataBanner({
    super.key,
    required this.visible,
    required this.onRefresh,
  });

  final bool visible;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) => IgnorePointer(
        ignoring: !visible,
        child: AnimatedSlide(
          offset: visible ? Offset.zero : const Offset(0, -1.5),
          duration: const Duration(milliseconds: 220),
          curve: visible ? Curves.easeOutCubic : Curves.easeInCubic,
          child: AnimatedOpacity(
            opacity: visible ? 1 : 0,
            duration: const Duration(milliseconds: 220),
            child: Semantics(
              button: true,
              label: 'Data may be out of date. Refresh',
              excludeSemantics: true,
              child: Material(
                color: const Color(0xFF353535),
                elevation: 4,
                shape: const StadiumBorder(
                    side: BorderSide(color: Color(0x14FFFFFF))),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: onRefresh,
                  child: const Padding(
                    padding: EdgeInsets.fromLTRB(12, 7, 14, 7),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(LucideIcons.refreshCw,
                            size: 15, color: Color(0xFFB59AFF)),
                        SizedBox(width: 8),
                        Text(
                          'Data may be out of date',
                          style: TextStyle(
                            fontSize: 13,
                            height: 16 / 13,
                            fontWeight: FontWeight.w500,
                            color: Color(0xFFE6E6E6),
                          ),
                        ),
                        SizedBox(width: 6),
                        Text(
                          'Pull to refresh',
                          style: TextStyle(
                            fontSize: 12,
                            height: 16 / 12,
                            color: Color(0xFF9A9A9A),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

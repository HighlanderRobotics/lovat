import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_team_rankings.dart';

const _accent = Color(0xFFB59AFF);
const _barBackground = Color(0xFF1F1F1F);
const _primaryText = Color(0xFFE6E6E6);
const _tertiaryText = Color(0xFF9A9A9A);

/// One row in the team search results.
class TeamSearchResult {
  const TeamSearchResult({required this.number, this.ranking});

  final int number;

  /// Present when the team is at the selected tournament.
  final TeamRanking? ranking;
}

/// Teams at the tournament whose number starts with [query], shortest numbers
/// first. A valid number that is not at the tournament is still offered first
/// so any team can be looked up.
List<TeamSearchResult> searchTeams(Iterable<TeamRanking> teams, String query) {
  final digits = query.trim();
  if (digits.isEmpty || int.tryParse(digits) == null) return [];
  final matches = teams
      .where((team) => team.number.toString().startsWith(digits))
      .toList()
    ..sort((a, b) => a.number.compareTo(b.number));
  final exact = int.parse(digits);
  return [
    if (exact > 0 && !matches.any((team) => team.number == exact))
      TeamSearchResult(number: exact),
    for (final team in matches)
      TeamSearchResult(number: team.number, ranking: team),
  ];
}

/// "Collin Cameron" -> "CC", "ted" -> "T".
String profileInitials(String? name) {
  final parts = (name ?? '')
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();
  if (parts.isEmpty) return '';
  final letters =
      parts.length == 1 ? parts.first[0] : '${parts.first[0]}${parts.last[0]}';
  return letters.toUpperCase();
}

/// The Rewrite design's home top bar: avatar, "Lovat" and a search action.
/// Opening search slides a "Search teams" field out from the search button;
/// closing slides it back in.
class HomeTopBar extends StatefulWidget implements PreferredSizeWidget {
  const HomeTopBar({
    super.key,
    required this.initials,
    required this.searching,
    required this.controller,
    required this.onAvatarPressed,
    required this.onSearchOpened,
    required this.onSearchClosed,
    required this.onSubmitted,
  });

  final String initials;
  final bool searching;
  final TextEditingController controller;
  final VoidCallback onAvatarPressed;
  final VoidCallback onSearchOpened;
  final VoidCallback onSearchClosed;
  final ValueChanged<String> onSubmitted;

  static const slideDuration = Duration(milliseconds: 240);

  @override
  Size get preferredSize => const Size.fromHeight(60);

  @override
  State<HomeTopBar> createState() => _HomeTopBarState();
}

class _HomeTopBarState extends State<HomeTopBar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _slide = AnimationController(
    vsync: this,
    duration: HomeTopBar.slideDuration,
    value: widget.searching ? 1 : 0,
  );
  late final Animation<double> _curve = CurvedAnimation(
    parent: _slide,
    curve: Curves.easeOutCubic,
    reverseCurve: Curves.easeInCubic,
  );
  final _focus = FocusNode();

  @override
  void didUpdateWidget(HomeTopBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.searching == oldWidget.searching) return;
    if (widget.searching) {
      _slide.forward();
      _focus.requestFocus();
    } else {
      _focus.unfocus();
      _slide.reverse();
    }
  }

  @override
  void dispose() {
    _slide.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Material(
        color: _barBackground,
        child: SafeArea(
          bottom: false,
          child: SizedBox(
            height: 60,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Row(
                children: [
                  SizedBox(
                    width: 62,
                    height: 44,
                    child: Center(
                      child: _Avatar(
                          initials: widget.initials,
                          onPressed: widget.onAvatarPressed),
                    ),
                  ),
                  Expanded(
                    child: AnimatedBuilder(
                      animation: _curve,
                      builder: (context, _) => Stack(
                        alignment: Alignment.center,
                        clipBehavior: Clip.none,
                        children: [
                          if (_curve.value < 1)
                            Opacity(
                              opacity: 1 - _curve.value,
                              child: const Text(
                                'Lovat',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontFamily: 'Heebo',
                                  fontSize: 30,
                                  fontWeight: FontWeight.w500,
                                  color: _accent,
                                ),
                              ),
                            ),
                          if (_curve.value > 0)
                            // Grows leftward from the search button's side.
                            Align(
                              alignment: Alignment.centerRight,
                              child: FractionallySizedBox(
                                widthFactor: _curve.value,
                                child: Opacity(
                                  opacity: Curves.easeOut
                                      .transform(_curve.value.clamp(0, 1)),
                                  child: _SearchField(
                                    controller: widget.controller,
                                    focusNode: _focus,
                                    autofocus: widget.searching,
                                    onSubmitted: widget.onSubmitted,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 62,
                    height: 44,
                    child: IconButton(
                      tooltip:
                          widget.searching ? 'Close search' : 'Search teams',
                      onPressed: widget.searching
                          ? widget.onSearchClosed
                          : widget.onSearchOpened,
                      icon: AnimatedSwitcher(
                        duration: HomeTopBar.slideDuration,
                        transitionBuilder: (child, animation) =>
                            RotationTransition(
                          turns: Tween<double>(begin: 0.75, end: 1)
                              .animate(animation),
                          child:
                              FadeTransition(opacity: animation, child: child),
                        ),
                        child: Icon(
                          widget.searching ? LucideIcons.x : LucideIcons.search,
                          key: ValueKey(widget.searching),
                          size: 24,
                          color: _primaryText,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.initials, required this.onPressed});

  final String initials;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: 'Menu',
        child: Material(
          color: const Color(0xFF353535),
          shape: const CircleBorder(side: BorderSide(color: Color(0x14FFFFFF))),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onPressed,
            child: SizedBox(
              width: 40,
              height: 40,
              child: Center(
                child: initials.isEmpty
                    ? const Icon(LucideIcons.user,
                        size: 22, color: _primaryText)
                    : Text(
                        initials,
                        style: const TextStyle(
                          fontSize: 15,
                          height: 1,
                          fontWeight: FontWeight.w500,
                          color: _primaryText,
                        ),
                      ),
              ),
            ),
          ),
        ),
      );
}

/// Matches the design's Field: 44pt tall, 8pt corners, a 2pt accent outline
/// (1pt border plus 1pt inner line), a 3pt accent glow and a dark fill.
class _SearchField extends StatelessWidget {
  const _SearchField({
    required this.controller,
    required this.focusNode,
    required this.autofocus,
    required this.onSubmitted,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool autofocus;
  final ValueChanged<String> onSubmitted;

  static const _text = TextStyle(
    fontFamily: 'Roboto',
    fontSize: 15,
    height: 22 / 15,
    fontWeight: FontWeight.w400,
    color: _primaryText,
  );

  @override
  Widget build(BuildContext context) => Container(
        height: 44,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        alignment: Alignment.centerLeft,
        decoration: BoxDecoration(
          // rgba(0,0,0,0.3) over the bar's #1F1F1F, kept opaque so the glow
          // does not tint the field.
          color: const Color(0xFF161616),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: _accent, width: 2),
          boxShadow: const [
            BoxShadow(color: Color(0x2EB59AFF), spreadRadius: 3),
          ],
        ),
        child: TextField(
          controller: controller,
          focusNode: focusNode,
          autofocus: autofocus,
          keyboardType: TextInputType.number,
          textInputAction: TextInputAction.search,
          onSubmitted: onSubmitted,
          cursorColor: _accent,
          cursorWidth: 1,
          cursorHeight: 17,
          style: _text,
          maxLines: 1,
          decoration: InputDecoration.collapsed(
            hintText: 'Search teams',
            hintStyle: _text.copyWith(color: _tertiaryText),
          ),
        ),
      );
}

/// Results shown under the top bar while searching.
class TeamSearchResults extends StatelessWidget {
  const TeamSearchResults({
    super.key,
    required this.query,
    required this.teams,
    required this.onSelected,
  });

  final String query;
  final List<TeamRanking> teams;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    final trimmed = query.trim();
    if (int.tryParse(trimmed) == null) {
      return const _SearchMessage('Team numbers only contain digits');
    }
    final results = searchTeams(teams, trimmed);
    if (results.isEmpty) {
      return const _SearchMessage('No matching teams');
    }
    return ListView.builder(
      itemCount: results.length,
      itemBuilder: (context, index) {
        final result = results[index];
        final ranking = result.ranking;
        final details = <String>[
          if ((ranking?.rank ?? 0) > 0) 'Rank ${ranking!.rank}',
          if (ranking?.rankingPoints != null) '${ranking!.rankingPoints} RP',
        ];
        return ListTile(
          leading: const Icon(LucideIcons.users),
          title: Text('${result.number}'),
          subtitle: Text(ranking == null
              ? 'Look up team'
              : details.isEmpty
                  ? 'At this tournament'
                  : details.join(' · ')),
          trailing: const Icon(LucideIcons.chevronRight),
          onTap: () => onSelected(result.number),
        );
      },
    );
  }
}

class _SearchMessage extends StatelessWidget {
  const _SearchMessage(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Text(text, style: const TextStyle(color: _tertiaryText)),
      );
}

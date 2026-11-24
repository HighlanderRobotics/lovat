import 'package:flutter/material.dart';
import 'package:scouting_dashboard_app/datatypes.dart';

const _accent = Color(0xFFB59AFF);
const _inactive = Color(0xFFB7B7B7);
const _blob = Color(0x2EB59AFF);

/// The Rewrite design's bottom tabs.
enum AppTab {
  home('Home', Icons.home_outlined, '/home'),
  scouting('Scouting', Icons.query_stats, '/match_schedule',
      needsTournament: true),
  forms('Forms', Icons.assignment_outlined, null),
  picklists('Picklists', Icons.format_list_numbered, '/picklists',
      needsTournament: true),
  strategy('Strategy', Icons.psychology_outlined, '/match_predictor_opener');

  const AppTab(this.label, this.icon, this.route,
      {this.needsTournament = false});

  final String label;
  final IconData icon;

  /// Page the tab opens; null while the page has not been built yet.
  final String? route;

  /// Whether the page only works once a tournament is selected.
  final bool needsTournament;
}

/// Bottom navigation shared by the top-level pages. [current] is highlighted.
class AppTabBar extends StatelessWidget {
  const AppTabBar({super.key, required this.current});

  final AppTab current;

  void _open(BuildContext context, AppTab tab) {
    if (tab == current) return;
    final messenger = ScaffoldMessenger.maybeOf(context);
    final route = tab.route;
    if (route == null) {
      messenger
        ?..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text('${tab.label} is coming soon.')));
      return;
    }
    if (tab.needsTournament && Tournament.currentSync == null) {
      messenger
        ?..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(
            content: Text('Choose a tournament in Settings first.')));
      return;
    }
    // Tabs switch in place instead of sliding like a pushed page.
    final builder =
        context.findAncestorWidgetOfExactType<MaterialApp>()?.routes?[route];
    if (builder == null) {
      Navigator.of(context).pushNamedAndRemoveUntil(route, (route) => false);
      return;
    }
    Navigator.of(context).pushAndRemoveUntil(
      PageRouteBuilder<void>(
        settings: RouteSettings(name: route),
        pageBuilder: (context, _, __) => builder(context),
        transitionDuration: Duration.zero,
        reverseTransitionDuration: Duration.zero,
      ),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(
          color: Color(0xFF1F1F1F),
          border: Border(top: BorderSide(color: Color(0xFF424242))),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                for (final tab in AppTab.values)
                  Expanded(
                    child: _TabItem(
                      tab: tab,
                      selected: tab == current,
                      onTap: () => _open(context, tab),
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
}

class _TabItem extends StatelessWidget {
  const _TabItem(
      {required this.tab, required this.selected, required this.onTap});

  final AppTab tab;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? _accent : _inactive;
    return Semantics(
      button: true,
      selected: selected,
      label: tab.label,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          height: 52,
          child: Center(
            // The blob sits behind the selected tab; text and icon keep the
            // same size and weight as the other tabs.
            child: AnimatedContainer(
              key: ValueKey('tab-blob-${tab.name}'),
              duration: const Duration(milliseconds: 150),
              curve: Curves.easeOut,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: selected ? _blob : const Color(0x00B59AFF),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(tab.icon, size: 24, color: color),
                  const SizedBox(height: 2),
                  Text(
                    tab.label,
                    maxLines: 1,
                    overflow: TextOverflow.visible,
                    style: TextStyle(
                      fontSize: 13,
                      height: 18 / 13,
                      fontWeight: FontWeight.w400,
                      color: color,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

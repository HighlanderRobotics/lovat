import 'package:flutter/material.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/reusable/images/city_photo.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_tournaments.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';
import 'package:url_launcher/url_launcher.dart';

class TournamentBanner extends StatefulWidget {
  const TournamentBanner({
    super.key,
    required this.tournament,
    required this.api,
  });
  final Tournament tournament;
  final LovatAPI api;

  @override
  State<TournamentBanner> createState() => _TournamentBannerState();
}

class _TournamentBannerState extends State<TournamentBanner> {
  late Future<CityPhoto?> _photo = _load();

  Future<CityPhoto?> _load() async {
    try {
      final tournament = widget.tournament;
      var location = tournament.location;
      // Older saved selections only retain key/name. Resolve their location
      // through the existing authenticated tournament endpoint after restart.
      if (location == null || location.trim().isEmpty) {
        final matches = await widget.api
            .getTournaments(filter: tournament.key)
            .timeout(const Duration(seconds: 8));
        for (final match in matches.tournaments) {
          if (match.key == tournament.key) location = match.location;
        }
      }
      return location == null ? null : await CityPhotoLookup().find(location);
    } catch (_) {
      return null;
    }
  }

  @override
  void didUpdateWidget(covariant TournamentBanner oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.tournament.key != widget.tournament.key ||
        oldWidget.tournament.location != widget.tournament.location ||
        oldWidget.api != widget.api) {
      _photo = _load();
    }
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) => FutureBuilder<CityPhoto?>(
          future: _photo,
          builder: (context, snapshot) {
            final photo = snapshot.connectionState == ConnectionState.done
                ? snapshot.data
                : null;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(7),
                  child: AspectRatio(
                    aspectRatio: constraints.maxWidth < 600 ? 2 : 3.48,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        ColoredBox(
                          color: Theme.of(context)
                              .colorScheme
                              .surfaceContainerHighest,
                        ),
                        if (photo != null)
                          Image.network(
                            photo.url,
                            fit: BoxFit.cover,
                            excludeFromSemantics: true,
                            errorBuilder: (_, __, ___) =>
                                const SizedBox.shrink(),
                          ),
                        const DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [Color(0x33000000), Color(0xCC000000)],
                            ),
                          ),
                        ),
                        Align(
                          alignment: Alignment.bottomLeft,
                          child: Padding(
                            padding: const EdgeInsets.all(18),
                            child: Text(
                              widget.tournament.localized,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: constraints.maxWidth < 600 ? 22 : 30,
                                height: 1.2,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                if (photo != null)
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () => launchUrl(Uri.parse(photo.source)),
                      child: Text(
                        'Photo: ${photo.credit}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      );
}

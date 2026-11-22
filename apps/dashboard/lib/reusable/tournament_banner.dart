import 'package:flutter/material.dart';
import 'package:scouting_dashboard_app/datatypes.dart';
import 'package:scouting_dashboard_app/reusable/images/city_photo.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_tournaments.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';

/// Reports the resolved city photo (and the location it was looked up for)
/// so the host page can show the credit in its own footer.
typedef CityPhotoResolved = void Function(CityPhoto? photo, String? location);

class TournamentBanner extends StatefulWidget {
  const TournamentBanner({
    super.key,
    required this.tournament,
    required this.api,
    this.onPhotoResolved,
  });
  final Tournament tournament;
  final LovatAPI api;
  final CityPhotoResolved? onPhotoResolved;

  @override
  State<TournamentBanner> createState() => _TournamentBannerState();
}

class _TournamentBannerState extends State<TournamentBanner> {
  late Future<CityPhoto?> _photo = _load();

  Future<CityPhoto?> _load() async {
    final key = widget.tournament.key;
    CityPhoto? photo;
    String? location;
    try {
      location = widget.tournament.location;
      // Older saved selections only retain key/name. Resolve their location
      // through the existing authenticated tournament endpoint after restart.
      if (location == null || location.trim().isEmpty) {
        final matches = await widget.api
            .getTournaments(filter: key)
            .timeout(const Duration(seconds: 8));
        for (final match in matches.tournaments) {
          if (match.key == key) location = match.location;
        }
      }
      if (location != null) photo = await CityPhotoLookup().find(location);
    } catch (_) {
      photo = null;
    }
    // Ignore results for a tournament this banner has already moved past.
    if (mounted && widget.tournament.key == key) {
      widget.onPhotoResolved?.call(photo, location);
    }
    return photo;
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
              ],
            );
          },
        ),
      );
}

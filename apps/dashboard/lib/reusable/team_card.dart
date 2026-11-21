import 'package:flutter/material.dart';
import 'package:scouting_dashboard_app/reusable/frc_team_colors.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/get_team_rankings.dart';

class TournamentTeamsGrid extends StatelessWidget {
  const TournamentTeamsGrid(
      {super.key, required this.rankings, this.shrinkWrap = false});
  final List<TeamRanking> rankings;
  final bool shrinkWrap;

  @override
  Widget build(BuildContext context) => GridView.builder(
        shrinkWrap: shrinkWrap,
        physics: shrinkWrap ? const NeverScrollableScrollPhysics() : null,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          mainAxisExtent: 53,
        ),
        itemCount: rankings.length,
        itemBuilder: (context, index) {
          final team = rankings[index];
          return TeamCard.fromRanking(team);
        },
      );
}

class TeamCard extends StatelessWidget {
  const TeamCard({
    super.key,
    required this.teamNumber,
    required this.rank,
    required this.score,
    required this.color,
    this.image,
  });

  factory TeamCard.fromRanking(TeamRanking team) => TeamCard(
        teamNumber: team.number.toString(),
        rank: (team.rank ?? 0) > 0 ? '${team.rank}' : '—',
        score: team.rankingPoints == null
            ? 'RP unavailable'
            : '${team.rankingPoints} RP${team.matchesPlayed == null ? '' : ' / ${team.matchesPlayed} QM'}',
        color: const Color(0xFF292929),
        image: team.avatar,
      );

  final String teamNumber;
  final String rank;
  final String score;
  final Color color;
  final String? image;

  Widget teamImage() {
    const fallback = Icon(Icons.groups, color: Colors.white70, size: 30);
    // Use the same avatar service as FRC Colors.
    return Image.network(
      'https://avatars.frc.sh/teams/${Uri.encodeComponent(teamNumber)}.png',
      fit: BoxFit.contain,
      semanticLabel: 'Team $teamNumber image',
      frameBuilder: (context, child, frame, synchronous) =>
          synchronous || frame != null ? child : fallback,
      errorBuilder: (context, error, stackTrace) => fallback,
    );
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Color?>(
        future: FrcTeamColors.instance.primaryColor(teamNumber),
        builder: (context, snapshot) {
          final primary = snapshot.connectionState == ConnectionState.done
              ? snapshot.data
              : null;
          const foreground = Color(0xFFE0E0E0);
          return Container(
            // The one-pixel border completes the design's seven-pixel inset.
            padding: const EdgeInsets.all(6),
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: const Color(0xFF292929),
              gradient: primary == null
                  ? null
                  : LinearGradient(
                      colors: [
                        Color.alphaBlend(primary.withValues(alpha: 0.45),
                            const Color(0xFF292929)),
                        const Color(0xFF292929),
                      ],
                    ),
              borderRadius: BorderRadius.circular(7),
              border: Border.all(color: const Color(0xFF404040)),
            ),
            child: Row(children: [
              Container(
                width: 38,
                height: 39,
                padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(
                  color: primary ?? color,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: teamImage(),
              ),
              const SizedBox(width: 7),
              Expanded(
                  child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    teamNumber,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontFamily: 'Heebo',
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                        height: 18 / 16,
                        color: foreground),
                  ),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(score,
                        style: const TextStyle(
                            fontFamily: 'Heebo',
                            fontSize: 10,
                            height: 1.5,
                            color: foreground)),
                  ),
                ],
              )),
              const SizedBox(width: 7),
              SizedBox(
                width: 39,
                height: 39,
                child: Center(
                    child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(rank,
                      style: const TextStyle(
                          fontFamily: 'Heebo',
                          fontWeight: FontWeight.w500,
                          fontSize: 24,
                          height: 32 / 24,
                          color: foreground)),
                )),
              ),
            ]),
          );
        },
      );
}

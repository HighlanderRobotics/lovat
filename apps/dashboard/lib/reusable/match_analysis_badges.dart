import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

class MatchAnalysisBadges extends StatelessWidget {
  const MatchAnalysisBadges(
      {super.key, required this.ocrAnalyzed, required this.fullyScouted});
  final bool ocrAnalyzed;
  final bool fullyScouted;
  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.primary;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      if (ocrAnalyzed)
        Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Tooltip(
                message: 'OCR analyzed',
                child: Semantics(
                    label: 'OCR analyzed',
                    child: SvgPicture.asset('assets/images/eye_tracking.svg',
                        width: 20,
                        height: 20,
                        colorFilter:
                            ColorFilter.mode(color, BlendMode.srcIn))))),
      if (fullyScouted)
        Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Tooltip(
                message: 'Fully scouted',
                child: Icon(Icons.fact_check_outlined,
                    size: 20, color: color, semanticLabel: 'Fully scouted'))),
    ]);
  }
}

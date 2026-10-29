import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

class MatchAnalysisBadges extends StatelessWidget {
  const MatchAnalysisBadges(
      {super.key,
      required this.ocrAnalyzed,
      required this.fullyScouted,
      this.scouted = false,
      this.onOcrPressed});
  final bool ocrAnalyzed, fullyScouted, scouted;
  final VoidCallback? onOcrPressed;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context), color = theme.colorScheme.primary;
    return Wrap(
        spacing: 6,
        runSpacing: 4,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          if (scouted)
            Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                decoration: BoxDecoration(
                    color: color, borderRadius: BorderRadius.circular(4)),
                child: Text('Scouted',
                    style: theme.textTheme.labelMedium
                        ?.copyWith(color: theme.colorScheme.onPrimary))),
          if (ocrAnalyzed)
            IconButton(
                tooltip: 'OCR analyzed',
                onPressed: onOcrPressed,
                visualDensity: VisualDensity.standard,
                constraints:
                    const BoxConstraints.tightFor(width: 40, height: 40),
                padding: const EdgeInsets.all(10),
                icon: SvgPicture.asset('assets/images/eye_tracking.svg',
                    width: 20,
                    height: 20,
                    semanticsLabel: 'OCR analyzed',
                    colorFilter: ColorFilter.mode(color, BlendMode.srcIn))),
          if (fullyScouted)
            SizedBox(
                width: 40,
                height: 40,
                child: Tooltip(
                    message: 'Fully scouted',
                    child: Icon(Icons.fact_check_outlined,
                        size: 20,
                        color: color,
                        semanticLabel: 'Fully scouted'))),
        ]);
  }
}

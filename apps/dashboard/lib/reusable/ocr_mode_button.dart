import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

class OcrModeButton extends StatelessWidget {
  const OcrModeButton(
      {super.key, required this.selected, required this.onPressed});
  final bool selected;
  final VoidCallback onPressed;
  @override
  Widget build(BuildContext context) => IconButton(
        tooltip: selected
            ? 'Use scout report scores'
            : 'Use OCR + report estimates only',
        isSelected: selected,
        onPressed: onPressed,
        icon: SvgPicture.asset('assets/images/eye_tracking.svg',
            width: 24,
            height: 24,
            colorFilter: ColorFilter.mode(
                selected
                    ? Theme.of(context).colorScheme.primary
                    : Theme.of(context).colorScheme.onSurfaceVariant,
                BlendMode.srcIn)),
      );
}

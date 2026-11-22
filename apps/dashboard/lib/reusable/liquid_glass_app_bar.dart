import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class LiquidGlassAppBar extends StatelessWidget implements PreferredSizeWidget {
  const LiquidGlassAppBar({super.key, required this.title});

  final Widget title;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight + 8);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final highContrast = MediaQuery.highContrastOf(context);
    final useUIKit = !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

    final Widget material;
    if (highContrast) {
      material = ColoredBox(color: colors.surfaceContainerHigh);
    } else if (useUIKit) {
      // Flutter owns the controls and handles pointer and accessibility events.
      material = IgnorePointer(
        child: UiKitView(
          key: ValueKey(isDark),
          viewType: 'lovat/liquid-glass-toolbar',
          creationParams: isDark,
          creationParamsCodec: const StandardMessageCodec(),
        ),
      );
    } else {
      material = ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: colors.surfaceContainerHigh.withValues(alpha: 0.86),
              borderRadius: BorderRadius.circular(28),
              border: Border.all(color: colors.outlineVariant),
            ),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: AppBar(
        title: title,
        toolbarHeight: kToolbarHeight,
        backgroundColor: Colors.transparent,
        foregroundColor: colors.onSurface,
        scrolledUnderElevation: 0,
        elevation: 0,
        systemOverlayStyle:
            isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
        flexibleSpace: Padding(
          padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
          child: highContrast
              ? ClipRRect(
                  borderRadius: BorderRadius.circular(28),
                  child: material,
                )
              : material,
        ),
      ),
    );
  }
}

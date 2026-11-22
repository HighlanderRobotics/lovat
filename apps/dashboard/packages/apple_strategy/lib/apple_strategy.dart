import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class AppleStrategyAvailability {
  const AppleStrategyAvailability(this.available, this.message);
  final bool available;
  final String message;
}

class AppleStrategyModel {
  const AppleStrategyModel();
  static const channel = MethodChannel('app.lovat/apple_strategy');

  Future<AppleStrategyAvailability> availability() async {
    if (kIsWeb ||
        ![TargetPlatform.iOS, TargetPlatform.macOS]
            .contains(defaultTargetPlatform)) {
      return const AppleStrategyAvailability(false,
          'On-device Apple Intelligence requires a supported iPhone, iPad, or Mac.');
    }
    try {
      final value =
          await channel.invokeMapMethod<String, dynamic>('availability');
      return AppleStrategyAvailability(value?['available'] == true,
          value?['message'] as String? ?? 'Apple Intelligence is unavailable.');
    } on MissingPluginException {
      return const AppleStrategyAvailability(
          false, 'This app build does not include Apple Intelligence support.');
    } on PlatformException {
      return const AppleStrategyAvailability(
          false, 'Apple Intelligence is currently unavailable.');
    }
  }

  Future<String> generate(
      {required String prompt, required String briefing}) async {
    final draft = await channel.invokeMethod<String>('generate', {
      'prompt': prompt,
      'briefing': briefing,
    }).timeout(const Duration(seconds: 90), onTimeout: () {
      unawaited(cancel());
      throw PlatformException(
          code: 'TIMEOUT',
          message: 'On-device generation took too long. Please retry.');
    });
    if (draft == null || draft.trim().isEmpty) {
      throw PlatformException(
          code: 'EMPTY_DRAFT',
          message: 'The on-device model returned an empty draft.');
    }
    return draft;
  }

  Future<void> cancel() async {
    try {
      await channel.invokeMethod<void>('cancel');
    } catch (_) {/* No cloud fallback. */}
  }
}

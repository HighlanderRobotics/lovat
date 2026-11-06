import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

/// Primary brand colors from the public FRC Colors API.
class FrcTeamColors {
  FrcTeamColors({http.Client? client}) : _client = client ?? http.Client();
  static final instance = FrcTeamColors();
  final http.Client _client;
  final _cache = <String, _ColorRequest>{};

  Future<Color?> primaryColor(String teamNumber) {
    if (!RegExp(r'^\d+$').hasMatch(teamNumber)) return Future.value(null);
    final existing = _cache[teamNumber];
    final now = DateTime.now();
    if (existing != null &&
        now.difference(existing.created) < const Duration(hours: 1)) {
      return existing.result;
    }
    if (_cache.length >= 512) _cache.remove(_cache.keys.first);
    final result = _fetch(teamNumber);
    _cache[teamNumber] = _ColorRequest(now, result);
    return result;
  }

  Future<Color?> _fetch(String teamNumber) async {
    try {
      final response = await _client
          .get(Uri.https('api.frc-colors.com', '/v1/team/$teamNumber'))
          .timeout(const Duration(seconds: 5));
      if (response.statusCode != 200) return null;
      final json = jsonDecode(response.body);
      if (json is! Map<String, dynamic>) return null;
      final hex = json['primaryHex'];
      if (hex is! String || !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(hex)) {
        return null;
      }
      return Color(0xFF000000 | int.parse(hex.substring(1), radix: 16));
    } catch (_) {
      return null;
    }
  }
}

class _ColorRequest {
  const _ColorRequest(this.created, this.result);
  final DateTime created;
  final Future<Color?> result;
}

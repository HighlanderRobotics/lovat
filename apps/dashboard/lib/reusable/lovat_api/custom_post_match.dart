import 'dart:convert';
import 'package:scouting_dashboard_app/reusable/lovat_api/lovat_api.dart';

extension CustomPostMatchSettings on LovatAPI {
  Future<List<String>> getCustomPostMatchQuestions() async {
    final response = await get('/v1/manager/settings/custom-post-match');
    if (response?.statusCode != 200) {
      throw Exception('Could not load custom questions.');
    }
    final json = jsonDecode(response!.body) as Map<String, dynamic>;
    return (json['customPostMatch'] as List<dynamic>).cast<String>();
  }

  Future<void> setCustomPostMatchQuestions(List<String> questions) async {
    final response = await put('/v1/manager/settings/custom-post-match',
        body: {'customPostMatch': questions});
    if (response?.statusCode != 200) {
      String message = 'Could not save custom questions.';
      try {
        message = (jsonDecode(response!.body)
                as Map<String, dynamic>)['displayError'] as String? ??
            message;
      } catch (_) {}
      throw LovatAPIException(message);
    }
  }
}

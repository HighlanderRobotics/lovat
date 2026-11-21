import 'package:flutter_test/flutter_test.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/api_error.dart';

void main() {
  test('reads shared error codes and the display message', () {
    final error = ApiError.fromBody(
      '{"code":"TEAM_REQUIRED","message":"Not on team","displayError":"Not on team"}',
    );
    expect(error.code, 'TEAM_REQUIRED');
    expect(error.message, 'Not on team');
  });

  test('keeps legacy plain-text and object error messages', () {
    expect(ApiError.fromBody('Not on team').message, 'Not on team');
    expect(ApiError.fromBody('{"error":"Not on team"}').message, 'Not on team');
  });

  test('tolerates unavailable or unrelated responses', () {
    for (final body in [null, 'null', '[]', '{"code":42}']) {
      expect(ApiError.fromBody(body).code, isNull);
      expect(ApiError.fromBody(body).message, isNull);
    }
  });
}

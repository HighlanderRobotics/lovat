import 'dart:convert';

class ApiError {
  const ApiError({this.code, this.message});

  final String? code;
  final String? message;

  /// Accept shared JSON errors and plain-text errors from older servers.
  factory ApiError.fromBody(String? body) {
    if (body == null) return const ApiError();
    try {
      final value = jsonDecode(body);
      if (value is Map<String, dynamic>) {
        final message =
            value['displayError'] ?? value['message'] ?? value['error'];
        return ApiError(
          code: value['code'] is String ? value['code'] as String : null,
          message: message is String ? message : null,
        );
      }
    } on FormatException {
      return ApiError(message: body);
    }
    return const ApiError();
  }
}

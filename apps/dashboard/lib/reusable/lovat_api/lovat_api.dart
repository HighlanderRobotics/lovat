import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:auth0_flutter/auth0_flutter.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:scouting_dashboard_app/constants.dart';
import 'package:scouting_dashboard_app/reusable/stale_refresh_builder.dart';
import 'package:scouting_dashboard_app/reusable/lovat_api/response_cache.dart';

class LovatAPI {
  LovatAPI(
    String baseUrl, {
    http.Client? client,
    Future<String?> Function()? tokenProvider,
  })  : _baseUrl = baseUrl,
        _client = client,
        _tokenProvider = tokenProvider;

  String _baseUrl;
  final http.Client? _client;
  final Future<String?> Function()? _tokenProvider;
  String? _lastToken;
  bool _hasCacheIdentity = false;
  int _cacheGeneration = 0;

  String get baseUrl => _baseUrl;
  set baseUrl(String value) {
    if (value == _baseUrl) return;
    _baseUrl = value;
    _invalidateCache();
    unawaited(cache.flush());
  }

  void _invalidateCache() {
    _cacheGeneration++;
    cache.clear();
    QueryCache.clearAll();
  }

  void dispose() {
    cache.dispose();
    _client?.close();
  }

  bool _isAuthenticating = false;
  final ResponseCache cache = ResponseCache();

  // Track if Auth0 Web SDK has been initialized
  bool _webSdkInitialized = false;
  Future<Credentials?>? _initializationFuture;

  /// Ensure the Auth0 Web SDK is initialized (must be called before any web auth operations)
  Future<Credentials?> ensureWebSdkInitialized() async {
    if (!kIsWeb) return null;
    if (_webSdkInitialized) return null;

    // Prevent concurrent initialization
    if (_initializationFuture != null) {
      return _initializationFuture;
    }

    _initializationFuture = _doInitialize();
    return _initializationFuture;
  }

  Future<Credentials?> _doInitialize() async {
    final credentials = await auth0Web.onLoad(
      audience: "https://api.lovat.app",
      scopes: {'openid', 'profile', 'email', 'offline_access'},
    );
    _webSdkInitialized = true;
    return credentials;
  }

  Future<Credentials> login() async {
    if (_isAuthenticating) {
      // Wait for the current login to finish
      while (_isAuthenticating) {
        await Future.delayed(const Duration(milliseconds: 100));
      }

      if (kIsWeb) {
        return await auth0Web.credentials();
      } else {
        return await auth0.credentialsManager.credentials();
      }
    }

    _isAuthenticating = true;

    try {
      if (kIsWeb) {
        await ensureWebSdkInitialized();

        final credentials = await auth0Web.loginWithPopup(
          audience: "https://api.lovat.app",
          scopes: {'openid', 'profile', 'email', 'offline_access'},
        );

        return credentials;
      } else {
        final newCredentials = await auth0
            .webAuthentication(scheme: "com.frc8033.lovatdashboard")
            .login(
          audience: "https://api.lovat.app",
          scopes: {'openid', 'profile', 'email', 'offline_access'},
        );

        await auth0.credentialsManager.storeCredentials(newCredentials);

        return newCredentials;
      }
    } finally {
      _isAuthenticating = false;
    }
  }

  Future<String?> getAccessToken() async {
    if (kIsWeb) {
      await ensureWebSdkInitialized();

      final hasCredentials = await auth0Web.hasValidCredentials();
      if (!hasCredentials) {
        return (await login()).accessToken;
      }

      final credentials = await auth0Web.credentials();
      return credentials.accessToken;
    }

    // Mobile/Desktop path
    try {
      final credentials = await auth0.credentialsManager.credentials();

      if (credentials.expiresAt.isBefore(DateTime.now())) {
        if (credentials.refreshToken == null) {
          return (await login()).accessToken;
        }

        final newCredentials = await auth0.api.renewCredentials(
          refreshToken: credentials.refreshToken!,
        );

        await auth0.credentialsManager.storeCredentials(newCredentials);

        return newCredentials.accessToken;
      } else {
        return credentials.accessToken;
      }
    } on CredentialsManagerException {
      return (await login()).accessToken;
    }
  }

  Future<Map<String, String>> _getHeaders({bool jsonBody = false}) async {
    final token = _tokenProvider == null
        ? await getAccessToken()
        : await _tokenProvider!();
    // A token stays in memory only. Persisted cached responses are never reused
    // before this client establishes its authenticated identity.
    if (!_hasCacheIdentity || token != _lastToken) {
      _invalidateCache();
      await cache.flush();
      _lastToken = token;
      _hasCacheIdentity = true;
    }
    PackageInfo packageInfo = await PackageInfo.fromPlatform();

    return {
      if (token != null) 'Authorization': 'Bearer $token',
      'X-Operating-System': kIsWeb ? "web" : Platform.operatingSystem,
      'X-App-Version': packageInfo.version,
      'X-Lovat-Error-Format': 'json-v1',
      'X-Build-Number': packageInfo.buildNumber,
      if (jsonBody) 'Content-Type': "application/json",
    };
  }

  Future<http.Response?> get(String path, {Map<String, String>? query}) async {
    final uri = Uri.parse(baseUrl + path).replace(queryParameters: query);
    final key = uri.toString();

    final headers = await _getHeaders();
    final generation = _cacheGeneration;
    final cachedEntry = cache.get(key);
    if (cachedEntry?.etag != null) {
      headers['If-None-Match'] = cachedEntry!.etag!;
    }

    final response = await (_client?.get ?? http.get)(uri, headers: headers);

    if (response.statusCode == 304 &&
        cachedEntry != null &&
        generation == _cacheGeneration) {
      return http.Response.bytes(
        utf8.encode(cachedEntry.body),
        200,
        headers: {'content-type': 'application/json'},
      );
    }

    if (response.statusCode == 200 && generation == _cacheGeneration) {
      final etag = response.headers['etag'] ?? response.headers['ETag'];
      cache.put(key, response.body, etag: etag);
    }

    return response;
  }

  http.Response? getCachedResponse(String path, {Map<String, String>? query}) {
    if (!_hasCacheIdentity) return null;
    final key = _cacheKey(path, query: query);
    final entry = cache.get(key);
    if (entry == null) return null;
    return http.Response.bytes(
      utf8.encode(entry.body),
      200,
      headers: {'content-type': 'application/json'},
    );
  }

  T? getCachedData<T>(
    String path, {
    Map<String, String>? query,
    required T Function(dynamic json) parser,
  }) {
    if (!_hasCacheIdentity) return null;
    final key = _cacheKey(path, query: query);
    final entry = cache.get(key);
    if (entry == null) return null;
    try {
      return parser(jsonDecode(entry.body));
    } catch (_) {
      return null;
    }
  }

  DateTime? getCachedTimestamp(String path, {Map<String, String>? query}) {
    if (!_hasCacheIdentity) return null;
    final key = _cacheKey(path, query: query);
    final entry = cache.get(key);
    if (entry == null) return null;
    return DateTime.fromMillisecondsSinceEpoch(entry.timestamp);
  }

  String _cacheKey(String path, {Map<String, String>? query}) {
    return Uri.parse(baseUrl + path).replace(queryParameters: query).toString();
  }

  String cacheKeyFor(String path, {Map<String, String>? query}) {
    return _cacheKey(path, query: query);
  }

  Future<http.Response?> post(
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? query,
  }) async {
    final uri = Uri.parse(baseUrl + path).replace(queryParameters: query);

    return await (_client?.post ?? http.post)(
      uri,
      body: body != null ? jsonEncode(body) : null,
      headers: await _getHeaders(jsonBody: body != null),
    );
  }

  Future<http.Response?> put(
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? query,
  }) async {
    final uri = Uri.parse(baseUrl + path).replace(queryParameters: query);

    return await (_client?.put ?? http.put)(
      uri,
      body: body != null ? jsonEncode(body) : null,
      headers: await _getHeaders(jsonBody: body != null),
    );
  }

  Future<http.Response?> delete(
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? query,
  }) async {
    final uri = Uri.parse(baseUrl + path).replace(queryParameters: query);

    return await (_client?.delete ?? http.delete)(
      uri,
      body: body != null ? jsonEncode(body) : null,
      headers: await _getHeaders(jsonBody: body != null),
    );
  }
}

class LovatAPIException implements Exception {
  const LovatAPIException(this.message);

  final String message;

  @override
  String toString() => message;
}

const kProductionBaseUrl = "https://api.lovat.app";

const kDefaultBaseUrl = String.fromEnvironment(
  'LOVAT_API_BASE',
  defaultValue: kProductionBaseUrl,
);

// The application uses this default instance. Test entrypoints may replace the
// service with an ordinary injected client/token provider; no runtime bypass flag exists.
LovatAPI lovatAPI = LovatAPI(kDefaultBaseUrl);

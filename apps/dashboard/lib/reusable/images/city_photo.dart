import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class CityPhoto {
  const CityPhoto(this.url, this.credit, this.source);
  final String url;
  final String credit;
  final String source;
}

/// Public Wikipedia requests never use Lovat's authenticated HTTP client.
class CityPhotoLookup {
  CityPhotoLookup({http.Client? client}) : _client = client;
  final http.Client? _client;

  Future<Map<String, dynamic>> _query(Map<String, String> parameters) async {
    final uri = Uri.https('en.wikipedia.org', '/w/api.php', {
      'action': 'query',
      'format': 'json',
      'formatversion': '2',
      'origin': '*',
      ...parameters,
    });
    final response = await (_client?.get(uri) ?? http.get(uri)).timeout(
      const Duration(seconds: 8),
    );
    if (response.statusCode != 200) throw Exception('Photo lookup unavailable');
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<CityPhoto?> find(String location) async {
    if (location.trim().isEmpty) return null;
    try {
      final prefs = await SharedPreferences.getInstance();
      final cacheKey = 'city_photo_v1:${location.trim().toLowerCase()}';
      final cached = prefs.getString(cacheKey);
      if (cached != null) {
        final value = jsonDecode(cached) as Map<String, dynamic>;
        if (DateTime.now().millisecondsSinceEpoch - (value['saved'] as int) <
            const Duration(days: 7).inMilliseconds) {
          return CityPhoto(value['url'], value['credit'], value['source']);
        }
      }
      final city = location.split(',').first.trim();
      final result = await _query({
        'generator': 'search',
        'gsrsearch': 'intitle:"$city" $location',
        'gsrnamespace': '0',
        'gsrlimit': '3',
        'prop': 'pageimages',
        'piprop': 'thumbnail|name',
        'pithumbsize': '1600',
        'pilicense': 'free',
      });
      final pages = ((result['query']?['pages'] as List?) ?? [])
          .cast<Map<String, dynamic>>()
        ..sort((a, b) => (a['index'] as int).compareTo(b['index'] as int));
      for (final page in pages) {
        final title = (page['title'] as String).toLowerCase();
        final file = page['pageimage'] as String?;
        final thumbnail = page['thumbnail']?['source'] as String?;
        if (!(title == city.toLowerCase() ||
                title.startsWith('${city.toLowerCase()},') ||
                title.startsWith('${city.toLowerCase()} (')) ||
            file == null ||
            thumbnail == null ||
            !thumbnail.startsWith('https://') ||
            RegExp(
              r'flag|seal|coat.of.arms|locator|map',
              caseSensitive: false,
            ).hasMatch(file)) {
          continue;
        }
        final info = await _query({
          'titles': 'File:$file',
          'prop': 'imageinfo',
          'iiprop': 'extmetadata|url',
        });
        final files = (info['query']?['pages'] as List?) ?? [];
        if (files.isEmpty) continue;
        final images = files.first['imageinfo'] as List?;
        if (images == null || images.isEmpty) continue;
        final image = images.first;
        final metadata = image['extmetadata'] as Map? ?? {};
        String plain(String field) =>
            (metadata[field]?['value'] as String? ?? '')
                .replaceAll(RegExp(r'<[^>]*>'), '')
                .replaceAll('&amp;', '&')
                .replaceAll('&quot;', '"')
                .replaceAll('&#39;', "'")
                .trim();
        final artist = plain('Artist');
        final license = plain('LicenseShortName');
        final source = image['descriptionurl'] as String?;
        if (artist.isEmpty ||
            license.isEmpty ||
            source == null ||
            !source.startsWith('https://')) {
          continue;
        }
        final photo = CityPhoto(thumbnail, '$artist · $license', source);
        await prefs.setString(
          cacheKey,
          jsonEncode({
            'saved': DateTime.now().millisecondsSinceEpoch,
            'url': photo.url,
            'credit': photo.credit,
            'source': photo.source,
          }),
        );
        return photo;
      }
    } catch (_) {
      // The homepage remains usable offline or when Wikipedia has no photo.
    }
    return null;
  }
}

import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:scouting_dashboard_app/reusable/images/city_photo.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('uses the full location and caches credited photos without auth headers',
      () async {
    var requests = 0;
    final lookup = CityPhotoLookup(client: MockClient((request) async {
      requests++;
      expect(request.headers.containsKey('authorization'), isFalse);
      if (request.url.queryParameters['generator'] == 'search') {
        expect(
            request.url.queryParameters['gsrsearch'], contains('California'));
        return http.Response(
            jsonEncode({
              'query': {
                'pages': [
                  {
                    'index': 1,
                    'title': 'San Francisco',
                    'pageimage': 'Skyline.jpg',
                    'thumbnail': {
                      'source': 'https://upload.wikimedia.org/skyline.jpg'
                    }
                  }
                ]
              }
            }),
            200);
      }
      return http.Response(
          jsonEncode({
            'query': {
              'pages': [
                {
                  'imageinfo': [
                    {
                      'descriptionurl':
                          'https://commons.wikimedia.org/wiki/File:Skyline.jpg',
                      'extmetadata': {
                        'Artist': {'value': '<a>Example photographer</a>'},
                        'LicenseShortName': {'value': 'CC BY-SA 4.0'}
                      }
                    }
                  ]
                }
              ]
            }
          }),
          200);
    }));
    final photo = await lookup.find('San Francisco, California, United States');
    expect(photo?.credit, 'Example photographer · CC BY-SA 4.0');
    expect(await lookup.find('San Francisco, California, United States'),
        isNotNull);
    expect(requests, 2);
  });

  test('rejects related articles and seals rather than showing the wrong image',
      () async {
    final lookup = CityPhotoLookup(
        client: MockClient((_) async => http.Response(
            jsonEncode({
              'query': {
                'pages': [
                  {
                    'index': 1,
                    'title': 'San Francisco District Attorney',
                    'pageimage': 'Portrait.jpg',
                    'thumbnail': {'source': 'https://example.com/a.jpg'}
                  },
                  {
                    'index': 2,
                    'title': 'San Francisco',
                    'pageimage': 'Seal.svg',
                    'thumbnail': {'source': 'https://example.com/b.svg'}
                  }
                ]
              }
            }),
            200)));
    expect(await lookup.find('San Francisco, California'), isNull);
  });

  test('network failure leaves a usable fallback instead of throwing',
      () async {
    final lookup = CityPhotoLookup(
        client: MockClient((_) async => throw Exception('offline')));
    expect(await lookup.find('San Francisco, California'), isNull);
    expect(await lookup.find(''), isNull);
  });
}

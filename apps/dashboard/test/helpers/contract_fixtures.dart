import 'dart:convert';
import 'dart:io';

Map<String, dynamic> contractFixtures() => jsonDecode(
        File('../../docs/testing/fixtures/contract-v1.json').readAsStringSync())
    as Map<String, dynamic>;

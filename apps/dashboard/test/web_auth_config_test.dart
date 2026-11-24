import 'package:flutter_test/flutter_test.dart';
import 'package:scouting_dashboard_app/web_auth_config.dart';

DashboardWebAuth sandbox({
  String? domain = 'login.sandbox.example',
  String? clientId = 'sandbox_public_client',
  String? audience = 'https://api.sandbox.example',
  String? apiBase = 'https://api.sandbox.example',
}) =>
    DashboardWebAuth.resolve(
      domain: domain,
      clientId: clientId,
      audience: audience,
      apiBase: apiBase,
    );

void main() {
  test('without Auth0 overrides the existing production configuration is used',
      () {
    final config = DashboardWebAuth.resolve(apiBase: 'https://preview.example');
    expect(config, same(DashboardWebAuth.production));
    expect(config.domain, productionAuth0Domain);
    expect(config.audience, productionAuth0Audience);
    expect(config.sandboxApiOrigin, isNull);
  });

  test('all public sandbox overrides are used with a pinned API origin', () {
    final config = sandbox(
      domain: 'LOGIN.SANDBOX.EXAMPLE',
      audience: productionAuth0Audience,
      apiBase: 'https://api.sandbox.example/',
    );
    expect(config.domain, 'login.sandbox.example');
    expect(config.clientId, 'sandbox_public_client');
    expect(config.audience, productionAuth0Audience);
    expect(config.sandboxApiOrigin, 'https://api.sandbox.example');
  });

  test('omitted and explicitly empty overrides cannot mix or fall back', () {
    expect(() => sandbox(domain: null), throwsFormatException);
    expect(() => sandbox(clientId: null), throwsFormatException);
    expect(() => sandbox(audience: null), throwsFormatException);
    expect(
      () => DashboardWebAuth.resolve(domain: '', clientId: '', audience: ''),
      throwsFormatException,
    );
    expect(
        () => sandbox(clientId: 'id with whitespace'), throwsFormatException);
    expect(() => sandbox(audience: '   '), throwsFormatException);
  });

  test('sandbox issuer must be a hostname distinct from production', () {
    for (final domain in [
      productionAuth0Domain.toUpperCase(),
      '$productionAuth0Domain.',
      'https://login.sandbox.example',
      'login.sandbox.example:443',
      'login.sandbox.example/path',
    ]) {
      expect(() => sandbox(domain: domain), throwsFormatException,
          reason: domain);
    }
  });

  test('sandbox API must be a separately specified HTTPS origin', () {
    for (final apiBase in [
      null,
      productionApiBase,
      'https://API.LOVAT.APP:444/',
      'https://api.lovat.app./',
      'http://api.sandbox.example',
      'https://user@api.sandbox.example',
      'https://api.sandbox.example/path',
      'https://api.sandbox.example?query=1',
      'https://api.sandbox.example#fragment',
    ]) {
      expect(() => sandbox(apiBase: apiBase), throwsFormatException,
          reason: apiBase);
    }
  });
}

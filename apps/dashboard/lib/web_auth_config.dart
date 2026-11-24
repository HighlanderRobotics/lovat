const productionAuth0Domain = 'lovat.us.auth0.com';
const productionAuth0Audience = 'https://api.lovat.app';
const productionApiBase = 'https://api.lovat.app';

const sandboxAuth0DomainKey = 'LOVAT_SANDBOX_AUTH0_DOMAIN';
const sandboxAuth0WebClientIdKey = 'LOVAT_SANDBOX_AUTH0_WEB_CLIENT_ID';
const sandboxAuth0AudienceKey = 'LOVAT_SANDBOX_AUTH0_AUDIENCE';
const apiBaseKey = 'LOVAT_API_BASE';

final dashboardWebAuth = DashboardWebAuth.resolve(
  domain: const bool.hasEnvironment(sandboxAuth0DomainKey)
      ? const String.fromEnvironment(sandboxAuth0DomainKey)
      : null,
  clientId: const bool.hasEnvironment(sandboxAuth0WebClientIdKey)
      ? const String.fromEnvironment(sandboxAuth0WebClientIdKey)
      : null,
  audience: const bool.hasEnvironment(sandboxAuth0AudienceKey)
      ? const String.fromEnvironment(sandboxAuth0AudienceKey)
      : null,
  apiBase: const String.fromEnvironment(apiBaseKey),
);

class DashboardWebAuth {
  const DashboardWebAuth._(this.domain, this.clientId, this.audience,
      {this.sandboxApiOrigin});

  static const production = DashboardWebAuth._(
    productionAuth0Domain,
    'FR7SUG9t0wXb5ZVo51G0ewnsK7PPSyJ9',
    productionAuth0Audience,
  );

  static final _hostname = RegExp(
    r'^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$',
  );

  final String domain;
  final String clientId;
  final String audience;
  final String? sandboxApiOrigin;

  factory DashboardWebAuth.resolve({
    String? domain,
    String? clientId,
    String? audience,
    String? apiBase,
  }) {
    if (domain == null && clientId == null && audience == null) {
      return production;
    }
    if (domain == null ||
        clientId == null ||
        audience == null ||
        domain.isEmpty ||
        clientId.isEmpty ||
        audience.isEmpty) {
      throw const FormatException(
        'Sandbox web Auth0 requires domain, web client ID, and audience together.',
      );
    }

    final authHost = domain.toLowerCase();
    if (!_hostname.hasMatch(authHost) || authHost == productionAuth0Domain) {
      throw const FormatException(
        'Sandbox web Auth0 domain must be a separate hostname (no scheme or path).',
      );
    }
    if (!RegExp(r'^[a-zA-Z0-9_-]+$').hasMatch(clientId) ||
        RegExp(r'[\s\x00-\x1f\x7f]').hasMatch(audience)) {
      throw const FormatException(
          'Invalid sandbox web Auth0 client ID or audience.');
    }

    final api = apiBase == null ? null : Uri.tryParse(apiBase);
    if (api == null ||
        api.scheme != 'https' ||
        !_hostname.hasMatch(api.host) ||
        api.host == Uri.parse(productionApiBase).host ||
        api.authority.contains('@') ||
        api.hasQuery ||
        api.hasFragment ||
        (api.path.isNotEmpty && api.path != '/')) {
      throw const FormatException(
        'Sandbox web Auth0 requires LOVAT_API_BASE to be a separate HTTPS API origin.',
      );
    }

    return DashboardWebAuth._(
      authHost,
      clientId,
      audience,
      sandboxApiOrigin: api.origin,
    );
  }
}

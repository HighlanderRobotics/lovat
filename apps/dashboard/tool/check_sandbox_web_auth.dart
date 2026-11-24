import 'dart:io';

import 'package:scouting_dashboard_app/web_auth_config.dart';

void main() {
  try {
    DashboardWebAuth.resolve(
      domain: Platform.environment[sandboxAuth0DomainKey],
      clientId: Platform.environment[sandboxAuth0WebClientIdKey],
      audience: Platform.environment[sandboxAuth0AudienceKey],
      apiBase: Platform.environment[apiBaseKey],
    );
  } on FormatException catch (error) {
    stderr.writeln(error.message);
    exitCode = 1;
  }
}

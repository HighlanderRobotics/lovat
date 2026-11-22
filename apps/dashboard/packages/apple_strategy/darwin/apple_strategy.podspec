Pod::Spec.new do |s|
  s.name = 'apple_strategy'
  s.version = '0.1.0'
  s.summary = 'On-device strategy generation for Lovat.'
  s.description = s.summary
  s.homepage = 'https://lovat.app'
  s.license = { :type => 'Private' }
  s.author = { 'Lovat' => 'https://lovat.app' }
  s.source = { :path => '.' }
  s.source_files = 'Classes/**/*.swift'
  s.ios.dependency 'Flutter'
  s.osx.dependency 'FlutterMacOS'
  s.platforms = { :ios => '15.0', :osx => '12.0' }
  s.swift_version = '5.0'
  s.weak_frameworks = 'FoundationModels'
end

Pod::Spec.new do |s|
  s.name = 'LovatLiveActivities'
  s.version = '1.0.0'
  s.summary = 'Collection scouting Live Activities'
  s.description = 'ActivityKit bridge and native background push token registration.'
  s.author = 'Highlander Robotics'
  s.homepage = 'https://lovat.app'
  s.license = { :type => 'MIT' }
  s.platform = :ios, '16.2'
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.swift_version = '5.0'
end

Pod::Spec.new do |s|
  s.name = 'LovatWatch'
  s.version = '1.0.0'
  s.summary = 'Share Collection identity with its paired watch companion'
  s.description = s.summary
  s.author = 'Highlander Robotics'
  s.homepage = 'https://github.com/HighlanderRobotics/lovat'
  s.license = { :type => 'UNLICENSED' }
  s.platforms = { :ios => '15.1' }
  s.source = { :git => 'https://github.com/HighlanderRobotics/lovat.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.swift_version = '5.0'
  s.source_files = '**/*.swift'
end

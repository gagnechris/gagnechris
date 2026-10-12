Pod::Spec.new do |s|
  s.name           = 'LiveMarkdown'
  s.version        = '1.0.0'
  s.summary        = 'Live-preview Markdown text view'
  s.description    = 'A UITextView that hides Markdown syntax off the caret line'
  s.author         = ''
  s.homepage       = 'https://gagnechris.com'
  s.license        = 'MIT'
  s.platforms      = { :ios => '17.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end

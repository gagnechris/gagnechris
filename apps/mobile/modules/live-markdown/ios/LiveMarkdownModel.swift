import UIKit

/// What JS computed for one text: `hash` names the text it was computed for.
struct Decorations: Decodable {
  let hash: Int32
  let lines: [LineDecoration]
}

struct LineDecoration: Decodable, Equatable {
  let style: String?
  let marks: [Mark]?
  let image: ImageMark?
}

/// `k` is hide, bullet, strong, em, code or link; offsets are within the line.
struct Mark: Decodable, Equatable {
  let f: Int
  let t: Int
  let k: String
}

struct ImageMark: Decodable, Equatable {
  let f: Int
  let t: Int
  let src: String
}

struct FontSpec: Decodable {
  let font: String
  let size: CGFloat
  let lineHeight: CGFloat
}

struct ThemeColors: Decodable {
  let text: String
  let link: String
  let quote: String
  let bullet: String
  let codeBackground: String
  let fenceBackground: String
  let placeholder: String
  let imagePlaceholder: String
  /// Markdown syntax on the lines the selection touches.
  let syntax: String?
}

struct Theme: Decodable {
  let body: FontSpec
  /// h1 to h6.
  let headings: [FontSpec]
  let strongFont: String
  /// Without one, emphasis slants the line's font.
  let emFont: String?
  let codeFont: String
  let codeScale: CGFloat
  let quoteIndent: CGFloat
  let imageMaxHeight: CGFloat
  let colors: ThemeColors
}

extension NSAttributedString.Key {
  static let liveMarkdownHidden = NSAttributedString.Key("LiveMarkdownHidden")
  static let liveMarkdownBullet = NSAttributedString.Key("LiveMarkdownBullet")
  /// On dimmed syntax: the colour its line's text takes.
  static let liveMarkdownSyntax = NSAttributedString.Key("LiveMarkdownSyntax")
}

/// The same hash the JS side computes over the UTF-16 code units.
func liveMarkdownHash(_ text: NSString) -> Int32 {
  var hash: Int32 = 0
  for i in 0..<text.length {
    hash = hash &* 31 &+ Int32(text.character(at: i))
  }
  return hash
}

func liveMarkdownFont(_ name: String, size: CGFloat) -> UIFont {
  UIFont(name: name, size: size) ?? UIFont.systemFont(ofSize: size)
}

func liveMarkdownColor(_ hex: String) -> UIColor {
  var value = hex.trimmingCharacters(in: .whitespaces)
  if value.hasPrefix("#") { value.removeFirst() }
  if value.count == 3 { value = value.map { "\($0)\($0)" }.joined() }
  guard value.count == 6 || value.count == 8, let rgb = UInt64(value, radix: 16) else {
    return .label
  }
  let hasAlpha = value.count == 8
  let r = CGFloat((rgb >> (hasAlpha ? 24 : 16)) & 0xff) / 255
  let g = CGFloat((rgb >> (hasAlpha ? 16 : 8)) & 0xff) / 255
  let b = CGFloat((rgb >> (hasAlpha ? 8 : 0)) & 0xff) / 255
  let a = hasAlpha ? CGFloat(rgb & 0xff) / 255 : 1
  return UIColor(red: r, green: g, blue: b, alpha: a)
}

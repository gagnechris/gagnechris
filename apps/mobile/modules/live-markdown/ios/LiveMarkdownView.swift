import CoreText
import ExpoModulesCore
import UIKit

/// React Native's InputAccessoryView finds its text view by duck typing on
/// `inputAccessoryViewID`, so the keyboard toolbar attaches as it does to a
/// TextInput.
final class LiveMarkdownTextView: UITextView {
  @objc var inputAccessoryViewID: String?
}

/// Props arrive one at a time in no set order; they are applied together.
struct IncomingProps {
  var value: String?
  var eventCount: Int?
  var decorations: String?
  var theme: String?
  var selection: [Int]?
  var focus: Int?
  var blur: Int?
}

private struct LineSignature: Equatable {
  let text: String
  let decoration: LineDecoration
  let active: Bool
  let imageSize: CGSize
}

private struct ImageRange {
  let range: NSRange
  let src: String
  let line: Int
}

/// Plain markdown in a TextKit 1 text view. Lines the selection doesn't touch
/// hide their syntax; a line holding only an image shows the image, which
/// the caret steps over and Backspace removes whole.
final class LiveMarkdownView: ExpoView, UITextViewDelegate, NSLayoutManagerDelegate {
  let onChangeText = EventDispatcher()
  let onSelectionChange = EventDispatcher()
  let onFocusChange = EventDispatcher()
  let onContentHeight = EventDispatcher()

  let textView = LiveMarkdownTextView(usingTextLayoutManager: false)
  private let placeholderLabel = UILabel()

  var incoming = IncomingProps()
  var autoFocus = false
  var placeholder = "" {
    didSet { updatePlaceholder() }
  }

  private var theme: Theme?
  private var decorations: Decorations?
  private var eventCount = 0
  private var jsValue: String?
  private var jsEventCount = 0
  private var appliedSelectionRequest: Int?
  private var appliedFocusRequest: Int?
  private var appliedBlurRequest: Int?
  private var didAutoFocus = false
  private var focusOnWindow = false
  private var applying = false

  private var lineStarts: [Int] = [0]
  private var textHash: Int32 = 0
  private var activeLines = IndexSet()
  private var applied: [LineSignature] = []
  private var images: [ImageRange] = []
  private var imageViews: [Int: UIImageView] = [:]
  private var lastCaret = 0
  private var lastHeight: CGFloat = -1
  private var lastWidth: CGFloat = -1

  private static let imageCache = NSCache<NSString, UIImage>()
  private var loading = Set<String>()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
    textView.delegate = self
    textView.layoutManager.delegate = self
    textView.backgroundColor = .clear
    textView.isScrollEnabled = false
    textView.textContainerInset = .zero
    textView.textContainer.lineFragmentPadding = 0
    addSubview(textView)
    placeholderLabel.numberOfLines = 0
    placeholderLabel.isAccessibilityElement = false
    textView.addSubview(placeholderLabel)
  }

  // MARK: - Layout

  override func layoutSubviews() {
    super.layoutSubviews()
    textView.frame = bounds
    placeholderLabel.frame = CGRect(x: 0, y: 0, width: bounds.width, height: placeholderLabel.sizeThatFits(
      CGSize(width: bounds.width, height: .greatestFiniteMagnitude)).height)
    if bounds.width != lastWidth {
      lastWidth = bounds.width
      // Image widgets are sized to the width.
      if !images.isEmpty { applied = [] }
      restyle()
    }
    layoutImages()
    reportHeight()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    guard window != nil else { return }
    if (autoFocus && !didAutoFocus) || focusOnWindow {
      didAutoFocus = true
      focusOnWindow = false
      textView.becomeFirstResponder()
    }
  }

  private func reportHeight() {
    guard bounds.width > 0 else { return }
    let height = ceil(textView.sizeThatFits(
      CGSize(width: bounds.width, height: .greatestFiniteMagnitude)).height)
    guard abs(height - lastHeight) > 0.5 else { return }
    lastHeight = height
    onContentHeight(["height": Double(height)])
    revealCaret()
  }

  /// The view grows with its text, so the screen's scroll view keeps the caret
  /// in sight above the keyboard and its toolbar.
  private func revealCaret() {
    guard textView.isFirstResponder, let end = textView.selectedTextRange?.end else { return }
    var scroll: UIView? = superview
    while let view = scroll, !(view is UIScrollView) { scroll = view.superview }
    guard let scrollView = scroll as? UIScrollView else { return }
    let caret = textView.caretRect(for: end)
    guard !caret.isNull, !caret.isInfinite else { return }
    let rect = textView.convert(caret, to: scrollView).insetBy(dx: 0, dy: -12)
    scrollView.scrollRectToVisible(rect, animated: false)
  }

  // MARK: - Props

  func applyIncomingProps() {
    let props = incoming
    incoming = IncomingProps()
    applying = true
    defer { applying = false }

    if let json = props.theme, let data = json.data(using: .utf8),
       let decoded = try? JSONDecoder().decode(Theme.self, from: data) {
      theme = decoded
      textView.font = liveMarkdownFont(decoded.body.font, size: decoded.body.size)
      textView.textColor = liveMarkdownColor(decoded.colors.text)
      textView.tintColor = liveMarkdownColor(decoded.colors.link)
      placeholderLabel.font = textView.font
      placeholderLabel.textColor = liveMarkdownColor(decoded.colors.placeholder)
      applied = []
    }
    if let count = props.eventCount { jsEventCount = count }
    if let value = props.value { jsValue = value }
    // A value JS sent before it saw the latest keystrokes would undo them.
    if (props.value != nil || props.eventCount != nil), let value = jsValue,
       jsEventCount >= eventCount, value != textView.textStorage.string {
      replaceText(with: value)
    }
    if let json = props.decorations, let data = json.data(using: .utf8) {
      decorations = try? JSONDecoder().decode(Decorations.self, from: data)
    }
    if let blur = props.blur, blur != appliedBlurRequest {
      appliedBlurRequest = blur
      textView.resignFirstResponder()
    }
    if let focus = props.focus, focus != appliedFocusRequest {
      appliedFocusRequest = focus
      if window == nil {
        focusOnWindow = true
      } else if !textView.isFirstResponder {
        textView.becomeFirstResponder()
      }
    }
    if let request = props.selection, request.count == 3, request[0] != appliedSelectionRequest {
      appliedSelectionRequest = request[0]
      let length = textView.textStorage.length
      let start = min(max(0, request[1]), length)
      let end = min(max(start, request[2]), length)
      textView.selectedRange = NSRange(location: start, length: end - start)
      lastCaret = end
    }
    updateActiveLines()
    restyle()
    updatePlaceholder()
    reportHeight()
  }

  /// Changes only the differing middle, so the attributes and the caret
  /// around it stay put.
  private func replaceText(with value: String) {
    let storage = textView.textStorage
    let old = storage.string as NSString
    let new = value as NSString
    var prefix = 0
    let maxPrefix = min(old.length, new.length)
    while prefix < maxPrefix && old.character(at: prefix) == new.character(at: prefix) { prefix += 1 }
    var suffix = 0
    let maxSuffix = min(old.length, new.length) - prefix
    while suffix < maxSuffix
      && old.character(at: old.length - 1 - suffix) == new.character(at: new.length - 1 - suffix) {
      suffix += 1
    }
    let replaced = NSRange(location: prefix, length: old.length - prefix - suffix)
    let inserted = new.substring(with: NSRange(location: prefix, length: new.length - prefix - suffix))
    let selection = textView.selectedRange
    let delta = new.length - old.length
    let move = { (offset: Int) -> Int in
      if offset >= replaced.location + replaced.length { return offset + delta }
      if offset > replaced.location { return replaced.location + (inserted as NSString).length }
      return offset
    }
    storage.beginEditing()
    storage.replaceCharacters(in: replaced, with: inserted)
    storage.endEditing()
    let start = move(selection.location)
    let end = max(start, move(selection.location + selection.length))
    textView.selectedRange = NSRange(location: start, length: end - start)
    textChanged()
  }

  // MARK: - Lines

  private func textChanged() {
    let text = textView.textStorage.string as NSString
    var starts = [0]
    for i in 0..<text.length where text.character(at: i) == 10 {
      starts.append(i + 1)
    }
    lineStarts = starts
    textHash = liveMarkdownHash(text)
    updatePlaceholder()
  }

  private func lineIndex(at offset: Int) -> Int {
    var lo = 0
    var hi = lineStarts.count - 1
    while lo < hi {
      let mid = (lo + hi + 1) / 2
      if lineStarts[mid] <= offset { lo = mid } else { hi = mid - 1 }
    }
    return lo
  }

  /// The line's text, without its newline.
  private func lineRange(_ line: Int) -> NSRange {
    let start = lineStarts[line]
    let end = line + 1 < lineStarts.count ? lineStarts[line + 1] - 1 : textView.textStorage.length
    return NSRange(location: start, length: end - start)
  }

  private func paragraphRange(_ line: Int) -> NSRange {
    let start = lineStarts[line]
    let end = line + 1 < lineStarts.count ? lineStarts[line + 1] : textView.textStorage.length
    return NSRange(location: start, length: end - start)
  }

  private func updateActiveLines() {
    let selection = textView.selectedRange
    var lines = IndexSet()
    if textView.isFirstResponder {
      let first = lineIndex(at: selection.location)
      let last = lineIndex(at: selection.location + selection.length)
      lines.insert(integersIn: first...last)
    }
    activeLines = lines
  }

  private var currentDecorations: Decorations? {
    guard let decorations, decorations.hash == textHash,
          decorations.lines.count == lineStarts.count else { return nil }
    return decorations
  }

  // MARK: - Styling

  private func restyle() {
    guard let theme else { return }
    guard let decorations = currentDecorations else {
      revealActiveLines()
      return
    }
    let storage = textView.textStorage
    let text = storage.string as NSString
    let width = max(1, bounds.width)
    var signatures: [LineSignature] = []
    signatures.reserveCapacity(lineStarts.count)
    var nextImages: [ImageRange] = []
    for line in 0..<lineStarts.count {
      let decoration = decorations.lines[line]
      var size = CGSize.zero
      if let image = decoration.image {
        size = imageSize(src: image.src, width: width, theme: theme)
        let start = lineStarts[line]
        nextImages.append(ImageRange(
          range: NSRange(location: start + image.f, length: image.t - image.f), src: image.src, line: line))
      }
      signatures.append(LineSignature(
        text: text.substring(with: lineRange(line)),
        decoration: decoration,
        active: activeLines.contains(line),
        imageSize: size))
    }
    images = nextImages

    var prefix = 0
    let common = min(signatures.count, applied.count)
    while prefix < common && signatures[prefix] == applied[prefix] { prefix += 1 }
    var suffix = 0
    while suffix < common - prefix
      && signatures[signatures.count - 1 - suffix] == applied[applied.count - 1 - suffix] {
      suffix += 1
    }
    let changed = prefix..<(signatures.count - suffix)
    applied = signatures
    guard !changed.isEmpty else { return }

    storage.beginEditing()
    for line in changed {
      style(line: line, decoration: decorations.lines[line], signature: signatures[line], theme: theme)
    }
    storage.endEditing()
    let first = paragraphRange(changed.lowerBound)
    let last = paragraphRange(changed.upperBound - 1)
    let range = NSRange(location: first.location, length: last.location + last.length - first.location)
    textView.layoutManager.invalidateGlyphs(forCharacterRange: range, changeInLength: 0, actualCharacterRange: nil)
    textView.layoutManager.invalidateLayout(forCharacterRange: range, actualCharacterRange: nil)
    updateTypingAttributes()
    setNeedsLayout()
  }

  /// Without decorations for the current text, the caret's lines still show
  /// their markdown; the next restyle redoes every line.
  private func revealActiveLines() {
    let storage = textView.textStorage
    var touched = false
    for line in activeLines where line < lineStarts.count {
      let range = paragraphRange(line)
      guard range.length > 0 else { continue }
      var marked = false
      for key in [NSAttributedString.Key.liveMarkdownHidden, .liveMarkdownBullet] {
        storage.enumerateAttribute(key, in: range) { value, _, stop in
          if value != nil {
            marked = true
            stop.pointee = true
          }
        }
      }
      guard marked else { continue }
      storage.removeAttribute(.liveMarkdownHidden, range: range)
      storage.removeAttribute(.liveMarkdownBullet, range: range)
      textView.layoutManager.invalidateGlyphs(forCharacterRange: range, changeInLength: 0, actualCharacterRange: nil)
      touched = true
    }
    if touched { applied = [] }
    updateTypingAttributes()
  }

  private func lineFont(_ style: String?, theme: Theme) -> (UIFont, CGFloat) {
    switch style ?? "" {
    case "h1", "h2", "h3", "h4", "h5", "h6":
      let level = Int(style!.dropFirst())! - 1
      let spec = level < theme.headings.count ? theme.headings[level] : theme.body
      return (liveMarkdownFont(spec.font, size: spec.size), spec.lineHeight)
    case "fence", "code":
      return (liveMarkdownFont(theme.codeFont, size: theme.body.size * theme.codeScale), theme.body.lineHeight)
    default:
      return (liveMarkdownFont(theme.body.font, size: theme.body.size), theme.body.lineHeight)
    }
  }

  private func style(line: Int, decoration: LineDecoration, signature: LineSignature, theme: Theme) {
    let storage = textView.textStorage
    let paragraph = paragraphRange(line)
    guard paragraph.length > 0 else { return }
    let start = lineStarts[line]
    let (font, lineHeight) = lineFont(decoration.style, theme: theme)
    let paragraphStyle = NSMutableParagraphStyle()
    paragraphStyle.minimumLineHeight = lineHeight
    paragraphStyle.maximumLineHeight = lineHeight
    var color = liveMarkdownColor(theme.colors.text)
    if decoration.style == "quote" {
      paragraphStyle.firstLineHeadIndent = theme.quoteIndent
      paragraphStyle.headIndent = theme.quoteIndent
      color = liveMarkdownColor(theme.colors.quote)
    }
    if signature.imageSize.height > 0 {
      paragraphStyle.paragraphSpacingBefore = signature.imageSize.height + 8
    }
    var attributes: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: color,
      .paragraphStyle: paragraphStyle,
      .baselineOffset: (lineHeight - font.lineHeight) / 2,
    ]
    if decoration.style == "fence" || decoration.style == "code" {
      attributes[.backgroundColor] = liveMarkdownColor(theme.colors.fenceBackground)
    }
    storage.setAttributes(attributes, range: paragraph)

    if let image = decoration.image {
      storage.addAttribute(.liveMarkdownHidden, value: true,
                           range: NSRange(location: start + image.f, length: image.t - image.f))
      return
    }
    guard !signature.active else { return }
    for mark in decoration.marks ?? [] {
      let range = NSRange(location: start + mark.f, length: mark.t - mark.f)
      guard range.length > 0, range.location + range.length <= storage.length else { continue }
      switch mark.k {
      case "hide":
        storage.addAttribute(.liveMarkdownHidden, value: true, range: range)
      case "bullet":
        storage.addAttributes([
          .liveMarkdownBullet: true,
          .foregroundColor: liveMarkdownColor(theme.colors.bullet),
        ], range: range)
      case "strong":
        if decoration.style == nil || decoration.style == "quote" {
          storage.addAttribute(.font, value: liveMarkdownFont(theme.strongFont, size: font.pointSize), range: range)
        }
      case "em":
        if let em = theme.emFont {
          storage.addAttribute(.font, value: liveMarkdownFont(em, size: font.pointSize), range: range)
        } else {
          storage.addAttribute(.obliqueness, value: 0.2, range: range)
        }
      case "code":
        storage.addAttributes([
          .font: liveMarkdownFont(theme.codeFont, size: font.pointSize * theme.codeScale),
          .backgroundColor: liveMarkdownColor(theme.colors.codeBackground),
        ], range: range)
      case "link":
        storage.addAttributes([
          .foregroundColor: liveMarkdownColor(theme.colors.link),
          .underlineStyle: NSUnderlineStyle.single.rawValue,
        ], range: range)
      default:
        break
      }
    }
  }

  /// What typing at the caret takes: its line's look, never hidden.
  private func updateTypingAttributes() {
    let storage = textView.textStorage
    guard storage.length > 0 else { return }
    let caret = textView.selectedRange.location
    let at = min(max(0, caret > 0 ? caret - 1 : 0), storage.length - 1)
    var attributes = storage.attributes(at: at, effectiveRange: nil)
    if (storage.string as NSString).character(at: at) == 10, caret < storage.length {
      attributes = storage.attributes(at: caret, effectiveRange: nil)
    }
    attributes[.liveMarkdownHidden] = nil
    attributes[.liveMarkdownBullet] = nil
    attributes[.underlineStyle] = nil
    attributes[.backgroundColor] = nil
    textView.typingAttributes = attributes
  }

  private func updatePlaceholder() {
    placeholderLabel.text = placeholder
    placeholderLabel.isHidden = placeholder.isEmpty || textView.textStorage.length > 0
    setNeedsLayout()
  }

  // MARK: - Glyphs

  private var bulletGlyphs: [String: CGGlyph] = [:]

  private func bulletGlyph(for font: UIFont) -> CGGlyph? {
    let key = "\(font.fontName)-\(font.pointSize)"
    if let glyph = bulletGlyphs[key] { return glyph }
    // By name, the system font (a private .SF name) resolves to another font, and
    // its glyph id draws the wrong character.
    let ctFont = font as CTFont
    var characters: [UniChar] = [0x2022]
    var glyphs: [CGGlyph] = [0]
    guard CTFontGetGlyphsForCharacters(ctFont, &characters, &glyphs, 1) else { return nil }
    bulletGlyphs[key] = glyphs[0]
    return glyphs[0]
  }

  func layoutManager(
    _ layoutManager: NSLayoutManager,
    shouldGenerateGlyphs glyphs: UnsafePointer<CGGlyph>,
    properties props: UnsafePointer<NSLayoutManager.GlyphProperty>,
    characterIndexes charIndexes: UnsafePointer<Int>,
    font aFont: UIFont,
    forGlyphRange glyphRange: NSRange
  ) -> Int {
    guard let storage = layoutManager.textStorage else { return 0 }
    let count = glyphRange.length
    var newGlyphs: [CGGlyph]?
    var newProps: [NSLayoutManager.GlyphProperty]?
    for i in 0..<count {
      let index = charIndexes[i]
      guard index < storage.length else { continue }
      if storage.attribute(.liveMarkdownHidden, at: index, effectiveRange: nil) != nil {
        if newProps == nil { newProps = Array(UnsafeBufferPointer(start: props, count: count)) }
        newProps![i] = .null
      } else if storage.attribute(.liveMarkdownBullet, at: index, effectiveRange: nil) != nil,
                let bullet = bulletGlyph(for: aFont) {
        if newGlyphs == nil { newGlyphs = Array(UnsafeBufferPointer(start: glyphs, count: count)) }
        newGlyphs![i] = bullet
      }
    }
    guard newGlyphs != nil || newProps != nil else { return 0 }
    let finalGlyphs = newGlyphs ?? Array(UnsafeBufferPointer(start: glyphs, count: count))
    let finalProps = newProps ?? Array(UnsafeBufferPointer(start: props, count: count))
    finalGlyphs.withUnsafeBufferPointer { glyphBuffer in
      finalProps.withUnsafeBufferPointer { propBuffer in
        layoutManager.setGlyphs(
          glyphBuffer.baseAddress!, properties: propBuffer.baseAddress!,
          characterIndexes: charIndexes, font: aFont, forGlyphRange: glyphRange)
      }
    }
    return count
  }

  // MARK: - Images

  private func imageSize(src: String, width: CGFloat, theme: Theme) -> CGSize {
    guard let image = LiveMarkdownView.imageCache.object(forKey: src as NSString),
          image.size.width > 0, image.size.height > 0 else {
      loadImage(src)
      return CGSize(width: width, height: min(180, theme.imageMaxHeight))
    }
    let aspect = image.size.height / image.size.width
    var w = min(width, image.size.width)
    var h = w * aspect
    if h > theme.imageMaxHeight {
      h = theme.imageMaxHeight
      w = h / aspect
    }
    return CGSize(width: round(w), height: round(h))
  }

  private func loadImage(_ src: String) {
    guard !loading.contains(src), let url = URL(string: src) else { return }
    loading.insert(src)
    URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
      let image = data.flatMap { UIImage(data: $0) }
      DispatchQueue.main.async {
        guard let self else { return }
        self.loading.remove(src)
        guard let image else { return }
        LiveMarkdownView.imageCache.setObject(image, forKey: src as NSString)
        self.restyle()
        self.layoutImages()
        self.reportHeight()
      }
    }.resume()
  }

  private func layoutImages() {
    guard let theme else { return }
    let layoutManager = textView.layoutManager
    var seen = Set<Int>()
    for image in images {
      guard image.line < applied.count else { continue }
      let size = applied[image.line].imageSize
      guard size.height > 0 else { continue }
      seen.insert(image.line)
      let paragraph = paragraphRange(image.line)
      guard paragraph.length > 0 else { continue }
      layoutManager.ensureLayout(forCharacterRange: paragraph)
      let glyph = layoutManager.glyphIndexForCharacter(at: paragraph.location)
      let fragment = layoutManager.lineFragmentRect(forGlyphAt: glyph, effectiveRange: nil)
      let view: UIImageView
      if let existing = imageViews[image.line] {
        view = existing
      } else {
        view = UIImageView()
        view.contentMode = .scaleAspectFill
        view.clipsToBounds = true
        view.layer.cornerRadius = 8
        view.isAccessibilityElement = false
        textView.addSubview(view)
        imageViews[image.line] = view
      }
      let loaded = LiveMarkdownView.imageCache.object(forKey: image.src as NSString)
      view.image = loaded
      view.backgroundColor = loaded == nil ? liveMarkdownColor(theme.colors.imagePlaceholder) : .clear
      // Above the line's own text, in its paragraph spacing.
      view.frame = CGRect(
        x: textView.textContainerInset.left,
        y: textView.textContainerInset.top + fragment.maxY - theme.body.lineHeight - size.height - 8,
        width: size.width,
        height: size.height)
    }
    for (line, view) in imageViews where !seen.contains(line) {
      view.removeFromSuperview()
      imageViews[line] = nil
    }
  }

  /// Where a caret inside an image should go: the side it came from.
  private func snappedCaret(_ caret: Int) -> Int? {
    for image in images {
      let end = image.range.location + image.range.length
      if caret > image.range.location && caret < end {
        return lastCaret >= end ? image.range.location : end
      }
    }
    return nil
  }

  // MARK: - UITextViewDelegate

  func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
    guard text.isEmpty, range.length > 0, currentDecorations != nil else { return true }
    var expanded = range
    for image in images {
      let imageRange = image.range
      guard NSIntersectionRange(expanded, imageRange).length > 0 else { continue }
      expanded = NSUnionRange(expanded, imageRange)
    }
    guard expanded != range else { return true }
    textView.textStorage.replaceCharacters(in: expanded, with: "")
    textView.selectedRange = NSRange(location: expanded.location, length: 0)
    userChangedText()
    return false
  }

  func textViewDidChange(_ textView: UITextView) {
    userChangedText()
  }

  private func userChangedText() {
    eventCount += 1
    textChanged()
    updateActiveLines()
    restyle()
    onChangeText(["text": textView.textStorage.string, "eventCount": eventCount])
    reportHeight()
    revealCaret()
  }

  func textViewDidChangeSelection(_ textView: UITextView) {
    // Typing moves the caret before textViewDidChange reports the new text.
    textChanged()
    let selection = textView.selectedRange
    if selection.length == 0, currentDecorations != nil, let snapped = snappedCaret(selection.location) {
      textView.selectedRange = NSRange(location: snapped, length: 0)
      return
    }
    lastCaret = selection.location + selection.length
    if textView.markedTextRange == nil {
      let before = activeLines
      updateActiveLines()
      if activeLines != before { restyle() }
    }
    updateTypingAttributes()
    guard !applying else { return }
    onSelectionChange([
      "selection": ["start": selection.location, "end": selection.location + selection.length],
    ])
  }

  func textViewDidBeginEditing(_ textView: UITextView) {
    updateActiveLines()
    restyle()
    onFocusChange(["focused": true])
    revealCaret()
  }

  func textViewDidEndEditing(_ textView: UITextView) {
    activeLines = IndexSet()
    restyle()
    onFocusChange(["focused": false])
  }
}

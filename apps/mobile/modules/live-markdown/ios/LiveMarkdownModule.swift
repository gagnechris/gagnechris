import ExpoModulesCore

public class LiveMarkdownModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveMarkdown")

    View(LiveMarkdownView.self) {
      Events("onChangeText", "onSelectionChange", "onFocusChange", "onContentHeight")

      Prop("value") { (view: LiveMarkdownView, value: String) in
        view.incoming.value = value
      }
      Prop("mostRecentEventCount") { (view: LiveMarkdownView, count: Int) in
        view.incoming.eventCount = count
      }
      Prop("decorations") { (view: LiveMarkdownView, json: String) in
        view.incoming.decorations = json
      }
      Prop("theme") { (view: LiveMarkdownView, json: String) in
        view.incoming.theme = json
      }
      Prop("selectionRequest") { (view: LiveMarkdownView, request: [Int]?) in
        view.incoming.selection = request
      }
      Prop("focusRequest") { (view: LiveMarkdownView, request: Int?) in
        view.incoming.focus = request
      }
      Prop("blurRequest") { (view: LiveMarkdownView, request: Int?) in
        view.incoming.blur = request
      }
      Prop("placeholder") { (view: LiveMarkdownView, text: String?) in
        view.placeholder = text ?? ""
      }
      Prop("textLabel") { (view: LiveMarkdownView, label: String?) in
        view.textView.accessibilityLabel = label
      }
      Prop("inputAccessoryViewID") { (view: LiveMarkdownView, id: String?) in
        view.textView.inputAccessoryViewID = id
      }
      Prop("editable") { (view: LiveMarkdownView, editable: Bool?) in
        view.textView.isEditable = editable ?? true
      }
      Prop("autoFocus") { (view: LiveMarkdownView, autoFocus: Bool?) in
        view.autoFocus = autoFocus ?? false
      }

      OnViewDidUpdateProps { (view: LiveMarkdownView) in
        view.applyIncomingProps()
      }
    }
  }
}

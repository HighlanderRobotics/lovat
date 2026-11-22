import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    engineBridge.pluginRegistry.registrar(forPlugin: "LiquidGlassToolbar")?
      .register(LiquidGlassToolbarFactory(), withId: "lovat/liquid-glass-toolbar")
  }
}

private final class LiquidGlassToolbarFactory: NSObject, FlutterPlatformViewFactory {
  func createArgsCodec() -> FlutterMessageCodec & NSObjectProtocol {
    FlutterStandardMessageCodec.sharedInstance()
  }

  func create(
    withFrame frame: CGRect,
    viewIdentifier viewId: Int64,
    arguments args: Any?
  ) -> FlutterPlatformView {
    LiquidGlassToolbar(frame: frame, isDark: args as? Bool ?? false)
  }
}

private final class LiquidGlassToolbar: NSObject, FlutterPlatformView {
  private let material: UIVisualEffectView

  init(frame: CGRect, isDark: Bool) {
    if #available(iOS 26.0, *) {
      material = UIVisualEffectView(effect: UIGlassEffect(style: .regular))
    } else {
      material = UIVisualEffectView(effect: UIBlurEffect(style: .systemThickMaterial))
      material.layer.cornerRadius = 28
      material.clipsToBounds = true
    }
    super.init()
    material.frame = frame
    material.overrideUserInterfaceStyle = isDark ? .dark : .light
    material.isUserInteractionEnabled = false
    material.accessibilityElementsHidden = true
  }

  func view() -> UIView {
    material
  }
}

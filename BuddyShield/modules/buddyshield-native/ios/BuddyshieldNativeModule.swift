import ExpoModulesCore

// iOS sandboxing does not allow any app to enumerate other installed apps or
// their usage/permission history — there is no Apple-equivalent of Android's
// PackageManager/UsageStatsManager for third-party apps. These stubs report
// "unsupported" so the JS layer falls back to its existing mock-data path
// instead of the app crashing or silently returning fake results.
public class BuddyshieldNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BuddyshieldNative")

    AsyncFunction("getInstalledApps") { () -> [[String: Any]] in
      []
    }

    Function("hasUsageAccess") { () -> Bool in
      false
    }

    Function("openUsageAccessSettings") { () -> Void in
      // No-op on iOS.
    }

    AsyncFunction("getUsageStats") { (_ days: Int) -> [[String: Any]] in
      []
    }

    Function("getPermissionAccessLog") { () -> [String: Any] in
      [
        "supported": false,
        "reason": "iOS does not expose installed-app or usage data to third-party apps.",
        "events": []
      ]
    }
  }
}

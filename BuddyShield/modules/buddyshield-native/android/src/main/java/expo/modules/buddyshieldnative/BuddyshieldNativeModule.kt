package expo.modules.buddyshieldnative

import android.app.AppOpsManager
import android.app.usage.NetworkStats
import android.app.usage.NetworkStatsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Process
import android.provider.Settings
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

private const val ICON_SIZE_PX = 96

class BuddyshieldNativeModule : Module() {

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("BuddyshieldNative")

    // ── Installed apps ──────────────────────────────────────────────────
    // Real device data via PackageManager. Requires QUERY_ALL_PACKAGES on
    // Android 11+ (declared in app.json -> android.permissions and subject
    // to Play Console's "All apps" declaration form for security apps).
    AsyncFunction("getInstalledApps") { promise: Promise ->
      try {
        promise.resolve(listInstalledApps())
      } catch (e: Exception) {
        promise.reject("ERR_INSTALLED_APPS", e.message ?: "Failed to list installed apps", e)
      }
    }

    // ── Usage stats ──────────────────────────────────────────────────────
    // Requires the special "Usage access" permission, which the user must
    // grant manually in Settings — it cannot be requested via a runtime
    // permission dialog. hasUsageAccess()/openUsageAccessSettings() let the
    // JS side check state and deep-link the user to the right screen.
    Function("hasUsageAccess") {
      hasUsageAccess()
    }

    Function("openUsageAccessSettings") {
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
        data = Uri.parse("package:${context.packageName}")
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      }
      context.startActivity(intent)
    }

    AsyncFunction("getUsageStats") { days: Int, promise: Promise ->
      try {
        promise.resolve(queryUsageStats(days))
      } catch (e: Exception) {
        promise.reject("ERR_USAGE_STATS", e.message ?: "Failed to read usage stats", e)
      }
    }

    // ── Network usage ────────────────────────────────────────────────────
    // Per-app data usage (bytes sent/received over WiFi + mobile) via
    // NetworkStatsManager. Gated behind the same "Usage access" permission
    // as getUsageStats — no VpnService involved, so there's no risk of
    // breaking the device's network connectivity. This gives real "is this
    // app moving an unusual amount of data" signal, but not which
    // domains/servers it talked to (that would require intercepting and
    // forwarding all device traffic through a local VPN, which is a much
    // higher-risk feature that needs on-device testing before it ships).
    AsyncFunction("getNetworkUsage") { days: Int, promise: Promise ->
      try {
        promise.resolve(queryNetworkUsage(days))
      } catch (e: Exception) {
        promise.reject("ERR_NETWORK_USAGE", e.message ?: "Failed to read network usage", e)
      }
    }

    // ── Permission access log ───────────────────────────────────────────
    // IMPORTANT: Android does not allow third-party apps to read AppOps
    // history (mic/camera/location access events) for OTHER apps — that
    // data is restricted to the OS's own Privacy Dashboard, which runs
    // with a system/signature-level permission normal Play Store apps
    // cannot hold. Rather than fabricate this data, we report it as
    // unsupported so the JS layer can skip that scan stage honestly.
    Function("getPermissionAccessLog") {
      mapOf(
        "supported" to false,
        "reason" to "Android restricts cross-app permission-access history to system apps; only self-monitoring is possible.",
        "events" to emptyList<Any>()
      )
    }
  }

  // ── Installed apps ─────────────────────────────────────────────────────
  private fun listInstalledApps(): List<Map<String, Any?>> {
    val pm = context.packageManager
    val installedPackages = pm.getInstalledPackages(PackageManager.GET_PERMISSIONS)
    val selfPackage = context.packageName

    return installedPackages
      .filter { it.packageName != selfPackage }
      .mapNotNull { pkgInfo ->
        val appInfo = pkgInfo.applicationInfo ?: return@mapNotNull null
        val isSystemApp = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
        val label = try {
          pm.getApplicationLabel(appInfo).toString()
        } catch (e: Exception) {
          pkgInfo.packageName
        }
        val requestedPermissions = pkgInfo.requestedPermissions
          ?.map { it.substringAfterLast('.') }
          ?: emptyList()
        val installerPackage = try {
          @Suppress("DEPRECATION")
          pm.getInstallerPackageName(pkgInfo.packageName)
        } catch (e: Exception) {
          null
        }
        val icon = try {
          iconToDataUri(pm.getApplicationIcon(appInfo))
        } catch (e: Exception) {
          null
        }

        mapOf(
          "name" to label,
          "packageName" to pkgInfo.packageName,
          "icon" to icon,
          "isSystemApp" to isSystemApp,
          "permissions" to requestedPermissions,
          "installerPackage" to installerPackage,
          "firstInstallTime" to pkgInfo.firstInstallTime,
          "lastUpdateTime" to pkgInfo.lastUpdateTime,
          "versionName" to pkgInfo.versionName
        )
      }
  }

  private fun iconToDataUri(drawable: Drawable): String {
    val bitmap = if (drawable is BitmapDrawable && drawable.bitmap != null) {
      Bitmap.createScaledBitmap(drawable.bitmap, ICON_SIZE_PX, ICON_SIZE_PX, true)
    } else {
      val bmp = Bitmap.createBitmap(ICON_SIZE_PX, ICON_SIZE_PX, Bitmap.Config.ARGB_8888)
      val canvas = android.graphics.Canvas(bmp)
      drawable.setBounds(0, 0, ICON_SIZE_PX, ICON_SIZE_PX)
      drawable.draw(canvas)
      bmp
    }
    val stream = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
    val base64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    return "data:image/png;base64,$base64"
  }

  // ── Usage stats ─────────────────────────────────────────────────────────
  private fun hasUsageAccess(): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = appOps.checkOpNoThrow(
      AppOpsManager.OPSTR_GET_USAGE_STATS,
      Process.myUid(),
      context.packageName
    )
    return mode == AppOpsManager.MODE_ALLOWED
  }

  private fun queryUsageStats(days: Int): List<Map<String, Any?>> {
    if (!hasUsageAccess()) return emptyList()

    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val end = System.currentTimeMillis()
    val start = end - days.coerceAtLeast(1).toLong() * 24L * 60L * 60L * 1000L

    val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, end)
    return stats
      .filter { it.totalTimeInForeground > 0 }
      .map {
        mapOf(
          "packageName" to it.packageName,
          "totalTimeInForegroundMs" to it.totalTimeInForeground,
          "lastTimeUsed" to it.lastTimeUsed
        )
      }
  }

  // ── Network usage ─────────────────────────────────────────────────────
  private fun queryNetworkUsage(days: Int): List<Map<String, Any?>> {
    if (!hasUsageAccess()) return emptyList()

    val nsm = context.getSystemService(Context.NETWORK_STATS_SERVICE) as NetworkStatsManager
    val end = System.currentTimeMillis()
    val start = end - days.coerceAtLeast(1).toLong() * 24L * 60L * 60L * 1000L

    // uid -> [rxBytes, txBytes]
    val totalsByUid = mutableMapOf<Int, LongArray>()

    for (networkType in intArrayOf(ConnectivityManager.TYPE_WIFI, ConnectivityManager.TYPE_MOBILE)) {
      try {
        val bucket = NetworkStats.Bucket()
        // subscriberId=null works for TYPE_WIFI always, and for TYPE_MOBILE
        // when the caller holds Usage Access (which we've already checked
        // above) — no READ_PHONE_STATE needed. If a device/OS combination
        // doesn't allow it, this network type is simply skipped below
        // rather than failing the whole call.
        val stats = nsm.querySummary(networkType, null, start, end)
        while (stats.hasNextBucket()) {
          stats.getNextBucket(bucket)
          val totals = totalsByUid.getOrPut(bucket.uid) { longArrayOf(0L, 0L) }
          totals[0] += bucket.rxBytes
          totals[1] += bucket.txBytes
        }
        stats.close()
      } catch (e: Exception) {
        // Expected on some devices/OS versions for TYPE_MOBILE — skip it.
      }
    }

    val pm = context.packageManager
    val selfUid = context.applicationInfo.uid

    return totalsByUid.entries
      .filter { it.key != selfUid && (it.value[0] > 0 || it.value[1] > 0) }
      .mapNotNull { (uid, totals) ->
        val packageName = pm.getPackagesForUid(uid)?.firstOrNull() ?: return@mapNotNull null
        val label = try {
          val appInfo = pm.getApplicationInfo(packageName, 0)
          pm.getApplicationLabel(appInfo).toString()
        } catch (e: Exception) {
          packageName
        }

        mapOf(
          "packageName" to packageName,
          "name" to label,
          "rxBytes" to totals[0],
          "txBytes" to totals[1]
        )
      }
  }
}

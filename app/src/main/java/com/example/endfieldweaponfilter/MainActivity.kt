package com.example.endfieldweaponfilter

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebSettings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler
import androidx.webkit.WebViewAssetLoader.ResourcesPathHandler
import androidx.webkit.WebViewClientCompat
import com.example.endfieldweaponfilter.theme.EndfieldWeaponFilterTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : ComponentActivity() {
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", AssetsPathHandler(this))
            .addPathHandler("/res/", ResourcesPathHandler(this))
            .build()

        setContent {
            EndfieldWeaponFilterTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    var webView: WebView? by remember { mutableStateOf(null) }
                    var canGoBack by remember { mutableStateOf(false) }

                    BackHandler(enabled = canGoBack) {
                        webView?.goBack()
                    }

                    AndroidView(
                        modifier = Modifier.fillMaxSize().safeDrawingPadding(),
                        factory = { context ->
                            WebView(context).apply {
                                webViewClient = object : LocalContentWebViewClient(assetLoader) {
                                    override fun doUpdateVisitedHistory(
                                        view: WebView?,
                                        url: String?,
                                        isReload: Boolean
                                    ) {
                                        super.doUpdateVisitedHistory(view, url, isReload)
                                        canGoBack = view?.canGoBack() == true
                                    }
                                }
                                webChromeClient = object : android.webkit.WebChromeClient() {
                                    override fun onConsoleMessage(message: android.webkit.ConsoleMessage): Boolean {
                                        android.util.Log.d("WebViewConsole", "${message.message()} -- From line ${message.lineNumber()} of ${message.sourceId()}")
                                        return true
                                    }
                                }
                                settings.javaScriptEnabled = true
                                settings.domStorageEnabled = true
                                settings.useWideViewPort = true
                                settings.loadWithOverviewMode = false
                                settings.allowFileAccess = false
                                settings.allowContentAccess = false
                                settings.cacheMode = WebSettings.LOAD_NO_CACHE

                                // Bind the JavaScript interface
                                addJavascriptInterface(AndroidInterface(context), "AndroidInterface")

                                loadUrl("https://appassets.androidplatform.net/assets/index.html")
                                webView = this
                            }
                        }
                    )
                }
            }
        }
    }
}

class AndroidInterface(private val context: Context) {

    @JavascriptInterface
    fun getVersionCode(): Int {
        return try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                packageInfo.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                packageInfo.versionCode
            }
        } catch (e: Exception) {
            1
        }
    }

    @JavascriptInterface
    fun getVersionName(): String {
        return try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            packageInfo.versionName ?: "1.0"
        } catch (e: Exception) {
            "1.0"
        }
    }

    @JavascriptInterface
    fun showToast(message: String) {
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
    }

    @JavascriptInterface
    fun checkInstallPermission(): Boolean {
        return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
    }

    @JavascriptInterface
    fun requestInstallPermission() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val intent = Intent(
                android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}")
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }
    }

    @JavascriptInterface
    fun startUpdate(apkUrl: String) {
        showToast("アップデートのダウンロードを開始しました...")

        CoroutineScope(Dispatchers.IO).launch {
            val success = downloadApk(apkUrl)
            withContext(Dispatchers.Main) {
                if (success) {
                    showToast("ダウンロード完了。インストールを開始します...")
                    triggerInstall()
                } else {
                    showToast("アップデートのダウンロードに失敗しました。")
                }
            }
        }
    }

    private fun downloadApk(apkUrl: String): Boolean {
        return try {
            val url = URL(apkUrl)
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            connection.connect()

            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                return false
            }

            // Create 'apks' directory under internal cache
            val apkDir = File(context.cacheDir, "apks")
            if (!apkDir.exists()) {
                apkDir.mkdirs()
            }

            val apkFile = File(apkDir, "update.apk")
            if (apkFile.exists()) {
                apkFile.delete()
            }

            connection.inputStream.use { input ->
                FileOutputStream(apkFile).use { output ->
                    val buffer = ByteArray(4096)
                    var bytesRead: Int
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                    }
                }
            }
            true
        } catch (e: Exception) {
            android.util.Log.e("AndroidInterface", "APK Download failed", e)
            false
        }
    }

    private fun triggerInstall() {
        try {
            val apkFile = File(File(context.cacheDir, "apks"), "update.apk")
            if (!apkFile.exists()) return

            val authority = "${context.packageName}.fileprovider"
            val uri = FileProvider.getUriForFile(context, authority, apkFile)

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            android.util.Log.e("AndroidInterface", "Installation launch failed", e)
            showToast("インストーラーの起動に失敗しました。設定を確認してください。")
        }
    }
}

private open class LocalContentWebViewClient(private val assetLoader: WebViewAssetLoader) : WebViewClientCompat() {
    override fun shouldInterceptRequest(
        view: WebView,
        request: WebResourceRequest
    ): WebResourceResponse? {
        return assetLoader.shouldInterceptRequest(request.url)
    }

    @Deprecated("Deprecated in Java")
    override fun shouldInterceptRequest(
        view: WebView,
        url: String
    ): WebResourceResponse? {
        return assetLoader.shouldInterceptRequest(Uri.parse(url))
    }
}

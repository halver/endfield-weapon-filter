package com.example.endfieldweaponfilter

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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
        Handler(Looper.getMainLooper()).post {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        }
    }

    @JavascriptInterface
    fun checkInstallPermission(): Boolean {
        val hasPermission = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
        android.util.Log.d("AndroidInterface", "checkInstallPermission returns: $hasPermission")
        return hasPermission
    }

    @JavascriptInterface
    fun requestInstallPermission() {
        android.util.Log.d("AndroidInterface", "requestInstallPermission called")
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
        android.util.Log.d("AndroidInterface", "startUpdate called with URL: $apkUrl")
        showToast("アップデートのダウンロードを開始しました...")

        CoroutineScope(Dispatchers.IO).launch {
            android.util.Log.d("AndroidInterface", "Download thread started")
            val success = downloadApk(apkUrl)
            android.util.Log.d("AndroidInterface", "Download success: $success")
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
        android.util.Log.d("AndroidInterface", "downloadApk: $apkUrl")
        return try {
            val url = URL(apkUrl)
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            android.util.Log.d("AndroidInterface", "Connecting...")
            connection.connect()

            android.util.Log.d("AndroidInterface", "Response code: ${connection.responseCode}")
            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                return false
            }

            val apkDir = File(context.cacheDir, "apks")
            if (!apkDir.exists()) {
                apkDir.mkdirs()
            }

            val apkFile = File(apkDir, "update.apk")
            if (apkFile.exists()) {
                apkFile.delete()
            }

            android.util.Log.d("AndroidInterface", "Downloading bytes to ${apkFile.absolutePath}...")
            connection.inputStream.use { input ->
                FileOutputStream(apkFile).use { output ->
                    val buffer = ByteArray(4096)
                    var bytesRead: Int
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                    }
                }
            }
            android.util.Log.d("AndroidInterface", "Download finished successfully. File size: ${apkFile.length()} bytes")
            true
        } catch (e: Exception) {
            android.util.Log.e("AndroidInterface", "APK Download failed", e)
            false
        }
    }

    private fun triggerInstall() {
        android.util.Log.d("AndroidInterface", "triggerInstall called")
        try {
            val apkFile = File(File(context.cacheDir, "apks"), "update.apk")
            if (!apkFile.exists()) {
                android.util.Log.e("AndroidInterface", "APK file does not exist")
                return
            }

            val authority = "${context.packageName}.fileprovider"
            val uri = FileProvider.getUriForFile(context, authority, apkFile)
            android.util.Log.d("AndroidInterface", "File URI: $uri")

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            android.util.Log.d("AndroidInterface", "Installation Activity started")
        } catch (e: Exception) {
            android.util.Log.e("AndroidInterface", "Installation launch failed", e)
            showToast("インストーラーの起動に失敗しました。設定を確認してください。")
        }
    }

    @JavascriptInterface
    fun saveFile(fileName: String, content: String, mimeType: String) {
        Handler(Looper.getMainLooper()).post {
            try {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                    val resolver = context.contentResolver
                    val contentValues = android.content.ContentValues().apply {
                        put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                        put(android.provider.MediaStore.MediaColumns.MIME_TYPE, if (mimeType.isNotBlank()) mimeType else "text/csv")
                        put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS)
                    }
                    val uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
                    if (uri != null) {
                        resolver.openOutputStream(uri)?.use { os ->
                            os.write(content.toByteArray(Charsets.UTF_8))
                        }
                        showToast("「ダウンロード」フォルダに保存しました: $fileName")
                    } else {
                        showToast("ファイルの保存に失敗しました。")
                    }
                } else {
                    @Suppress("DEPRECATION")
                    val downloadsDir = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS)
                    if (!downloadsDir.exists()) downloadsDir.mkdirs()
                    val file = File(downloadsDir, fileName)
                    file.writeText(content, Charsets.UTF_8)
                    showToast("「ダウンロード」フォルダに保存しました: $fileName")
                }
            } catch (e: Exception) {
                android.util.Log.e("AndroidInterface", "saveFile failed", e)
                showToast("保存エラー: ${e.message}")
            }
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

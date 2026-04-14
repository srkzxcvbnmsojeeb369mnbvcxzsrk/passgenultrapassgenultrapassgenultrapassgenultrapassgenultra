package com.passgen.pro;

import android.os.Bundle;
import android.os.Message;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.app.Dialog;
import android.view.ViewGroup;
import android.view.Window;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = this.bridge.getWebView();
        WebSettings settings = webView.getSettings();

        // 1. Bypass Google's "disallowed_useragent" WebView block
        String originalUserAgent = settings.getUserAgentString();
        final String finalUserAgent = originalUserAgent.replace("; wv", "");
        settings.setUserAgentString(finalUserAgent);

        // 2. Enable necessary WebView features for Google Sign-In
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);

        // 3. Allow third party cookies
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        // 4. Wrap the existing WebChromeClient to handle popups inside the app
        final WebChromeClient capacitorWebChromeClient = webView.getWebChromeClient();
        
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                final Dialog dialog = new Dialog(MainActivity.this);
                dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
                
                WebView newWebView = new WebView(MainActivity.this);
                WebSettings newSettings = newWebView.getSettings();
                newSettings.setJavaScriptEnabled(true);
                newSettings.setUserAgentString(finalUserAgent);
                newSettings.setDomStorageEnabled(true);
                android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(newWebView, true);
                
                newWebView.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onCloseWindow(WebView window) {
                        dialog.dismiss();
                    }
                });
                
                newWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                        String url = request.getUrl().toString();
                        if (url.contains("accounts.google.com") || url.contains("oauth")) {
                            androidx.browser.customtabs.CustomTabsIntent.Builder builder = new androidx.browser.customtabs.CustomTabsIntent.Builder();
                            androidx.browser.customtabs.CustomTabsIntent customTabsIntent = builder.build();
                            customTabsIntent.launchUrl(MainActivity.this, android.net.Uri.parse(url));
                            dialog.dismiss();
                            return true;
                        }
                        return false;
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, String url) {
                        if (url.contains("accounts.google.com") || url.contains("oauth")) {
                            androidx.browser.customtabs.CustomTabsIntent.Builder builder = new androidx.browser.customtabs.CustomTabsIntent.Builder();
                            androidx.browser.customtabs.CustomTabsIntent customTabsIntent = builder.build();
                            customTabsIntent.launchUrl(MainActivity.this, android.net.Uri.parse(url));
                            dialog.dismiss();
                            return true;
                        }
                        return false; // Let the WebView load the URL
                    }
                });

                dialog.setContentView(newWebView);
                dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
                dialog.show();

                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(newWebView);
                resultMsg.sendToTarget();

                return true;
            }

            // Delegate other important methods to Capacitor
            @Override
            public void onPermissionRequest(android.webkit.PermissionRequest request) {
                if (capacitorWebChromeClient != null) {
                    capacitorWebChromeClient.onPermissionRequest(request);
                } else {
                    super.onPermissionRequest(request);
                }
            }
            
            @Override
            public boolean onShowFileChooser(WebView webView, android.webkit.ValueCallback<android.net.Uri[]> filePathCallback, WebChromeClient.FileChooserParams fileChooserParams) {
                if (capacitorWebChromeClient != null) {
                    return capacitorWebChromeClient.onShowFileChooser(webView, filePathCallback, fileChooserParams);
                }
                return super.onShowFileChooser(webView, filePathCallback, fileChooserParams);
            }
            
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage consoleMessage) {
                if (capacitorWebChromeClient != null) {
                    return capacitorWebChromeClient.onConsoleMessage(consoleMessage);
                }
                return super.onConsoleMessage(consoleMessage);
            }
        });
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        android.net.Uri data = intent.getData();
        if (data != null && "passgen.pro.bd".equals(data.getHost())) {
            WebView webView = this.bridge.getWebView();
            webView.loadUrl(data.toString());
        }
    }
}

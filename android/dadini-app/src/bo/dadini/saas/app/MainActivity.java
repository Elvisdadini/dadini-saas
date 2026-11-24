package bo.dadini.saas.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;

import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.util.HashSet;
import java.util.Set;

/**
 * Aplicación Android de DADINI SaaS.
 *
 * Carga el sistema publicado dentro de un WebView seguro. La interfaz, los
 * módulos, los roles y los permisos son exactamente los del SaaS: toda la
 * lógica vive en el backend y en la web, la app solo la muestra en el móvil.
 */
public class MainActivity extends Activity {

    private static final String SITE_URL = "https://dadini-saas.onrender.com";
    private static final String SITE_HOST = "dadini-saas.onrender.com";
    private static final int FILE_CHOOSER_REQUEST = 4321;
    private static final int PERMISOS_REQUEST = 1001;

    private WebView webView;
    private LinearLayout loadingView;
    private LinearLayout errorView;
    private TextView loadingText;
    private ValueCallback<Uri[]> filePathCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);


        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#061C33"));
        window.setNavigationBarColor(Color.WHITE);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);

        // ---------- WebView: interfaz completa del SaaS ----------
        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        // Los window.open() del SaaS (WhatsApp, mapas) se abren dentro del mismo
        // WebView y se interceptan en shouldOverrideUrlLoading → abrirUrlExterna:
        // ninguna ventana emergente puede mostrar un origen que no sea el SaaS.
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
        settings.setGeolocationEnabled(true);
        settings.setUserAgentString(settings.getUserAgentString() + " DadiniSaasApp/21.0.5");

        CookieManager.getInstance().setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= 21) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        }

        // ---------- Splash con logo en miniatura ----------
        loadingView = new LinearLayout(this);
        loadingView.setOrientation(LinearLayout.VERTICAL);
        loadingView.setGravity(Gravity.CENTER);
        loadingView.setBackgroundColor(Color.parseColor("#061C33"));

        ImageView logo = new ImageView(this);
        logo.setImageResource(logoResource());
        logo.setAdjustViewBounds(true);
        loadingView.addView(logo, new LinearLayout.LayoutParams(190, 166));

        ProgressBar progressBar = new ProgressBar(this);
        progressBar.setIndeterminate(true);
        LinearLayout.LayoutParams barParams = new LinearLayout.LayoutParams(80, 80);
        barParams.topMargin = 12;
        loadingView.addView(progressBar, barParams);

        loadingText = new TextView(this);
        loadingText.setText("Cargando DADINI SaaS...\nPrimera carga: puede tardar cerca de 1 minuto.");
        loadingText.setTextColor(Color.WHITE);
        loadingText.setTextSize(13);
        loadingText.setGravity(Gravity.CENTER);
        loadingText.setPadding(0, 18, 0, 0);
        loadingView.addView(loadingText);

        root.addView(loadingView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // ---------- Pantalla de error ----------
        errorView = new LinearLayout(this);
        errorView.setOrientation(LinearLayout.VERTICAL);
        errorView.setGravity(Gravity.CENTER);
        errorView.setBackgroundColor(Color.WHITE);
        errorView.setVisibility(View.GONE);

        ImageView errorLogo = new ImageView(this);
        errorLogo.setImageResource(logoResource());
        errorLogo.setAdjustViewBounds(true);
        errorView.addView(errorLogo, new LinearLayout.LayoutParams(220, 195));

        TextView errorTitle = new TextView(this);
        errorTitle.setText("No se pudo conectar");
        errorTitle.setTextColor(Color.parseColor("#061C33"));
        errorTitle.setTextSize(19);
        errorTitle.setGravity(Gravity.CENTER);

        TextView errorText = new TextView(this);
        errorText.setText("Revisa tu conexión a internet e inténtalo de nuevo.");
        errorText.setTextColor(Color.parseColor("#64748B"));
        errorText.setTextSize(13);
        errorText.setGravity(Gravity.CENTER);
        errorText.setPadding(48, 12, 48, 24);

        Button retry = new Button(this);
        retry.setText("Reintentar");
        retry.setBackgroundColor(Color.parseColor("#FF6500"));
        retry.setTextColor(Color.WHITE);
        retry.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                errorView.setVisibility(View.GONE);
                loadingView.setVisibility(View.VISIBLE);
                webView.loadUrl(SITE_URL);
            }
        });

        errorView.addView(errorTitle);
        errorView.addView(errorText);
        errorView.addView(retry);
        root.addView(errorView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        setContentView(root);

        // ---------- Permisos en tiempo de ejecución ----------
        solicitarPermisos();

        // Si el servidor está despertando, lo indicamos en pantalla.
        new Handler().postDelayed(new Runnable() {
            @Override
            public void run() {
                if (loadingView.getVisibility() == View.VISIBLE) {
                    loadingText.setText("El servidor se está despertando.\nPuede tardar cerca de 1 minuto.");
                }
            }
        }, 20000);

        // ---------- Navegación ----------
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return abrirUrlExterna(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return abrirUrlExterna(request.getUrl().toString());
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {

            }

            @Override
            public void onPageFinished(WebView view, String url) {

                loadingView.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {

                if (request.isForMainFrame()) mostrarError();
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                if (Build.VERSION.SDK_INT < 23) mostrarError();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                String origin = request.getOrigin() == null ? "" : request.getOrigin().toString();
                if (!esOrigenPermitido(origin)) {
                    request.deny();
                    return;
                }
                // Solo se concede la cámara, que es lo que usa el escáner.
                Set<String> concedidos = new HashSet<>();
                for (String recurso : request.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(recurso)) {
                        concedidos.add(recurso);
                    }
                }
                if (concedidos.isEmpty()) request.deny();
                else request.grant(concedidos.toArray(new String[0]));
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(final String origin,
                                                           final GeolocationPermissions.Callback callback) {
                callback.invoke(origin, esOrigenPermitido(origin), false);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
            }
        });

        if (savedInstanceState != null) {

            webView.restoreState(savedInstanceState);
        } else {

            webView.loadUrl(SITE_URL);
        }
    }

    @SuppressLint("InlinedApi")
    private void solicitarPermisos() {
        String[] permisos = {
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.CAMERA,
            Manifest.permission.READ_CONTACTS,
            Build.VERSION.SDK_INT >= 33
                ? Manifest.permission.READ_MEDIA_IMAGES
                : Manifest.permission.READ_EXTERNAL_STORAGE
        };
        java.util.List<String> faltan = new java.util.ArrayList<String>();
        for (String permiso : permisos) {
            if (checkSelfPermission(permiso) != PackageManager.PERMISSION_GRANTED) faltan.add(permiso);
        }
        if (!faltan.isEmpty()) requestPermissions(faltan.toArray(new String[0]), PERMISOS_REQUEST);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    private void mostrarError() {
        loadingView.setVisibility(View.GONE);
        errorView.setVisibility(View.VISIBLE);
    }

    // Se resuelve por nombre para no depender de la generación de R.java.
    private int logoResource() {
        return getResources().getIdentifier("splash_logo", "drawable", getPackageName());
    }

    private boolean esDelSitio(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        return "https".equalsIgnoreCase(uri.getScheme())
            && SITE_HOST.equalsIgnoreCase(uri.getHost() == null ? "" : uri.getHost());
    }

    private boolean esOrigenPermitido(String origin) {
        return esDelSitio(origin);
    }

    /** Mantiene el SaaS dentro de la app y abre WhatsApp/teléfono/correo en su app nativa. */
    private boolean abrirUrlExterna(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();

        if ("http".equals(scheme) || "https".equals(scheme)) {
            if (SITE_HOST.equals(host)) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
                // Sin app compatible: no hacer nada.
            }
            return true;
        }

        if ("tel".equals(scheme) || "mailto".equals(scheme) || "whatsapp".equals(scheme)
                || "intent".equals(scheme) || "market".equals(scheme)) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
                // Sin app compatible: no hacer nada.
            }
            return true;
        }

        return false;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback == null) return;
            Uri[] results = null;

            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{ data.getData() };
                }
            }

            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}


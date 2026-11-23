# APK DADINI SaaS (nueva)

Aplicación Android nueva e independiente de la APK de preventa anterior. Muestra
**exactamente la misma interfaz y estructura del SaaS** dentro de un WebView
seguro que carga https://dadini-saas.onrender.com.

- Paquete: `bo.dadini.saas.app`
- Versión: `21.0.1` (versionCode 2, carga optimizada)
- Android mínimo: 7.0 (API 24)
- Ícono y pantalla de inicio: logo DADINI sin marca de agua.
- Salida: `backend/assets/apk/DADINI-SaaS-21.0.1.apk`

## Compilar

```powershell
powershell -ExecutionPolicy Bypass -File .\dadini-saas\android\build-dadini-apk.ps1
```

El script detecta el Android SDK y el JDK (usa el JBR de Android Studio),
compila recursos y Java, alinea, firma y verifica el APK.

La firma se guarda en `dadini-app/signing/dadini-saas-release.keystore`
(ignorado por Git). Consérvala para publicar actualizaciones; contraseña por
defecto `dadini-saas-2026`, configurable con `DADINI_APK_PASSWORD`.

## Publicar una actualización

1. Sube `versionCode`/`versionName` en `AndroidManifest.xml` y en el script.
2. Ejecuta el build (genera un APK con nombre de versión nuevo).
3. Actualiza `ARCHIVO_POR_DEFECTO` y `VERSION_POR_DEFECTO` en
   `backend/src/apk.js` si cambias el nombre del archivo.
4. Commit, push y espera el deploy de Render. Desde **Marca y APK** se podrá
   descargar o compartir por WhatsApp.

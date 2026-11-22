const fs = require('fs');
const path = require('path');
const config = require('./config');
const { save } = require('./db');

const ARCHIVO_POR_DEFECTO = 'DADINI-Preventa-20.0.0.apk';
const VERSION_POR_DEFECTO = '20.0.0';

function directorioApk() {
  const directorio = path.join(config.uploadDir, 'apk');
  fs.mkdirSync(directorio, { recursive: true });
  return directorio;
}

function protocolo(req) {
  return (req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
}

function urlPublica(req, archivo) {
  const base = (process.env.DADINI_APP_URL || `${protocolo(req)}://${req.get('host')}`).replace(/\/$/, '');
  return `${base}/uploads/apk/${archivo}`;
}

// Publica la APK incluida en el repositorio cuando no hay una cargada por el usuario.
function asegurarApkPorDefecto(db, req) {
  if (req && protocolo(req) === 'https' && db.configuracion.apk?.url?.startsWith('http://')) {
    db.configuracion.apk.url = db.configuracion.apk.url.replace(/^http:\/\//, 'https://');
    save();
  }
  if (db.configuracion.apk?.url || db.configuracion.apk_desactivada) return db.configuracion.apk || null;
  const ruta = path.join(directorioApk(), ARCHIVO_POR_DEFECTO);
  if (!fs.existsSync(ruta)) return null;
  const archivo = fs.statSync(ruta);
  db.configuracion.apk = {
    nombre: ARCHIVO_POR_DEFECTO,
    archivo: ARCHIVO_POR_DEFECTO,
    url: req ? urlPublica(req, ARCHIVO_POR_DEFECTO) : `/uploads/apk/${ARCHIVO_POR_DEFECTO}`,
    tamano_bytes: archivo.size,
    version: VERSION_POR_DEFECTO,
    notas: 'Versión oficial DADINI · instala para probar la app',
    subido_por: 1,
    subido_en: new Date().toISOString(),
  };
  save();
  return db.configuracion.apk;
}

module.exports = { asegurarApkPorDefecto, directorioApk, ARCHIVO_POR_DEFECTO };

const { load, guardarAhora, estadoGuardado } = require('./db');
const sync = require('./supabase-sync');
const config = require('./config');
const { obtenerCliente, estaConfigurado } = require('./supabase-client');
const { ensureBucket } = require('./supabase-storage');

// Job de sincronización manual con progreso observable.
// Guarda primero en disco (fuente de verdad local) y después sube a Supabase.
let estado = estadoInicial();

function estadoInicial() {
  return {
    activo: false,
    estado: 'idle',
    porcentaje: 0,
    etapa: '',
    mensaje: 'Sin sincronizaciones en curso.',
    errores: [],
    avisos: [],
    iniciado_en: null,
    finalizado_en: null,
    resultado: null,
  };
}

function progreso() {
  return { ...estado, errores: [...estado.errores], avisos: [...estado.avisos] };
}

function avanzar(porcentaje, etapa, mensaje) {
  estado.porcentaje = porcentaje;
  estado.etapa = etapa;
  estado.mensaje = mensaje;
}

function detalleError(error) {
  if (!error) return 'Error desconocido.';
  return error.message || String(error);
}

async function ejecutar() {
  if (estado.activo) return { iniciado: false, motivo: 'Ya hay una sincronización en curso.' };
  estado = {
    ...estadoInicial(),
    activo: true,
    estado: 'en_curso',
    porcentaje: 2,
    etapa: 'Preparando',
    mensaje: 'Preparando la sincronización…',
    iniciado_en: new Date().toISOString(),
  };

  const recomendaciones = [];
  try {
    avanzar(8, 'Base local', 'Guardando todos los cambios en la base local…');
    const guardado = await guardarAhora();
    recomendaciones.push(`Base local guardada en ${guardado.base}.`);

    avanzar(28, 'Integridad', 'Verificando que los datos quedaron escritos…');
    const db = load();
    if (!db || !Array.isArray(db.productos)) throw new Error('La base local no tiene una estructura válida.');
    const conteo = {
      productos: db.productos.length,
      clientes: db.clientes?.length || 0,
      pedidos: db.pedidos?.length || 0,
    };
    recomendaciones.push(`Verificación local: ${conteo.productos} productos, ${conteo.clientes} clientes, ${conteo.pedidos} pedidos.`);

    if (!estaConfigurado()) {
      avanzar(100, 'Nube no configurada', 'Los cambios quedaron guardados en la base local, pero Supabase no está configurado.');
      throw new Error('SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no están configurados en el servidor.');
    }

    avanzar(42, 'Almacenamiento', 'Verificando buckets de imágenes y catálogos…');
    const supabase = obtenerCliente();
    try {
      await ensureBucket('productos', { fileSizeLimit: '2MB', allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png'] });
      await ensureBucket('catalogos', { fileSizeLimit: '20MB', allowedMimeTypes: ['application/pdf'] });
      recomendaciones.push('Buckets productos y catalogos verificados.');
    } catch (error) {
      estado.avisos.push(`Buckets: ${detalleError(error)}`);
    }

    avanzar(65, 'Supabase', 'Subiendo la instantánea completa a Supabase…');
    const resultado = await sync.sincronizar(db, 'manual', { forzar: true });
    if (!resultado.ok) throw new Error(resultado.error || 'Supabase rechazó la instantánea.');
    recomendaciones.push(`Instantánea enviada (${resultado.enviado_en}).`);

    avanzar(88, 'Confirmación', 'Confirmando que la nube recibió los datos…');
    const { data, error } = await supabase
      .from(config.supabase.table)
      .select('updated_at')
      .eq('empresa_id', db.sincronizacion?.empresa_id || 'dadini-principal')
      .maybeSingle();
    if (error) throw new Error(`No se pudo verificar la instantánea en Supabase: ${error.message}`);
    if (!data) throw new Error('Supabase no devolvió la instantánea después de subirla.');

    avanzar(100, 'Completado', 'Sincronización exitosa. Todos los cambios están guardados.');
    estado.estado = 'exitoso';
    estado.resultado = { ...conteo, ...resultado, verificado_en: data.updated_at };
    estado.mensaje = `Sincronización exitosa. ${conteo.productos} productos y ${conteo.pedidos} pedidos guardados localmente y en la nube.`;
  } catch (error) {
    estado.estado = 'fallido';
    estado.porcentaje = 100;
    estado.etapa = estado.etapa || 'Error';
    estado.mensaje = 'La sincronización falló. Revisa el error exacto abajo.';
    estado.errores.push({ etapa: estado.etapa, mensaje: detalleError(error) });
  } finally {
    estado.activo = false;
    estado.finalizado_en = new Date().toISOString();
    estado.avisos.push(...recomendaciones);
  }
  return progreso();
}

function iniciar() {
  if (estado.activo) return { iniciado: false, motivo: 'Ya hay una sincronización en curso.' };
  // Se lanza sin await para que el endpoint responda de inmediato y el front
  // pueda empezar a sondear el progreso.
  ejecutar().catch((error) => {
    estado.activo = false;
    estado.estado = 'fallido';
    estado.errores.push({ etapa: 'Job', mensaje: detalleError(error) });
  });
  return { iniciado: true };
}

module.exports = { iniciar, progreso };

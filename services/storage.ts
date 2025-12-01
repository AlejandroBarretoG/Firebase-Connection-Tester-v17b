
// @ts-ignore
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { FirebaseInitResult } from './firebase';

/**
 * Realiza una prueba real de subida, descarga y borrado en Firebase Storage.
 * Incluye un TIMEOUT DE 5 SEGUNDOS y manejo de errores específicos.
 */
export const testStorageConnection = async (appInstance: any): Promise<FirebaseInitResult> => {
  const TIMEOUT_MS = 5000;

  // Promesa que se rechaza automáticamente después del tiempo límite
  const timeoutPromise = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error("TIMEOUT_EXCEEDED"));
    }, TIMEOUT_MS);
  });

  // La operación real de almacenamiento
  const operationPromise = async (): Promise<FirebaseInitResult> => {
    try {
      const storage = getStorage(appInstance);
      const filename = `_diagnostics/test_${Date.now()}.txt`;
      const storageRef = ref(storage, filename);
      
      // 1. Subida (Upload)
      const content = "Firebase Connection Tester - Connectivity Check";
      await uploadString(storageRef, content);
      
      // 2. Verificación de Acceso (Download URL)
      const downloadURL = await getDownloadURL(storageRef);
      
      // 3. Limpieza (Delete)
      await deleteObject(storageRef);

      return {
        success: true,
        message: "Storage Test Exitoso",
        data: {
          filename,
          urlSample: downloadURL.substring(0, 40) + "...",
          latency: "OK (< 5s)"
        }
      };
    } catch (error: any) {
      throw error; // Re-lanzar para que lo capture el bloque catch principal o el race
    }
  };

  try {
    // Competencia: Lo que ocurra primero (Operación exitosa/fallida o Timeout)
    return await Promise.race([operationPromise(), timeoutPromise]);

  } catch (error: any) {
    let userMessage = "Error desconocido en Storage.";
    let technicalDetails = error.message;

    // Diagnóstico de Errores Específicos
    if (error.message === "TIMEOUT_EXCEEDED") {
      userMessage = "Tiempo de espera agotado (Timeout 5s). Verifica si el servicio Storage está habilitado o si hay bloqueos de red (Firewall/CORS).";
    } else if (error.code === 'storage/unauthorized') {
      userMessage = "Permiso denegado (storage/unauthorized). Revisa las Reglas de Seguridad en la consola de Firebase. Asegúrate de permitir lectura/escritura en la ruta de prueba.";
    } else if (error.code === 'storage/retry-limit-exceeded') {
      userMessage = "Límite de reintentos excedido. La conexión es inestable o está bloqueada.";
    } else if (error.code === 'storage/object-not-found') {
      userMessage = "Objeto no encontrado. Falló la verificación post-subida.";
    } else if (error.code === 'storage/canceled') {
      userMessage = "Operación cancelada por el sistema.";
    } else if (error.code === 'storage/unknown') {
      userMessage = "Error desconocido de configuración de Storage.";
    } else if (error.message && error.message.includes("cors")) {
      userMessage = "Error de CORS. Necesitas configurar los encabezados CORS en Google Cloud Console para tu bucket.";
    }

    return {
      success: false,
      message: userMessage,
      error: technicalDetails
    };
  }
};

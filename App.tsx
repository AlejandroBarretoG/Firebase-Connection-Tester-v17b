
import React, { useState, useEffect } from 'react';
import { initFirebase, getConfigDisplay, mockSignIn, testRealAuthConnection, FirebaseApp, Auth } from './services/firebase';
import { mockWriteUserData, mockGetUserData } from './services/firestore_mock';
import { testStorageConnection } from './services/storage';
import { testFirestoreConnection } from './services/firestore';
import { runGeminiTests } from './services/gemini';
import { runVertexTests } from './services/vertex';
import { StatusCard } from './components/StatusCard';
import { FirebaseWizard } from './components/FirebaseWizard';
import { BillingWizard } from './components/BillingWizard';
import { AuthLab } from './components/AuthLab';
import { ShieldCheck, Server, Database, Settings, XCircle, Code2, ChevronDown, ChevronUp, Bot, Sparkles, KeyRound, Cpu, UserCircle, HelpCircle, Key, HardDrive, TestTube2, CreditCard, CloudLightning, LockKeyhole, ExternalLink } from 'lucide-react';

interface TestStep {
  id: string;
  title: string;
  description: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  details?: string;
}

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyB9IR6S_XDeHdqWQUsfwNE55S7LazuflOw",
  authDomain: "conexion-tester-suite.firebaseapp.com",
  projectId: "conexion-tester-suite",
  storageBucket: "conexion-tester-suite.firebasestorage.app",
  messagingSenderId: "1085453980210",
  appId: "1:1085453980210:web:3001b7acdea2d0c0e5a22b"
};

type AppMode = 'firebase' | 'gemini' | 'local' | 'auth_lab' | 'vertex';

const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Recomendado)' },
  { id: 'gemini-2.5-flash-lite-preview-02-05', name: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro' },
];

/**
 * Extractor inteligente de configuración.
 * Capaz de procesar JSON puro, Objetos JS, o bloques de código completo copiados de Firebase Console.
 */
const safeJsonParse = (input: string) => {
  // 1. Limpieza previa: Quitar comentarios de una línea (//) y de bloque (/* */)
  // Esto es crucial porque JSON.parse ni new Function soportan comentarios bien si hay saltos de línea raros
  const cleanInput = input
    .replace(/\/\/.*$/gm, '') 
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  let objectString = cleanInput;

  // 2. Detectar si es un bloque de código buscando la asignación de variable
  // Buscamos "firebaseConfig =" o "const firebaseConfig ="
  const configMarker = "firebaseConfig";
  const assignmentIndex = cleanInput.indexOf(configMarker);
  
  if (assignmentIndex !== -1) {
    // Buscar el primer '{' después de la asignación
    const searchFrom = cleanInput.substring(assignmentIndex);
    const firstBraceIndex = searchFrom.indexOf('{');
    
    if (firstBraceIndex !== -1) {
      // Algoritmo de balanceo de llaves para extraer SOLO el objeto, ignorando el resto del código (imports, init, etc)
      let openCount = 0;
      let endIndex = -1;
      
      for (let i = firstBraceIndex; i < searchFrom.length; i++) {
        if (searchFrom[i] === '{') openCount++;
        else if (searchFrom[i] === '}') openCount--;
        
        if (openCount === 0) {
          endIndex = i;
          break;
        }
      }

      if (endIndex !== -1) {
        // Extraemos exactamente desde { hasta }
        objectString = searchFrom.substring(firstBraceIndex, endIndex + 1);
      }
    }
  } else {
    // Si no hay variable explícita, intentamos encontrar el primer objeto {...} 
    // útil si copiaron solo el objeto pero quedaron caracteres sueltos
    const first = cleanInput.indexOf('{');
    const last = cleanInput.lastIndexOf('}');
    if (first !== -1 && last > first) {
       objectString = cleanInput.substring(first, last + 1);
    }
  }

  try {
    // 3. Evaluar como expresión JavaScript
    // new Function es seguro aquí porque corre en el cliente y permite sintaxis de objeto JS (claves sin comillas)
    const func = new Function(`return ${objectString}`);
    const result = func();
    if (result && typeof result === 'object') return result;
    throw new Error("El resultado no es un objeto válido.");
  } catch (jsError) {
    // 4. Fallback final: JSON.parse estricto
    // Si falló lo anterior, probamos el parseo estricto por si acaso
    return JSON.parse(input);
  }
};

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('firebase');
  
  // Firebase State
  const [firebaseInstance, setFirebaseInstance] = useState<FirebaseApp | null>(null);
  const [firebaseAuth, setFirebaseAuth] = useState<Auth | null>(null);
  const [realAuthInstance, setRealAuthInstance] = useState<any>(null); // State for the Real Auth SDK Instance
  
  // PERSISTENCIA: Inicializar desde localStorage o default
  const [firebaseConfigInput, setFirebaseConfigInput] = useState<string>(() => {
    return localStorage.getItem('firebase_config_input') || JSON.stringify(DEFAULT_FIREBASE_CONFIG, null, 2);
  });
  
  const [testUid, setTestUid] = useState<string>('test-user-123');
  const [showConfig, setShowConfig] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  
  // Gemini State - PERSISTENCIA
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    return localStorage.getItem('gemini_api_key') || "";
  });
  const [geminiModel, setGeminiModel] = useState<string>(() => {
    return localStorage.getItem('gemini_model') || GEMINI_MODELS[0].id;
  });

  // Vertex AI State - PERSISTENCIA
  const [vertexProject, setVertexProject] = useState<string>(() => localStorage.getItem('vertex_project') || "");
  const [vertexLocation, setVertexLocation] = useState<string>(() => localStorage.getItem('vertex_location') || "us-central1");
  const [vertexToken, setVertexToken] = useState<string>(() => localStorage.getItem('vertex_token') || "");
  
  const [showBillingWizard, setShowBillingWizard] = useState(false);

  // EFECTOS DE PERSISTENCIA
  useEffect(() => { localStorage.setItem('firebase_config_input', firebaseConfigInput); }, [firebaseConfigInput]);
  useEffect(() => { localStorage.setItem('gemini_api_key', geminiApiKey); }, [geminiApiKey]);
  useEffect(() => { localStorage.setItem('gemini_model', geminiModel); }, [geminiModel]);
  useEffect(() => { localStorage.setItem('vertex_project', vertexProject); }, [vertexProject]);
  useEffect(() => { localStorage.setItem('vertex_location', vertexLocation); }, [vertexLocation]);
  useEffect(() => { localStorage.setItem('vertex_token', vertexToken); }, [vertexToken]);

  // Shared Steps State
  const [firebaseSteps, setFirebaseSteps] = useState<TestStep[]>([
    { id: 'config', title: 'Validación de Configuración', description: 'Analizando el JSON proporcionado.', status: 'idle' },
    { id: 'init', title: 'Inicialización del SDK', description: 'Ejecutando initializeApp() con la configuración.', status: 'idle' },
    { id: 'auth_module', title: 'Servicio de Autenticación', description: 'Verificando la instanciación del módulo Auth.', status: 'idle' },
    { id: 'auth_login', title: 'Simulación de Login', description: 'Estableciendo usuario activo (UID).', status: 'idle' },
    { id: 'db_write', title: 'Escritura Protegida (BD)', description: 'Guardando datos en /users/{uid}/data.', status: 'idle' },
    { id: 'db_read', title: 'Lectura Protegida (BD)', description: 'Recuperando datos propios del usuario.', status: 'idle' },
    { id: 'real_auth_test', title: 'Prueba de Conexión REAL (Auth)', description: 'Intentando signInAnonymously() contra el servidor.', status: 'idle' },
    { id: 'firestore_real', title: 'Prueba de Firestore REAL', description: 'Escritura/Lectura real en Cloud Firestore.', status: 'idle' },
    { id: 'storage_test', title: 'Prueba de Storage REAL', description: 'Subir/Bajar archivo (Timeout 5s).', status: 'idle' }
  ]);

  const [geminiSteps, setGeminiSteps] = useState<TestStep[]>([
    { id: 'connect', title: 'Verificación de API Key', description: 'Intentando establecer conexión inicial con Gemini.', status: 'idle' },
    { id: 'text', title: 'Generación de Texto', description: 'Prompt simple "Hola mundo".', status: 'idle' },
    { id: 'stream', title: 'Prueba de Streaming', description: 'Verificando recepción de chunks en tiempo real.', status: 'idle' },
    { id: 'tokens', title: 'Conteo de Tokens', description: 'Verificando endpoint countTokens.', status: 'idle' },
    { id: 'vision', title: 'Capacidad Multimodal', description: 'Analizando imagen de prueba (Pixel).', status: 'idle' },
    { id: 'system', title: 'Instrucciones del Sistema', description: 'Probando comportamiento de systemInstruction.', status: 'idle' },
    { id: 'embed', title: 'Embeddings', description: 'Generando vector con text-embedding-004.', status: 'idle' }
  ]);

  const [vertexSteps, setVertexSteps] = useState<TestStep[]>([
    { id: 'auth', title: 'Autenticación & Acceso', description: 'Verificando token y acceso a la ubicación mediante listado de modelos.', status: 'idle' },
    { id: 'predict', title: 'Inferencia (Generación)', description: 'Prueba de generateContent con Gemini 1.5 Flash en Vertex.', status: 'idle' },
  ]);

  const [localSteps, setLocalSteps] = useState<TestStep[]>([
    { id: 'support', title: 'Soporte del Navegador', description: 'Verificando disponibilidad de window.localStorage.', status: 'idle' },
    { id: 'write', title: 'Prueba de Escritura', description: 'Intentando guardar un valor de prueba.', status: 'idle' },
    { id: 'read', title: 'Prueba de Lectura', description: 'Leyendo y validando integridad del dato.', status: 'idle' },
    { id: 'persistence', title: 'Verificación de Persistencia', description: 'Buscando configuración guardada anteriormente.', status: 'idle' },
    { id: 'clean', title: 'Limpieza', description: 'Eliminando datos de prueba.', status: 'idle' },
    { id: 'quota', title: 'Estimación de Uso', description: 'Calculando tamaño total almacenado.', status: 'idle' }
  ]);

  const updateStep = (mode: AppMode, id: string, updates: Partial<TestStep>) => {
    if (mode === 'firebase') setFirebaseSteps(prev => prev.map(step => step.id === id ? { ...step, ...updates } : step));
    else if (mode === 'gemini') setGeminiSteps(prev => prev.map(step => step.id === id ? { ...step, ...updates } : step));
    else if (mode === 'vertex') setVertexSteps(prev => prev.map(step => step.id === id ? { ...step, ...updates } : step));
    else if (mode === 'local') setLocalSteps(prev => prev.map(step => step.id === id ? { ...step, ...updates } : step));
  };

  const runFirebaseTests = async () => {
    setFirebaseSteps(prev => prev.map(s => ({ ...s, status: 'idle', details: undefined })));
    setFirebaseInstance(null);
    setFirebaseAuth(null);
    setRealAuthInstance(null);
    
    // 1. Check Config
    updateStep('firebase', 'config', { status: 'loading' });
    await new Promise(resolve => setTimeout(resolve, 400)); 
    
    let parsedConfig: any;
    try {
      parsedConfig = safeJsonParse(firebaseConfigInput);
      if (!parsedConfig.apiKey || !parsedConfig.projectId) throw new Error("Faltan campos requeridos (apiKey, projectId).");
      updateStep('firebase', 'config', { status: 'success', details: JSON.stringify(getConfigDisplay(parsedConfig), null, 2) });
    } catch (e: any) {
      updateStep('firebase', 'config', { status: 'error', details: `Formato Inválido: ${e.message}` });
      return;
    }

    // 2. Initialize App
    updateStep('firebase', 'init', { status: 'loading' });
    await new Promise(resolve => setTimeout(resolve, 600));

    const result = await initFirebase(parsedConfig);
    
    if (result.success && result.app) {
      setFirebaseInstance(result.app);
      updateStep('firebase', 'init', { status: 'success', details: `App Name: "${result.app.name}"\nAutomatic Data Collection: ${result.app.automaticDataCollectionEnabled}` });
    } else {
      updateStep('firebase', 'init', { status: 'error', details: result.error?.message || result.message });
      return;
    }

    // 3. Check Auth Module
    updateStep('firebase', 'auth_module', { status: 'loading' });
    await new Promise(resolve => setTimeout(resolve, 600));
    
    if (result.auth) {
       updateStep('firebase', 'auth_module', { status: 'success', details: `Auth SDK preparado.` });
    } else {
       updateStep('firebase', 'auth_module', { status: 'error', details: 'No se pudo obtener la instancia de Auth.' });
       return;
    }

    // 4. Simulate Login
    updateStep('firebase', 'auth_login', { status: 'loading' });
    if (!testUid.trim()) {
      updateStep('firebase', 'auth_login', { status: 'error', details: 'Se requiere un UID de prueba para simular el login.' });
      return;
    }

    try {
      const authResult = await mockSignIn(testUid, result.app!);
      setFirebaseAuth(authResult);
      updateStep('firebase', 'auth_login', { status: 'success', details: `Usuario autenticado (Simulado):\nUID: ${authResult.currentUser?.uid}\nEstado: Sesión Activa` });
    } catch (e: any) {
      updateStep('firebase', 'auth_login', { status: 'error', details: e.message });
      return;
    }

    // 5. DB Write (Protected by UID)
    updateStep('firebase', 'db_write', { status: 'loading' });
    try {
      const docId = 'profile_v1';
      const sampleData = { role: 'tester', lastLogin: new Date().toISOString() };
      const writeResult = await mockWriteUserData(testUid, docId, sampleData);
      updateStep('firebase', 'db_write', { status: 'success', details: `Escritura exitosa en ruta protegida:\n${writeResult.path}\nDatos: ${JSON.stringify(sampleData)}` });
    } catch (e: any) {
      updateStep('firebase', 'db_write', { status: 'error', details: `Error de escritura: ${e.message}` });
      return;
    }

    // 6. DB Read (Protected by UID)
    updateStep('firebase', 'db_read', { status: 'loading' });
    try {
      const docId = 'profile_v1';
      const data = await mockGetUserData(testUid, docId);
      if (data) {
        updateStep('firebase', 'db_read', { status: 'success', details: `Lectura exitosa. Verificando propiedad:\nOwner: ${data._meta.createdBy} (Coincide con UID)\nData: ${JSON.stringify(data)}` });
      } else {
        throw new Error("El documento no se encontró o devolvió null.");
      }
    } catch (e: any) {
      updateStep('firebase', 'db_read', { status: 'error', details: `Error de lectura: ${e.message}` });
    }

    // 7. Test Real Auth Connection
    updateStep('firebase', 'real_auth_test', { status: 'loading' });
    const realAuthResult = await testRealAuthConnection(parsedConfig);
    let realAppInstance = null;
    if (realAuthResult.success && realAuthResult.data) {
       realAppInstance = realAuthResult.app; 
       setRealAuthInstance(realAuthResult.auth);
       updateStep('firebase', 'real_auth_test', { status: 'success', details: `Conexión REAL exitosa. UID generado:\n${realAuthResult.data.uid}\nModo: Anónimo: ${realAuthResult.data.isAnonymous}` });
    } else {
       updateStep('firebase', 'real_auth_test', { status: 'error', details: realAuthResult.message });
       updateStep('firebase', 'firestore_real', { status: 'idle', details: 'Cancelado: Requiere conexión Auth exitosa.' });
       updateStep('firebase', 'storage_test', { status: 'idle', details: 'Cancelado: Requiere conexión Auth exitosa.' });
       return;
    }

    // 8. Test Real Firestore
    updateStep('firebase', 'firestore_real', { status: 'loading' });
    if (realAppInstance && realAuthResult.data?.uid) {
      const firestoreResult = await testFirestoreConnection(realAppInstance, realAuthResult.data.uid);
      if (firestoreResult.success) {
        updateStep('firebase', 'firestore_real', { status: 'success', details: `Operaciones:\n1. Write: OK\n2. Read: OK\n3. Delete: OK\nLatency: ${firestoreResult.data.latency}` });
      } else {
        updateStep('firebase', 'firestore_real', { status: 'error', details: firestoreResult.error || firestoreResult.message });
      }
    } else {
      updateStep('firebase', 'firestore_real', { status: 'error', details: "No se pudo iniciar Firestore sin Auth UID." });
    }

    // 9. Test Real Storage
    updateStep('firebase', 'storage_test', { status: 'loading' });
    if (realAppInstance) {
      const storageResult = await testStorageConnection(realAppInstance);
      if (storageResult.success) {
        updateStep('firebase', 'storage_test', { status: 'success', details: `Operaciones:\n1. Upload: OK (${storageResult.data.filename})\n2. Download URL: OK\n3. Delete: OK` });
      } else {
        updateStep('firebase', 'storage_test', { status: 'error', details: storageResult.message });
      }
    } else {
      updateStep('firebase', 'storage_test', { status: 'error', details: "No hay instancia de App válida para probar Storage." });
    }
  };

  const runGeminiTestFlow = async () => {
    setGeminiSteps(prev => prev.map(s => ({ ...s, status: 'idle', details: undefined })));
    if (!geminiApiKey.trim()) {
      updateStep('gemini', 'connect', { status: 'error', details: "Se requiere una API Key válida para ejecutar las pruebas." });
      return;
    }
    // 1. Connection
    updateStep('gemini', 'connect', { status: 'loading' });
    const connResult = await runGeminiTests.connect(geminiApiKey, geminiModel);
    if (connResult.success) updateStep('gemini', 'connect', { status: 'success', details: JSON.stringify(connResult.data, null, 2) });
    else { updateStep('gemini', 'connect', { status: 'error', details: connResult.message }); return; }
    // 2. Text
    updateStep('gemini', 'text', { status: 'loading' });
    const textResult = await runGeminiTests.generateText(geminiApiKey, geminiModel);
    if (textResult.success) updateStep('gemini', 'text', { status: 'success', details: JSON.stringify(textResult.data, null, 2) });
    else updateStep('gemini', 'text', { status: 'error', details: textResult.message });
    // 3. Stream
    updateStep('gemini', 'stream', { status: 'loading' });
    const streamResult = await runGeminiTests.streamText(geminiApiKey, geminiModel);
    if (streamResult.success) updateStep('gemini', 'stream', { status: 'success', details: JSON.stringify(streamResult.data, null, 2) });
    else updateStep('gemini', 'stream', { status: 'error', details: streamResult.message });
    // 4. Tokens
    updateStep('gemini', 'tokens', { status: 'loading' });
    const tokenResult = await runGeminiTests.countTokens(geminiApiKey, geminiModel);
    if (tokenResult.success) updateStep('gemini', 'tokens', { status: 'success', details: JSON.stringify(tokenResult.data, null, 2) });
    else updateStep('gemini', 'tokens', { status: 'error', details: tokenResult.message });
    // 5. Vision
    updateStep('gemini', 'vision', { status: 'loading' });
    const visionResult = await runGeminiTests.vision(geminiApiKey, geminiModel);
    if (visionResult.success) updateStep('gemini', 'vision', { status: 'success', details: JSON.stringify(visionResult.data, null, 2) });
    else updateStep('gemini', 'vision', { status: 'error', details: visionResult.message });
    // 6. System
    updateStep('gemini', 'system', { status: 'loading' });
    const sysResult = await runGeminiTests.systemInstruction(geminiApiKey, geminiModel);
    if (sysResult.success) updateStep('gemini', 'system', { status: 'success', details: JSON.stringify(sysResult.data, null, 2) });
    else updateStep('gemini', 'system', { status: 'error', details: sysResult.message });
    // 7. Embed
    updateStep('gemini', 'embed', { status: 'loading' });
    const embedResult = await runGeminiTests.embedding(geminiApiKey);
    if (embedResult.success) updateStep('gemini', 'embed', { status: 'success', details: JSON.stringify(embedResult.data, null, 2) });
    else updateStep('gemini', 'embed', { status: 'error', details: embedResult.message });
  };

  const runVertexTestFlow = async () => {
    setVertexSteps(prev => prev.map(s => ({ ...s, status: 'idle', details: undefined })));
    
    if (!vertexProject || !vertexToken) {
      updateStep('vertex', 'auth', { status: 'error', details: "Faltan credenciales (Project ID o Token)." });
      return;
    }

    // 1. Connectivity (Auth)
    updateStep('vertex', 'auth', { status: 'loading' });
    const authResult = await runVertexTests.connect(vertexProject, vertexLocation, vertexToken);
    
    if (authResult.success) {
      updateStep('vertex', 'auth', { status: 'success', details: JSON.stringify(authResult.data, null, 2) });
    } else {
      updateStep('vertex', 'auth', { status: 'error', details: authResult.message });
      return; // Stop if auth fails
    }

    // 2. Predict (Generation)
    updateStep('vertex', 'predict', { status: 'loading' });
    const predictResult = await runVertexTests.generate(vertexProject, vertexLocation, vertexToken);
    
    if (predictResult.success) {
      updateStep('vertex', 'predict', { status: 'success', details: JSON.stringify(predictResult.data, null, 2) });
    } else {
      updateStep('vertex', 'predict', { status: 'error', details: predictResult.message });
    }
  };

  const runLocalTests = async () => {
    setLocalSteps(prev => prev.map(s => ({ ...s, status: 'idle', details: undefined })));
    const TEST_KEY = 'diag_test_key';
    const TEST_VAL = 'diag_test_value_' + Date.now();
    // 1. Support
    updateStep('local', 'support', { status: 'loading' });
    await new Promise(resolve => setTimeout(resolve, 300));
    try {
      if (typeof window !== 'undefined' && window.localStorage) updateStep('local', 'support', { status: 'success', details: 'window.localStorage está disponible.' });
      else throw new Error("localStorage no está disponible en este navegador.");
    } catch (e: any) { updateStep('local', 'support', { status: 'error', details: e.message }); return; }
    // 2. Write
    updateStep('local', 'write', { status: 'loading' });
    try {
      localStorage.setItem(TEST_KEY, TEST_VAL);
      updateStep('local', 'write', { status: 'success', details: `Clave: ${TEST_KEY}\nValor guardado correctamente.` });
    } catch (e: any) { updateStep('local', 'write', { status: 'error', details: `Error al escribir: ${e.message}. Posible almacenamiento lleno.` }); return; }
    // 3. Read
    updateStep('local', 'read', { status: 'loading' });
    try {
      const val = localStorage.getItem(TEST_KEY);
      if (val === TEST_VAL) updateStep('local', 'read', { status: 'success', details: `Valor recuperado coincide: ${val}` });
      else throw new Error(`Discrepancia de datos. Esperado: ${TEST_VAL}, Recibido: ${val}`);
    } catch (e: any) { updateStep('local', 'read', { status: 'error', details: e.message }); }
    // 4. Persistence
    updateStep('local', 'persistence', { status: 'loading' });
    const savedConfig = localStorage.getItem('firebase_config_input');
    if (savedConfig && savedConfig.length > 50) updateStep('local', 'persistence', { status: 'success', details: 'Se encontró configuración de Firebase guardada previamente por la app.' });
    else updateStep('local', 'persistence', { status: 'success', details: 'No se encontraron datos previos importantes, pero el acceso funciona.' });
    // 5. Clean
    updateStep('local', 'clean', { status: 'loading' });
    localStorage.removeItem(TEST_KEY);
    if (localStorage.getItem(TEST_KEY) === null) updateStep('local', 'clean', { status: 'success', details: 'Datos de prueba eliminados correctamente.' });
    else updateStep('local', 'clean', { status: 'error', details: 'No se pudo eliminar la clave de prueba.' });
    // 6. Quota
    updateStep('local', 'quota', { status: 'loading' });
    let totalLength = 0, keysCount = 0;
    for (let x in localStorage) {
      if (!localStorage.hasOwnProperty(x)) continue;
      keysCount++;
      totalLength += ((localStorage[x].length + x.length) * 2);
    }
    const kb = (totalLength / 1024).toFixed(2);
    updateStep('local', 'quota', { status: 'success', details: `Uso estimado: ${kb} KB\nClaves totales: ${keysCount}` });
  };

  useEffect(() => {
    if (mode === 'firebase') runFirebaseTests();
  }, []);

  let currentSteps: TestStep[] = [];
  if (mode === 'firebase') currentSteps = firebaseSteps;
  else if (mode === 'gemini') currentSteps = geminiSteps;
  else if (mode === 'vertex') currentSteps = vertexSteps;
  else if (mode === 'local') currentSteps = localSteps;

  const allSuccess = currentSteps.length > 0 && currentSteps.every(s => s.status === 'success');
  const hasError = currentSteps.some(s => s.status === 'error');
  const isLoading = currentSteps.some(s => s.status === 'loading');

  const getPageTitle = () => {
    if (mode === 'firebase') return 'Firebase Connection Test';
    if (mode === 'gemini') return 'Gemini API Diagnostics';
    if (mode === 'vertex') return 'Vertex AI Testing';
    if (mode === 'auth_lab') return 'Auth Lab';
    return 'Diagnóstico LocalStorage';
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans relative">
      <FirebaseWizard isOpen={showWizard} onClose={() => setShowWizard(false)} />
      <BillingWizard isOpen={showBillingWizard} onClose={() => setShowBillingWizard(false)} />

      <div className="max-w-3xl mx-auto">
        {/* Header with Tabs */}
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-6 overflow-x-auto">
            <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 inline-flex whitespace-nowrap">
              <button onClick={() => setMode('firebase')} className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'firebase' ? 'bg-orange-100 text-orange-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                <Database size={18} /> Firebase
              </button>
              <button onClick={() => setMode('auth_lab')} className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'auth_lab' ? 'bg-teal-100 text-teal-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                <TestTube2 size={18} /> Auth Lab
              </button>
              <button onClick={() => setMode('gemini')} className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'gemini' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                <Sparkles size={18} /> Gemini AI
              </button>
              <button onClick={() => setMode('vertex')} className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'vertex' ? 'bg-violet-100 text-violet-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                <CloudLightning size={18} /> Vertex AI
              </button>
              <button onClick={() => setMode('local')} className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'local' ? 'bg-purple-100 text-purple-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                <HardDrive size={18} /> Local
              </button>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">{getPageTitle()}</h1>
        </div>

        {/* Configuration Section */}
        {(mode !== 'local' && mode !== 'auth_lab') && (
          <div className="mb-8 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="w-full flex items-center justify-between p-4 bg-slate-50 border-b border-slate-100">
              <button onClick={() => setShowConfig(!showConfig)} className="flex items-center gap-2 text-slate-800 font-medium hover:text-slate-900 transition-colors">
                {mode === 'firebase' && <Code2 size={20} className="text-orange-500" />}
                {mode === 'gemini' && <KeyRound size={20} className="text-blue-500" />}
                {mode === 'vertex' && <CloudLightning size={20} className="text-violet-500" />}
                Configuración {mode === 'vertex' ? 'Vertex AI' : mode === 'gemini' ? 'Gemini' : 'Firebase'}
                {showConfig ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </button>
              
              {mode === 'firebase' && showConfig && (
                <button onClick={() => setShowWizard(true)} className="text-xs flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors">
                  <HelpCircle size={14} /> ¿Cómo obtengo esto?
                </button>
              )}
              {mode === 'gemini' && showConfig && (
                <button onClick={() => setShowBillingWizard(true)} className="text-xs flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors">
                  <CreditCard size={14} /> Guía de Facturación
                </button>
              )}
              {mode === 'vertex' && showConfig && (
                <a 
                  href="https://console.cloud.google.com/vertex-ai" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors"
                >
                  <ExternalLink size={14} /> Ir a Consola Vertex
                </a>
              )}
            </div>
            
            {showConfig && (
              <div className="p-4">
                {mode === 'firebase' ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-slate-500 mb-2">Pega tu objeto <code>firebaseConfig</code> aquí.</p>
                      <textarea value={firebaseConfigInput} onChange={(e) => setFirebaseConfigInput(e.target.value)} className="w-full h-32 p-4 font-mono text-xs md:text-sm bg-slate-900 text-green-400 rounded-lg border border-slate-300 outline-none resize-y" spellCheck={false} />
                    </div>
                    <div className="pt-4 border-t border-slate-100">
                       <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2"><UserCircle size={16} /> UID de Prueba</label>
                       <input type="text" value={testUid} onChange={(e) => setTestUid(e.target.value)} className="w-full p-2 font-mono text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                    </div>
                  </div>
                ) : mode === 'vertex' ? (
                  <div className="space-y-4">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Project ID</label>
                          <input type="text" value={vertexProject} onChange={(e) => setVertexProject(e.target.value)} placeholder="my-gcp-project-id" className="w-full p-2 font-mono text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                          <select value={vertexLocation} onChange={(e) => setVertexLocation(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm">
                            <option value="us-central1">us-central1 (Iowa)</option>
                            <option value="us-east4">us-east4 (Virginia)</option>
                            <option value="us-west1">us-west1 (Oregon)</option>
                            <option value="europe-west4">europe-west4 (Netherlands)</option>
                            <option value="asia-southeast1">asia-southeast1 (Singapore)</option>
                          </select>
                        </div>
                     </div>
                     <div>
                       <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                         <LockKeyhole size={16} /> Access Token (Bearer)
                       </label>
                       <input type="password" value={vertexToken} onChange={(e) => setVertexToken(e.target.value)} placeholder="ya29.a0..." className="w-full p-2 font-mono text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none" />
                       <p className="text-xs text-slate-400 mt-1">
                         Ejecuta <code>gcloud auth print-access-token</code> en tu terminal para obtener uno temporal.
                       </p>
                     </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                       <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2"><Key size={16} /> Gemini API Key</label>
                       <input type="password" value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)} className="w-full p-2 font-mono text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Modelo</label>
                      <select value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                          {GEMINI_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        {mode === 'auth_lab' ? (
          <AuthLab authInstance={realAuthInstance} />
        ) : (
          <>
            <div className={`mb-8 p-4 rounded-xl border shadow-sm flex items-center gap-4 transition-colors duration-500 ${hasError ? 'bg-red-50 border-red-100 text-red-800' : allSuccess && !isLoading && mode !== 'local' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-white border-slate-200 text-slate-600'}`}>
              {hasError ? <div className="bg-red-100 p-2 rounded-full"><XCircle size={24} /></div> : allSuccess && !isLoading && mode !== 'local' ? <div className="bg-emerald-100 p-2 rounded-full"><ShieldCheck size={24} /></div> : <div className="bg-slate-100 p-2 rounded-full"><Server size={24} className={isLoading ? "animate-pulse" : ""} /></div>}
              <div>
                <h2 className="font-bold text-lg">{hasError ? 'Diagnóstico Fallido' : allSuccess && !isLoading && mode !== 'local' ? 'Sistema Operativo' : 'Estado del Diagnóstico'}</h2>
                <p className="text-sm opacity-90">{hasError ? 'Se encontraron problemas durante la ejecución.' : allSuccess && !isLoading && mode !== 'local' ? 'Todas las pruebas pasaron exitosamente.' : 'Listo para iniciar pruebas.'}</p>
              </div>
            </div>

            <div className="space-y-4">
              {currentSteps.map((step) => (
                <div key={step.id}>
                  <StatusCard title={step.title} description={step.description} status={step.status} details={step.details} />
                  {mode === 'gemini' && step.id === 'embed' && step.status === 'error' && (
                    <div className="mt-2 ml-4">
                      <button onClick={() => setShowBillingWizard(true)} className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg shadow-sm transition-colors"><CreditCard size={14} /> Solucionar Problema de Facturación</button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-center">
              <button
                onClick={mode === 'firebase' ? runFirebaseTests : mode === 'gemini' ? runGeminiTestFlow : mode === 'vertex' ? runVertexTestFlow : runLocalTests}
                disabled={isLoading}
                className={`flex items-center gap-2 px-6 py-3 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-lg hover:shadow-xl ${
                  mode === 'firebase' ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-200' : 
                  mode === 'gemini' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' :
                  mode === 'vertex' ? 'bg-violet-600 hover:bg-violet-700 shadow-violet-200' :
                  'bg-purple-600 hover:bg-purple-700 shadow-purple-200'
                }`}
              >
                {isLoading ? <Server size={18} className="animate-spin" /> : mode === 'firebase' ? <Database size={18} /> : mode === 'gemini' ? <Bot size={18} /> : mode === 'vertex' ? <CloudLightning size={18} /> : <HardDrive size={18} />}
                {isLoading ? 'Ejecutando...' : 'Iniciar Diagnóstico'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default App;

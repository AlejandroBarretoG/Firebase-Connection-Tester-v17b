import React, { useState, useEffect } from 'react';
import { User, Shield, Lock, Mail, Link as LinkIcon, AlertTriangle, CheckCircle2, UserCircle2, ArrowRight, RefreshCw, AlertCircle, HelpCircle, Settings, ExternalLink, LogOut, ArrowLeft, LogIn } from 'lucide-react';
import { linkWithCredential, EmailAuthProvider, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from '../services/firebase';

interface AuthLabProps {
  authInstance: any; // Real Firebase Auth Instance
}

type AuthMode = 'link' | 'login' | 'reset';

export const AuthLab: React.FC<AuthLabProps> = ({ authInstance }) => {
  const [user, setUser] = useState<any>(authInstance?.currentUser || null);
  
  // Form Inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // UI State
  const [mode, setMode] = useState<AuthMode>('login'); // Default mode
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  
  // Conflict Modal (Only for Linking flow)
  const [showConflictModal, setShowConflictModal] = useState(false);

  useEffect(() => {
    if (authInstance) {
      const unsubscribe = authInstance.onAuthStateChanged((u: any) => {
        setUser(u);
        // Smart Mode Switching based on User State
        if (u) {
          if (u.isAnonymous) {
            setMode('link');
          } else {
            // User is verified, usually we don't show forms, but logic is handled in render
            setMode('link'); 
          }
        } else {
          setMode('login');
        }
        // Reset form state on user change
        setStatus('idle');
        setMessage('');
        setErrorDetail(null);
        setEmail('');
        setPassword('');
      });
      return () => unsubscribe();
    }
  }, [authInstance]);

  // Limpiar inputs al cambiar de modo manual
  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setStatus('idle');
    setMessage('');
    setErrorDetail(null);
    setPassword(''); // Security: Clear password
    // Keep email if switching between login/reset/link as convenience
  };

  const handleLogout = async () => {
    try {
      await signOut(authInstance);
      // User state listener will handle the rest
    } catch (e: any) {
      alert("Error al cerrar sesión: " + e.message);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) return;
    setStatus('loading');
    setMessage('');
    setErrorDetail(null);

    try {
      await signInWithEmailAndPassword(authInstance, email, password);
      // Success is handled by onAuthStateChanged -> user becomes !null
      setStatus('success');
    } catch (error: any) {
      setStatus('error');
      
      if (error.code === 'auth/wrong-password') {
        setMessage('Contraseña incorrecta.');
      } else if (error.code === 'auth/user-not-found') {
        setMessage('No existe cuenta registrada con este email.');
      } else if (error.code === 'auth/invalid-email') {
        setMessage('Email inválido.');
      } else if (error.code === 'auth/too-many-requests') {
        setMessage('Demasiados intentos fallidos. Intenta más tarde.');
      } else {
        setMessage(error.message || 'Error al iniciar sesión.');
      }
    }
  };

  const handleResetPassword = async () => {
    if (!email) return;
    setStatus('loading');
    setMessage('');

    try {
      await sendPasswordResetEmail(authInstance, email);
      setStatus('success');
      setMessage(`Correo de recuperación enviado a ${email}. Revisa tu bandeja de entrada.`);
    } catch (error: any) {
      setStatus('error');
      setMessage(error.message || "Error al enviar correo.");
    }
  };

  const handleLinkAccount = async () => {
    if (!user || !email || !password) return;
    setStatus('loading');
    setMessage('');
    setErrorDetail(null);

    try {
      const credential = EmailAuthProvider.credential(email, password);
      await linkWithCredential(user, credential);
      
      setStatus('success');
      setMessage('¡Cuenta vinculada exitosamente! Tu usuario anónimo ahora es permanente.');
      setPassword(''); 
    } catch (error: any) {
      console.error("Link Error:", error);
      setStatus('error');
      
      if (error.code === 'auth/credential-already-in-use') {
        setMessage('Esta cuenta de correo ya está asociada a otro usuario.');
        setShowConflictModal(true);
      } else if (error.code === 'auth/operation-not-allowed') {
        setMessage('El proveedor Email/Password no está habilitado.');
        setErrorDetail('Ve a Firebase Console > Authentication > Sign-in method y habilita "Correo electrónico/contraseña".');
      } else if (error.code === 'auth/network-request-failed') {
        setMessage('Error de conexión con Firebase.');
        setErrorDetail('Verifica tu conexión a internet o configuración de red. Si ocurre consistentemente, puede ser un bloqueo de CORS o Firewall.');
      } else if (error.code === 'auth/weak-password') {
        setMessage('La contraseña es demasiado débil. Usa al menos 6 caracteres.');
      } else {
        setMessage(error.message || 'Error al vincular cuenta.');
      }
    }
  };

  if (!authInstance) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-xl border border-slate-200 border-dashed">
        <div className="bg-slate-50 p-4 rounded-full mb-4">
          <Shield className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-800">Laboratorio de Autenticación Inactivo</h3>
        <p className="text-slate-500 max-w-md mt-2 mb-6">
          Para usar este laboratorio, primero debes ejecutar el <strong>Diagnóstico de Firebase</strong> con éxito para establecer una conexión real.
        </p>
      </div>
    );
  }

  // --- RENDER HELPERS ---

  const renderUserInfo = () => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <UserCircle2 className="text-blue-500" size={20} />
          {user ? "Sesión Activa" : "Sin Sesión"}
        </h2>
        {user ? (
          user.isAnonymous ? (
            <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded-full border border-orange-200">
              ANÓNIMO
            </span>
          ) : (
            <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full border border-green-200">
              VERIFICADO
            </span>
          )
        ) : (
          <span className="px-3 py-1 bg-slate-100 text-slate-500 text-xs font-bold rounded-full">
            DESCONECTADO
          </span>
        )}
      </div>
      <div className="p-6">
        {user ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Firebase UID</label>
              <div className="font-mono text-xs md:text-sm bg-slate-900 text-green-400 p-3 rounded-lg overflow-x-auto">
                {user.uid}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Email</label>
                <div className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Mail size={16} className="text-slate-400" />
                  {user.email || 'Sin email (Cuenta Anónima)'}
                </div>
              </div>
              {!user.isAnonymous && (
                 <button 
                  onClick={handleLogout}
                  className="text-sm text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 flex items-center gap-2 transition-colors w-full md:w-auto justify-center md:justify-start"
                 >
                   <LogOut size={16} /> Cerrar Sesión
                 </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-2 text-slate-500 text-sm">
            No hay ningún usuario conectado actualmente. Inicia sesión para continuar.
          </div>
        )}
      </div>
    </div>
  );

  // --- MAIN RENDER ---

  // SCENARIO 1: USER IS PERMANENT/VERIFIED
  if (user && !user.isAnonymous) {
    return (
      <div className="space-y-6">
        {renderUserInfo()}
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield size={32} />
          </div>
          <h3 className="text-xl font-bold text-green-800">¡Cuenta Segura!</h3>
          <p className="text-green-700 mt-2 max-w-lg mx-auto">
            Estás autenticado como <strong>{user.email}</strong>. Tu cuenta es permanente y puedes iniciar sesión en cualquier dispositivo.
          </p>
          <div className="mt-6 flex justify-center">
             <button 
               onClick={handleLogout}
               className="bg-white text-green-700 border border-green-200 px-4 py-2 rounded-lg font-medium shadow-sm hover:bg-green-50 transition-colors flex items-center gap-2"
             >
               <LogOut size={16} /> Salir y Probar otra Cuenta
             </button>
          </div>
        </div>
      </div>
    );
  }

  // SCENARIO 2 & 3: ANONYMOUS OR LOGGED OUT
  return (
    <div className="space-y-6">
      {renderUserInfo()}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* TABS HEADER */}
        {user?.isAnonymous && (
           <div className="flex border-b border-slate-100">
             <button
               onClick={() => switchMode('link')}
               className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                 mode === 'link' ? 'text-orange-600 border-b-2 border-orange-500 bg-orange-50/50' : 'text-slate-500 hover:bg-slate-50'
               }`}
             >
               <LinkIcon size={16} /> Vincular (Guardar Progreso)
             </button>
             <button
               onClick={() => switchMode('login')}
               className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                 mode === 'login' || mode === 'reset' ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'
               }`}
             >
               <LogIn size={16} /> Iniciar Sesión (Otra Cuenta)
             </button>
           </div>
        )}

        {/* FORMS CONTENT */}
        <div className="p-6">
          {mode === 'reset' ? (
             // --- RESET PASSWORD FORM ---
             <div className="max-w-md mx-auto animate-in fade-in slide-in-from-right-4">
               <button 
                 onClick={() => switchMode('login')}
                 className="mb-4 text-xs font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1"
               >
                 <ArrowLeft size={12} /> Volver al Login
               </button>
               <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                 <HelpCircle className="text-blue-500" size={20} /> Recuperar Contraseña
               </h3>
               <p className="text-sm text-slate-600 mb-6">Te enviaremos un enlace a tu correo para que puedas crear una nueva contraseña.</p>
               
               <div className="space-y-4">
                 <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Correo Electrónico</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                      <input 
                        type="email" 
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="tu@email.com"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      />
                    </div>
                 </div>
                 <button
                    onClick={handleResetPassword}
                    disabled={status === 'loading' || !email}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                  >
                     {status === 'loading' ? <RefreshCw className="animate-spin" size={18} /> : 'Enviar Correo'}
                  </button>
               </div>
             </div>

          ) : mode === 'login' ? (
            // --- LOGIN FORM ---
            <div className="max-w-md mx-auto animate-in fade-in">
              <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                <LogIn className="text-blue-500" size={20} /> Iniciar Sesión
              </h3>
              <p className="text-sm text-slate-600 mb-6">
                {user?.isAnonymous 
                  ? "Accede a una cuenta existente. ⚠️ Advertencia: Se perderán los datos de la sesión anónima actual."
                  : "Ingresa tus credenciales para acceder a tu cuenta."}
              </p>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Correo Electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input 
                      type="email" 
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="usuario@ejemplo.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Contraseña</label>
                    <button 
                      onClick={() => switchMode('reset')}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input 
                      type="password" 
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    />
                  </div>
                </div>

                <button
                  onClick={handleLogin}
                  disabled={status === 'loading' || !email || !password}
                  className="mt-2 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 transition-all"
                >
                   {status === 'loading' ? <RefreshCw className="animate-spin" size={18} /> : <ArrowRight size={18} />}
                   Entrar
                </button>
              </div>
            </div>

          ) : (
            // --- LINK FORM (Default for Anonymous) ---
            <div className="max-w-md mx-auto animate-in fade-in">
              <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                <LinkIcon className="text-orange-500" size={20} /> Convertir a Permanente
              </h3>
              <p className="text-sm text-slate-600 mb-6">
                Crea una contraseña para tu ID actual. Esto guardará todo tu progreso y te permitirá volver a entrar después.
              </p>
              
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Correo Electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input 
                      type="email" 
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="usuario@ejemplo.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Contraseña Nueva</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input 
                      type="password" 
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                    />
                  </div>
                </div>

                <button
                  onClick={handleLinkAccount}
                  disabled={status === 'loading' || !email || !password}
                  className="mt-2 w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 transition-all"
                >
                   {status === 'loading' ? <RefreshCw className="animate-spin" size={18} /> : <Shield size={18} />}
                   Vincular Cuenta
                </button>
              </div>
            </div>
          )}

          {/* SHARED FEEDBACK AREA */}
          {message && status !== 'loading' && !showConflictModal && (
            <div className={`mt-6 p-4 rounded-lg flex flex-col gap-1 text-sm animate-in slide-in-from-bottom-2 ${
              status === 'error' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-green-100 text-green-800 border border-green-200'
            }`}>
              <div className="flex items-start gap-2 font-medium">
                {status === 'error' ? <AlertCircle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
                <span>{message}</span>
              </div>
              
              {/* Detailed Instruction for Config Errors */}
              {errorDetail && (
                <div className="ml-6 mt-1 text-xs bg-white/50 p-2 rounded border border-red-200/50">
                  <p className="mb-2 font-semibold flex items-center gap-1">
                    <Settings size={12} /> Acción Requerida:
                  </p>
                  <p>{errorDetail}</p>
                  <a 
                    href="https://console.firebase.google.com/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    Ir a Firebase Console <ExternalLink size={10} />
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CONFLICT MODAL (Only used when LINKING fails) */}
      {showConflictModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-red-50 p-6 border-b border-red-100 flex items-start gap-4">
               <div className="p-3 bg-red-100 rounded-full text-red-600 shrink-0">
                 <AlertTriangle size={24} />
               </div>
               <div>
                 <h3 className="text-lg font-bold text-slate-900">Correo ya registrado</h3>
                 <p className="text-sm text-slate-600 mt-1">
                   El correo <strong>{email}</strong> ya existe.
                 </p>
               </div>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                No se puede vincular porque ya existe una cuenta. ¿Deseas iniciar sesión en ella? (Perderás los datos actuales).
              </p>
              <div className="flex gap-3">
                 <button 
                  onClick={() => {
                    setShowConflictModal(false);
                    switchMode('login');
                    // Email is already set, user just types password in login form
                  }}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Ir al Login
                </button>
                <button 
                  onClick={() => {
                    setShowConflictModal(false);
                  }}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
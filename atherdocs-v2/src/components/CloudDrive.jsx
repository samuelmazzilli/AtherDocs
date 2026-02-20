import React, { useState, useEffect } from 'react';
import { supabase } from '../supbaseCLient.js';
import { Cloud, Lock, Mail, Key, LogOut, FileText, Plus, Server } from 'lucide-react';

const CloudDrive = () => {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true); // Alterna tra Login e Registrazione

  // Controlla se l'utente è già loggato all'avvio
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Ascolta i cambiamenti (es. quando l'utente fa login o logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('Registrazione completata! -verified');
      }
    } catch (error) {
      alert(error.error_description || error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // --- VISTA 1: SCHERMATA DI LOGIN / REGISTRAZIONE ---
  if (!session) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0a0d12]">
        <div className="w-full max-w-md p-8 space-y-8 bg-[#161b22] rounded-2xl border border-gray-800 shadow-2xl">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center mb-4 shadow-lg">
              <Cloud size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">AtherDocs Cloud</h2>
            <p className="text-gray-400 text-sm mt-2">Accedi al tuo spazio di lavoro sincronizzato.</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                <input
                  type="email"
                  placeholder="Indirizzo Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#0d1117] border border-gray-700 text-white rounded-lg pl-10 pr-4 py-2.5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all"
                  required
                />
              </div>
              <div className="relative">
                <Key className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#0d1117] border border-gray-700 text-white rounded-lg pl-10 pr-4 py-2.5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2.5 rounded-lg shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all disabled:opacity-50"
            >
              {loading ? 'Elaborazione...' : (isLogin ? 'Accedi al Cloud' : 'Crea Account')}
            </button>
          </form>

          <div className="text-center">
            <button onClick={() => setIsLogin(!isLogin)} className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
              {isLogin ? "Non hai un account? Registrati" : "Hai già un account? Accedi"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- VISTA 2: DASHBOARD CLOUD (Utente Loggato) ---
  return (
    <div className="flex h-full bg-[#0d1117] text-gray-300">
      
      {/* Sidebar Cloud */}
      <aside className="w-64 border-r border-gray-800 bg-[#161b22] flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-sm font-bold text-purple-400 tracking-wider uppercase flex items-center gap-2">
            <Server size={16} /> Cloud Storage
          </h2>
          <p className="text-xs text-gray-500 mt-1 truncate">{session.user.email}</p>
        </div>
        
        <div className="p-2 space-y-1 overflow-y-auto flex-1">
          <button className="w-full flex items-center gap-3 p-2 rounded-lg bg-purple-600/10 text-purple-400 hover:bg-purple-600/20 text-sm transition-colors text-left border border-purple-500/20">
            <Plus size={18} />
            <span>Nuovo File Cloud</span>
          </button>
          
          <hr className="border-gray-800 my-4" />
          
          <p className="text-xs text-gray-600 px-2">I tuoi file appariranno qui...</p>
        </div>

        <div className="p-4 border-t border-gray-800">
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-sm bg-transparent border border-gray-600 hover:bg-red-900/30 hover:text-red-400 hover:border-red-800 px-3 py-2 rounded transition-colors">
            <LogOut size={16} /> Disconnetti
          </button>
        </div>
      </aside>

      {/* Area Editor Cloud */}
      <main className="flex-1 flex flex-col items-center justify-center bg-[#0a0d12]">
        <div className="text-center space-y-4 opacity-50">
          <Cloud size={64} className="mx-auto text-gray-600" />
          <p className="text-lg">Seleziona o crea un file nel Cloud per iniziare.</p>
        </div>
      </main>
    </div>
  );
};

export default CloudDrive;
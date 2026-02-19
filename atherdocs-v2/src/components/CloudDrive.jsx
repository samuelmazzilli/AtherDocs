import React, { useState } from 'react';
import { Cloud, UploadCloud, Folder, File, Server } from 'lucide-react';

const CloudDrive = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false); // Simula lo stato di Auth

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#0d1117] text-white">
        <div className="p-4 bg-purple-600/20 rounded-2xl mb-6 shadow-[0_0_50px_rgba(168,85,247,0.3)]">
          <Server size={64} className="text-purple-500" />
        </div>
        <h1 className="text-3xl font-bold mb-2">AtherDocs <span className="text-purple-400">AI Cloud</span></h1>
        <p className="text-gray-400 mb-8">Nuovo Motore Cloud Infallibile + IA Auto-Curante.</p>
        <button 
          onClick={() => setIsLoggedIn(true)}
          className="bg-purple-600 hover:bg-purple-500 px-8 py-3 rounded-lg font-semibold transition-all shadow-lg"
        >
          Accedi al Cloud Gratuito
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[#0d1117] text-gray-300 p-6">
      <div className="w-full h-full border border-gray-800 rounded-xl bg-[#161b22] flex flex-col">
        <header className="p-4 border-b border-gray-800 flex justify-between items-center">
          <h2 className="flex items-center gap-2 font-bold text-white"><Cloud className="text-purple-400"/> Il tuo Spazio Cloud</h2>
          <button className="flex items-center gap-2 bg-[#2d333b] hover:bg-gray-700 px-4 py-2 rounded text-sm transition-colors">
            <UploadCloud size={16} /> Carica File
          </button>
        </header>
        
        <div className="p-6 grid grid-cols-4 gap-4">
          {/* Mockup di file nel cloud */}
          <div className="border border-gray-700 p-4 rounded-lg flex flex-col items-center justify-center gap-3 hover:bg-gray-800 cursor-pointer transition-colors">
            <Folder size={48} className="text-blue-400" />
            <span className="text-sm">Progetti_React</span>
          </div>
          <div className="border border-gray-700 p-4 rounded-lg flex flex-col items-center justify-center gap-3 hover:bg-gray-800 cursor-pointer transition-colors">
            <File size={48} className="text-gray-400" />
            <span className="text-sm">appunti_ai.txt</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CloudDrive;
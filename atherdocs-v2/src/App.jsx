import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { HardDrive, Cloud, Settings } from 'lucide-react';
import LocalDrive from './components/LocalDrive';
import CloudDrive from './components/CloudDrive';
import Chatbot from './components/Chatbot';

// SidebarLink Component (Invariato)
const SidebarLink = ({ to, icon: Icon, label, defaultColor }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link 
      to={to} 
      className={`p-3 rounded-xl transition-all duration-300 flex items-center justify-center ${
        isActive ? 'bg-gray-800 text-white shadow-md' : 'text-gray-500 hover:bg-gray-800/50 hover:text-gray-300'
      }`}
      title={label}
    >
      <Icon size={26} className={isActive ? defaultColor : ''} />
    </Link>
  );
};

const App = () => {
  return (
    <Router>
      {/* Contenitore Principale: h-screen e w-screen assicurano la dimensione piena */}
      <div className="flex h-screen w-screen bg-[#0d1117] text-gray-300 font-sans overflow-hidden">
        
        {/* Sidebar di Navigazione (Fissa a sinistra) */}
        <aside className="w-20 flex-shrink-0 bg-[#161b22] border-r border-gray-800 flex flex-col items-center py-6 gap-6 z-20 shadow-2xl">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg mb-4 cursor-pointer">
            <span className="font-extrabold text-white text-2xl tracking-tighter">A</span>
          </div>
          <nav className="flex flex-col gap-4 w-full px-3">
            <SidebarLink to="/" icon={HardDrive} label="Disco Locale" defaultColor="text-blue-400" />
            <SidebarLink to="/cloud" icon={Cloud} label="AtherDocs Cloud" defaultColor="text-purple-400" />
          </nav>
          <div className="mt-auto p-3 text-gray-500 hover:bg-gray-800/50 hover:text-white rounded-xl cursor-pointer transition-all">
            <Settings size={26} />
          </div>
        </aside>

        {/* Area Contenuto Principale (Si espande per riempire lo spazio) */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <main className="flex-1 overflow-hidden relative bg-[#0a0d12] h-full w-full">
            <Routes>
              <Route path="/" element={<LocalDrive />} />
              <Route path="/cloud" element={<CloudDrive />} />
            </Routes>
          </main>
          
          {/* Astro AI: Posizionato qui per essere sopra a tutto */}
          <Chatbot />
        </div>
        
      </div>
    </Router>
  );
};

export default App;
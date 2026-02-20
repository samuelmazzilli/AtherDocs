import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { 
  Folder, FileCode2, Image as ImageIcon, Save, Download, 
  Plus, Search, Bold, Italic, Underline, AlignLeft, Sparkles 
} from 'lucide-react';

const LocalDrive = () => {
  const [fileHandle, setFileHandle] = useState(null);
  const [content, setContent] = useState('// Seleziona o crea un file dall\'esploratore.\nconsole.log("AtherDocs V2 Inizializzato");');
  const [fileName, setFileName] = useState('SenzaTitolo.js');
  const [language, setLanguage] = useState('javascript');
  const [fileType, setFileType] = useState('code'); 

  // 1. Creazione di un Nuovo File
  const handleNewFile = () => {
    setFileHandle(null);
    setFileName('Nuovo_File.js');
    setContent('');
    setLanguage('javascript');
    setFileType('code');
  };

  // 2. Lettura File (Disco Locale)
  const openFile = async () => {
    try {
      const [handle] = await window.showOpenFilePicker();
      const file = await handle.getFile();
      setFileHandle(handle);
      setFileName(file.name);

      const ext = file.name.split('.').pop().toLowerCase();
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'];
      
      if (imageExts.includes(ext)) {
        setFileType('image');
        setContent(URL.createObjectURL(file));
      } else {
        setFileType('code');
        const text = await file.text();
        setContent(text);
        const langMap = { js: 'javascript', jsx: 'javascript', html: 'html', css: 'css', json: 'json', md: 'markdown' };
        setLanguage(langMap[ext] || 'plaintext');
      }
    } catch (error) {
      console.log('Apertura annullata', error);
    }
  };

  // 3. Salvataggio / Esportazione
  const saveFile = async () => {
    try {
      let handleToUse = fileHandle;
      if (!handleToUse) {
        handleToUse = await window.showSaveFilePicker({ suggestedName: fileName });
        setFileHandle(handleToUse);
      }
      const writable = await handleToUse.createWritable();
      await writable.write(content);
      await writable.close();
      alert('File salvato con successo! -verified');
    } catch (error) {
      console.error('Errore di salvataggio:', error);
    }
  };

  return (
    <div className="flex h-full bg-[#0d1117] text-gray-300 font-sans">
      
      {/* Sidebar - Esplora Risorse */}
      <aside className="w-64 border-r border-gray-800 bg-[#161b22] flex flex-col">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-bold text-blue-400 tracking-wider uppercase">Disco Locale</h2>
          <button onClick={handleNewFile} className="text-gray-400 hover:text-white"><Plus size={18} /></button>
        </div>
        
        <div className="p-2 space-y-1 overflow-y-auto">
          <button onClick={openFile} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 text-sm transition-colors text-left">
            <Folder size={18} className="text-blue-500" />
            <span>Apri dal PC...</span>
          </button>
          
          <hr className="border-gray-800 my-2" />
          
          {/* File Attivo Simulato nella Tree */}
          <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-800 text-sm text-white border border-gray-700">
            {fileType === 'image' ? <ImageIcon size={18} className="text-green-400" /> : <FileCode2 size={18} className="text-yellow-400" />}
            <span className="truncate">{fileName}</span>
          </div>
        </div>
      </aside>

      {/* Area Principale */}
      <main className="flex-1 flex flex-col bg-[#0a0d12]">
        
        {/* Toolbar Stile Word/IDE */}
        <header className="h-14 border-b border-gray-800 bg-[#161b22] flex items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <select className="bg-[#0d1117] border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 outline-none">
              <option>Sans Serif</option>
              <option>Monospace</option>
            </select>
            <div className="flex items-center gap-1 border-l border-r border-gray-800 px-4">
              <button className="p-1.5 hover:bg-gray-700 rounded text-gray-400"><Bold size={14} /></button>
              <button className="p-1.5 hover:bg-gray-700 rounded text-gray-400"><Italic size={14} /></button>
              <button className="p-1.5 hover:bg-gray-700 rounded text-gray-400"><Underline size={14} /></button>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button onClick={saveFile} className="flex items-center gap-2 text-xs bg-transparent border border-gray-600 hover:bg-gray-800 px-3 py-1.5 rounded transition-colors">
              <Download size={14} /> Esporta
            </button>
            <button className="flex items-center gap-2 text-xs bg-purple-600 hover:bg-purple-500 text-white px-4 py-1.5 rounded shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all">
              <Sparkles size={14} /> Aether AI
            </button>
          </div>
        </header>

        {/* Workspace - Editor o Immagine */}
        <div className="flex-1 relative overflow-hidden p-4">
          {fileType === 'image' ? (
            <div className="w-full h-full flex items-center justify-center bg-[#0d1117] rounded-xl border border-gray-800">
              <img src={content} alt="Preview" className="max-w-full max-h-full object-contain rounded drop-shadow-2xl" />
            </div>
          ) : (
            <div className="w-full h-full rounded-xl overflow-hidden border border-gray-800 shadow-2xl">
              <Editor
                height="100%"
                language={language}
                theme="vs-dark"
                value={content}
                onChange={setContent}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: "'Fira Code', monospace",
                  wordWrap: 'on',
                  padding: { top: 16 },
                }}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default LocalDrive;
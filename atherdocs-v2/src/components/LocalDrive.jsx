import React, { useState, useEffect } from 'react';
import CodeEditor from './CodeEditor';
import { FolderOpen, Save, FileCode2, Image as ImageIcon } from 'lucide-react';

const LocalDrive = () => {
  const [fileHandle, setFileHandle] = useState(null);
  const [fileType, setFileType] = useState('code'); // 'code' o 'image'
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState(null);
  const [fileName, setFileName] = useState('');
  const [language, setLanguage] = useState('plaintext');

  // Pulizia della memoria per le immagini
  useEffect(() => {
    return () => { if (imageUrl) URL.revokeObjectURL(imageUrl); };
  }, [imageUrl]);

  const openFile = async () => {
    try {
      const [handle] = await window.showOpenFilePicker();
      const file = await handle.getFile();
      const ext = file.name.split('.').pop().toLowerCase();
      
      setFileHandle(handle);
      setFileName(file.name);

      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'];
      
      if (imageExts.includes(ext)) {
        // Gestione Immagini
        setFileType('image');
        if (imageUrl) URL.revokeObjectURL(imageUrl); // Libera la memoria precedente
        setImageUrl(URL.createObjectURL(file));
      } else {
        // Gestione Testo / Codice
        setFileType('code');
        const text = await file.text();
        setContent(text);
        
        const langMap = { 
          js: 'javascript', jsx: 'javascript', html: 'html', 
          css: 'css', json: 'json', php: 'php', py: 'python', md: 'markdown', txt: 'plaintext'
        };
        setLanguage(langMap[ext] || 'plaintext');
      }
    } catch (error) {
      console.log('Apertura annullata.', error);
    }
  };

  const saveFile = async () => {
    if (!fileHandle || fileType !== 'code') {
      alert('Puoi salvare solo file di testo al momento.');
      return;
    }
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      alert('File salvato! -verified');
    } catch (error) {
      console.error('Errore durante il salvataggio:', error);
    }
  };

  return (
    <div className="flex h-full bg-[#0d1117] text-gray-300">
      <aside className="w-64 border-r border-gray-800 flex flex-col bg-[#161b22] p-4">
        <h2 className="text-xs font-bold text-gray-500 tracking-wider uppercase mb-4">Disco Locale</h2>
        <button onClick={openFile} className="flex items-center justify-center gap-2 bg-[#1f242c] hover:bg-[#2d333b] border border-gray-700 p-2 rounded text-sm transition-all">
          <FolderOpen size={16} className="text-blue-400" /> Sfoglia File
        </button>
        
        {fileName && (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-200 p-2 bg-gray-800/60 rounded border border-gray-700">
            {fileType === 'image' ? <ImageIcon size={16} className="text-green-400" /> : <FileCode2 size={16} className="text-[#a855f7]" />}
            <span className="truncate">{fileName}</span>
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col p-4 gap-4 h-full">
        <header className="flex justify-between items-center bg-[#161b22] p-3 rounded-lg border border-gray-800">
          <div className="text-sm font-mono text-gray-400">
            {fileType === 'code' ? `Linguaggio: ${language}` : 'Visualizzatore Immagini'}
          </div>
          {fileType === 'code' && (
            <button onClick={saveFile} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm">
              <Save size={16} /> Salva
            </button>
          )}
        </header>
        
        <div className="flex-1 overflow-hidden flex items-center justify-center bg-[#0a0d12] rounded-lg border border-gray-800">
          {fileType === 'code' ? (
            <CodeEditor language={language} content={content} onChange={setContent} />
          ) : (
            <img src={imageUrl} alt="Anteprima" className="max-w-full max-h-full object-contain rounded drop-shadow-2xl" />
          )}
        </div>
      </main>
    </div>
  );
};

export default LocalDrive;
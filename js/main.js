import { initEditor } from './editor.js';
import { initFS } from './fs.js';
import { initUI } from './ui.js';
import { initExport } from './export.js';
import { initAudio } from './audio.js';

document.addEventListener('DOMContentLoaded', () => {
    try {
        const editor = initEditor();
        const fsManager = initFS(editor);
        
        initUI(editor, fsManager);
        initExport(editor, fsManager);
        initAudio(editor);
        
        console.log("🚀 AetherDocs: Boot Completato. Zero Errori.");
    } catch (err) {
        console.error("❌ Eccezione Imprevista:", err);
    }
});
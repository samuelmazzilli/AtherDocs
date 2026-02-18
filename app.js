// --- 1. CONFIGURAZIONE FONT QUILL ---
const Font = Quill.import('formats/font');
Font.whitelist = ['sans-serif', 'serif', 'monospace'];
Quill.register(Font, true);

// --- 2. INIZIALIZZAZIONE EDITOR ---
const editor = new Quill('#editor-container', {
    theme: 'snow',
    placeholder: 'Il tuo capolavoro inizia da qui...',
    modules: { toolbar: '#custom-toolbar' }
});

// IL BOTTONE MAGICO: Importa Immagini & PDF
document.getElementById('btn-custom-media').addEventListener('click', () => {
    const input = document.getElementById('media-input');
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (re) => {
            const range = editor.getSelection(true);
            if (file.type === 'application/pdf') {
                // Genera un allegato PDF stile bottone cliccabile integrato nel testo!
                const pdfLink = `<br><a href="${re.target.result}" download="${file.name}" class="pdf-attachment" contenteditable="false"><i class="ph-fill ph-file-pdf text-red-400 text-lg"></i> Clicca per visualizzare/scaricare: ${file.name}</a><br><br>`;
                editor.clipboard.dangerouslyPasteHTML(range.index, pdfLink);
                editor.setSelection(range.index + 2);
            } else {
                // Incolla l'immagine nativamente
                editor.insertEmbed(range.index, 'image', re.target.result);
                editor.setSelection(range.index + 1);
            }
        };
        reader.readAsDataURL(file);
        input.value = ''; // reset
    };
    input.click();
});

// --- 3. STATO DELL'APP E SISTEMA A TABS ---
let rootDirHandle = null;
let openTabs = []; // Array di { id, name, handle, content, isDirty }
let activeTabId = null;
let saveTimeout = null;
let isSwitching = false;

const DOM = {
    welcome: document.getElementById('welcome-screen'),
    workspace: document.getElementById('app-workspace'),
    tree: document.getElementById('file-tree'),
    tabsContainer: document.getElementById('tabs-container'),
    editorWrapper: document.getElementById('editor-wrapper'),
    noFile: document.getElementById('no-file-open'),
    status: document.getElementById('save-status')
};

// Avvio Workspace
document.getElementById('btn-welcome-open').onclick = async () => {
    try {
        rootDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        DOM.welcome.classList.add('opacity-0', 'pointer-events-none');
        DOM.workspace.classList.remove('opacity-0', 'pointer-events-none');
        DOM.tree.innerHTML = '<div class="text-xs text-center text-gray-500 mt-6 animate-pulse">Scansione in corso...</div>';
        await buildTree(rootDirHandle, DOM.tree, 0);
    } catch (e) { if(e.name !== 'AbortError') alert("Devi concedere i permessi per usare l'app."); }
};

// Costruzione Albero Directory Ricorsivo
async function buildTree(dirHandle, containerElement, level = 0) {
    if (level === 0) containerElement.innerHTML = ''; 
    let entries = [];
    for await (const entry of dirHandle.values()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') entries.push(entry);
    }
    entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : (a.kind === 'directory' ? -1 : 1)));

    for (const entry of entries) {
        const itemDiv = document.createElement('div');
        const pl = (level * 16) + 8;
        itemDiv.style.paddingLeft = `${pl}px`;
        
        if (entry.kind === 'directory') {
            itemDiv.className = "tree-item flex items-center gap-2 py-1.5 pr-2 text-gray-300";
            itemDiv.innerHTML = `<i class="ph-bold ph-caret-right text-[10px] text-gray-500 transition-transform"></i> <i class="ph-fill ph-folder text-blue-400 text-lg opacity-80"></i> <span class="truncate">${entry.name}</span>`;
            
            const subContainer = document.createElement('div');
            subContainer.className = 'hidden flex-col w-full';
            
            itemDiv.onclick = async (e) => {
                e.stopPropagation();
                const caret = itemDiv.querySelector('.ph-caret-right');
                if (subContainer.classList.toggle('hidden')) { caret.style.transform = 'rotate(0deg)'; } 
                else {
                    caret.style.transform = 'rotate(90deg)';
                    if (subContainer.innerHTML === '') await buildTree(await dirHandle.getDirectoryHandle(entry.name), subContainer, level + 1);
                }
            };
            containerElement.appendChild(itemDiv);
            containerElement.appendChild(subContainer);
        } else {
            const ext = entry.name.split('.').pop().toLowerCase();
            if (!['txt', 'html', 'md', 'js', 'css', 'json'].includes(ext)) continue;
            
            let icon = 'ph-file-text text-gray-400';
            if(ext === 'html') icon = 'ph-file-html text-orange-400';
            if(ext === 'md') icon = 'ph-markdown-logo text-blue-300';

            itemDiv.className = "tree-item file-node flex items-center gap-2 py-1.5 pr-2 text-gray-300";
            itemDiv.dataset.id = entry.name; // Usiamo il nome come ID temporaneo
            itemDiv.innerHTML = `<div class="w-[10px]"></div><i class="ph-fill ${icon} text-lg"></i><span class="truncate">${entry.name}</span>`;
            
            itemDiv.onclick = (e) => { e.stopPropagation(); openFileTab(entry); };
            containerElement.appendChild(itemDiv);
        }
    }
}

// Logica Tabs (Apertura e Switch)
async function openFileTab(fileHandle) {
    const tabId = fileHandle.name;
    let existingTab = openTabs.find(t => t.id === tabId); 
    
    if (!existingTab) {
        try {
            const file = await fileHandle.getFile();
            let text = await file.text();
            
            // Format fallback per file txt o md
            if (!file.name.endsWith('.html') && text) text = text.split('\n').map(line => `<p>${line}</p>`).join('');
            
            existingTab = { id: tabId, name: file.name, handle: fileHandle, content: text, isDirty: false };
            openTabs.push(existingTab);
        } catch(e) { return alert("Impossibile leggere il file."); }
    }
    switchTab(existingTab.id);
}

function switchTab(tabId) {
    if (activeTabId && !isSwitching) {
        // Salva il contenuto del tab precedente in memoria PRIMA di cambiare
        const prevTab = openTabs.find(t => t.id === activeTabId);
        if (prevTab) prevTab.content = editor.root.innerHTML;
    }

    isSwitching = true;
    activeTabId = tabId;
    const tab = openTabs.find(t => t.id === tabId);

    if (tab) {
        DOM.noFile.classList.add('hidden');
        DOM.editorWrapper.classList.remove('opacity-0', 'pointer-events-none');
        
        editor.root.innerHTML = tab.content; // Carica il nuovo contenuto

        // Evidenzia Sidebar
        document.querySelectorAll('.file-node').forEach(el => el.classList.remove('file-active'));
        const activeNode = document.querySelector(`.file-node[data-id="${tab.id}"]`);
        if(activeNode) activeNode.classList.add('file-active');
        
        updateStatus(tab.isDirty ? 'Modificato' : 'Sincronizzato', tab.isDirty ? 'bg-yellow-900/30 text-yellow-500' : 'bg-gray-800 text-gray-300');
    }
    
    renderTabs();
    setTimeout(() => { isSwitching = false; }, 100);
}

function closeTab(e, tabId) {
    e.stopPropagation();
    const index = openTabs.findIndex(t => t.id === tabId);
    if (index === -1) return;
    
    openTabs.splice(index, 1);
    if (openTabs.length === 0) {
        activeTabId = null;
        DOM.editorWrapper.classList.add('opacity-0', 'pointer-events-none');
        DOM.noFile.classList.remove('hidden');
        document.querySelectorAll('.file-node').forEach(el => el.classList.remove('file-active'));
        updateStatus('Pronto', 'bg-gray-800 text-gray-300');
    } else if (activeTabId === tabId) {
        switchTab(openTabs[Math.max(0, index - 1)].id);
    } else {
        renderTabs();
    }
}

function renderTabs() {
    DOM.tabsContainer.innerHTML = '';
    openTabs.forEach(tab => {
        const div = document.createElement('div');
        div.className = `editor-tab ${tab.id === activeTabId ? 'active' : ''} ${tab.isDirty ? 'dirty' : ''}`;
        
        let icon = tab.name.endsWith('.html') ? 'ph-file-html text-orange-400' : (tab.name.endsWith('.md') ? 'ph-markdown-logo text-blue-400' : 'ph-file-text');

        div.innerHTML = `
            <i class="ph-fill ${icon} text-sm shrink-0"></i>
            <span class="truncate tab-title">${tab.name}</span>
            <button class="tab-close"><i class="ph-bold ph-x text-[10px]"></i></button>
        `;
        div.onclick = () => { if (activeTabId !== tab.id) switchTab(tab.id); };
        div.querySelector('.tab-close').onclick = (e) => closeTab(e, tab.id);
        DOM.tabsContainer.appendChild(div);
    });
}

// --- 4. AUTO-SAVE E METRICHE ---
function updateStatus(state, colorClass) {
    DOM.status.className = `px-2 py-0.5 rounded text-[11px] font-mono border border-transparent ${colorClass}`;
    DOM.status.innerText = state;
}

editor.on('text-change', () => {
    if (isSwitching || !activeTabId) return;
    
    const text = editor.getText().trim();
    document.getElementById('stat-words').innerText = `${text.length > 0 ? text.split(/\s+/).length : 0} Parole`;
    document.getElementById('stat-chars').innerText = `${text.length} Caratteri`;
    
    const tab = openTabs.find(t => t.id === activeTabId);
    if(tab) {
        tab.content = editor.root.innerHTML;
        if (!tab.isDirty) {
            tab.isDirty = true;
            renderTabs(); // Attiva il pallino giallo di "modifica non salvata" sul tab
        }
        updateStatus('Salvataggio...', 'bg-yellow-900/40 text-yellow-500 border-yellow-700/50');
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => saveFileContent(tab), 1200);
    }
});

async function saveFileContent(tab) {
    try {
        const writable = await tab.handle.createWritable();
        // Se è HTML salva tutto, altrimenti estrae solo il testo per MD e TXT
        const content = tab.name.endsWith('.html') ? tab.content : editor.getText();
        await writable.write(content);
        await writable.close();
        tab.isDirty = false;
        if (activeTabId === tab.id) {
            updateStatus('Sincronizzato ✓', 'bg-green-900/40 text-green-400 border-green-700/50');
            renderTabs();
        }
    } catch(e) { updateStatus('Errore FS', 'bg-red-900/40 text-red-400 border-red-700/50'); }
}

// Creazione Nuovo File
document.getElementById('btn-new-file').onclick = async () => {
    if (!rootDirHandle) return;
    const name = prompt("Nome del file (es: script.html, appunti.md):", "nuovo.html");
    if (!name) return;
    try {
        const handle = await rootDirHandle.getFileHandle(name, { create: true });
        await buildTree(rootDirHandle, DOM.tree, 0); 
        openFileTab(handle);
    } catch(e) { alert("Errore creazione file"); }
};

// --- 5. EXPORT DI MASSA (Librerie e Native Blob) ---
const getBaseName = () => {
    const tab = openTabs.find(t => t.id === activeTabId);
    return tab ? tab.name.replace(/\.[^/.]+$/, "") : "Documento";
};

const downloadData = (content, ext, mime) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = `${getBaseName()}.${ext}`;
    a.click();
};

document.getElementById('exp-pdf').onclick = () => {
    if(!activeTabId) return;
    html2pdf().set({ margin: 15, filename: `${getBaseName()}.pdf`, html2canvas: { scale: 2 } }).from(editor.root).save();
};
document.getElementById('exp-html').onclick = () => {
    if(!activeTabId) return; downloadData(editor.root.innerHTML, 'html', 'text/html');
};
document.getElementById('exp-md').onclick = () => {
    if(!activeTabId) return;
    const td = new TurndownService({ headingStyle: 'atx' });
    downloadData(td.turndown(editor.root.innerHTML), 'md', 'text/markdown');
};
document.getElementById('exp-txt').onclick = () => {
    if(!activeTabId) return; downloadData(editor.getText(), 'txt', 'text/plain');
};

// Esportazione Nativa in Word DOCX (tramite html-docx-js)
document.getElementById('exp-docx').onclick = () => {
    if(!activeTabId) return;
    const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${editor.root.innerHTML}</body></html>`;
    const convertedBlob = htmlDocx.asBlob(content);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(convertedBlob);
    a.download = `${getBaseName()}.docx`;
    a.click();
};
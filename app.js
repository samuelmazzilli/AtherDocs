// Inizializzazione Editor (Quill)
const editor = new Quill('#editor-container', {
    theme: 'snow',
    placeholder: 'Inizia a scrivere il tuo capolavoro qui...',
    modules: {
        toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'color': [] }, { 'background': [] }],
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            ['blockquote', 'code-block', 'link'],
            ['clean']
        ]
    }
});

let rootDirHandle = null;
let currentFileHandle = null;
let saveTimeout = null;

const DOM = {
    tree: document.getElementById('file-tree'),
    fileName: document.getElementById('current-file-name'),
    status: document.getElementById('save-status')
};

function updateStatus(state) {
    if (state === 'saving') {
        DOM.status.className = "ml-2 px-2 py-0.5 rounded-full bg-yellow-900/30 text-yellow-500 text-[10px] font-mono border border-yellow-700/50";
        DOM.status.innerText = "Salvataggio...";
    } else if (state === 'saved') {
        DOM.status.className = "ml-2 px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 text-[10px] font-mono border border-green-700/50";
        DOM.status.innerText = "Salvato";
    }
}

editor.on('text-change', () => {
    const text = editor.getText().trim();
    const words = text.length > 0 ? text.split(/\s+/).length : 0;
    document.getElementById('stat-words').innerText = `${words} parole`;
    document.getElementById('stat-chars').innerText = `${text.length} caratteri`;
    
    if (currentFileHandle) {
        updateStatus('saving');
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveFile, 1500); // Auto-save istantaneo
    }
});

// IL VERO ALGORITMO RICORSIVO (Come VS Code)
async function buildTree(dirHandle, containerElement, level = 0) {
    if (level === 0) containerElement.innerHTML = ''; 
    let entries = [];
    
    for await (const entry of dirHandle.values()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            entries.push(entry);
        }
    }

    // Ordina: Prima le cartelle (A-Z), poi i file (A-Z)
    entries.sort((a, b) => {
        if (a.kind === b.kind) return a.name.localeCompare(b.name);
        return a.kind === 'directory' ? -1 : 1;
    });

    for (const entry of entries) {
        const itemDiv = document.createElement('div');
        const paddingLeft = (level * 16) + 16; // Indentazione matematica
        itemDiv.style.paddingLeft = `${paddingLeft}px`;
        
        if (entry.kind === 'directory') {
            itemDiv.className = "tree-item flex items-center gap-2 py-1.5 pr-2 text-gray-300";
            itemDiv.innerHTML = `
                <i class="ph-bold ph-caret-right text-[10px] text-gray-500 transition-transform duration-200"></i>
                <i class="ph-fill ph-folder text-blue-400 text-lg opacity-80"></i>
                <span class="truncate">${entry.name}</span>
            `;
            
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'hidden flex-col w-full';
            
            // Lazy Loading: entra nella sottocartella SOLO quando la apri
            itemDiv.onclick = async (e) => {
                e.stopPropagation();
                const caret = itemDiv.querySelector('.ph-caret-right');
                const isHidden = childrenContainer.classList.contains('hidden');
                
                if (isHidden) {
                    childrenContainer.classList.remove('hidden');
                    caret.style.transform = 'rotate(90deg)';
                    if (childrenContainer.innerHTML === '') {
                        childrenContainer.innerHTML = `<div class="text-xs text-gray-600 py-1" style="padding-left: ${paddingLeft + 20}px">Caricamento...</div>`;
                        const subDirHandle = await dirHandle.getDirectoryHandle(entry.name);
                        await buildTree(subDirHandle, childrenContainer, level + 1);
                    }
                } else {
                    childrenContainer.classList.add('hidden');
                    caret.style.transform = 'rotate(0deg)';
                }
            };
            containerElement.appendChild(itemDiv);
            containerElement.appendChild(childrenContainer);
            
        } else {
            // È un file: nascondi i file non testuali
            const ext = entry.name.split('.').pop().toLowerCase();
            if (!['txt', 'html', 'md', 'js', 'css', 'json'].includes(ext)) continue;

            let iconClass = 'ph-file-text text-gray-400';
            if (ext === 'md') iconClass = 'ph-markdown-logo text-blue-300';
            else if (ext === 'html') iconClass = 'ph-file-html text-orange-400';

            itemDiv.className = "tree-item flex items-center gap-2 py-1.5 pr-2 text-gray-300";
            itemDiv.innerHTML = `<div class="w-[10px]"></div><i class="ph-fill ${iconClass} text-lg"></i><span class="truncate">${entry.name}</span>`;
            
            itemDiv.onclick = (e) => {
                e.stopPropagation();
                document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('file-active'));
                itemDiv.classList.add('file-active');
                openFile(entry);
            };
            containerElement.appendChild(itemDiv);
        }
    }
    
    if (entries.length === 0 && level === 0) {
        containerElement.innerHTML = '<div class="text-xs text-gray-500 text-center mt-4">Cartella vuota</div>';
    }
}

// Apertura Workspace
document.getElementById('btn-open-folder').onclick = async () => {
    try {
        rootDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        DOM.tree.innerHTML = '<div class="text-sm text-center text-gray-500 mt-10 animate-pulse">Lettura cartella...</div>';
        await buildTree(rootDirHandle, DOM.tree, 0);
        updateStatus('saved');
    } catch (e) {
        if (e.name !== 'AbortError') alert("Errore o permessi negati. Usa Chrome/Edge su PC.");
    }
};

// Apertura File
async function openFile(fileHandle) {
    try {
        const file = await fileHandle.getFile();
        const text = await file.text();
        currentFileHandle = fileHandle;
        DOM.fileName.innerText = file.name;
        
        if (file.name.endsWith('.html')) editor.root.innerHTML = text;
        else editor.setText(text);
        
        updateStatus('saved');
    } catch (e) { alert("Impossibile aprire il file."); }
}

// Salvataggio File
async function saveFile() {
    if (!currentFileHandle) return;
    try {
        const writable = await currentFileHandle.createWritable();
        const content = currentFileHandle.name.endsWith('.html') ? editor.root.innerHTML : editor.getText();
        await writable.write(content);
        await writable.close();
        updateStatus('saved');
    } catch (e) {
        DOM.status.innerText = "Errore!";
        DOM.status.className = "ml-2 px-2 py-0.5 rounded-full bg-red-900/30 text-red-500 text-[10px] border border-red-700/50";
    }
}

// Nuovo File
document.getElementById('btn-new-file').onclick = async () => {
    if (!rootDirHandle) return alert("Devi prima aprire un Workspace!");
    const name = prompt("Nome del file (es: appunti.md, documento.html):", "nuovo_documento.md");
    if (!name) return;
    try {
        currentFileHandle = await rootDirHandle.getFileHandle(name, { create: true });
        editor.setText('');
        DOM.fileName.innerText = name;
        await buildTree(rootDirHandle, DOM.tree, 0);
        updateStatus('saved');
    } catch (e) { alert("Errore creazione file."); }
};

// Esportazioni Multiple
const getBaseName = () => (currentFileHandle ? currentFileHandle.name.replace(/\.[^/.]+$/, "") : "Documento");
const triggerDownload = (content, ext, mime) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = `${getBaseName()}.${ext}`;
    a.click();
};

document.getElementById('exp-pdf').onclick = () => {
    html2pdf().set({ margin: 15, filename: `${getBaseName()}.pdf`, html2canvas: { scale: 2 } }).from(editor.root).save();
};
document.getElementById('exp-html').onclick = () => triggerDownload(editor.root.innerHTML, 'html', 'text/html');
document.getElementById('exp-md').onclick = () => {
    const td = new TurndownService({ headingStyle: 'atx' });
    triggerDownload(td.turndown(editor.root.innerHTML), 'md', 'text/markdown');
};
// --- CONFIGURAZIONE QUILL ---
const Font = Quill.import('formats/font');
Font.whitelist = ['sans-serif', 'serif', 'monospace'];
Quill.register(Font, true);

const editor = new Quill('#editor-container', {
    theme: 'snow',
    placeholder: 'Digita qui il testo, apri un documento Word o incolla del codice...',
    modules: { toolbar: '#custom-toolbar' }
});

// --- MEDIA IMPORT ---
document.getElementById('btn-custom-media').addEventListener('click', () => {
    const input = document.getElementById('media-input');
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (re) => {
            const range = editor.getSelection(true) || { index: editor.getLength() };
            if (file.type === 'application/pdf') {
                const pdfLink = `<br><a href="${re.target.result}" download="${file.name}" class="pdf-attachment" contenteditable="false"><i class="ph-fill ph-file-pdf text-red-400 text-lg"></i> Clicca per visualizzare/scaricare: ${file.name}</a><br><br>`;
                editor.clipboard.dangerouslyPasteHTML(range.index, pdfLink);
                editor.setSelection(range.index + 2);
            } else {
                editor.insertEmbed(range.index, 'image', re.target.result);
                editor.setSelection(range.index + 1);
            }
        };
        reader.readAsDataURL(file);
        input.value = '';
    };
    input.click();
});

// --- STATO E VARIABILI GLOBALI ---
let rootDirHandle = null;
let openTabs = [];
let activeTabId = null;
let saveTimeout = null;
let isSwitching = false;

// ESTENSIONI SUPPORTATE
const ALLOWED_EXT = ['txt', 'html', 'htm', 'md', 'js', 'json', 'css', 'scss', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'ts', 'jsx', 'tsx', 'sql', 'xml', 'yaml', 'yml', 'ini', 'conf', 'sh', 'bat', 'csv', 'tsv', 'docx'];
const CODE_EXT = ['js', 'json', 'css', 'scss', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'ts', 'jsx', 'tsx', 'sql', 'xml', 'yaml', 'yml', 'ini', 'conf', 'sh', 'bat'];

const DOM = {
    welcome: document.getElementById('welcome-screen'), workspace: document.getElementById('app-workspace'),
    tree: document.getElementById('file-tree'), tabsContainer: document.getElementById('tabs-container'),
    editorWrapper: document.getElementById('editor-wrapper'), noFile: document.getElementById('no-file-open'),
    unsupportedMsg: document.getElementById('unsupported-msg'), status: document.getElementById('save-status')
};

// Assegnazione Icone per l'Esploratore
function getIconForFile(ext) {
    if (ext === 'html' || ext === 'htm') return 'ph-file-html text-orange-400';
    if (ext === 'css' || ext === 'scss') return 'ph-file-css text-blue-400';
    if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) return 'ph-file-code text-yellow-400';
    if (ext === 'json') return 'ph-brackets-curly text-green-400';
    if (ext === 'md') return 'ph-markdown-logo text-blue-300';
    if (ext === 'docx') return 'ph-file-doc text-blue-500';
    if (['py', 'java', 'cpp', 'c', 'php', 'cs'].includes(ext)) return 'ph-file-code text-purple-400';
    if (ext === 'sql') return 'ph-database text-gray-300';
    if (!ALLOWED_EXT.includes(ext)) return 'ph-file-archive text-gray-500';
    return 'ph-file-text text-gray-400';
}

document.getElementById('btn-welcome-open').onclick = async () => {
    try {
        rootDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        DOM.welcome.classList.add('opacity-0', 'pointer-events-none');
        DOM.workspace.classList.remove('opacity-0', 'pointer-events-none');
        DOM.tree.innerHTML = '<div class="text-xs text-center text-gray-500 mt-6 animate-pulse">Scansione in corso...</div>';
        await buildTree(rootDirHandle, DOM.tree, 0);
    } catch (e) { if(e.name !== 'AbortError') alert("Devi concedere i permessi dal browser."); }
};

// --- FILE SYSTEM RICORSIVO ---
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
            const subContainer = document.createElement('div'); subContainer.className = 'hidden flex-col w-full';
            
            itemDiv.onclick = async (e) => {
                e.stopPropagation();
                const caret = itemDiv.querySelector('.ph-caret-right');
                if (subContainer.classList.toggle('hidden')) caret.style.transform = 'rotate(0deg)';
                else {
                    caret.style.transform = 'rotate(90deg)';
                    if (subContainer.innerHTML === '') await buildTree(await dirHandle.getDirectoryHandle(entry.name), subContainer, level + 1);
                }
            };
            containerElement.appendChild(itemDiv); containerElement.appendChild(subContainer);
        } else {
            const ext = entry.name.split('.').pop().toLowerCase();
            itemDiv.className = "tree-item file-node flex items-center gap-2 py-1.5 pr-2 text-gray-400";
            itemDiv.dataset.id = entry.name;
            itemDiv.innerHTML = `<div class="w-[8px]"></div><i class="ph-fill ${getIconForFile(ext)} text-[16px]"></i><span class="truncate">${entry.name}</span>`;
            itemDiv.onclick = (e) => { e.stopPropagation(); openFileTab(entry, ext); };
            containerElement.appendChild(itemDiv);
        }
    }
}

// --- LETTURA E APERTURA FILE (COMPRESO DOCX NATIVO) ---
async function openFileTab(fileHandle, ext) {
    const tabId = fileHandle.name;
    let existingTab = openTabs.find(t => t.id === tabId); 
    
    if (!existingTab) {
        let isSupported = ALLOWED_EXT.includes(ext);
        let text = "";

        if (isSupported) {
            try {
                updateStatus('Lettura...', 'bg-blue-900/40 text-blue-400');
                const file = await fileHandle.getFile();

                if (ext === 'docx') {
                    // IL COLPO DI GENIO: Decompila i file Word e li rende HTML che Quill può leggere!
                    const arrayBuffer = await file.arrayBuffer();
                    const result = await mammoth.convertToHtml({arrayBuffer: arrayBuffer});
                    text = result.value || "<p><i>Documento Word vuoto.</i></p>";
                } else {
                    text = await file.text();
                    if (!['html', 'htm'].includes(ext)) {
                        text = text.replace(/</g, "&lt;").replace(/>/g, "&gt;"); // Sicurezza base
                        if (CODE_EXT.includes(ext)) {
                            text = `<pre class="ql-syntax" spellcheck="false">${text}</pre>`;
                        } else if (['md', 'txt', 'csv'].includes(ext)) {
                            text = text.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
                        }
                    }
                }
                updateStatus('Pronto', 'bg-gray-800 text-gray-300');
            } catch(e) { console.error(e); return alert("Impossibile leggere il file."); }
        }
        
        existingTab = { id: tabId, name: fileHandle.name, handle: fileHandle, content: text, isDirty: false, ext: ext, isSupported: isSupported };
        openTabs.push(existingTab);
    }
    switchTab(existingTab.id);
}

// --- SISTEMA TABS ---
function switchTab(tabId) {
    if (activeTabId && !isSwitching) {
        const prevTab = openTabs.find(t => t.id === activeTabId);
        if (prevTab && prevTab.isSupported) prevTab.content = editor.root.innerHTML;
    }

    isSwitching = true;
    activeTabId = tabId;
    const tab = openTabs.find(t => t.id === tabId);

    DOM.noFile.classList.add('hidden');
    
    if (tab.isSupported) {
        DOM.unsupportedMsg.classList.add('hidden');
        DOM.editorWrapper.classList.remove('opacity-0', 'pointer-events-none');
        editor.root.innerHTML = tab.content;
    } else {
        // File non supportato: Mostra avviso invece di crashare!
        DOM.editorWrapper.classList.add('opacity-0', 'pointer-events-none');
        DOM.unsupportedMsg.classList.remove('hidden');
    }

    document.querySelectorAll('.file-node').forEach(el => el.classList.remove('file-active'));
    const activeNode = document.querySelector(`.file-node[data-id="${tab.id}"]`);
    if(activeNode) activeNode.classList.add('file-active');
    
    updateStatus(tab.isDirty ? 'Modificato' : 'Sincronizzato', tab.isDirty ? 'text-yellow-500' : 'text-gray-300');
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
        DOM.unsupportedMsg.classList.add('hidden');
        DOM.noFile.classList.remove('hidden');
        document.querySelectorAll('.file-node').forEach(el => el.classList.remove('file-active'));
        updateStatus('Pronto', 'text-gray-400');
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
        div.innerHTML = `<i class="ph-fill ${getIconForFile(tab.ext)} text-[13px] shrink-0"></i><span class="truncate tab-title">${tab.name}</span><button class="tab-close"><i class="ph-bold ph-x text-[10px]"></i></button>`;
        div.onclick = () => { if (activeTabId !== tab.id) switchTab(tab.id); };
        div.querySelector('.tab-close').onclick = (e) => closeTab(e, tab.id);
        DOM.tabsContainer.appendChild(div);
    });
}

// --- SALVATAGGIO AUTOMATICO ---
function updateStatus(state, colorClass) {
    DOM.status.className = `px-2 py-[1px] rounded text-[10px] font-mono border border-transparent ${colorClass} bg-gray-800`;
    DOM.status.innerText = state;
}

editor.on('text-change', () => {
    if (isSwitching || !activeTabId) return;
    const tab = openTabs.find(t => t.id === activeTabId);
    if (!tab || !tab.isSupported) return;

    const text = editor.getText().trim();
    document.getElementById('stat-words').innerText = `${text.length > 0 ? text.split(/\s+/).length : 0} Parole`;
    document.getElementById('stat-chars').innerText = `${text.length} Caratteri`;
    
    tab.content = editor.root.innerHTML;
    if (!tab.isDirty) { tab.isDirty = true; renderTabs(); }
    updateStatus('Salvataggio...', 'text-yellow-500');
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveFileContent(tab), 1200);
});

async function saveFileContent(tab) {
    try {
        const writable = await tab.handle.createWritable();
        
        if (tab.ext === 'docx') {
            // Ricostruisce il binario DOCX per non corrompere il file
            const htmlContent = `<!DOCTYPE html><html><body>${tab.content}</body></html>`;
            const docxBlob = htmlDocx.asBlob(htmlContent);
            const arrayBuffer = await docxBlob.arrayBuffer();
            await writable.write(arrayBuffer);
        } else if (['html', 'htm'].includes(tab.ext)) {
            await writable.write(tab.content);
        } else if (tab.ext === 'md') {
            const td = new TurndownService({ headingStyle: 'atx' });
            await writable.write(td.turndown(tab.content));
        } else {
            await writable.write(editor.getText());
        }
        
        await writable.close();
        tab.isDirty = false;
        if (activeTabId === tab.id) { updateStatus('Sincronizzato ✓', 'text-green-400'); renderTabs(); }
    } catch(e) { updateStatus('Errore File', 'text-red-400'); }
}

// Nuovo file
document.getElementById('btn-new-file').onclick = async () => {
    if (!rootDirHandle) return;
    const name = prompt("Nome del file (es: test.html, main.js, doc.docx):", "nuovo.html");
    if (!name) return;
    try {
        const handle = await rootDirHandle.getFileHandle(name, { create: true });
        await buildTree(rootDirHandle, DOM.tree, 0); 
        openFileTab(handle, name.split('.').pop().toLowerCase());
    } catch(e) {}
};

// --- ESPORTAZIONE ---
const getBaseName = () => { const tab = openTabs.find(t => t.id === activeTabId); return tab ? tab.name.replace(/\.[^/.]+$/, "") : "Documento"; };
const downloadData = (content, ext, mime) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = `${getBaseName()}.${ext}`; a.click(); };

document.getElementById('exp-pdf').onclick = () => { if(activeTabId) html2pdf().set({ margin: 15, filename: `${getBaseName()}.pdf` }).from(editor.root).save(); };
document.getElementById('exp-html').onclick = () => { if(activeTabId) downloadData(editor.root.innerHTML, 'html', 'text/html'); };
document.getElementById('exp-md').onclick = () => { if(activeTabId) downloadData(new TurndownService().turndown(editor.root.innerHTML), 'md', 'text/markdown'); };
document.getElementById('exp-txt').onclick = () => { if(activeTabId) downloadData(editor.getText(), 'txt', 'text/plain'); };
document.getElementById('exp-docx').onclick = () => {
    if(activeTabId) {
        const content = `<!DOCTYPE html><html><body>${editor.root.innerHTML}</body></html>`;
        const a = document.createElement('a'); a.href = URL.createObjectURL(htmlDocx.asBlob(content)); a.download = `${getBaseName()}.docx`; a.click();
    }
};
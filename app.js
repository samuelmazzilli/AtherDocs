// --- CHIAVE API GOOGLE GEMINI ---
const GEMINI_API_KEY = "AIzaSyB1CfsF2ZkZq7qfe-mCjfPx18A5V5gbItw";

// Inizializzazione Editor (History Module attivato per gestire i Rifiuti dell'AI)
const Font = Quill.import('formats/font'); Font.whitelist = ['sans-serif', 'serif', 'monospace']; Quill.register(Font, true);
const editor = new Quill('#editor-container', { 
    theme: 'snow', placeholder: 'Inizia a scrivere il tuo documento...',
    modules: { toolbar: '#custom-toolbar', history: { delay: 1000, maxStack: 500, userOnly: true } }
});

// --- STATO GLOBALE ---
let currentMode = null; // 'local' o 'cloud'
let rootDirHandle = null;
let cloudToken = localStorage.getItem('aether_cloud_token') || null;
let cloudData = {}; // Struttura Npoint
let openTabs = [];
let activeTabId = null;
let saveTimeout = null;
let isSwitching = false;
let isGhostEditing = false;

const DOM = {
    workspace: document.getElementById('app-workspace'), welcome: document.getElementById('welcome-screen'),
    tree: document.getElementById('file-tree'), tabs: document.getElementById('tabs-container'),
    editorWrap: document.getElementById('editor-wrapper'), status: document.getElementById('save-status'),
    cloudModal: document.getElementById('cloud-modal'), aiChatBox: document.getElementById('ai-chat-box'),
    ghostWidget: document.getElementById('ghost-edit-widget'), aiInput: document.getElementById('ai-input')
};

const getIcon = (ext) => {
    if(['html','htm'].includes(ext)) return 'ph-file-html text-orange-400';
    if(ext==='md') return 'ph-markdown-logo text-blue-300';
    if(ext==='docx') return 'ph-file-doc text-blue-500';
    return 'ph-file-text text-gray-400';
};

// ==========================================
// 1. AETHER CLOUD (Serverless Npoint API)
// ==========================================
document.getElementById('btn-welcome-cloud').onclick = () => { DOM.welcome.querySelector('#welcome-main').classList.add('hidden'); DOM.cloudModal.classList.remove('hidden'); DOM.cloudModal.classList.add('flex'); };
document.getElementById('btn-cloud-cancel').onclick = () => { DOM.cloudModal.classList.add('hidden'); DOM.cloudModal.classList.remove('flex'); DOM.welcome.querySelector('#welcome-main').classList.remove('hidden'); };

document.getElementById('btn-cloud-create').onclick = async () => {
    DOM.cloudModal.innerHTML = `<div class="p-6 text-center text-purple-400"><i class="ph-duotone ph-spinner animate-spin text-4xl mb-4"></i><p>Creazione Cloud Vault in corso...</p></div>`;
    try {
        const res = await fetch('https://api.npoint.io', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: {} }) });
        const data = await res.json();
        cloudToken = data.id; localStorage.setItem('aether_cloud_token', cloudToken);
        enterWorkspace('cloud');
    } catch(e) { alert("Errore connessione API. Riprova."); location.reload(); }
};

document.getElementById('btn-cloud-connect').onclick = async () => {
    const val = document.getElementById('cloud-token-input').value.trim(); if(!val) return;
    cloudToken = val; localStorage.setItem('aether_cloud_token', cloudToken);
    enterWorkspace('cloud');
};

document.getElementById('btn-copy-token').onclick = () => { navigator.clipboard.writeText(cloudToken); alert("Token copiato negli appunti!"); };

async function loadCloudFiles() {
    DOM.tree.innerHTML = '<div class="text-xs text-center text-gray-500 mt-6 animate-pulse">Syncing Cloud...</div>';
    try {
        const res = await fetch(`https://api.npoint.io/${cloudToken}`);
        if (!res.ok) throw new Error();
        cloudData = (await res.json()).files || {};
        renderCloudTree();
    } catch(e) { alert("Token Cloud non valido o errore di rete."); location.reload(); }
}

async function saveCloudFiles() {
    try { await fetch(`https://api.npoint.io/${cloudToken}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: cloudData }) }); } 
    catch(e) { updateStatus("Errore Sync Cloud", "text-red-500"); }
}

function renderCloudTree() {
    DOM.tree.innerHTML = ''; const keys = Object.keys(cloudData).sort();
    if(keys.length === 0) return DOM.tree.innerHTML = '<div class="text-xs text-center text-gray-500 mt-4 italic">Nessun file nel Cloud.</div>';
    keys.forEach(filename => {
        const ext = filename.split('.').pop();
        const item = document.createElement('div');
        item.className = "tree-item file-node flex items-center gap-2 py-1.5 px-3 text-gray-300";
        item.dataset.id = filename; item.dataset.source = 'cloud';
        item.innerHTML = `<i class="ph-fill ${getIcon(ext)} text-[16px]"></i><span class="truncate">${filename}</span>`;
        item.onclick = () => openTab(filename, ext, cloudData[filename], 'cloud');
        DOM.tree.appendChild(item);
    });
}

// ==========================================
// 2. DISCO LOCALE E WORKSPACE MANAGER
// ==========================================
document.getElementById('btn-welcome-local').onclick = async () => {
    try { rootDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' }); enterWorkspace('local'); } catch(e) {}
};

async function enterWorkspace(mode) {
    currentMode = mode;
    DOM.welcome.classList.add('opacity-0', 'pointer-events-none');
    DOM.workspace.classList.remove('opacity-0', 'pointer-events-none');
    switchSidebarTab(mode);
}

document.getElementById('tab-local').onclick = async () => { if(!rootDirHandle) { try{ rootDirHandle = await window.showDirectoryPicker({mode:'readwrite'}); }catch(e){return;} } switchSidebarTab('local'); };
document.getElementById('tab-cloud').onclick = async () => { if(!cloudToken){ DOM.cloudModal.classList.remove('hidden'); DOM.cloudModal.classList.add('flex'); } else { switchSidebarTab('cloud'); } };

function switchSidebarTab(mode) {
    currentMode = mode; const tLoc = document.getElementById('tab-local'); const tClo = document.getElementById('tab-cloud');
    if(mode === 'local') {
        tLoc.className = "flex-1 py-3 text-white border-b-2 border-accent flex justify-center gap-2 items-center bg-[#161b22]";
        tClo.className = "flex-1 py-3 text-gray-500 border-b-2 border-transparent hover:text-purple-400 flex justify-center gap-2 items-center bg-[#010409]";
        document.getElementById('workspace-title').innerText = "DISCO LOCALE";
        document.getElementById('cloud-info').classList.replace('flex', 'hidden');
        if(rootDirHandle) buildLocalTree(rootDirHandle, DOM.tree, 0);
    } else {
        tClo.className = "flex-1 py-3 text-white border-b-2 border-purple-500 flex justify-center gap-2 items-center bg-[#161b22]";
        tLoc.className = "flex-1 py-3 text-gray-500 border-b-2 border-transparent hover:text-blue-400 flex justify-center gap-2 items-center bg-[#010409]";
        document.getElementById('workspace-title').innerText = "AETHER CLOUD";
        document.getElementById('cloud-info').classList.replace('hidden', 'flex');
        document.getElementById('display-token').value = cloudToken;
        loadCloudFiles();
    }
}

async function buildLocalTree(dirHandle, container, level) {
    if (level === 0) container.innerHTML = ''; 
    let entries = []; for await (const entry of dirHandle.values()) { if (!entry.name.startsWith('.') && entry.name !== 'node_modules') entries.push(entry); }
    entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : (a.kind === 'directory' ? -1 : 1)));

    for (const entry of entries) {
        const item = document.createElement('div'); item.style.paddingLeft = `${(level * 16) + 8}px`;
        if (entry.kind === 'directory') {
            item.className = "tree-item flex items-center gap-2 py-1.5 pr-2 text-gray-300";
            item.innerHTML = `<i class="ph-bold ph-caret-right text-[10px] text-gray-500"></i><i class="ph-fill ph-folder text-blue-400 text-lg"></i><span>${entry.name}</span>`;
            const sub = document.createElement('div'); sub.className = 'hidden flex-col w-full';
            item.onclick = async (e) => { e.stopPropagation(); if(!sub.classList.toggle('hidden')) { if(sub.innerHTML==='') await buildLocalTree(await dirHandle.getDirectoryHandle(entry.name), sub, level + 1); item.querySelector('.ph-caret-right').style.transform = 'rotate(90deg)'; } else item.querySelector('.ph-caret-right').style.transform = 'rotate(0deg)'; };
            container.appendChild(item); container.appendChild(sub);
        } else {
            const ext = entry.name.split('.').pop().toLowerCase();
            if(!['txt','html','md','js','css','docx'].includes(ext)) continue;
            item.className = "tree-item file-node flex items-center gap-2 py-1.5 pr-2 text-gray-400";
            item.dataset.id = entry.name; item.dataset.source = 'local';
            item.innerHTML = `<div class="w-[8px]"></div><i class="ph-fill ${getIcon(ext)} text-[16px]"></i><span class="truncate">${entry.name}</span>`;
            item.onclick = async () => {
                const file = await entry.getFile();
                let text = ext === 'docx' ? (await mammoth.convertToHtml({arrayBuffer: await file.arrayBuffer()})).value : await file.text();
                openTab(entry.name, ext, text, 'local', entry);
            };
            container.appendChild(item);
        }
    }
}

// --- TABS E SALVATAGGIO ---
function openTab(id, ext, content, source, handle=null) {
    if(isGhostEditing) return alert("Concludi prima la revisione dell'IA!");
    let tab = openTabs.find(t => t.id === id && t.source === source); 
    if (!tab) {
        if (source === 'local' && !['html', 'htm', 'docx'].includes(ext) && content) content = content.split('\n').map(line => `<p>${line.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`).join('');
        tab = { id, name: id, content, source, handle, isDirty: false, ext }; openTabs.push(tab);
    }
    switchTab(tab.id, tab.source);
}

function switchTab(tabId, source) {
    if (activeTabId && !isSwitching) { const prev = openTabs.find(t => t.id === activeTabId); if (prev) prev.content = editor.root.innerHTML; }
    isSwitching = true; activeTabId = tabId; const tab = openTabs.find(t => t.id === tabId && t.source === source);
    
    document.getElementById('no-file-open').classList.add('hidden');
    DOM.editorWrap.classList.remove('opacity-0', 'pointer-events-none');
    editor.root.innerHTML = tab.content;
    
    document.querySelectorAll('.file-node').forEach(el => el.classList.remove('file-active', 'local', 'cloud'));
    const actNode = document.querySelector(`.file-node[data-id="${tab.id}"][data-source="${tab.source}"]`);
    if(actNode) actNode.classList.add('file-active', tab.source);
    
    renderTabs(); setTimeout(() => { isSwitching = false; }, 50);
}

function renderTabs() {
    DOM.tabs.innerHTML = '';
    openTabs.forEach(tab => {
        const d = document.createElement('div');
        d.className = `editor-tab ${tab.source === 'cloud' ? 'cloud-tab' : ''} ${tab.id === activeTabId ? 'active' : ''} ${tab.isDirty ? 'dirty' : ''}`;
        d.innerHTML = `<i class="ph-fill ${getIcon(tab.ext)} text-[13px] shrink-0"></i><span class="tab-title truncate">${tab.name}</span><button class="tab-close"><i class="ph-bold ph-x"></i></button>`;
        d.onclick = () => { if(activeTabId !== tab.id && !isGhostEditing) switchTab(tab.id, tab.source); };
        d.querySelector('.tab-close').onclick = (e) => { e.stopPropagation(); if(isGhostEditing) return; openTabs = openTabs.filter(t => t !== tab); if(openTabs.length===0){activeTabId=null; DOM.editorWrap.classList.add('opacity-0','pointer-events-none'); document.getElementById('no-file-open').classList.remove('hidden');} else switchTab(openTabs[0].id, openTabs[0].source); renderTabs(); };
        DOM.tabs.appendChild(d);
    });
}

function updateStatus(state, colorClass) { DOM.status.className = `px-2 py-[1px] rounded text-[10px] font-mono border border-transparent ${colorClass} bg-gray-800`; DOM.status.innerText = state; }

editor.on('text-change', (delta, oldDelta, source) => {
    if (source === 'api' || isSwitching || !activeTabId || isGhostEditing) return;
    const tab = openTabs.find(t => t.id === activeTabId); if(!tab) return;
    
    const text = editor.getText().trim();
    document.getElementById('stat-words').innerText = `${text.length > 0 ? text.split(/\s+/).length : 0} Parole`;
    document.getElementById('stat-chars').innerText = `${text.length} Caratteri`;
    
    tab.content = editor.root.innerHTML;
    if (!tab.isDirty) { tab.isDirty = true; renderTabs(); }
    updateStatus('Salvataggio...', 'text-yellow-500');
    
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        if (tab.source === 'cloud') {
            cloudData[tab.name] = tab.ext === 'md' ? new TurndownService().turndown(tab.content) : tab.content;
            await saveCloudFiles();
            tab.isDirty = false; updateStatus('Cloud Sync ✓', 'text-purple-400'); renderTabs();
        } else if (tab.handle) {
            try {
                const writable = await tab.handle.createWritable();
                await writable.write(tab.ext === 'md' ? new TurndownService().turndown(tab.content) : (tab.ext === 'txt' ? editor.getText() : tab.content));
                await writable.close();
                tab.isDirty = false; updateStatus('Salvato PC ✓', 'text-blue-400'); renderTabs();
            } catch(e) { updateStatus('Errore PC', 'text-red-400'); }
        }
    }, 1500);
});

document.getElementById('btn-new-file').onclick = async () => {
    if(isGhostEditing) return;
    const name = prompt("Nome file (es: test.html):", "nuovo.html"); if(!name) return;
    if (currentMode === 'cloud') { cloudData[name] = "<h1>Nuovo Documento</h1>"; await saveCloudFiles(); renderCloudTree(); openTab(name, name.split('.').pop(), "", 'cloud'); }
    else if(rootDirHandle) { const handle = await rootDirHandle.getFileHandle(name, {create:true}); await buildLocalTree(rootDirHandle, DOM.tree, 0); openTab(name, name.split('.').pop(), "", 'local', handle); }
};

// ==========================================
// 3. AETHER AI E GHOST EDIT (Gemini API)
// ==========================================
document.getElementById('btn-toggle-ai').onclick = () => document.body.classList.toggle('ai-open');
document.getElementById('btn-close-ai').onclick = () => document.body.classList.remove('ai-open');

function appendChatMsg(text, isUser = false, isTyping = false) {
    const div = document.createElement('div'); 
    div.className = isUser ? 'user-msg' : 'ai-msg';
    if(isTyping) div.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    else div.innerHTML = marked.parse(text);
    DOM.aiChatBox.appendChild(div); DOM.aiChatBox.scrollTop = DOM.aiChatBox.scrollHeight;
    return div;
}

document.querySelectorAll('.ai-quick-btn').forEach(btn => { btn.onclick = () => handleAISubmit(btn.getAttribute('data-prompt')); });
document.getElementById('ai-form').onsubmit = (e) => { e.preventDefault(); const input = document.getElementById('ai-input'); handleAISubmit(input.value.trim()); input.value = ''; };
document.getElementById('ai-input').addEventListener('keypress', (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('ai-form').dispatchEvent(new Event('submit')); } });

async function handleAISubmit(promptText) {
    if(!promptText || !activeTabId || isGhostEditing) return;
    appendChatMsg(promptText, true);
    const loadingDiv = appendChatMsg("", false, true);
    
    const currentHtml = editor.root.innerHTML;
    const sysPrompt = `Sei Aether Copilot, IA integrata nell'editor.
Codice HTML attuale del documento dell'utente:
---
${currentHtml}
---
REGOLE:
1. Se l'utente ti chiede di TRADURRE, CORREGGERE o MODIFICARE il documento, DEVI restituire l'intero nuovo codice HTML aggiornato, racchiuso ESATTAMENTE tra i tag <AETHER_MOD> e </AETHER_MOD>. Non formattarlo come blocco markdown. Mantiene i tag <h1>, <p>, <b> ecc.
2. Fuori dai tag <AETHER_MOD> puoi scrivere una frase di conferma.
3. Se l'utente fa una domanda discorsiva o chiede un riassunto slegato, rispondi solo in testo normale Markdown senza usare i tag.`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ contents: [{ parts: [{ text: `${sysPrompt}\n\nRichiesta: ${promptText}` }] }] })
        });
        const data = await res.json(); loadingDiv.remove();
        if (data.error) throw new Error(data.error.message);
        
        const reply = data.candidates[0].content.parts[0].text;
        
        // Estrazione Magica
        const match = reply.match(/<AETHER_MOD>([\s\S]*?)<\/AETHER_MOD>/i);
        if (match) {
            const newHtml = match[1].trim();
            const cleanReply = reply.replace(/<AETHER_MOD>[\s\S]*?<\/AETHER_MOD>/i, '').trim() || "✨ Modifica applicata. Accetta o scarta dall'editor.";
            
            appendChatMsg(cleanReply, false);
            
            // ANTIGRAVITY GHOST EDIT: Inserimento col Rollback Undo pronto
            editor.history.cutoff(); // Ferma la storia qui per l'undo
            editor.root.innerHTML = newHtml;
            isGhostEditing = true;
            
            // UI Glow
            DOM.editorWrap.classList.add('ghost-glow');
            DOM.ghostWidget.classList.remove('hidden'); DOM.ghostWidget.classList.add('flex');
            
        } else {
            appendChatMsg(reply, false);
        }
    } catch(e) {
        loadingDiv.remove(); appendChatMsg(`❌ Errore IA: Controlla la connessione o l'API Key.`, false);
    }
}

// Handler per l'Accettazione o il Rifiuto del Ghost Edit
document.getElementById('btn-ghost-reject').onclick = () => {
    editor.history.undo(); // Magia pura: fa rollback atomico istantaneo
    isGhostEditing = false;
    DOM.editorWrap.classList.remove('ghost-glow');
    DOM.ghostWidget.classList.add('hidden'); DOM.ghostWidget.classList.remove('flex');
};

document.getElementById('btn-ghost-accept').onclick = () => {
    isGhostEditing = false;
    DOM.editorWrap.classList.remove('ghost-glow');
    DOM.ghostWidget.classList.add('hidden'); DOM.ghostWidget.classList.remove('flex');
    // Innesca salvataggio auto-save modificando artificialmente l'editor
    editor.insertText(editor.getLength(), ' '); editor.deleteText(editor.getLength()-1, 1);
};

// Utilities Media & Export
document.getElementById('btn-custom-media').onclick = () => { const i = document.getElementById('media-input'); i.onchange = (e) => { const f = e.target.files[0]; if(!f) return; const r = new FileReader(); r.onload = (re) => { const rng = editor.getSelection(true)||{index:editor.getLength()}; if(f.type==='application/pdf'){ editor.clipboard.dangerouslyPasteHTML(rng.index, `<br><a href="${re.target.result}" download="${f.name}" class="text-blue-500 font-bold border border-blue-500/30 p-2 rounded bg-blue-500/10"><i class="ph-fill ph-file-pdf"></i> PDF: ${f.name}</a><br>`); } else { editor.insertEmbed(rng.index, 'image', re.target.result); } editor.setSelection(rng.index+2); }; r.readAsDataURL(f); i.value=''; }; i.click(); };
const getBaseName = () => { const t = openTabs.find(t=>t.id===activeTabId); return t ? t.id.replace(/\.[^/.]+$/, "") : "Documento"; };
const dwnld = (c, e, m) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([c], {type: m})); a.download = `${getBaseName()}.${e}`; a.click(); };
document.getElementById('exp-pdf').onclick = () => { if(activeTabId) html2pdf().set({ margin: 15, filename: `${getBaseName()}.pdf` }).from(editor.root).save(); };
document.getElementById('exp-html').onclick = () => { if(activeTabId) dwnld(editor.root.innerHTML, 'html', 'text/html'); };
document.getElementById('exp-md').onclick = () => { if(activeTabId) dwnld(new TurndownService({headingStyle:'atx'}).turndown(editor.root.innerHTML), 'md', 'text/markdown'); };
document.getElementById('exp-txt').onclick = () => { if(activeTabId) dwnld(editor.getText(), 'txt', 'text/plain'); };
document.getElementById('exp-docx').onclick = () => { if(activeTabId) { const a=document.createElement('a'); a.href=URL.createObjectURL(htmlDocx.asBlob(`<!DOCTYPE html><html><body>${editor.root.innerHTML}</body></html>`)); a.download=`${getBaseName()}.docx`; a.click(); } };
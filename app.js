// --- CHIAVE API GOOGLE GEMINI ---
const GEMINI_API_KEY = "AIzaSyB1CfsF2ZkZq7qfe-mCjfPx18A5V5gbItw";

const Font = Quill.import('formats/font'); Font.whitelist = ['sans-serif', 'serif', 'monospace']; Quill.register(Font, true);
const editor = new Quill('#editor-container', { 
    theme: 'snow', placeholder: 'Inizia a scrivere o incollare codice...',
    modules: { toolbar: '#custom-toolbar', history: { delay: 1000, maxStack: 500, userOnly: true } }
});

// --- STATO GLOBALE ---
let currentMode = 'cloud';
let rootDirHandle = null;
let cloudToken = localStorage.getItem('aether_cloud_token') || null;
let cloudData = {}; 
let openTabs = [];
let activeTabId = null;
let saveTimeout = null;
let isSwitching = false;
let isGhostEditing = false;
let activeAiModel = "models/gemini-1.5-flash"; // Fallback iniziale

const DOM = {
    workspace: document.getElementById('app-workspace'), splash: document.getElementById('boot-screen'),
    tree: document.getElementById('file-tree'), tabs: document.getElementById('tabs-container'),
    editorWrap: document.getElementById('editor-wrapper'), status: document.getElementById('save-status'),
    aiChatBox: document.getElementById('ai-chat-box'), ghostWidget: document.getElementById('ghost-edit-widget'),
    displayToken: document.getElementById('display-token'), cloudModal: document.getElementById('cloud-modal')
};

// ==========================================
// 1. DIZIONARIO ICONE ESTESO (40+ Formati)
// ==========================================
const getIcon = (ext) => {
    ext = ext.toLowerCase();
    if(['png','jpg','jpeg','gif','svg','webp'].includes(ext)) return 'ph-image text-purple-400';
    if(['pdf'].includes(ext)) return 'ph-file-pdf text-red-500';
    if(['html','htm'].includes(ext)) return 'ph-file-html text-orange-400';
    if(['js','ts','jsx','tsx'].includes(ext)) return 'ph-file-code text-yellow-400';
    if(['py','java','c','cpp','cs','php','rb','go'].includes(ext)) return 'ph-file-code text-indigo-400';
    if(['css','scss','less'].includes(ext)) return 'ph-file-css text-blue-400';
    if(['json','xml','yaml','yml'].includes(ext)) return 'ph-brackets-curly text-green-300';
    if(['md','mdx'].includes(ext)) return 'ph-markdown-logo text-blue-300';
    if(['doc','docx'].includes(ext)) return 'ph-file-doc text-blue-500';
    if(['xls','xlsx','csv'].includes(ext)) return 'ph-file-xls text-green-500';
    if(['ppt','pptx'].includes(ext)) return 'ph-file-ppt text-orange-500';
    if(['zip','rar','7z','tar','gz'].includes(ext)) return 'ph-file-archive text-orange-400';
    if(['mp3','wav','ogg'].includes(ext)) return 'ph-file-audio text-yellow-500';
    if(['mp4','mov','avi','mkv'].includes(ext)) return 'ph-file-video text-pink-400';
    return 'ph-file-text text-gray-400';
};

// ==========================================
// 2. BOOT ISTANTANEO CLOUD E AI DISCOVERY
// ==========================================
async function autoDetectAI() {
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
        const data = await res.json();
        
        if (data.models) {
            const valid = data.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent") && m.name.includes("gemini"));
            const best = valid.find(m => m.name.includes("1.5-flash")) || valid.find(m => m.name.includes("pro")) || valid[0];
            if (best) activeAiModel = best.name;
        }
        document.getElementById('ai-model-status').innerHTML = `<span class="text-green-400 font-bold">AI Pronta (${activeAiModel.split('/')[1] || activeAiModel})</span>`;
        document.getElementById('ai-welcome-msg').innerHTML = `<i class="ph-fill ph-robot text-purple-400 text-lg mb-1 block"></i> IA auto-rilevata: <b>${activeAiModel.split('/')[1] || activeAiModel}</b>. Sono pronto ad assisterti.`;
    } catch(e) {
        document.getElementById('ai-model-status').innerHTML = `<span class="text-yellow-500 font-bold">AI Pronta (Fallback)</span>`;
    }
}

async function bootAetherOS() {
    autoDetectAI(); // Ricerca in background dell'IA senza bloccare l'app
    
    try {
        if (!cloudToken) {
            document.getElementById('boot-text').innerText = "Creazione serverless Vault in corso...";
            const res = await fetch('https://api.npoint.io', { method: 'POST', body: JSON.stringify({files: {"Benvenuto.md": "<h1>AetherDocs Cloud</h1><p>I tuoi file sono ora al sicuro e sincronizzati nel cloud.</p>"}}) });
            const data = await res.json();
            cloudToken = data.id; 
            localStorage.setItem('aether_cloud_token', cloudToken);
        }
        DOM.displayToken.value = cloudToken;
        await loadCloudFiles();
        
        // Dissolvenza Splash Screen Istantanea
        DOM.splash.style.opacity = '0';
        setTimeout(() => {
            DOM.splash.classList.add('hidden');
            DOM.workspace.classList.remove('opacity-0');
            DOM.workspace.classList.add('opacity-100');
        }, 500);
        
    } catch(e) { 
        document.getElementById('boot-text').innerText = "Errore di rete. Impossibile connettersi al Cloud.";
        document.getElementById('boot-text').classList.add('text-red-400');
    }
}

document.addEventListener('DOMContentLoaded', bootAetherOS);

// ==========================================
// 3. FIX IMMAGINI E PDF NATIVI (HACK QUILL)
// ==========================================
// Modifichiamo il comportamento dell'icona immagine standard
const quillToolbar = editor.getModule('toolbar');
quillToolbar.addHandler('image', () => {
    // 1. Salva la posizione ESATTA del cursore prima di aprire la finestra
    editor.focus();
    const range = editor.getSelection();
    const cursorIndex = range ? range.index : editor.getLength();

    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/png, image/jpeg, image/jpg, image/gif, image/webp, application/pdf');
    input.click();

    input.onchange = () => {
        const file = input.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            if (file.type === 'application/pdf') {
                const badge = `<br><a href="${e.target.result}" download="${file.name}" class="pdf-badge" contenteditable="false"><i class="ph-bold ph-file-pdf"></i> PDF: ${file.name}</a><br>`;
                editor.clipboard.dangerouslyPasteHTML(cursorIndex, badge);
                editor.setSelection(cursorIndex + 2);
            } else {
                editor.insertEmbed(cursorIndex, 'image', e.target.result);
                editor.setSelection(cursorIndex + 1);
            }
        };
        reader.readAsDataURL(file);
    };
});

// ==========================================
// 4. GESTIONE CLOUD E SIDEBAR
// ==========================================
document.getElementById('btn-import-token').onclick = () => { DOM.cloudModal.classList.remove('hidden'); DOM.cloudModal.classList.add('flex'); };
document.getElementById('btn-cloud-cancel').onclick = () => { DOM.cloudModal.classList.add('hidden'); DOM.cloudModal.classList.remove('flex'); };
document.getElementById('btn-cloud-connect').onclick = async () => {
    const val = document.getElementById('cloud-token-input').value.trim(); if(!val) return;
    cloudToken = val; localStorage.setItem('aether_cloud_token', cloudToken);
    DOM.cloudModal.classList.add('hidden'); DOM.cloudModal.classList.remove('flex');
    DOM.displayToken.value = cloudToken;
    openTabs = []; renderTabs(); await loadCloudFiles();
};
document.getElementById('btn-copy-token').onclick = () => { navigator.clipboard.writeText(cloudToken); updateStatus("Token Copiato", "text-purple-400"); };

async function loadCloudFiles() {
    DOM.tree.innerHTML = '<div class="text-xs text-center text-gray-500 mt-6 animate-pulse">Syncing...</div>';
    try {
        const res = await fetch(`https://api.npoint.io/${cloudToken}`);
        if (!res.ok) throw new Error();
        cloudData = (await res.json()).files || {};
        renderCloudTree();
    } catch(e) { DOM.tree.innerHTML = '<div class="text-xs text-center text-red-500 mt-6">Token errato o rete assente.</div>'; }
}

async function saveCloudFiles() {
    try { await fetch(`https://api.npoint.io/${cloudToken}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: cloudData }) }); } 
    catch(e) { updateStatus("Errore Sync", "text-red-500"); }
}

function renderCloudTree() {
    DOM.tree.innerHTML = ''; const keys = Object.keys(cloudData).sort();
    if(keys.length === 0) return DOM.tree.innerHTML = '<div class="text-xs text-center text-gray-500 mt-4 italic">Spazio vuoto. Crea un file.</div>';
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

document.getElementById('tab-local').onclick = async () => { if(!rootDirHandle){ try{ rootDirHandle = await window.showDirectoryPicker({mode:'readwrite'}); }catch(e){return;} } switchSidebarTab('local'); };
document.getElementById('tab-cloud').onclick = () => { switchSidebarTab('cloud'); };

function switchSidebarTab(mode) {
    currentMode = mode; const tLoc = document.getElementById('tab-local'); const tClo = document.getElementById('tab-cloud');
    if(mode === 'local') {
        tLoc.className = "flex-1 py-3 text-white border-b-2 border-blue-500 flex justify-center gap-2 items-center bg-[#161b22]";
        tClo.className = "flex-1 py-3 text-gray-500 border-b-2 border-transparent hover:text-purple-400 flex justify-center gap-2 items-center bg-[#010409]";
        document.getElementById('workspace-title').innerText = "DISCO LOCALE";
        document.getElementById('workspace-title').className = "text-xs font-mono text-blue-400 tracking-widest font-bold";
        document.getElementById('cloud-info').classList.add('hidden');
        if(rootDirHandle) buildLocalTree(rootDirHandle, DOM.tree, 0);
    } else {
        tClo.className = "flex-1 py-3 text-white border-b-2 border-purple-500 flex justify-center gap-2 items-center bg-[#161b22]";
        tLoc.className = "flex-1 py-3 text-gray-500 border-b-2 border-transparent hover:text-blue-400 flex justify-center gap-2 items-center bg-[#010409]";
        document.getElementById('workspace-title').innerText = "AETHER CLOUD";
        document.getElementById('workspace-title').className = "text-xs font-mono text-purple-400 tracking-widest font-bold";
        document.getElementById('cloud-info').classList.remove('hidden');
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
            if(!['txt','html','md','js','css','py','docx'].includes(ext)) continue;
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

// ==========================================
// 5. TABS E AUTO-SAVE
// ==========================================
function openTab(id, ext, content, source, handle=null) {
    if(isGhostEditing) return alert("Concludi prima la revisione dell'IA!");
    let tab = openTabs.find(t => t.id === id && t.source === source); 
    if (!tab) {
        if (source === 'local' && !['html', 'htm', 'docx'].includes(ext) && content) content = content.split('\n').map(line => `<p>${line.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`).join('');
        tab = { id, name: id, content, source, handle, isDirty: false, ext }; openTabs.push(tab);
    } switchTab(tab.id, tab.source);
}

function switchTab(tabId, source) {
    if (activeTabId && !isSwitching) { const prev = openTabs.find(t => t.id === activeTabId); if (prev) prev.content = editor.root.innerHTML; }
    isSwitching = true; activeTabId = tabId; const tab = openTabs.find(t => t.id === tabId && t.source === source);
    
    document.getElementById('no-file-open').classList.add('hidden'); DOM.editorWrap.classList.remove('opacity-0', 'pointer-events-none');
    editor.root.innerHTML = tab.content || "<p><br></p>";
    
    document.querySelectorAll('.file-node').forEach(el => el.classList.remove('file-active', 'local', 'cloud'));
    const actNode = document.querySelector(`.file-node[data-id="${tab.id}"][data-source="${tab.source}"]`); if(actNode) actNode.classList.add('file-active', tab.source);
    
    renderTabs(); setTimeout(() => { isSwitching = false; }, 50);
}

function renderTabs() {
    DOM.tabs.innerHTML = '';
    openTabs.forEach(tab => {
        const d = document.createElement('div'); d.className = `editor-tab ${tab.source === 'cloud' ? 'cloud-tab' : ''} ${tab.id === activeTabId ? 'active' : ''} ${tab.isDirty ? 'dirty' : ''}`;
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
    document.getElementById('stat-words').innerText = `${text.length > 0 ? text.split(/\s+/).length : 0} Parole`; document.getElementById('stat-chars').innerText = `${text.length} Caratteri`;
    
    tab.content = editor.root.innerHTML; if (!tab.isDirty) { tab.isDirty = true; renderTabs(); } updateStatus('Salvataggio...', 'text-yellow-500');
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        if (tab.source === 'cloud') { cloudData[tab.name] = tab.ext === 'md' ? new TurndownService().turndown(tab.content) : tab.content; await saveCloudFiles(); tab.isDirty = false; updateStatus('Cloud Sync ✓', 'text-purple-400'); renderTabs(); } 
        else if (tab.handle) {
            try { const writable = await tab.handle.createWritable(); await writable.write(tab.ext === 'md' ? new TurndownService().turndown(tab.content) : (['js','txt','py','css','html'].includes(tab.ext) ? editor.getText() : tab.content)); await writable.close(); tab.isDirty = false; updateStatus('Salvato PC ✓', 'text-blue-400'); renderTabs(); } catch(e) { updateStatus('Errore PC', 'text-red-400'); }
        }
    }, 1500);
});

document.getElementById('btn-new-file').onclick = async () => {
    if(isGhostEditing) return; const name = prompt("Nome file (es: appunti.md o index.html):", "nuovo.html"); if(!name) return;
    if (currentMode === 'cloud') { cloudData[name] = "<h1>Nuovo Documento</h1>"; await saveCloudFiles(); renderCloudTree(); openTab(name, name.split('.').pop(), "", 'cloud'); }
    else if(rootDirHandle) { const handle = await rootDirHandle.getFileHandle(name, {create:true}); await buildLocalTree(rootDirHandle, DOM.tree, 0); openTab(name, name.split('.').pop(), "", 'local', handle); }
};

// ==========================================
// 6. GHOST EDIT AI & CHAT INTELLIGENTE
// ==========================================
document.getElementById('btn-toggle-ai').onclick = () => document.body.classList.toggle('ai-open');
document.getElementById('btn-close-ai').onclick = () => document.body.classList.remove('ai-open');

function appendChatMsg(text, isUser = false, isTyping = false) {
    const div = document.createElement('div'); div.className = isUser ? 'user-msg' : 'ai-msg';
    if(isTyping) div.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    else div.innerHTML = marked.parse(text);
    DOM.aiChatBox.appendChild(div); DOM.aiChatBox.scrollTop = DOM.aiChatBox.scrollHeight; return div;
}

document.querySelectorAll('.ai-quick-btn').forEach(btn => { btn.onclick = () => handleAISubmit(btn.getAttribute('data-prompt')); });
document.getElementById('ai-form').onsubmit = (e) => { e.preventDefault(); handleAISubmit(document.getElementById('ai-input').value.trim()); document.getElementById('ai-input').value = ''; };
document.getElementById('ai-input').addEventListener('keypress', (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('ai-form').dispatchEvent(new Event('submit')); } });

async function handleAISubmit(promptText) {
    if(!promptText || !activeTabId || isGhostEditing || !activeAiModel) return;

    appendChatMsg(promptText, true); const loadingDiv = appendChatMsg("", false, true);
    
    const currentHtml = editor.root.innerHTML;
    const sysPrompt = `Sei Aether Copilot, assistente editoriale per scrittori e programmatori. 
Codice HTML attuale del documento dell'utente:
---
${currentHtml}
---
REGOLE FONDAMENTALI:
1. Se l'utente chiede una MODIFICA, TRADUZIONE, ESPANSIONE o CORREZIONE del documento, DEVI restituire l'intero nuovo codice HTML aggiornato, racchiuso ESATTAMENTE tra i tag <AETHER_MOD> e </AETHER_MOD>. Non omettere questi tag per le modifiche.
2. Mantieni la formattazione originale del testo (h1, p, br, b).
3. Se l'utente fa una domanda discorsiva o non richiede modifiche dirette al file, rispondi normalmente testualmente senza usare i tag.`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${activeAiModel}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ contents: [{ parts: [{ text: `${sysPrompt}\n\nRichiesta utente: ${promptText}` }] }] })
        });
        const data = await res.json(); loadingDiv.remove();
        if (data.error) throw new Error(data.error.message);
        
        const reply = data.candidates[0].content.parts[0].text;
        const match = reply.match(/<AETHER_MOD>([\s\S]*?)<\/AETHER_MOD>/i);
        
        if (match) {
            const newHtml = match[1].trim();
            appendChatMsg(reply.replace(/<AETHER_MOD>[\s\S]*?<\/AETHER_MOD>/i, '').trim() || "✨ Modifica in attesa di approvazione.", false);
            editor.history.cutoff(); 
            editor.root.innerHTML = newHtml;
            isGhostEditing = true;
            DOM.editorWrap.classList.add('ghost-glow');
            DOM.ghostWidget.classList.remove('hidden'); DOM.ghostWidget.classList.add('flex');
        } else {
            appendChatMsg(reply, false);
        }
    } catch(e) { loadingDiv.remove(); appendChatMsg(`❌ Errore API Google. Impossibile connettersi.`, false); }
}

document.getElementById('btn-ghost-reject').onclick = () => { editor.history.undo(); isGhostEditing = false; DOM.editorWrap.classList.remove('ghost-glow'); DOM.ghostWidget.classList.add('hidden'); DOM.ghostWidget.classList.remove('flex'); };
document.getElementById('btn-ghost-accept').onclick = () => { isGhostEditing = false; DOM.editorWrap.classList.remove('ghost-glow'); DOM.ghostWidget.classList.add('hidden'); DOM.ghostWidget.classList.remove('flex'); editor.insertText(editor.getLength(), ' '); editor.deleteText(editor.getLength()-1, 1); };

// ==========================================
// 7. EXPORT
// ==========================================
const getBaseName = () => { const t = openTabs.find(t=>t.id===activeTabId); return t ? t.id.replace(/\.[^/.]+$/, "") : "Documento"; };
const dwnld = (c, e, m) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([c], {type: m})); a.download = `${getBaseName()}.${e}`; a.click(); };
document.getElementById('exp-pdf').onclick = () => { if(activeTabId) html2pdf().set({ margin: 15, filename: `${getBaseName()}.pdf` }).from(editor.root).save(); };
document.getElementById('exp-html').onclick = () => { if(activeTabId) dwnld(editor.root.innerHTML, 'html', 'text/html'); };
document.getElementById('exp-md').onclick = () => { if(activeTabId) dwnld(new TurndownService({headingStyle:'atx'}).turndown(editor.root.innerHTML), 'md', 'text/markdown'); };
document.getElementById('exp-txt').onclick = () => { if(activeTabId) dwnld(editor.getText(), 'txt', 'text/plain'); };
document.getElementById('exp-docx').onclick = () => { if(activeTabId) { const a=document.createElement('a'); a.href=URL.createObjectURL(htmlDocx.asBlob(`<!DOCTYPE html><html><body>${editor.root.innerHTML}</body></html>`)); a.download=`${getBaseName()}.docx`; a.click(); } };
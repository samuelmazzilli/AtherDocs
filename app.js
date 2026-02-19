document.addEventListener('DOMContentLoaded', () => {

    // --- SISTEMA DI TOAST NOTIFICATIONS ---
    function showToast(msg, type='info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        let icon = type === 'error' ? 'ph-warning-circle' : (type === 'success' ? 'ph-check-circle' : 'ph-info');
        toast.innerHTML = `<i class="ph-fill ${icon} text-lg"></i> <span>${msg}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(120%)';
            toast.style.transition = '0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // --- VARIABILI GLOBALI E SICUREZZA ---
    let GEMINI_API_KEY = ""; 
    let cloudToken = null;
    
    try { 
        GEMINI_API_KEY = localStorage.getItem('aether_api_key') || "";
        cloudToken = localStorage.getItem('aether_cloud_token'); 
    } catch(e) { console.warn("LocalStorage bloccato."); }

    let currentMode = null;
    let rootDirHandle = null;
    let cloudData = {}; 
    let openTabs = [];
    let activeTabId = null;
    let saveTimeout = null;
    let isSwitching = false;
    let isGhostEditing = false;
    const AI_MODEL = "gemini-1.5-flash"; 

    const DOM = {
        welcome: document.getElementById('welcome-screen'), welcomeMain: document.getElementById('welcome-main'),
        cloudModal: document.getElementById('cloud-modal'), workspace: document.getElementById('app-workspace'),
        tree: document.getElementById('file-tree'), tabs: document.getElementById('tabs-container'),
        editorWrap: document.getElementById('editor-wrapper'), status: document.getElementById('save-status'),
        aiChatBox: document.getElementById('ai-chat-box'), ghostWidget: document.getElementById('ghost-edit-widget'),
        displayToken: document.getElementById('display-token'), aiSettingsModal: document.getElementById('ai-settings-modal')
    };

    // ==========================================
    // 1. INIZIALIZZAZIONE QUILL
    // ==========================================
    const Font = Quill.import('formats/font'); 
    Font.whitelist = ['sans-serif', 'serif', 'monospace']; Quill.register(Font, true);

    const editor = new Quill('#editor-container', { 
        theme: 'snow', placeholder: 'Inizia a scrivere o chiedi all\'AI...',
        modules: { 
            toolbar: {
                container: '#custom-toolbar',
                handlers: {
                    image: function() {
                        editor.focus();
                        const range = editor.getSelection(); 
                        const cursorIndex = range ? range.index : editor.getLength();
                        
                        const input = document.createElement('input');
                        input.setAttribute('type', 'file');
                        input.setAttribute('accept', 'image/png, image/jpeg, image/jpg, image/gif, application/pdf');
                        input.style.display = 'none'; document.body.appendChild(input);
                        
                        input.click();
                        input.onchange = () => {
                            const file = input.files[0]; 
                            if (!file) { document.body.removeChild(input); return; }
                            const reader = new FileReader();
                            reader.onload = (e) => {
                                if (file.type === 'application/pdf') {
                                    const badge = `<br><a href="${e.target.result}" download="${file.name}" class="pdf-badge" contenteditable="false"><i class="ph-bold ph-file-pdf text-xl"></i> SCARICA PDF: ${file.name}</a><br><br>`;
                                    editor.clipboard.dangerouslyPasteHTML(cursorIndex, badge);
                                    editor.setSelection(cursorIndex + 2);
                                } else {
                                    editor.insertEmbed(cursorIndex, 'image', e.target.result);
                                    editor.setSelection(cursorIndex + 1);
                                }
                                document.body.removeChild(input);
                            };
                            reader.readAsDataURL(file);
                        };
                    }
                }
            }, 
            history: { delay: 1000, maxStack: 500, userOnly: true } 
        }
    });

    const getIcon = (ext) => {
        const e = ext?.toLowerCase() || 'txt';
        if(['png','jpg','jpeg','gif','webp'].includes(e)) return 'ph-image text-purple-400';
        if(['pdf'].includes(e)) return 'ph-file-pdf text-red-500';
        if(['html','htm'].includes(e)) return 'ph-file-html text-orange-400';
        if(['js','ts','jsx','tsx'].includes(e)) return 'ph-file-code text-yellow-400';
        if(['py','java','c','cpp','cs','php'].includes(e)) return 'ph-file-code text-indigo-400';
        if(['css','scss','less'].includes(e)) return 'ph-file-css text-blue-400';
        if(['json','xml','yaml','yml'].includes(e)) return 'ph-brackets-curly text-green-300';
        if(['md','mdx'].includes(e)) return 'ph-markdown-logo text-blue-300';
        if(['doc','docx'].includes(e)) return 'ph-file-doc text-blue-500';
        if(['xls','csv'].includes(e)) return 'ph-file-xls text-green-500';
        if(['zip','rar'].includes(e)) return 'ph-file-archive text-orange-400';
        return 'ph-file-text text-gray-400';
    };

    // ==========================================
    // 2. MOTORE CLOUD INFALLIBILE (JSONBlob)
    // ==========================================
    document.getElementById('btn-welcome-cloud')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget; const origHTML = btn.innerHTML;
        if (cloudToken) { enterWorkspace('cloud'); return; }

        btn.innerHTML = '<i class="ph-duotone ph-spinner animate-spin text-xl"></i> Creazione in corso...';
        btn.style.pointerEvents = 'none';
        
        try {
            const res = await fetch('https://jsonblob.com/api/jsonBlob', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ files: {"Benvenuto.md": "<h1>AetherDocs Cloud</h1><p>Database creato e sincronizzato con successo. I tuoi dati sono al sicuro nel cloud.</p>"} })
            });
            
            if (!res.ok) throw new Error("Cloud Error");
            cloudToken = res.headers.get('Location').split('/').pop();
            
            localStorage.setItem('aether_cloud_token', cloudToken);
            showToast("Cloud Generato Correttamente!", "success");
            enterWorkspace('cloud');
            
        } catch(err) { 
            showToast("Errore di rete. Controlla la tua connessione e riprova.", "error");
            btn.innerHTML = origHTML; 
            btn.style.pointerEvents = 'auto'; 
        }
    });

    document.getElementById('btn-welcome-local')?.addEventListener('click', async () => {
        try { 
            if (!window.showDirectoryPicker) return showToast("Il tuo browser blocca le cartelle del PC. Usa il Cloud Gratuito.", "error");
            rootDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' }); 
            enterWorkspace('local'); 
        } catch(e) {}
    });

    document.getElementById('btn-welcome-import')?.addEventListener('click', () => { DOM.welcomeMain.classList.add('hidden'); DOM.cloudModal.classList.remove('hidden'); DOM.cloudModal.classList.add('flex'); });
    document.getElementById('btn-cloud-cancel')?.addEventListener('click', () => { DOM.cloudModal.classList.add('hidden'); DOM.cloudModal.classList.remove('flex'); DOM.welcomeMain.classList.remove('hidden'); });

    document.getElementById('btn-cloud-connect')?.addEventListener('click', () => {
        const val = document.getElementById('cloud-token-input').value.trim();
        if(!val) return; 
        cloudToken = val; 
        localStorage.setItem('aether_cloud_token', cloudToken);
        showToast("Token Importato! Sincronizzazione...", "success");
        enterWorkspace('cloud');
    });

    function enterWorkspace(mode) {
        currentMode = mode;
        if(DOM.welcome) DOM.welcome.style.opacity = '0';
        setTimeout(() => {
            if(DOM.welcome) DOM.welcome.classList.add('hidden');
            if(DOM.workspace) DOM.workspace.classList.remove('opacity-0', 'pointer-events-none');
            switchSidebarTab(mode);
        }, 500);
    }

    // --- Sincronizzazione Dati ---
    document.getElementById('btn-copy-token')?.addEventListener('click', () => { navigator.clipboard.writeText(cloudToken); showToast("Token copiato negli appunti!", "success"); });
    document.getElementById('btn-disconnect-cloud')?.addEventListener('click', () => { localStorage.removeItem('aether_cloud_token'); location.reload(); });

    async function loadCloudFiles() {
        if(!DOM.tree) return;
        DOM.tree.innerHTML = '<div class="text-xs text-center text-gray-500 mt-6 animate-pulse">Sincronizzazione in corso...</div>';
        try {
            const res = await fetch(`https://jsonblob.com/api/jsonBlob/${cloudToken}`, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) throw new Error();
            const data = await res.json();
            cloudData = data.files || {};
            renderCloudTree();
        } catch(e) { 
            showToast("Errore lettura Cloud.", "error");
            DOM.tree.innerHTML = '<div class="text-xs text-center text-red-500 mt-6 p-4">Token errato o non trovato.<br><button id="btn-reset-cloud" class="mt-4 border border-red-500 text-red-400 px-3 py-1 rounded hover:bg-red-500 hover:text-white">Azzera Cloud</button></div>'; 
            document.getElementById('btn-reset-cloud')?.addEventListener('click', () => { localStorage.removeItem('aether_cloud_token'); location.reload(); });
        }
    }

    async function saveCloudFiles() {
        try { 
            await fetch(`https://jsonblob.com/api/jsonBlob/${cloudToken}`, { 
                method: 'PUT', 
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ files: cloudData }) 
            }); 
        } catch(e) { showToast("Impossibile salvare sul Server Cloud.", "error"); }
    }

    function renderCloudTree() {
        DOM.tree.innerHTML = ''; const keys = Object.keys(cloudData).sort();
        if(keys.length === 0) return DOM.tree.innerHTML = '<div class="text-xs text-center text-gray-500 mt-4 italic">Spazio vuoto. Crea un file.</div>';
        keys.forEach(filename => {
            const ext = filename.split('.').pop(); const item = document.createElement('div');
            item.className = "tree-item file-node flex items-center gap-2 py-1.5 px-3 text-gray-300";
            item.dataset.id = filename; item.dataset.source = 'cloud';
            item.innerHTML = `<i class="ph-fill ${getIcon(ext)} text-[16px]"></i><span class="truncate">${filename}</span>`;
            item.onclick = () => openTab(filename, ext, cloudData[filename], 'cloud');
            DOM.tree.appendChild(item);
        });
    }

    // ==========================================
    // 3. UI ED ESPLORATORE LOCALE
    // ==========================================
    document.getElementById('tab-local')?.addEventListener('click', async () => { if(!rootDirHandle){ try{ rootDirHandle = await window.showDirectoryPicker({mode:'readwrite'}); }catch(e){return;} } switchSidebarTab('local'); });
    document.getElementById('tab-cloud')?.addEventListener('click', () => switchSidebarTab('cloud'));

    function switchSidebarTab(mode) {
        currentMode = mode; 
        const tLoc = document.getElementById('tab-local'); const tClo = document.getElementById('tab-cloud');
        if(mode === 'local') {
            if(tLoc) tLoc.className = "flex-1 py-3 text-white border-b-2 border-blue-500 flex justify-center gap-2 items-center bg-[#161b22] transition-all";
            if(tClo) tClo.className = "flex-1 py-3 text-gray-500 border-b-2 border-transparent hover:text-purple-400 flex justify-center gap-2 items-center bg-[#010409] transition-all";
            if(document.getElementById('workspace-title')) { document.getElementById('workspace-title').innerText = "DISCO LOCALE"; document.getElementById('workspace-title').className = "text-xs font-mono text-blue-400 tracking-widest font-bold"; }
            document.getElementById('cloud-info')?.classList.add('hidden'); document.getElementById('cloud-info')?.classList.remove('flex');
            if(rootDirHandle) buildLocalTree(rootDirHandle, DOM.tree, 0); else if(DOM.tree) DOM.tree.innerHTML = '<div class="text-xs text-center text-gray-500 mt-4 italic">Nessuna cartella locale.</div>';
        } else {
            if(tClo) tClo.className = "flex-1 py-3 text-white border-b-2 border-purple-500 flex justify-center gap-2 items-center bg-[#161b22] transition-all";
            if(tLoc) tLoc.className = "flex-1 py-3 text-gray-500 border-b-2 border-transparent hover:text-blue-400 flex justify-center gap-2 items-center bg-[#010409] transition-all";
            if(document.getElementById('workspace-title')) { document.getElementById('workspace-title').innerText = "AETHER CLOUD"; document.getElementById('workspace-title').className = "text-xs font-mono text-purple-400 tracking-widest font-bold"; }
            document.getElementById('cloud-info')?.classList.remove('hidden'); document.getElementById('cloud-info')?.classList.add('flex');
            if(DOM.displayToken) DOM.displayToken.value = cloudToken;
            loadCloudFiles();
        }
    }

    async function buildLocalTree(dirHandle, container, level) {
        if (level === 0 && container) container.innerHTML = ''; 
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
                    try { const file = await entry.getFile(); let text = ext === 'docx' ? (await mammoth.convertToHtml({arrayBuffer: await file.arrayBuffer()})).value : await file.text(); openTab(entry.name, ext, text, 'local', entry); } catch(e) { showToast("File illeggibile.", "error"); }
                };
                container.appendChild(item);
            }
        }
    }

    // ==========================================
    // 4. TABS E AUTO-SAVE IN TEMPO REALE
    // ==========================================
    function openTab(id, ext, content, source, handle=null) {
        if(isGhostEditing) return showToast("Concludi prima la revisione dell'IA!", "error");
        let tab = openTabs.find(t => t.id === id && t.source === source); 
        if (!tab) {
            if (source === 'local' && !['html', 'htm', 'docx'].includes(ext) && content) content = content.split('\n').map(line => `<p>${line.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`).join('');
            tab = { id, name: id, content, source, handle, isDirty: false, ext }; openTabs.push(tab);
        } switchTab(tab.id, tab.source);
    }

    function switchTab(tabId, source) {
        if (activeTabId && !isSwitching) { const prev = openTabs.find(t => t.id === activeTabId); if (prev) prev.content = editor.root.innerHTML; }
        isSwitching = true; activeTabId = tabId; const tab = openTabs.find(t => t.id === tabId && t.source === source);
        
        document.getElementById('no-file-open')?.classList.add('hidden'); if(DOM.editorWrap) DOM.editorWrap.classList.remove('opacity-0', 'pointer-events-none');
        editor.root.innerHTML = tab.content || "<p><br></p>";
        
        document.querySelectorAll('.file-node').forEach(elem => elem.classList.remove('file-active', 'local', 'cloud'));
        const actNode = document.querySelector(`.file-node[data-id="${tab.id}"][data-source="${tab.source}"]`); if(actNode) actNode.classList.add('file-active', tab.source);
        
        renderTabs(); setTimeout(() => { isSwitching = false; }, 50);
    }

    function renderTabs() {
        if(!DOM.tabs) return; DOM.tabs.innerHTML = '';
        openTabs.forEach(tab => {
            const d = document.createElement('div'); d.className = `editor-tab ${tab.source === 'cloud' ? 'cloud-tab' : ''} ${tab.id === activeTabId ? 'active' : ''} ${tab.isDirty ? 'dirty' : ''}`;
            d.innerHTML = `<i class="ph-fill ${getIcon(tab.ext)} text-[13px] shrink-0"></i><span class="tab-title truncate">${tab.name}</span><button class="tab-close"><i class="ph-bold ph-x"></i></button>`;
            
            d.addEventListener('click', (e) => { 
                if(e.target.closest('.tab-close')) return; 
                if(activeTabId !== tab.id && !isGhostEditing) switchTab(tab.id, tab.source); 
            });
            
            d.querySelector('.tab-close').addEventListener('click', (e) => { 
                e.stopPropagation(); if(isGhostEditing) return; 
                openTabs = openTabs.filter(t => !(t.id === tab.id && t.source === tab.source)); 
                if(openTabs.length===0){
                    activeTabId = null; DOM.editorWrap?.classList.add('opacity-0','pointer-events-none'); document.getElementById('no-file-open')?.classList.remove('hidden');
                } else switchTab(openTabs[0].id, openTabs[0].source); 
                renderTabs(); 
            });
            DOM.tabs.appendChild(d);
        });
    }

    function updateStatus(state, colorClass) { if(DOM.status) { DOM.status.className = `px-2 py-[1px] rounded text-[10px] font-mono border border-transparent ${colorClass} bg-gray-800`; DOM.status.innerText = state; } }

    const forceSave = async (tab) => {
        let contentToSave = tab.content;
        if(tab.ext === 'md' && typeof TurndownService !== 'undefined') contentToSave = new TurndownService().turndown(tab.content);
        else if (['js','txt','py','css'].includes(tab.ext)) contentToSave = editor.getText();

        if (tab.source === 'cloud') { 
            cloudData[tab.name] = contentToSave; 
            await saveCloudFiles(); 
            tab.isDirty = false; updateStatus('Cloud Sync ✓', 'text-purple-400'); renderTabs(); 
        } 
        else if (tab.handle) {
            try { const writable = await tab.handle.createWritable(); await writable.write(contentToSave); await writable.close(); tab.isDirty = false; updateStatus('Salvato PC ✓', 'text-blue-400'); renderTabs(); } catch(e) { updateStatus('Errore PC', 'text-red-400'); }
        }
    };

    editor.on('text-change', (delta, oldDelta, source) => {
        if (source === 'api' || isSwitching || !activeTabId || isGhostEditing) return;
        const tab = openTabs.find(t => t.id === activeTabId); if(!tab) return;
        
        const text = editor.getText().trim();
        const statw = document.getElementById('stat-words'); if(statw) statw.innerText = `${text.length > 0 ? text.split(/\s+/).length : 0} Parole`; 
        const statc = document.getElementById('stat-chars'); if(statc) statc.innerText = `${text.length} Caratteri`;
        
        tab.content = editor.root.innerHTML; if (!tab.isDirty) { tab.isDirty = true; renderTabs(); } 
        updateStatus('Salvataggio...', 'text-yellow-500');
        
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => forceSave(tab), 1500);
    });

    document.getElementById('btn-new-file')?.addEventListener('click', async () => {
        if(isGhostEditing) return; const name = prompt("Nome file (es: appunti.md):", "nuovo.html"); if(!name) return;
        if (currentMode === 'cloud') { cloudData[name] = "<h1>Nuovo Documento</h1>"; await saveCloudFiles(); renderCloudTree(); openTab(name, name.split('.').pop(), "", 'cloud'); }
        else if(currentMode === 'local' && rootDirHandle) { try{ const handle = await rootDirHandle.getFileHandle(name, {create:true}); await buildLocalTree(rootDirHandle, DOM.tree, 0); openTab(name, name.split('.').pop(), "", 'local', handle); } catch(e){ showToast("Errore creazione.", "error"); } }
    });

    // ==========================================
    // 5. PANNELLO AI AUTO-CURANTE
    // ==========================================
    document.getElementById('btn-toggle-ai')?.addEventListener('click', () => {
        document.body.classList.toggle('ai-open');
        // Auto-Diagnosi se manca la chiave
        if(document.body.classList.contains('ai-open') && !GEMINI_API_KEY) {
            DOM.aiSettingsModal?.classList.remove('hidden'); DOM.aiSettingsModal?.classList.add('flex');
        }
    });
    
    document.getElementById('btn-close-ai')?.addEventListener('click', () => document.body.classList.remove('ai-open'));
    
    // Gestione Modali Salvataggio Chiave
    document.getElementById('btn-ai-settings')?.addEventListener('click', () => { DOM.aiSettingsModal?.classList.remove('hidden'); DOM.aiSettingsModal?.classList.add('flex'); });
    document.getElementById('btn-close-modal-key')?.addEventListener('click', () => { DOM.aiSettingsModal?.classList.add('hidden'); DOM.aiSettingsModal?.classList.remove('flex'); });
    
    document.getElementById('btn-save-modal-key')?.addEventListener('click', () => {
        const val = document.getElementById('modal-api-key-input')?.value.trim();
        if(val) { 
            GEMINI_API_KEY = val; 
            try { localStorage.setItem('aether_api_key', val); } catch(e){} 
            DOM.aiSettingsModal?.classList.add('hidden'); DOM.aiSettingsModal?.classList.remove('flex');
            showToast("Chiave privata salvata con successo!", "success");
            appendChatMsg("✅ **Chiave aggiornata.** Sono pronto a lavorare.", false);
        } else {
            showToast("Inserisci una chiave valida.", "error");
        }
    });

    document.getElementById('btn-close-key-modal')?.addEventListener('click', () => {
        DOM.aiKeyModal?.classList.add('hidden'); DOM.aiKeyModal?.classList.remove('flex');
    });
    document.getElementById('btn-save-new-key')?.addEventListener('click', () => {
        const val = document.getElementById('new-api-key')?.value.trim();
        if(val) { 
            GEMINI_API_KEY = val; 
            try { localStorage.setItem('aether_api_key', val); } catch(e){} 
            DOM.aiKeyModal?.classList.add('hidden'); DOM.aiKeyModal?.classList.remove('flex');
            showToast("La nuova chiave è attiva.", "success");
            appendChatMsg("✅ **Sistema ripristinato.** L'AI è di nuovo online.", false);
        }
    });

    function appendChatMsg(text, isUser = false, isTyping = false) {
        if(!DOM.aiChatBox) return;
        const div = document.createElement('div'); div.className = isUser ? 'user-msg' : 'ai-msg';
        if(isTyping) div.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
        else div.innerHTML = typeof marked !== 'undefined' ? marked.parse(text) : text;
        DOM.aiChatBox.appendChild(div); DOM.aiChatBox.scrollTop = DOM.aiChatBox.scrollHeight; return div;
    }

    document.querySelectorAll('.ai-quick-btn').forEach(btn => {
        btn.addEventListener('click', () => handleAISubmit(btn.getAttribute('data-prompt')));
    });

    document.getElementById('ai-form')?.addEventListener('submit', (e) => { 
        e.preventDefault(); 
        const input = document.getElementById('ai-input');
        if(input && input.value.trim()) { handleAISubmit(input.value.trim()); input.value = ''; }
    });
    
    document.getElementById('ai-input')?.addEventListener('keypress', (e) => { 
        if(e.key === 'Enter' && !e.shiftKey) { 
            e.preventDefault(); 
            document.getElementById('ai-form')?.dispatchEvent(new Event('submit')); 
        } 
    });

    async function handleAISubmit(promptText) {
        if (!GEMINI_API_KEY) { 
            DOM.aiSettingsModal?.classList.remove('hidden'); DOM.aiSettingsModal?.classList.add('flex');
            return; 
        }
        if(!promptText || !activeTabId || isGhostEditing) return;

        appendChatMsg(promptText, true); const loadingDiv = appendChatMsg("", false, true);
        const currentHtml = editor.root.innerHTML;
        const sysPrompt = `Sei Aether Copilot, assistente per scrittori e programmatori. 
HTML ATTUALE:
---
${currentHtml}
---
REGOLE DI RISPOSTA TASSATIVE:
1. Se chiedono modifiche (Traduci, Riscrivi, Correggi, Espandi), DEVI restituire l'intero nuovo codice HTML racchiuso tra i tag speciali <AETHER_MOD> e </AETHER_MOD>. Mantenendo h1, p, br. Non usare markdown per l'html.
2. Se chiedono un parere discorsivo o un riassunto a parte, rispondi testualmente in Markdown e NON usare i tag speciali.`;

        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ contents: [{ parts: [{ text: `${sysPrompt}\n\nUtente: ${promptText}` }] }] })
            });
            
            const data = await res.json();
            if(loadingDiv) loadingDiv.remove();
            
            // LA DIAGNOSI: RILEVA LA CHIAVE DISTRUTTA
            if (!res.ok) {
                if (data.error?.message?.includes("API key not valid") || res.status === 400 || res.status === 403) {
                    try { localStorage.removeItem('aether_api_key'); } catch(e){}
                    GEMINI_API_KEY = "";
                    DOM.aiKeyModal?.classList.remove('hidden'); DOM.aiKeyModal?.classList.add('flex');
                    throw new Error("I Bot di Google hanno disattivato la tua chiave.");
                }
                throw new Error("Errore API di Google.");
            }
            
            const replyObj = data.candidates?.[0]?.content?.parts?.[0];
            if (!replyObj || !replyObj.text) throw new Error("Google ha fornito una risposta vuota.");
            
            const reply = replyObj.text;
            const match = reply.match(/<AETHER_MOD>([\s\S]*?)<\/AETHER_MOD>/i);
            
            if (match) {
                appendChatMsg(reply.replace(/<AETHER_MOD>[\s\S]*?<\/AETHER_MOD>/i, '').trim() || "✨ Modifica pronta! Approvala o scartala nell'editor.", false);
                
                // GHOST EDIT NATIVO (UNDO INTATTO)
                editor.history.cutoff(); 
                editor.setContents(editor.clipboard.convert(match[1].trim()), 'user');
                isGhostEditing = true;
                
                if(DOM.editorWrap) DOM.editorWrap.classList.add('ghost-glow');
                if(DOM.ghostWidget) { DOM.ghostWidget.classList.remove('hidden'); DOM.ghostWidget.classList.add('flex'); }
            } else appendChatMsg(reply, false);
            
        } catch(e) { 
            if(loadingDiv) loadingDiv.remove(); 
            showToast(e.message, "error");
            appendChatMsg(`❌ <b>Sistema:</b> ${e.message}`, false); 
        }
    }

    document.getElementById('btn-ghost-reject')?.addEventListener('click', () => { 
        editor.history.undo(); isGhostEditing = false; 
        DOM.editorWrap?.classList.remove('ghost-glow'); DOM.ghostWidget?.classList.add('hidden'); DOM.ghostWidget?.classList.remove('flex'); 
        showToast("Modifica rifiutata.", "info");
    });
    
    document.getElementById('btn-ghost-accept')?.addEventListener('click', () => { 
        isGhostEditing = false; 
        DOM.editorWrap?.classList.remove('ghost-glow'); DOM.ghostWidget?.classList.add('hidden'); DOM.ghostWidget?.classList.remove('flex'); 
        const tab = openTabs.find(t => t.id === activeTabId);
        if(tab) { tab.content = editor.root.innerHTML; tab.isDirty = true; forceSave(tab); }
        showToast("Modifica salvata!", "success");
    });

    // ==========================================
    // 6. EXPORT
    // ==========================================
    const getBaseName = () => { const t = openTabs.find(t=>t.id===activeTabId); return t ? t.id.replace(/\.[^/.]+$/, "") : "Documento"; };
    const dwnld = (c, e, m) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([c], {type: m})); a.download = `${getBaseName()}.${e}`; a.click(); showToast("Download completato", "success"); };
    
    document.getElementById('exp-pdf')?.addEventListener('click', () => { if(activeTabId){ showToast("Generazione PDF...", "info"); html2pdf().set({ margin: 15, filename: `${getBaseName()}.pdf` }).from(editor.root).save(); }});
    document.getElementById('exp-html')?.addEventListener('click', () => { if(activeTabId) dwnld(editor.root.innerHTML, 'html', 'text/html'); });
    document.getElementById('exp-md')?.addEventListener('click', () => { if(activeTabId) dwnld(new TurndownService({headingStyle:'atx'}).turndown(editor.root.innerHTML), 'md', 'text/markdown'); });
    document.getElementById('exp-txt')?.addEventListener('click', () => { if(activeTabId) dwnld(editor.getText(), 'txt', 'text/plain'); });
    document.getElementById('exp-docx')?.addEventListener('click', () => { if(activeTabId && typeof htmlDocx !== 'undefined') { const a=document.createElement('a'); a.href=URL.createObjectURL(htmlDocx.asBlob(`<!DOCTYPE html><html><body>${editor.root.innerHTML}</body></html>`)); a.download=`${getBaseName()}.docx`; a.click(); showToast("Creato DOCX", "success"); } });

});
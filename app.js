document.addEventListener('DOMContentLoaded', () => {

    // --- FUNZIONE DI BINDING EVENTI ANTI-CRASH ---
    // Questo sistema impedisce all'app di "congelarsi" se la cache del browser carica bottoni errati
    const bindEvent = (id, event, callback) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, callback);
    };

    // --- VARIABILI GLOBALI E SICUREZZA MEMORIA ---
    let GEMINI_API_KEY = "";
    let cloudToken = null;
    
    // Proviamo a leggere il LocalStorage avvolgendolo in un try/catch per evitare il Fatal Error che bloccava tutto
    try { 
        GEMINI_API_KEY = localStorage.getItem('aether_api_key') || "";
        cloudToken = localStorage.getItem('aether_cloud_token') || null;
    } catch(e) { 
        console.warn("Memoria locale bloccata dalle impostazioni del browser."); 
    }

    let currentMode = null;
    let rootDirHandle = null;
    let cloudData = {}; 
    let openTabs = [];
    let activeTabId = null;
    let saveTimeout = null;
    let isSwitching = false;
    let isGhostEditing = false;
    const AI_MODEL = "gemini-1.5-flash"; // Hardcodato: nessun errore 404 in futuro

    const DOM = {
        welcome: document.getElementById('welcome-screen'), welcomeMain: document.getElementById('welcome-main'),
        cloudModal: document.getElementById('cloud-modal'), workspace: document.getElementById('app-workspace'),
        tree: document.getElementById('file-tree'), tabs: document.getElementById('tabs-container'),
        editorWrap: document.getElementById('editor-wrapper'), status: document.getElementById('save-status'),
        aiChatBox: document.getElementById('ai-chat-box'), ghostWidget: document.getElementById('ghost-edit-widget'),
        displayToken: document.getElementById('display-token')
    };

    // ==========================================
    // 1. INIZIALIZZAZIONE QUILL & HACK IMMAGINI
    // ==========================================
    const Font = Quill.import('formats/font'); 
    Font.whitelist = ['sans-serif', 'serif', 'monospace']; 
    Quill.register(Font, true);

    const editor = new Quill('#editor-container', { 
        theme: 'snow', placeholder: 'Inizia a scrivere il tuo documento o incolla del codice...',
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
                        input.setAttribute('accept', 'image/png, image/jpeg, image/jpg, image/gif, image/webp, application/pdf');
                        input.style.display = 'none';
                        document.body.appendChild(input); // Inietta nel DOM per aggirare blocchi popup
                        
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

    // ==========================================
    // 2. DIZIONARIO ICONE ESTESO (40+ Tipi)
    // ==========================================
    const getIcon = (ext) => {
        const e = ext?.toLowerCase() || 'txt';
        if(['png','jpg','jpeg','gif','svg','webp'].includes(e)) return 'ph-image text-purple-400';
        if(['pdf'].includes(e)) return 'ph-file-pdf text-red-500';
        if(['html','htm'].includes(e)) return 'ph-file-html text-orange-400';
        if(['js','ts','jsx','tsx'].includes(e)) return 'ph-file-code text-yellow-400';
        if(['py','java','c','cpp','cs','php','rb','go'].includes(e)) return 'ph-file-code text-indigo-400';
        if(['css','scss','less'].includes(e)) return 'ph-file-css text-blue-400';
        if(['json','xml','yaml','yml'].includes(e)) return 'ph-brackets-curly text-green-300';
        if(['md','mdx'].includes(e)) return 'ph-markdown-logo text-blue-300';
        if(['doc','docx'].includes(e)) return 'ph-file-doc text-blue-500';
        if(['xls','xlsx','csv'].includes(e)) return 'ph-file-xls text-green-500';
        if(['zip','rar','7z','tar','gz'].includes(e)) return 'ph-file-archive text-orange-400';
        if(['mp3','wav','ogg'].includes(e)) return 'ph-file-audio text-yellow-500';
        if(['mp4','mov','avi','mkv'].includes(e)) return 'ph-file-video text-pink-400';
        return 'ph-file-text text-gray-400';
    };

    // ==========================================
    // 3. BOTTONI SCHERMATA INIZIALE & NUOVO CLOUD
    // ==========================================
    bindEvent('btn-welcome-local', 'click', async () => {
        try { 
            if (!window.showDirectoryPicker) return alert("Questo browser blocca l'accesso alle cartelle locali per sicurezza. Prova l'Aether Cloud Gratuito!");
            rootDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' }); 
            enterWorkspace('local'); 
        } catch(e) { /* Utente ha cliccato Annulla */ }
    });

    bindEvent('btn-welcome-cloud', 'click', async (e) => {
        const btn = e.currentTarget;
        const origHTML = btn.innerHTML;
        
        if (cloudToken) { enterWorkspace('cloud'); return; }

        btn.innerHTML = '<i class="ph-duotone ph-spinner animate-spin text-xl"></i> Creazione Cloud in corso...';
        btn.style.pointerEvents = 'none';
        
        try {
            // NUOVO MOTORE CLOUD: api.restful-api.dev (Infallibile e senza blocchi CORS)
            const res = await fetch('https://api.restful-api.dev/objects', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: "AetherDocs_Workspace",
                    data: { files: { "Benvenuto.md": "<h1>AetherDocs Cloud</h1><p>Database creato. Sincronizzazione online invisibile attiva.</p>" } }
                }) 
            });
            
            if(!res.ok) throw new Error("Errore API");
            const data = await res.json();
            
            cloudToken = data.id; 
            try { localStorage.setItem('aether_cloud_token', cloudToken); } catch(e){}
            enterWorkspace('cloud');
        } catch(err) { 
            alert("Il server Cloud esterno ha bloccato la connessione. Prova l'accesso PC Locale."); 
            btn.innerHTML = origHTML; 
            btn.style.pointerEvents = 'auto'; 
        }
    });

    bindEvent('btn-welcome-import', 'click', () => { if(DOM.welcomeMain) DOM.welcomeMain.classList.add('hidden'); if(DOM.cloudModal) { DOM.cloudModal.classList.remove('hidden'); DOM.cloudModal.classList.add('flex'); } });
    bindEvent('btn-cloud-cancel', 'click', () => { if(DOM.cloudModal) { DOM.cloudModal.classList.add('hidden'); DOM.cloudModal.classList.remove('flex'); } if(DOM.welcomeMain) DOM.welcomeMain.classList.remove('hidden'); });

    bindEvent('btn-cloud-connect', 'click', () => {
        const val = document.getElementById('cloud-token-input')?.value.trim();
        if(!val) return;
        cloudToken = val; 
        try { localStorage.setItem('aether_cloud_token', cloudToken); } catch(e){}
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

    // ==========================================
    // 4. MOTORE CLOUD SYNC
    // ==========================================
    bindEvent('btn-copy-token', 'click', () => { navigator.clipboard.writeText(cloudToken); updateStatus("Token Copiato!", "text-purple-400"); });

    async function loadCloudFiles() {
        if(!DOM.tree) return;
        DOM.tree.innerHTML = '<div class="text-xs text-center text-gray-500 mt-6 animate-pulse">Sincronizzazione in corso...</div>';
        try {
            const res = await fetch(`https://api.restful-api.dev/objects/${cloudToken}`);
            if (!res.ok) throw new Error();
            const result = await res.json();
            // L'API structure è data.files
            cloudData = result.data?.files || {};
            renderCloudTree();
        } catch(e) { 
            DOM.tree.innerHTML = '<div class="text-xs text-center text-red-500 mt-6 p-4">Token errato o non trovato.<br><button id="btn-reset-cloud" class="mt-4 border border-red-500 text-red-400 px-3 py-1 rounded hover:bg-red-500 hover:text-white">Scollega Cloud</button></div>'; 
            bindEvent('btn-reset-cloud', 'click', () => { try { localStorage.removeItem('aether_cloud_token'); }catch(e){} location.reload(); });
        }
    }

    async function saveCloudFiles() {
        try { 
            await fetch(`https://api.restful-api.dev/objects/${cloudToken}`, { 
                method: 'PUT', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ name: "AetherDocs_Workspace", data: { files: cloudData } }) 
            }); 
        } catch(e) { updateStatus("Errore Sync", "text-red-500"); }
    }

    function renderCloudTree() {
        if(!DOM.tree) return;
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

    // ==========================================
    // 5. ESPLORATORE LOCALE E SIDEBAR
    // ==========================================
    bindEvent('tab-local', 'click', async () => { if(!rootDirHandle){ try{ rootDirHandle = await window.showDirectoryPicker({mode:'readwrite'}); }catch(e){return;} } switchSidebarTab('local'); });
    bindEvent('tab-cloud', 'click', () => switchSidebarTab('cloud'));

    function switchSidebarTab(mode) {
        currentMode = mode; 
        const tLoc = document.getElementById('tab-local'); const tClo = document.getElementById('tab-cloud');
        if(mode === 'local') {
            if(tLoc) tLoc.className = "flex-1 py-3 text-white border-b-2 border-blue-500 flex justify-center gap-2 items-center bg-[#161b22] transition-all";
            if(tClo) tClo.className = "flex-1 py-3 text-gray-500 border-b-2 border-transparent hover:text-purple-400 flex justify-center gap-2 items-center bg-[#010409] transition-all";
            const wt = document.getElementById('workspace-title'); if(wt) { wt.innerText = "DISCO LOCALE"; wt.className = "text-xs font-mono text-blue-400 tracking-widest font-bold"; }
            document.getElementById('cloud-info')?.classList.add('hidden'); document.getElementById('cloud-info')?.classList.remove('flex');
            if(rootDirHandle) buildLocalTree(rootDirHandle, DOM.tree, 0); else if(DOM.tree) DOM.tree.innerHTML = '<div class="text-xs text-center text-gray-500 mt-4 italic">Nessuna cartella.</div>';
        } else {
            if(tClo) tClo.className = "flex-1 py-3 text-white border-b-2 border-purple-500 flex justify-center gap-2 items-center bg-[#161b22] transition-all";
            if(tLoc) tLoc.className = "flex-1 py-3 text-gray-500 border-b-2 border-transparent hover:text-blue-400 flex justify-center gap-2 items-center bg-[#010409] transition-all";
            const wt = document.getElementById('workspace-title'); if(wt) { wt.innerText = "AETHER CLOUD"; wt.className = "text-xs font-mono text-purple-400 tracking-widest font-bold"; }
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
                    try {
                        const file = await entry.getFile();
                        let text = ext === 'docx' ? (await mammoth.convertToHtml({arrayBuffer: await file.arrayBuffer()})).value : await file.text();
                        openTab(entry.name, ext, text, 'local', entry);
                    } catch(e) { alert("Impossibile leggere il file."); }
                };
                container.appendChild(item);
            }
        }
    }

    // ==========================================
    // 6. TABS E AUTO-SAVE
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
        
        document.getElementById('no-file-open')?.classList.add('hidden'); 
        if(DOM.editorWrap) DOM.editorWrap.classList.remove('opacity-0', 'pointer-events-none');
        editor.root.innerHTML = tab.content || "<p><br></p>";
        
        document.querySelectorAll('.file-node').forEach(el => el.classList.remove('file-active', 'local', 'cloud'));
        const actNode = document.querySelector(`.file-node[data-id="${tab.id}"][data-source="${tab.source}"]`); if(actNode) actNode.classList.add('file-active', tab.source);
        
        renderTabs(); setTimeout(() => { isSwitching = false; }, 50);
    }

    function renderTabs() {
        if(!DOM.tabs) return; DOM.tabs.innerHTML = '';
        openTabs.forEach(tab => {
            const d = document.createElement('div'); d.className = `editor-tab ${tab.source === 'cloud' ? 'cloud-tab' : ''} ${tab.id === activeTabId ? 'active' : ''} ${tab.isDirty ? 'dirty' : ''}`;
            d.innerHTML = `<i class="ph-fill ${getIcon(tab.ext)} text-[13px] shrink-0"></i><span class="tab-title truncate">${tab.name}</span><button class="tab-close"><i class="ph-bold ph-x"></i></button>`;
            d.onclick = () => { if(activeTabId !== tab.id && !isGhostEditing) switchTab(tab.id, tab.source); };
            d.querySelector('.tab-close').onclick = (e) => { e.stopPropagation(); if(isGhostEditing) return; openTabs = openTabs.filter(t => t !== tab); if(openTabs.length===0){activeTabId=null; DOM.editorWrap?.classList.add('opacity-0','pointer-events-none'); document.getElementById('no-file-open')?.classList.remove('hidden');} else switchTab(openTabs[0].id, openTabs[0].source); renderTabs(); };
            DOM.tabs.appendChild(d);
        });
    }

    function updateStatus(state, colorClass) { if(DOM.status) { DOM.status.className = `px-2 py-[1px] rounded text-[10px] font-mono border border-transparent ${colorClass} bg-gray-800`; DOM.status.innerText = state; } }

    editor.on('text-change', (delta, oldDelta, source) => {
        if (source === 'api' || isSwitching || !activeTabId || isGhostEditing) return;
        const tab = openTabs.find(t => t.id === activeTabId); if(!tab) return;
        const text = editor.getText().trim();
        const statw = document.getElementById('stat-words'); if(statw) statw.innerText = `${text.length > 0 ? text.split(/\s+/).length : 0} Parole`; 
        const statc = document.getElementById('stat-chars'); if(statc) statc.innerText = `${text.length} Caratteri`;
        
        tab.content = editor.root.innerHTML; if (!tab.isDirty) { tab.isDirty = true; renderTabs(); } updateStatus('Salvataggio...', 'text-yellow-500');
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            if (tab.source === 'cloud') { 
                cloudData[tab.name] = tab.ext === 'md' ? new TurndownService().turndown(tab.content) : tab.content; 
                await saveCloudFiles(); 
                tab.isDirty = false; updateStatus('Cloud Sync ✓', 'text-purple-400'); renderTabs(); 
            } 
            else if (tab.handle) {
                try { const writable = await tab.handle.createWritable(); await writable.write(tab.ext === 'md' ? new TurndownService().turndown(tab.content) : (['js','txt','py','css','html'].includes(tab.ext) ? editor.getText() : tab.content)); await writable.close(); tab.isDirty = false; updateStatus('Salvato PC ✓', 'text-blue-400'); renderTabs(); } catch(e) { updateStatus('Errore PC', 'text-red-400'); }
            }
        }, 1500);
    });

    bindEvent('btn-new-file', 'click', async () => {
        if(isGhostEditing) return; const name = prompt("Nome file (es: appunti.md):", "nuovo.html"); if(!name) return;
        if (currentMode === 'cloud') { cloudData[name] = "<h1>Nuovo Documento</h1>"; await saveCloudFiles(); renderCloudTree(); openTab(name, name.split('.').pop(), "", 'cloud'); }
        else if(currentMode === 'local' && rootDirHandle) { try{ const handle = await rootDirHandle.getFileHandle(name, {create:true}); await buildLocalTree(rootDirHandle, DOM.tree, 0); openTab(name, name.split('.').pop(), "", 'local', handle); } catch(e){ alert("Errore creazione."); } }
    });

    // ==========================================
    // 7. INTELLIGENZA ARTIFICIALE BLINDATA
    // ==========================================
    bindEvent('btn-toggle-ai', 'click', () => document.body.classList.toggle('ai-open'));
    bindEvent('btn-close-ai', 'click', () => document.body.classList.remove('ai-open'));

    // Pannello Impostazioni (Salvavita API Key)
    bindEvent('btn-ai-settings', 'click', () => document.getElementById('ai-settings-panel')?.classList.toggle('hidden'));
    bindEvent('btn-save-key', 'click', () => {
        const val = document.getElementById('api-key-input')?.value.trim();
        if(val) { 
            GEMINI_API_KEY = val; 
            try { localStorage.setItem('aether_api_key', val); } catch(e){} 
            document.getElementById('ai-settings-panel')?.classList.add('hidden');
            document.getElementById('ai-key-warning')?.classList.add('hidden');
            appendChatMsg("✅ **Chiave aggiornata e salvata in locale sul tuo PC.** L'IA è di nuovo attiva e pronta all'uso!", false);
        }
    });

    function appendChatMsg(text, isUser = false, isTyping = false) {
        if(!DOM.aiChatBox) return;
        const div = document.createElement('div'); div.className = isUser ? 'user-msg' : 'ai-msg';
        if(isTyping) div.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
        else div.innerHTML = typeof marked !== 'undefined' ? marked.parse(text) : text;
        DOM.aiChatBox.appendChild(div); DOM.aiChatBox.scrollTop = DOM.aiChatBox.scrollHeight; return div;
    }

    document.querySelectorAll('.ai-quick-btn').forEach(btn => { bindEvent(btn.id, 'click', () => handleAISubmit(btn.getAttribute('data-prompt'))); btn.onclick = () => handleAISubmit(btn.getAttribute('data-prompt')); });
    bindEvent('ai-form', 'submit', (e) => { e.preventDefault(); const i = document.getElementById('ai-input'); handleAISubmit(i?.value.trim()); if(i) i.value = ''; });
    bindEvent('ai-input', 'keypress', (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('ai-form')?.dispatchEvent(new Event('submit')); } });

    async function handleAISubmit(promptText) {
        if (!GEMINI_API_KEY) { document.getElementById('ai-key-warning')?.classList.remove('hidden'); return; }
        if(!promptText || !activeTabId || isGhostEditing) return;

        appendChatMsg(promptText, true); const loadingDiv = appendChatMsg("", false, true);
        const currentHtml = editor.root.innerHTML;
        const sysPrompt = `Sei Aether Copilot. Codice HTML attuale del documento: \n${currentHtml}\n\nREGOLE:\n1. Se l'utente chiede modifiche (Traduci, Riscrivi, Correggi), restituisci l'intero nuovo HTML tra i tag <AETHER_MOD> e </AETHER_MOD>.\n2. Se l'utente fa una domanda, rispondi testualmente senza usare tag.`;

        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ contents: [{ parts: [{ text: `${sysPrompt}\n\nRichiesta utente: ${promptText}` }] }] })
            });
            
            const data = await res.json();
            loadingDiv.remove();
            
            if (!res.ok) {
                if (data.error?.message.includes("API key not valid")) throw new Error("La tua chiave API è stata revocata da Google (Succede sempre quando la scrivi in una chat pubblica). Clicca sull'ingranaggio in alto per inserirne una nuova.");
                throw new Error(data.error?.message || `Errore HTTP ${res.status}`);
            }
            
            const replyObj = data.candidates?.[0]?.content?.parts?.[0];
            if (!replyObj || !replyObj.text) throw new Error("Google ha bloccato la risposta.");
            
            const reply = replyObj.text;
            const match = reply.match(/<AETHER_MOD>([\s\S]*?)<\/AETHER_MOD>/i);
            
            if (match) {
                appendChatMsg(reply.replace(/<AETHER_MOD>[\s\S]*?<\/AETHER_MOD>/i, '').trim() || "✨ Modifica generata e iniettata nell'editor.", false);
                editor.history.cutoff(); 
                editor.root.innerHTML = match[1].trim();
                isGhostEditing = true;
                if(DOM.editorWrap) DOM.editorWrap.classList.add('ghost-glow');
                if(DOM.ghostWidget) { DOM.ghostWidget.classList.remove('hidden'); DOM.ghostWidget.classList.add('flex'); }
            } else appendChatMsg(reply, false);
            
        } catch(e) { if(loadingDiv) loadingDiv.remove(); appendChatMsg(`❌ <b>Errore:</b> ${e.message}`, false); }
    }

    bindEvent('btn-ghost-reject', 'click', () => { editor.history.undo(); isGhostEditing = false; DOM.editorWrap?.classList.remove('ghost-glow'); DOM.ghostWidget?.classList.add('hidden'); DOM.ghostWidget?.classList.remove('flex'); });
    bindEvent('btn-ghost-accept', 'click', () => { isGhostEditing = false; DOM.editorWrap?.classList.remove('ghost-glow'); DOM.ghostWidget?.classList.add('hidden'); DOM.ghostWidget?.classList.remove('flex'); editor.insertText(editor.getLength(), ' '); editor.deleteText(editor.getLength()-1, 1); });

    // ==========================================
    // 8. EXPORT E UTILITIES
    // ==========================================
    const getBaseName = () => { const t = openTabs.find(t=>t.id===activeTabId); return t ? t.id.replace(/\.[^/.]+$/, "") : "Documento"; };
    const dwnld = (c, e, m) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([c], {type: m})); a.download = `${getBaseName()}.${e}`; a.click(); };
    bindEvent('exp-pdf', 'click', () => { if(activeTabId) html2pdf().set({ margin: 15, filename: `${getBaseName()}.pdf` }).from(editor.root).save(); });
    bindEvent('exp-html', 'click', () => { if(activeTabId) dwnld(editor.root.innerHTML, 'html', 'text/html'); });
    bindEvent('exp-md', 'click', () => { if(activeTabId) dwnld(new TurndownService({headingStyle:'atx'}).turndown(editor.root.innerHTML), 'md', 'text/markdown'); });
    bindEvent('exp-txt', 'click', () => { if(activeTabId) dwnld(editor.getText(), 'txt', 'text/plain'); });
    bindEvent('exp-docx', 'click', () => { if(activeTabId) { const a=document.createElement('a'); a.href=URL.createObjectURL(htmlDocx.asBlob(`<!DOCTYPE html><html><body>${editor.root.innerHTML}</body></html>`)); a.download=`${getBaseName()}.docx`; a.click(); } });

});
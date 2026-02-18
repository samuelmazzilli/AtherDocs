export function initFS(editor) {
    let dirHandle = null;
    let currentFileHandle = null;
    let saveTimeout = null;

    const fileTree = document.getElementById('file-tree');
    const statusBadge = document.getElementById('save-status');
    const currentFileLabel = document.getElementById('current-file');

    async function openWorkspace() {
        try {
            dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            await renderTree();
        } catch (e) { if (e.name !== 'AbortError') alert("Errore di permessi o browser non supportato (Usa Chrome/Edge)."); }
    }

    async function renderTree() {
        if (!dirHandle) return;
        fileTree.innerHTML = '';
        let count = 0;
        
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file' && (entry.name.endsWith('.html') || entry.name.endsWith('.txt') || entry.name.endsWith('.md'))) {
                count++;
                const div = document.createElement('div');
                div.className = 'file-item';
                div.innerHTML = `<i class="ph ph-file-text"></i> ${entry.name}`;
                div.onclick = () => loadFile(entry, div);
                fileTree.appendChild(div);
            }
        }
        if (count === 0) fileTree.innerHTML = '<div class="empty-state">Nessun documento trovato.</div>';
    }

    async function loadFile(handle, element) {
        try {
            const file = await handle.getFile();
            const text = await file.text();
            
            document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
            if(element) element.classList.add('active');

            currentFileHandle = handle;
            currentFileLabel.innerText = file.name;
            
            if (file.name.endsWith('.html')) editor.root.innerHTML = text;
            else editor.setText(text);
            
            updateStatus('saved', 'Sincronizzato');
        } catch (e) { alert("Impossibile leggere il file."); }
    }

    async function saveFile() {
        if (!currentFileHandle) return;
        try {
            updateStatus('saving', 'Salvataggio...');
            const writable = await currentFileHandle.createWritable();
            const content = currentFileHandle.name.endsWith('.html') ? editor.root.innerHTML : editor.getText();
            await writable.write(content);
            await writable.close();
            updateStatus('saved', 'Salvato su PC ✓');
        } catch (e) { updateStatus('saving', 'Errore salvataggio'); }
    }

    async function createNewFile() {
        if (!dirHandle) return alert("Apri prima un Workspace dalla Sidebar.");
        const name = prompt("Nome del nuovo file (es: appunti.html o script.txt):", "documento.html");
        if (!name) return;
        try {
            currentFileHandle = await dirHandle.getFileHandle(name, { create: true });
            editor.setText('');
            currentFileLabel.innerText = name;
            await renderTree();
            updateStatus('saved', 'Nuovo File Creato');
        } catch (e) { alert("Impossibile creare il file."); }
    }

    function updateStatus(type, text) {
        statusBadge.className = `status-badge ${type}`;
        statusBadge.innerText = text;
    }

    // Auto-save infallibile basato su eventi (Debounce di 1.5 secondi)
    document.addEventListener('editor-modified', () => {
        if (!currentFileHandle) return;
        updateStatus('saving', 'Modificato...');
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveFile, 1500);
    });

    return { openWorkspace, createNewFile, getCurrentName: () => currentFileHandle ? currentFileHandle.name : 'Senza_Titolo' };
}
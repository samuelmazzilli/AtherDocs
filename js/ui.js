export function initUI(editor, fsManager) {
    // Sidebar Toggle
    document.getElementById('btn-close-sidebar').onclick = () => {
        document.getElementById('sidebar').classList.add('closed');
        document.getElementById('btn-open-sidebar').classList.remove('hidden');
    };
    document.getElementById('btn-open-sidebar').onclick = (e) => {
        document.getElementById('sidebar').classList.remove('closed');
        e.currentTarget.classList.add('hidden');
    };

    // Temi
    document.getElementById('theme-selector').onchange = (e) => {
        document.documentElement.setAttribute('data-theme', e.target.value);
    };

    // Modalità Zen
    const btnZen = document.getElementById('btn-zen');
    btnZen.onclick = () => {
        document.body.classList.toggle('zen-mode');
        btnZen.classList.toggle('active');
        if (document.body.classList.contains('zen-mode') && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(()=>{});
        } else if (document.exitFullscreen) {
            document.exitFullscreen().catch(()=>{});
        }
    };

    // File System Bindings
    document.getElementById('btn-open-folder').onclick = fsManager.openWorkspace;
    document.getElementById('btn-new-file').onclick = fsManager.createNewFile;
}
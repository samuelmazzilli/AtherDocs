export function initExport(editor, fsManager) {
    const getBaseName = () => fsManager.getCurrentName().replace(/\.[^/.]+$/, "");
    
    const download = (content, ext, mime) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([content], { type: mime }));
        a.download = `${getBaseName()}${ext}`;
        a.click();
    };

    document.getElementById('exp-pdf').onclick = (e) => {
        e.preventDefault();
        html2pdf().set({ margin: 15, filename: `${getBaseName()}.pdf`, html2canvas: { scale: 2 }, jsPDF: { format: 'a4', orientation: 'portrait' } }).from(editor.root).save();
    };

    document.getElementById('exp-html').onclick = (e) => { e.preventDefault(); download(editor.root.innerHTML, '.html', 'text/html'); };
    document.getElementById('exp-txt').onclick = (e) => { e.preventDefault(); download(editor.getText(), '.txt', 'text/plain'); };
    
    // Generatore Markdown Nativo tramite libreria Turndown
    document.getElementById('exp-md').onclick = (e) => {
        e.preventDefault();
        const turndownService = new TurndownService({ headingStyle: 'atx' });
        download(turndownService.turndown(editor.root.innerHTML), '.md', 'text/markdown');
    };
}
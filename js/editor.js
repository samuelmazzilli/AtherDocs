export function initEditor() {
    const editor = new Quill('#editor-container', {
        theme: 'snow',
        placeholder: 'La tua creatività inizia qui...',
        modules: {
            toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'align': [] }],
                ['blockquote', 'code-block', 'link'],
                ['clean']
            ]
        }
    });

    editor.on('text-change', () => {
        const text = editor.getText().trim();
        const words = text.length > 0 ? text.split(/\s+/).length : 0;
        
        document.getElementById('word-count').innerText = `${words} Parole`;
        document.getElementById('char-count').innerText = `${text.length} Caratteri`;
        document.getElementById('read-time').innerText = `${Math.ceil(words / 200)} min lettura`;
        
        document.dispatchEvent(new CustomEvent('editor-modified'));
    });

    return editor;
}
import React from 'react';
import Editor from '@monaco-editor/react';

const CodeEditor = ({ language, content, onChange }) => {
  return (
    <div className="w-full h-full border border-gray-800 rounded-lg overflow-hidden shadow-2xl">
      <Editor
        height="100%"
        language={language}
        theme="vs-dark"
        value={content}
        onChange={onChange}
        options={{
          minimap: { enabled: false },
          fontSize: 15,
          fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
          wordWrap: 'on',
          automaticLayout: true,
          suggestOnTriggerCharacters: true, // Autocompletamento nativo
        }}
      />
    </div>
  );
};

export default CodeEditor;
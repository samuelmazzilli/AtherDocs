import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Sparkles } from 'lucide-react';
import { GoogleGenerativeAI } from "@google/generative-ai";

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { text: "Ciao! Sono Astro 🚀. Come posso aiutarti con il tuo codice o i tuoi file oggi?", sender: "bot" }
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);

  // Scorrimento automatico fluente verso l'ultimo messaggio
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Recupero sicuro della chiave (priorità al file .env locale, fallback su localStorage per produzione sicura)
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('GEMINI_API_KEY');

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMsg = { text: input, sender: "user" };
    setMessages(prev => [...prev, userMsg]);
    setInput("");

    if (!apiKey) {
       setMessages(prev => [...prev, { text: "Errore di sicurezza: Chiave API Gemini non trovata. Aggiungila al file .env.", sender: "bot" }]);
       return;
    }

    try {
      // Feedback visivo immediato all'utente
      setMessages(prev => [...prev, { text: "Sto analizzando i dati...", sender: "bot", isTyping: true }]);
      
      const genAI = new GoogleGenerativeAI(apiKey);
      // Utilizzo del modello moderno per massimizzare la qualità del ragionamento
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }); 
      
      const result = await model.generateContent(input);
      const responseText = await result.response.text();
      
      // Rimuove l'indicatore di digitazione e inietta la risposta reale
      setMessages(prev => prev.filter(msg => !msg.isTyping).concat({ text: responseText, sender: "bot" }));
    } catch (error) {
      setMessages(prev => prev.filter(msg => !msg.isTyping).concat({ text: "Houston, abbiamo un problema nel flusso logico: " + error.message, sender: "bot" }));
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Finestra della Chat */}
      {isOpen && (
        <div className="bg-[#161b22] border border-gray-700 rounded-2xl shadow-2xl w-80 sm:w-96 h-[30rem] flex flex-col mb-4 overflow-hidden transform transition-all duration-300 ease-out origin-bottom-right">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-4 flex justify-between items-center shadow-md">
            <div className="flex items-center gap-2 text-white font-bold tracking-wide">
              <Sparkles size={18} />
              <span>Astro AI</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 bg-[#0d1117] scrollbar-thin scrollbar-thumb-gray-700">
            {messages.map((msg, index) => (
              <div key={index} className={`max-w-[85%] p-3 rounded-xl text-sm leading-relaxed shadow-sm ${msg.sender === "user" ? "bg-blue-600 text-white self-end rounded-br-none" : "bg-gray-800 text-gray-200 self-start rounded-bl-none border border-gray-700"}`}>
                {msg.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 border-t border-gray-800 bg-[#161b22] flex gap-2 items-center">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Chiedi ad Astro..." 
              className="flex-1 bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
            />
            <button 
              onClick={handleSend}
              className="bg-purple-600 hover:bg-purple-500 p-2 rounded-lg text-white transition-colors flex items-center justify-center shadow-md"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Pulsante Fluttuante (FAB) */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`${isOpen ? 'bg-gray-800 text-gray-400 border border-gray-700' : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:scale-110'} p-4 rounded-full transition-all duration-300 flex items-center justify-center z-50`}
      >
        {isOpen ? <X size={28} /> : <MessageSquare size={28} />}
      </button>
    </div>
  );
};

export default Chatbot;
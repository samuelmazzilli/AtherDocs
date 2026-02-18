export function initAudio(editor) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let lofiNode, lofiGain;
    
    // 1. Rumore Bianco (Brown Noise) Generato Algoritmicamente per il Focus
    const btnLofi = document.getElementById('btn-lofi');
    btnLofi.onclick = () => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        btnLofi.classList.toggle('active');
        
        if (!lofiNode) {
            const bufferSize = audioCtx.sampleRate * 2;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const output = buffer.getChannelData(0);
            let lastOut = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                output[i] = (lastOut + (0.02 * white)) / 1.02; // Brownian Noise Math
                lastOut = output[i];
                output[i] *= 3.5; 
            }
            lofiNode = audioCtx.createBufferSource();
            lofiNode.buffer = buffer; lofiNode.loop = true;
            
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass'; filter.frequency.value = 400; // Effetto pioggia sorda
            
            lofiGain = audioCtx.createGain(); lofiGain.gain.value = 0;
            
            lofiNode.connect(filter); filter.connect(lofiGain); lofiGain.connect(audioCtx.destination);
            lofiNode.start();
        }
        
        if (btnLofi.classList.contains('active')) lofiGain.gain.setTargetAtTime(0.5, audioCtx.currentTime, 1);
        else lofiGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.5);
    };

    // 2. Sintetizzatore Tasti Meccanici (ASMR)
    let typeWriterActive = false;
    const btnType = document.getElementById('btn-typewriter');
    btnType.onclick = () => {
        typeWriterActive = !typeWriterActive;
        btnType.classList.toggle('active', typeWriterActive);
        if (audioCtx.state === 'suspended') audioCtx.resume();
    };

    editor.root.addEventListener('keydown', (e) => {
        if (!typeWriterActive || e.ctrlKey || e.metaKey) return;
        // Crea un "click" meccanico brevissimo
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(100 + Math.random() * 50, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
        
        osc.connect(gainNode); gainNode.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + 0.03);
    });
}
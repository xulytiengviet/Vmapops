'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface VoiceButtonFloatingProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
  onStartRecording?: () => void;
  onRecordingStop?: () => void;
  autoStart?: boolean;
}

export function VoiceButtonFloating({ 
  onTranscription, 
  disabled = false, 
  onStartRecording, 
  onRecordingStop,
  autoStart = false 
}: VoiceButtonFloatingProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Auto-start recording when autoStart prop changes to true
  useEffect(() => {
    if (autoStart && !isRecording && !disabled && !isProcessing) {
      setTimeout(() => {
        if (!isRecording && !disabled && !isProcessing) {
          startRecording();
        }
      }, 100);
    }
  }, [autoStart, disabled, isProcessing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      onStartRecording?.();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        setIsProcessing(true);
        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');

          const response = await fetch('/api/voice/listen', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error('Transcription failed');
          }

          const data = await response.json();
          if (data.success && data.text) {
            onTranscription(data.text);
          } else {
            throw new Error(data.error || 'No transcription received');
          }
        } catch (error) {
          console.error('[VoiceButtonFloating] Transcription error:', error);
        } finally {
          setIsProcessing(false);
          audioChunksRef.current = [];
          onRecordingStop?.();
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('[VoiceButtonFloating] Error starting recording:', error);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isProcessing}
      className={clsx(
        "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl",
        "bg-white/10 backdrop-blur-xl border-2 border-white/20",
        "hover:scale-110 active:scale-95",
        {
          "bg-red-500/80 border-red-400/50 animate-pulse": isRecording,
          "hover:bg-white/20": !isRecording && !isProcessing && !disabled,
          "opacity-50 cursor-not-allowed": disabled || isProcessing,
        }
      )}
      title={isRecording ? 'Stop recording' : (isProcessing ? 'Processing...' : 'Start voice input')}
    >
      {isProcessing ? (
        <Loader2 size={32} className="animate-spin text-white" />
      ) : isRecording ? (
        <MicOff size={32} className="text-white" />
      ) : (
        <Mic size={32} className="text-white" />
      )}
    </button>
  );
}


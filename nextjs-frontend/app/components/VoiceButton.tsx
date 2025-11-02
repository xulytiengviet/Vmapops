'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

interface VoiceButtonProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
  onStartRecording?: () => void;
  autoStart?: boolean;
}

export function VoiceButton({ onTranscription, disabled = false, onStartRecording, autoStart = false }: VoiceButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Auto-start recording when autoStart prop changes to true
  useEffect(() => {
    if (autoStart && !isRecording && !disabled && !isProcessing) {
      // Use setTimeout to avoid dependency issues
      setTimeout(() => {
        if (!isRecording && !disabled && !isProcessing) {
          startRecording();
        }
      }, 100);
    }
  }, [autoStart, disabled, isProcessing]); // Only track these deps

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
      // Notify parent to stop any audio playback (barge-in)
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
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        // Create blob from chunks
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        // Send to API for transcription
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
          console.error('[VoiceButton] Transcription error:', error);
          alert('Failed to transcribe audio. Please try again.');
        } finally {
          setIsProcessing(false);
          audioChunksRef.current = [];
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('[VoiceButton] Error starting recording:', error);
      alert('Failed to access microphone. Please check permissions.');
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
      data-voice-button
      onClick={handleClick}
      disabled={disabled || isProcessing}
      className={`
        rounded-lg px-3 py-2 transition-colors flex items-center gap-2
        ${isRecording 
          ? 'bg-red-500 text-white hover:bg-red-600' 
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
        }
        ${(disabled || isProcessing) ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      title={isRecording ? 'Stop recording' : 'Start voice recording'}
    >
      {isProcessing ? (
        <>
          <Loader2 size={18} className="animate-spin" />
          <span className="text-xs">Processing...</span>
        </>
      ) : isRecording ? (
        <>
          <MicOff size={18} />
          <span className="text-xs">Stop</span>
        </>
      ) : (
        <>
          <Mic size={18} />
          <span className="text-xs">Voice</span>
        </>
      )}
    </button>
  );
}


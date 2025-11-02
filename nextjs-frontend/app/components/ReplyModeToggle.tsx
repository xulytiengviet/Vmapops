'use client';

import { useState } from 'react';
import { Volume2, Settings } from 'lucide-react';

type ReplyMode = 'text' | 'voice' | 'auto' | 'hands-free';
type SpeakStyle = 'summary' | 'full';

interface ReplyModeToggleProps {
  mode: ReplyMode;
  onModeChange: (mode: ReplyMode) => void;
  selectedSpeaker?: string;
  onSpeakerChange?: (speaker: string) => void;
  speakers?: Array<{ voiceId: string; name: string }>;
  speakStyle?: SpeakStyle;
  onSpeakStyleChange?: (style: SpeakStyle) => void;
}

export function ReplyModeToggle({ 
  mode, 
  onModeChange, 
  selectedSpeaker,
  onSpeakerChange,
  speakers = [],
  speakStyle = 'summary',
  onSpeakStyleChange,
}: ReplyModeToggleProps) {
  const [showSettings, setShowSettings] = useState(false);

  const modes: { value: ReplyMode; label: string; icon: React.ReactNode }[] = [
    { value: 'text', label: 'Text', icon: <span className="text-xs">📝</span> },
    { value: 'voice', label: 'Voice', icon: <Volume2 size={14} /> },
    { value: 'auto', label: 'Auto', icon: <span className="text-xs">🔄</span> },
    { value: 'hands-free', label: 'Hands-Free', icon: <span className="text-xs">🎤</span> },
  ];

  return (
    <div className="relative">
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
        {modes.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => onModeChange(m.value)}
            className={`
              px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1
              ${mode === m.value 
                ? 'bg-blue-500 text-white' 
                : 'text-gray-600 hover:text-gray-900'
              }
            `}
            title={`Reply mode: ${m.label}`}
          >
            {m.icon}
            <span>{m.label}</span>
          </button>
        ))}
        {(mode === 'voice' || mode === 'hands-free') && speakers.length > 0 && (
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="ml-1 p-1 text-gray-600 hover:text-gray-900"
            title="Voice settings"
          >
            <Settings size={14} />
          </button>
        )}
      </div>

      {/* Voice Settings Dropdown */}
      {showSettings && (mode === 'voice' || mode === 'hands-free') && (
        <div className="absolute bottom-full mb-2 right-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 min-w-[200px] z-50">
          <div className="text-xs font-semibold text-gray-700 mb-2">Voice settings</div>
          {speakers.length > 0 && (
            <>
              <div className="text-[11px] text-gray-500 mb-1">Voice</div>
              <div className="space-y-1 max-h-40 overflow-y-auto mb-2">
                {speakers.map((speaker) => (
                  <button
                    key={speaker.voiceId}
                    type="button"
                    onClick={() => {
                      onSpeakerChange?.(speaker.voiceId);
                    }}
                    className={`
                      w-full text-left px-2 py-1 rounded text-xs transition-colors
                      ${selectedSpeaker === speaker.voiceId
                        ? 'bg-blue-100 text-blue-700'
                        : 'hover:bg-gray-100 text-gray-700'
                      }
                    `}
                  >
                    {speaker.name}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="border-t border-gray-200 pt-2 mt-1">
            <div className="text-[11px] text-gray-500 mb-1">Speak style</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSpeakStyleChange?.('summary')}
                className={`px-2 py-1 rounded text-xs ${speakStyle === 'summary' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'}`}
              >Summary</button>
              <button
                type="button"
                onClick={() => onSpeakStyleChange?.('full')}
                className={`px-2 py-1 rounded text-xs ${speakStyle === 'full' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'}`}
              >Full</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


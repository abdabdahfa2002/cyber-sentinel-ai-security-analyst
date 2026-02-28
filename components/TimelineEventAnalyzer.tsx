
import React, { useState } from 'react';
import type { TimelineEvent } from '../types';
import { SparklesIcon, XMarkIcon } from './icons';
import { analyzeAndExtractTimelineEvents } from '../services/timelineService';

interface TimelineEventAnalyzerProps {
  onClose: () => void;
  onAddEvents: (events: TimelineEvent[]) => void;
}

const TimelineEventAnalyzer: React.FC<TimelineEventAnalyzerProps> = ({ onClose, onAddEvents }) => {
  const [rawData, setRawData] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractedEvents, setExtractedEvents] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!rawData.trim()) {
      setError('Please paste event data to analyze');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const events = await analyzeAndExtractTimelineEvents(rawData);
      setExtractedEvents(events);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze events');
      setExtractedEvents([]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddSelected = () => {
    if (extractedEvents.length > 0) {
      onAddEvents(extractedEvents);
      onClose();
    }
  };

  const handleToggleEvent = (index: number) => {
    setExtractedEvents(prev => {
      const updated = [...prev];
      // Mark as selected/unselected by toggling a property
      updated[index] = { ...updated[index] };
      return updated;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-sentinel-gray-medium rounded-lg shadow-2xl border border-sentinel-gray-light w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-sentinel-gray-light sticky top-0 bg-sentinel-gray-medium">
          <h2 className="text-xl font-bold text-gray-100 flex items-center">
            <SparklesIcon className="h-6 w-6 mr-2 text-sentinel-blue" />
            AI Event Analyzer
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {extractedEvents.length === 0 ? (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-200 mb-2">
                  Paste Event Log or Raw Data
                </label>
                <textarea
                  value={rawData}
                  onChange={(e) => setRawData(e.target.value)}
                  placeholder="Paste your event log, security alert, or raw event data here. The AI will analyze it and extract timeline events..."
                  rows={10}
                  className="w-full px-3 py-2 bg-sentinel-gray-dark border border-sentinel-gray-light rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:border-sentinel-blue resize-none"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-md text-red-300 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-sentinel-gray-dark hover:bg-sentinel-gray-light text-gray-200 rounded-md transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !rawData.trim()}
                  className="flex items-center px-4 py-2 bg-sentinel-blue hover:bg-cyan-500 text-white rounded-md transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAnalyzing ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="h-4 w-4 mr-2" />
                      Analyze with AI
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-green-500/20 border border-green-500/50 rounded-md p-3 text-green-300 text-sm">
                ✓ Found {extractedEvents.length} event{extractedEvents.length !== 1 ? 's' : ''} in your data
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {extractedEvents.map((event, index) => (
                  <div key={event.id || index} className="p-3 bg-sentinel-gray-dark border border-sentinel-gray-light rounded-md">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        defaultChecked
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <time className="text-xs text-gray-400">{event.timestamp}</time>
                          {event.severity && (
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              event.severity === 'Critical' ? 'bg-red-500/30 text-red-300' :
                              event.severity === 'High' ? 'bg-orange-500/30 text-orange-300' :
                              event.severity === 'Medium' ? 'bg-yellow-500/30 text-yellow-300' :
                              'bg-green-500/30 text-green-300'
                            }`}>
                              {event.severity}
                            </span>
                          )}
                        </div>
                        <p className="font-semibold text-gray-100 text-sm">{event.event}</p>
                        {event.description && (
                          <p className="text-xs text-gray-400 mt-1">{event.description}</p>
                        )}
                        {(event.host || event.category || event.source) && (
                          <div className="flex gap-2 mt-2 text-xs">
                            {event.host && <span className="bg-sentinel-blue/20 text-sentinel-blue px-2 py-0.5 rounded">{event.host}</span>}
                            {event.category && <span className="bg-sentinel-blue/20 text-sentinel-blue px-2 py-0.5 rounded">{event.category}</span>}
                            {event.source && <span className="bg-sentinel-blue/20 text-sentinel-blue px-2 py-0.5 rounded">{event.source}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-sentinel-gray-light">
                <button
                  onClick={() => {
                    setExtractedEvents([]);
                    setRawData('');
                    setError(null);
                  }}
                  className="px-4 py-2 bg-sentinel-gray-dark hover:bg-sentinel-gray-light text-gray-200 rounded-md transition"
                >
                  Analyze More
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-sentinel-gray-dark hover:bg-sentinel-gray-light text-gray-200 rounded-md transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddSelected}
                  className="px-4 py-2 bg-sentinel-blue hover:bg-cyan-500 text-white rounded-md transition font-semibold"
                >
                  Add {extractedEvents.length} Event{extractedEvents.length !== 1 ? 's' : ''} to Timeline
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimelineEventAnalyzer;

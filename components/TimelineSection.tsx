
import React, { useState } from 'react';
import type { TimelineEvent } from '../types';
import { ClockIcon, PlusIcon, PencilSquareIcon, TrashIcon } from './icons';
import TimelineModal from './TimelineModal';

interface TimelineSectionProps {
  events: TimelineEvent[];
  onAddEvent?: (event: TimelineEvent) => void;
  onUpdateEvent?: (eventId: string, event: TimelineEvent) => void;
  onDeleteEvent?: (eventId: string) => void;
  onOpenFullTimeline?: () => void;
}

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-sentinel-gray-medium rounded-lg shadow-lg p-6 border border-sentinel-gray-light">
    {children}
  </div>
);

const TimelineSection: React.FC<TimelineSectionProps> = ({ 
  events, 
  onAddEvent, 
  onUpdateEvent, 
  onDeleteEvent,
  onOpenFullTimeline 
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);

  const handleAddClick = () => {
    setEditingEvent(null);
    setIsModalOpen(true);
  };

  const handleEditClick = (event: TimelineEvent) => {
    setEditingEvent(event);
    setIsModalOpen(true);
  };

  const handleSave = (event: TimelineEvent) => {
    if (editingEvent && editingEvent.id) {
      onUpdateEvent?.(editingEvent.id, event);
    } else {
      onAddEvent?.(event);
    }
    setIsModalOpen(false);
    setEditingEvent(null);
  };

  const handleDelete = (eventId: string | undefined) => {
    if (eventId) {
      onDeleteEvent?.(eventId);
    }
  };

  const sortedEvents = [...events].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'Critical': return 'bg-red-500/20 border-red-500/50 text-red-300';
      case 'High': return 'bg-orange-500/20 border-orange-500/50 text-orange-300';
      case 'Medium': return 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300';
      case 'Low': return 'bg-green-500/20 border-green-500/50 text-green-300';
      default: return 'bg-sentinel-blue/20 border-sentinel-blue/50 text-sentinel-blue';
    }
  };

  return (
    <>
      <Card>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-100 flex items-center">
            <ClockIcon className="h-6 w-6 mr-3 text-sentinel-blue" />
            Attack Timeline
          </h2>
          <div className="flex gap-2">
            {onAddEvent && (
              <button 
                onClick={handleAddClick}
                className="flex items-center text-sm bg-sentinel-blue/80 hover:bg-sentinel-blue text-white px-3 py-1 rounded-md transition"
              >
                <PlusIcon className="h-4 w-4 mr-1" /> Add Event
              </button>
            )}
            {onOpenFullTimeline && (
              <button 
                onClick={onOpenFullTimeline}
                className="flex items-center text-sm bg-sentinel-gray-light hover:bg-sentinel-gray-dark text-white px-3 py-1 rounded-md transition"
              >
                <ClockIcon className="h-4 w-4 mr-1" /> Full View
              </button>
            )}
          </div>
        </div>

        {events.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>No timeline events yet. Add your first event to get started.</p>
          </div>
        ) : (
          <div className="relative border-l-2 border-sentinel-gray-light ml-3">
            {sortedEvents.slice(0, 5).map((event, index) => (
              <div key={event.id || index} className="mb-8 ml-8 group">
                <span className="absolute flex items-center justify-center w-6 h-6 bg-sentinel-blue rounded-full -left-3 ring-8 ring-sentinel-gray-medium">
                  <svg className="w-2.5 h-2.5 text-cyan-200" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M20 4a2 2 0 0 0-2-2h-2V1a1 1 0 0 0-2 0v1h-3V1a1 1 0 0 0-2 0v1H6V1a1 1 0 0 0-2 0v1H2a2 2 0 0 0-2 2v2h20V4Z"/>
                  </svg>
                </span>
                <div className={`p-4 bg-sentinel-gray-dark rounded-lg border ${getSeverityColor(event.severity)} shadow-sm`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <time className="text-sm font-normal leading-none text-gray-400">{event.timestamp}</time>
                      <p className="mt-2 text-base font-semibold text-gray-200">{event.event}</p>
                      {event.description && (
                        <p className="mt-1 text-sm text-gray-300">{event.description}</p>
                      )}
                      {(event.host || event.category || event.source) && (
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {event.host && <span className="bg-sentinel-gray-light px-2 py-1 rounded">{event.host}</span>}
                          {event.category && <span className="bg-sentinel-gray-light px-2 py-1 rounded">{event.category}</span>}
                          {event.source && <span className="bg-sentinel-gray-light px-2 py-1 rounded">{event.source}</span>}
                        </div>
                      )}
                    </div>
                    {(onUpdateEvent || onDeleteEvent) && (
                      <div className="flex gap-2 ml-2 opacity-0 group-hover:opacity-100 transition">
                        {onUpdateEvent && (
                          <button 
                            onClick={() => handleEditClick(event)}
                            className="p-1 text-sentinel-blue hover:text-cyan-300 transition"
                            title="Edit event"
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                          </button>
                        )}
                        {onDeleteEvent && (
                          <button 
                            onClick={() => handleDelete(event.id)}
                            className="p-1 text-red-400 hover:text-red-300 transition"
                            title="Delete event"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {events.length > 5 && (
              <div className="ml-8 text-center py-4 text-gray-400 text-sm">
                +{events.length - 5} more events
              </div>
            )}
          </div>
        )}
      </Card>

      {isModalOpen && (
        <TimelineModal 
          event={editingEvent}
          onClose={() => {
            setIsModalOpen(false);
            setEditingEvent(null);
          }}
          onSave={handleSave}
        />
      )}
    </>
  );
};

export default TimelineSection;

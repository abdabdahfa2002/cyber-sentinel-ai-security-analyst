
import React, { useState } from 'react';
import type { TimelineEvent } from '../types';
import { XMarkIcon, PlusIcon, PencilSquareIcon, TrashIcon, AdjustmentsHorizontalIcon } from './icons';
import TimelineModal from './TimelineModal';

interface FullTimelineViewProps {
  events: TimelineEvent[];
  onClose: () => void;
  onAddEvent?: (event: TimelineEvent) => void;
  onUpdateEvent?: (eventId: string, event: TimelineEvent) => void;
  onDeleteEvent?: (eventId: string) => void;
}

const FullTimelineView: React.FC<FullTimelineViewProps> = ({
  events,
  onClose,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [searchText, setSearchText] = useState('');

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
    if (eventId && window.confirm('Are you sure you want to delete this event?')) {
      onDeleteEvent?.(eventId);
    }
  };

  // Filter and sort events
  const filteredEvents = events
    .filter(e => {
      if (filterSeverity && e.severity !== filterSeverity) return false;
      if (filterCategory && e.category !== filterCategory) return false;
      if (searchText) {
        const text = searchText.toLowerCase();
        return (
          e.event.toLowerCase().includes(text) ||
          e.description?.toLowerCase().includes(text) ||
          e.host?.toLowerCase().includes(text) ||
          e.source?.toLowerCase().includes(text)
        );
      }
      return true;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const categories = Array.from(new Set(events.map(e => e.category).filter(Boolean)));
  const severities = ['Low', 'Medium', 'High', 'Critical'];

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'Critical': return 'bg-red-500/20 border-red-500/50 text-red-300';
      case 'High': return 'bg-orange-500/20 border-orange-500/50 text-orange-300';
      case 'Medium': return 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300';
      case 'Low': return 'bg-green-500/20 border-green-500/50 text-green-300';
      default: return 'bg-sentinel-blue/20 border-sentinel-blue/50 text-sentinel-blue';
    }
  };

  const getSeverityBadgeColor = (severity?: string) => {
    switch (severity) {
      case 'Critical': return 'bg-red-500/30 text-red-300';
      case 'High': return 'bg-orange-500/30 text-orange-300';
      case 'Medium': return 'bg-yellow-500/30 text-yellow-300';
      case 'Low': return 'bg-green-500/30 text-green-300';
      default: return 'bg-sentinel-blue/30 text-sentinel-blue';
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-sentinel-gray-medium rounded-lg shadow-2xl border border-sentinel-gray-light w-full max-w-6xl max-h-[95vh] flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center p-6 border-b border-sentinel-gray-light sticky top-0 bg-sentinel-gray-medium z-10">
            <h2 className="text-2xl font-bold text-gray-100">Complete Timeline</h2>
            <div className="flex gap-2">
              {onAddEvent && (
                <button
                  onClick={handleAddClick}
                  className="flex items-center text-sm bg-sentinel-blue/80 hover:bg-sentinel-blue text-white px-3 py-2 rounded-md transition"
                >
                  <PlusIcon className="h-4 w-4 mr-1" /> Add Event
                </button>
              )}
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-200 transition p-2"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="p-4 border-b border-sentinel-gray-light bg-sentinel-gray-dark space-y-3">
            <div className="flex gap-2 items-center text-sm">
              <AdjustmentsHorizontalIcon className="h-4 w-4 text-sentinel-blue" />
              <span className="font-semibold text-gray-200">Filters:</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Search */}
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search events..."
                className="px-3 py-2 bg-sentinel-gray-medium border border-sentinel-gray-light rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:border-sentinel-blue text-sm"
              />

              {/* Severity Filter */}
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="px-3 py-2 bg-sentinel-gray-medium border border-sentinel-gray-light rounded-md text-gray-200 focus:outline-none focus:border-sentinel-blue text-sm"
              >
                <option value="">All Severities</option>
                {severities.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              {/* Category Filter */}
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3 py-2 bg-sentinel-gray-medium border border-sentinel-gray-light rounded-md text-gray-200 focus:outline-none focus:border-sentinel-blue text-sm"
              >
                <option value="">All Categories</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Clear Filters */}
            {(filterSeverity || filterCategory || searchText) && (
              <button
                onClick={() => {
                  setFilterSeverity('');
                  setFilterCategory('');
                  setSearchText('');
                }}
                className="text-xs text-sentinel-blue hover:text-cyan-300 transition"
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Timeline Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {filteredEvents.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-lg">No events match your filters.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredEvents.map((event, index) => (
                  <div
                    key={event.id || index}
                    className={`p-4 rounded-lg border-l-4 ${getSeverityColor(event.severity)} group`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        {/* Header Row */}
                        <div className="flex items-center gap-3 mb-2">
                          <time className="text-sm font-semibold text-gray-300 bg-sentinel-gray-dark px-2 py-1 rounded">
                            {new Date(event.timestamp).toLocaleString()}
                          </time>
                          {event.severity && (
                            <span className={`text-xs font-semibold px-2 py-1 rounded ${getSeverityBadgeColor(event.severity)}`}>
                              {event.severity}
                            </span>
                          )}
                        </div>

                        {/* Event Title */}
                        <h3 className="text-lg font-bold text-gray-100 mb-2">{event.event}</h3>

                        {/* Description */}
                        {event.description && (
                          <p className="text-sm text-gray-300 mb-3">{event.description}</p>
                        )}

                        {/* Metadata */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-xs">
                          {event.host && (
                            <div>
                              <span className="text-gray-400">Host:</span>
                              <p className="text-gray-200 font-mono">{event.host}</p>
                            </div>
                          )}
                          {event.category && (
                            <div>
                              <span className="text-gray-400">Category:</span>
                              <p className="text-gray-200">{event.category}</p>
                            </div>
                          )}
                          {event.source && (
                            <div>
                              <span className="text-gray-400">Source:</span>
                              <p className="text-gray-200">{event.source}</p>
                            </div>
                          )}
                        </div>

                        {/* Custom Details */}
                        {event.details && Object.keys(event.details).length > 0 && (
                          <div className="bg-sentinel-gray-dark p-3 rounded text-xs space-y-1">
                            {Object.entries(event.details).map(([key, value]) => (
                              <div key={key} className="flex justify-between">
                                <span className="text-gray-400">{key}:</span>
                                <span className="text-gray-200 font-mono">{value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      {(onUpdateEvent || onDeleteEvent) && (
                        <div className="flex gap-2 ml-4 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                          {onUpdateEvent && (
                            <button
                              onClick={() => handleEditClick(event)}
                              className="p-2 text-sentinel-blue hover:text-cyan-300 transition"
                              title="Edit event"
                            >
                              <PencilSquareIcon className="h-4 w-4" />
                            </button>
                          )}
                          {onDeleteEvent && (
                            <button
                              onClick={() => handleDelete(event.id)}
                              className="p-2 text-red-400 hover:text-red-300 transition"
                              title="Delete event"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-sentinel-gray-light p-4 bg-sentinel-gray-dark text-sm text-gray-400">
            Showing {filteredEvents.length} of {events.length} events
          </div>
        </div>
      </div>

      {/* Timeline Modal */}
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

export default FullTimelineView;


import React, { useState, useEffect } from 'react';
import type { TimelineEvent } from '../types';
import { XMarkIcon } from './icons';

interface TimelineModalProps {
  event?: TimelineEvent | null;
  onClose: () => void;
  onSave: (event: TimelineEvent) => void;
}

const TimelineModal: React.FC<TimelineModalProps> = ({ event, onClose, onSave }) => {
  const [formData, setFormData] = useState<TimelineEvent>({
    id: event?.id || `event-${Date.now()}`,
    timestamp: event?.timestamp || new Date().toISOString().slice(0, 16),
    event: event?.event || '',
    description: event?.description || '',
    host: event?.host || '',
    severity: event?.severity || 'Medium',
    category: event?.category || '',
    source: event?.source || '',
    details: event?.details || {},
  });

  const [customFields, setCustomFields] = useState<Array<{ key: string; value: string }>>(
    event?.details ? Object.entries(event.details).map(([k, v]) => ({ key: k, value: v })) : []
  );

  const handleInputChange = (field: keyof TimelineEvent, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddCustomField = () => {
    setCustomFields(prev => [...prev, { key: '', value: '' }]);
  };

  const handleCustomFieldChange = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...customFields];
    updated[index][field] = value;
    setCustomFields(updated);
  };

  const handleRemoveCustomField = (index: number) => {
    setCustomFields(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Build details object from custom fields
    const details: Record<string, string> = {};
    customFields.forEach(field => {
      if (field.key.trim()) {
        details[field.key] = field.value;
      }
    });

    const eventData: TimelineEvent = {
      ...formData,
      details: Object.keys(details).length > 0 ? details : undefined,
    };

    onSave(eventData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-sentinel-gray-medium rounded-lg shadow-2xl border border-sentinel-gray-light max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b border-sentinel-gray-light sticky top-0 bg-sentinel-gray-medium">
          <h2 className="text-xl font-bold text-gray-100">
            {event ? 'Edit Timeline Event' : 'Add Timeline Event'}
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Timestamp */}
          <div>
            <label className="block text-sm font-semibold text-gray-200 mb-2">
              Timestamp *
            </label>
            <input
              type="datetime-local"
              value={formData.timestamp}
              onChange={(e) => handleInputChange('timestamp', e.target.value)}
              className="w-full px-3 py-2 bg-sentinel-gray-dark border border-sentinel-gray-light rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:border-sentinel-blue"
              required
            />
          </div>

          {/* Event Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-200 mb-2">
              Event Title *
            </label>
            <input
              type="text"
              value={formData.event}
              onChange={(e) => handleInputChange('event', e.target.value)}
              placeholder="Brief description of the event"
              className="w-full px-3 py-2 bg-sentinel-gray-dark border border-sentinel-gray-light rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:border-sentinel-blue"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-200 mb-2">
              Description
            </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Detailed description of what happened"
              rows={3}
              className="w-full px-3 py-2 bg-sentinel-gray-dark border border-sentinel-gray-light rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:border-sentinel-blue resize-none"
            />
          </div>

          {/* Host */}
          <div>
            <label className="block text-sm font-semibold text-gray-200 mb-2">
              Host / System
            </label>
            <input
              type="text"
              value={formData.host || ''}
              onChange={(e) => handleInputChange('host', e.target.value)}
              placeholder="e.g., SERVER-01, 192.168.1.100"
              className="w-full px-3 py-2 bg-sentinel-gray-dark border border-sentinel-gray-light rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:border-sentinel-blue"
            />
          </div>

          {/* Severity */}
          <div>
            <label className="block text-sm font-semibold text-gray-200 mb-2">
              Severity
            </label>
            <select
              value={formData.severity || 'Medium'}
              onChange={(e) => handleInputChange('severity', e.target.value)}
              className="w-full px-3 py-2 bg-sentinel-gray-dark border border-sentinel-gray-light rounded-md text-gray-200 focus:outline-none focus:border-sentinel-blue"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-semibold text-gray-200 mb-2">
              Category
            </label>
            <input
              type="text"
              value={formData.category || ''}
              onChange={(e) => handleInputChange('category', e.target.value)}
              placeholder="e.g., Login, File Access, Network"
              className="w-full px-3 py-2 bg-sentinel-gray-dark border border-sentinel-gray-light rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:border-sentinel-blue"
            />
          </div>

          {/* Source */}
          <div>
            <label className="block text-sm font-semibold text-gray-200 mb-2">
              Source
            </label>
            <input
              type="text"
              value={formData.source || ''}
              onChange={(e) => handleInputChange('source', e.target.value)}
              placeholder="e.g., Windows Event Log, Firewall Log"
              className="w-full px-3 py-2 bg-sentinel-gray-dark border border-sentinel-gray-light rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:border-sentinel-blue"
            />
          </div>

          {/* Custom Fields */}
          <div className="border-t border-sentinel-gray-light pt-4">
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-semibold text-gray-200">
                Additional Details
              </label>
              <button
                type="button"
                onClick={handleAddCustomField}
                className="text-xs bg-sentinel-blue/80 hover:bg-sentinel-blue text-white px-2 py-1 rounded transition"
              >
                + Add Field
              </button>
            </div>

            <div className="space-y-2">
              {customFields.map((field, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={field.key}
                    onChange={(e) => handleCustomFieldChange(index, 'key', e.target.value)}
                    placeholder="Field name"
                    className="w-1/3 px-3 py-2 bg-sentinel-gray-dark border border-sentinel-gray-light rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:border-sentinel-blue text-sm"
                  />
                  <input
                    type="text"
                    value={field.value}
                    onChange={(e) => handleCustomFieldChange(index, 'value', e.target.value)}
                    placeholder="Field value"
                    className="flex-1 px-3 py-2 bg-sentinel-gray-dark border border-sentinel-gray-light rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:border-sentinel-blue text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomField(index)}
                    className="text-red-400 hover:text-red-300 transition p-2"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-6 border-t border-sentinel-gray-light">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-sentinel-gray-dark hover:bg-sentinel-gray-light text-gray-200 rounded-md transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-sentinel-blue hover:bg-cyan-500 text-white rounded-md transition font-semibold"
            >
              {event ? 'Update Event' : 'Add Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TimelineModal;

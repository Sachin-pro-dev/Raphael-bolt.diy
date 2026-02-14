/**
 * Memory Indicator Component
 *
 * Displays a visual indicator when memories are loaded
 * Shows memory count and last sync time
 */

import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { loadedMemories, lastSync, memoryStats } from '~/lib/stores/memory';
import { classNames } from '~/utils/classNames';
import { MemoryViewer } from './MemoryViewer';

interface MemoryIndicatorProps {
  chatId?: string;
}

export function MemoryIndicator({ chatId }: MemoryIndicatorProps = {}) {
  const memories = useStore(loadedMemories);
  const stats = useStore(memoryStats);
  const lastSyncTime = useStore(lastSync);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showViewer, setShowViewer] = useState(false);

  if (memories.length === 0) {
    return null;
  }

  const formatLastSync = (timestamp: number | undefined): string => {
    if (!timestamp) {
      return 'Never';
    }

    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) {
      return 'Just now';
    }

    if (minutes < 60) {
      return `${minutes}m ago`;
    }

    if (hours < 24) {
      return `${hours}h ago`;
    }

    return `${days}d ago`;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={classNames(
          'flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg transition-colors',
          'bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30',
          'text-purple-600 dark:text-purple-400',
        )}
        title="Click to view loaded memories"
      >
        <span className="text-base">🧠</span>
        <span className="font-medium">{memories.length}</span>
        <span className="text-bolt-elements-textTertiary">|</span>
        <span className="text-bolt-elements-textSecondary">{formatLastSync(lastSyncTime)}</span>
        <div className={classNames('transition-transform', isExpanded ? 'rotate-180' : '')}>▼</div>
      </button>

      {isExpanded && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg shadow-lg z-50">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Loaded Memories</h3>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-bolt-elements-background-depth-1 rounded p-2">
                <div className="text-xs text-bolt-elements-textTertiary">Projects</div>
                <div className="text-lg font-bold text-bolt-elements-textPrimary">{stats.byType.project}</div>
              </div>
              <div className="bg-bolt-elements-background-depth-1 rounded p-2">
                <div className="text-xs text-bolt-elements-textTertiary">Preferences</div>
                <div className="text-lg font-bold text-bolt-elements-textPrimary">{stats.byType.preference}</div>
              </div>
              <div className="bg-bolt-elements-background-depth-1 rounded p-2">
                <div className="text-xs text-bolt-elements-textTertiary">Decisions</div>
                <div className="text-lg font-bold text-bolt-elements-textPrimary">{stats.byType.decision}</div>
              </div>
              <div className="bg-bolt-elements-background-depth-1 rounded p-2">
                <div className="text-xs text-bolt-elements-textTertiary">Highlights</div>
                <div className="text-lg font-bold text-bolt-elements-textPrimary">{stats.byType.highlight}</div>
              </div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {memories.slice(0, 5).map((memory) => (
                <div key={memory.id} className="bg-bolt-elements-background-depth-1 rounded p-2 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={classNames(
                        'px-2 py-0.5 rounded text-[10px] font-medium',
                        memory.type === 'project' && 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
                        memory.type === 'preference' && 'bg-green-500/20 text-green-600 dark:text-green-400',
                        memory.type === 'decision' && 'bg-purple-500/20 text-purple-600 dark:text-purple-400',
                        memory.type === 'highlight' && 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
                        memory.type === 'structure' && 'bg-gray-500/20 text-gray-600 dark:text-gray-400',
                      )}
                    >
                      {memory.type}
                    </span>
                    {memory.metadata.importance && (
                      <span className="text-bolt-elements-textTertiary">
                        {memory.metadata.importance === 'high' && '⭐⭐⭐'}
                        {memory.metadata.importance === 'medium' && '⭐⭐'}
                        {memory.metadata.importance === 'low' && '⭐'}
                      </span>
                    )}
                  </div>
                  <div className="text-bolt-elements-textSecondary line-clamp-2">{memory.content}</div>
                </div>
              ))}
            </div>

            {memories.length > 5 && (
              <div className="mt-2 text-center text-xs text-bolt-elements-textTertiary">
                + {memories.length - 5} more memories
              </div>
            )}

            {chatId && (
              <div className="mt-3 pt-3 border-t border-bolt-elements-borderColor">
                <button
                  onClick={() => {
                    setIsExpanded(false);
                    setShowViewer(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg bg-purple-500 hover:bg-purple-600 text-white transition-colors"
                >
                  <div className="i-ph:eye text-lg" />
                  View All Memories
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Memory Viewer Dialog */}
      {chatId && <MemoryViewer isOpen={showViewer} onClose={() => setShowViewer(false)} chatId={chatId} />}
    </div>
  );
}

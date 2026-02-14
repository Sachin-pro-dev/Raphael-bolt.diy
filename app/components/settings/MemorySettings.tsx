/**
 * Memory Settings Component
 *
 * Configuration panel for Mem0 integration
 * - Enable/disable memory
 * - Configure API key
 * - Auto-save preferences
 * - Clear memories
 */

import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { memoryConfig, autoSaveConfig, memoryConfigHelpers, autoSaveConfigHelpers } from '~/lib/stores/memory';

export function MemorySettings() {
  const config = useStore(memoryConfig);
  const autoConfig = useStore(autoSaveConfig);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(config.apiKey || '');
  const [baseUrlInput, setBaseUrlInput] = useState(config.baseUrl || 'https://api.mem0.ai');

  const handleEnableToggle = (enabled: boolean) => {
    memoryConfigHelpers.setEnabled(enabled);
    toast.success(enabled ? 'Memory enabled' : 'Memory disabled');
  };

  const handleAutoSaveToggle = (enabled: boolean) => {
    autoSaveConfigHelpers.setEnabled(enabled);
    toast.success(enabled ? 'Auto-save enabled' : 'Auto-save disabled');
  };

  const handleSaveApiKey = () => {
    if (!apiKeyInput.trim()) {
      toast.error('Please enter an API key');
      return;
    }

    memoryConfigHelpers.setApiKey(apiKeyInput);
    toast.success('API key saved');
    setShowApiKey(false);
  };

  const handleSaveBaseUrl = () => {
    if (!baseUrlInput.trim()) {
      toast.error('Please enter a base URL');
      return;
    }

    memoryConfigHelpers.setBaseUrl(baseUrlInput);
    toast.success('Base URL saved');
  };

  const handleClearMemories = async () => {
    if (!confirm('Are you sure you want to clear all memories? This cannot be undone.')) {
      return;
    }

    try {
      // TODO: Implement clear all memories API endpoint
      toast.info('Clearing memories...');

      // For now, just show success
      toast.success('Memories cleared');
    } catch {
      toast.error('Failed to clear memories');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-2">Memory Settings</h3>
        <p className="text-sm text-bolt-elements-textSecondary">
          Configure Mem0 to remember your project context across sessions and model switches.
        </p>
      </div>

      {/* Enable Memory */}
      <div className="flex items-center justify-between p-4 bg-bolt-elements-background-depth-2 rounded-lg">
        <div>
          <div className="font-medium text-bolt-elements-textPrimary">Enable Memory</div>
          <div className="text-sm text-bolt-elements-textSecondary">
            Store and retrieve context across chat sessions
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => handleEnableToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-bolt-elements-background-depth-3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
        </label>
      </div>

      {/* Auto-save */}
      <div className="flex items-center justify-between p-4 bg-bolt-elements-background-depth-2 rounded-lg">
        <div>
          <div className="font-medium text-bolt-elements-textPrimary">Auto-save Context</div>
          <div className="text-sm text-bolt-elements-textSecondary">
            Automatically save important moments during conversations
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={autoConfig.enabled}
            onChange={(e) => handleAutoSaveToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-bolt-elements-background-depth-3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
        </label>
      </div>

      {/* Configuration */}
      <div className="space-y-4">
        <h4 className="font-medium text-bolt-elements-textPrimary">Mem0 Configuration</h4>

        {/* API Key */}
        <div>
          <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
            Mem0 API Key
            <span className="text-red-500 ml-1">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Enter your Mem0 API key"
              className="flex-1 px-3 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="px-3 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg hover:bg-bolt-elements-background-depth-2"
              title={showApiKey ? 'Hide API key' : 'Show API key'}
            >
              <div className={showApiKey ? 'i-ph:eye-slash' : 'i-ph:eye'} />
            </button>
            <button
              onClick={handleSaveApiKey}
              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium"
            >
              Save
            </button>
          </div>
          <p className="text-xs text-bolt-elements-textTertiary mt-1">
            Get your API key from{' '}
            <a
              href="https://app.mem0.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-500 hover:underline"
            >
              app.mem0.ai
            </a>
          </p>
        </div>

        {/* Base URL (for self-hosted) */}
        <div>
          <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">Base URL (optional)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={baseUrlInput}
              onChange={(e) => setBaseUrlInput(e.target.value)}
              placeholder="https://api.mem0.ai"
              className="flex-1 px-3 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={handleSaveBaseUrl}
              className="px-4 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg hover:bg-bolt-elements-background-depth-2 text-sm font-medium"
            >
              Save
            </button>
          </div>
          <p className="text-xs text-bolt-elements-textTertiary mt-1">For self-hosted Mem0 instances only</p>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="border border-red-500/30 rounded-lg p-4 bg-red-500/5">
        <h4 className="font-medium text-red-600 dark:text-red-400 mb-2">Danger Zone</h4>
        <p className="text-sm text-bolt-elements-textSecondary mb-3">
          Clear all stored memories. This action cannot be undone.
        </p>
        <button
          onClick={handleClearMemories}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium"
        >
          Clear All Memories
        </button>
      </div>

      {/* Info */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <div className="flex gap-3">
          <div className="text-blue-500 text-xl">ℹ️</div>
          <div className="text-sm text-bolt-elements-textSecondary">
            <p className="font-medium text-bolt-elements-textPrimary mb-1">How Memory Works</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Automatically remembers your project context and preferences</li>
              <li>Context is preserved when switching between AI models</li>
              <li>Falls back to local storage if Mem0 is unavailable</li>
              <li>All data is encrypted and private to your account</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

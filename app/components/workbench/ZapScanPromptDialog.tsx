import { memo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

interface ZapScanPromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onStartScan: (config: { autoDeploy: boolean; manualUrl?: string }) => void;
}

export const ZapScanPromptDialog = memo(({ isOpen, onClose, onStartScan }: ZapScanPromptDialogProps) => {
  const [targetUrl, setTargetUrl] = useState('https://');
  const [urlError, setUrlError] = useState('');

  const handleStartScan = () => {
    // Validate URL
    if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
      setUrlError('Please enter a valid URL starting with http:// or https://');
      return;
    }

    if (targetUrl === 'https://' || targetUrl === 'http://') {
      setUrlError('Please enter a complete URL');
      return;
    }

    onStartScan({ autoDeploy: false, manualUrl: targetUrl });
    onClose();
  };

  const handleCancel = () => {
    setTargetUrl('https://');
    setUrlError('');
    onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleCancel}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-bolt-elements-background-depth-2 shadow-2xl border border-bolt-elements-borderColor">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <div className="i-ph:shield-warning text-white text-2xl" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-semibold text-bolt-elements-textPrimary">
                  Configure DAST Scan
                </Dialog.Title>
                <Dialog.Description className="text-sm text-bolt-elements-textSecondary mt-0.5">
                  Choose how to scan your application for security vulnerabilities
                </Dialog.Description>
              </div>
            </div>
            <button
              onClick={handleCancel}
              className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors rounded-lg p-2 hover:bg-bolt-elements-background-depth-3"
            >
              <div className="i-ph:x text-xl" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* URL Input */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-bolt-elements-textPrimary">Deployment URL</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-bolt-elements-textSecondary">
                  <div className="i-ph:globe text-lg" />
                </div>
                <input
                  type="url"
                  value={targetUrl}
                  onChange={(e) => {
                    setTargetUrl(e.target.value);
                    setUrlError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleStartScan();
                    }
                  }}
                  placeholder="https://your-app.vercel.app"
                  className="w-full pl-10 pr-4 py-3 rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  autoFocus
                />
              </div>
              {urlError && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <div className="i-ph:warning-circle text-lg" />
                  {urlError}
                </div>
              )}
              <div className="space-y-2">
                <p className="text-xs text-bolt-elements-textSecondary">
                  <span className="font-medium text-bolt-elements-textPrimary">Supported platforms:</span> Vercel,
                  Netlify, Railway, Render, or any publicly accessible URL
                </p>
                <div className="flex flex-wrap gap-2">
                  <code className="px-2 py-1 text-xs bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded">
                    https://app.vercel.app
                  </code>
                  <code className="px-2 py-1 text-xs bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded">
                    https://staging.mysite.com
                  </code>
                </div>
              </div>
            </div>

            {/* Info Box */}
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <div className="flex items-start gap-3">
                <div className="i-ph:info text-blue-400 text-xl mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-1">About DAST Scanning</h4>
                  <p className="text-xs text-bolt-elements-textSecondary">
                    DAST (Dynamic Application Security Testing) analyzes your running application for security
                    vulnerabilities. The scan typically takes 5-10 minutes and tests for common web vulnerabilities,
                    missing security headers, and configuration issues.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium text-bolt-elements-textPrimary bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-2 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleStartScan}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2"
            >
              <div className="i-ph:play-circle" />
              Start Scan
              <span className="text-xs opacity-75">(~5-10 min)</span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});

ZapScanPromptDialog.displayName = 'ZapScanPromptDialog';

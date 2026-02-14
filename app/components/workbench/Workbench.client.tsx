import { useStore } from '@nanostores/react';
import { motion, type HTMLMotionProps, type Variants } from 'framer-motion';
import { computed } from 'nanostores';
import { memo, useCallback, useEffect, useState, useMemo } from 'react';
import { toast } from 'react-toastify';
import { Popover, Transition } from '@headlessui/react';
import { diffLines, type Change } from 'diff';
import { getLanguageFromExtension } from '~/utils/getLanguageFromExtension';
import type { FileHistory } from '~/types/actions';
import { DiffView } from './DiffView';
import {
  type OnChangeCallback as OnEditorChange,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { IconButton } from '~/components/ui/IconButton';
import { Slider, type SliderOptions } from '~/components/ui/Slider';
import { workbenchStore, type WorkbenchViewType } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { renderLogger } from '~/utils/logger';
import { EditorPanel } from './EditorPanel';
import { Preview } from './Preview';
import useViewport from '~/lib/hooks';

import { usePreviewStore } from '~/lib/stores/previews';
import { chatStore } from '~/lib/stores/chat';
import type { ElementInfo } from './Inspector';
import { ExportChatButton } from '~/components/chat/chatExportAndImport/ExportChatButton';
import { useChatHistory } from '~/lib/persistence';
import { streamingState } from '~/lib/stores/streaming';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { SemgrepDialog } from './SemgrepDialog';
import { ZapDialog } from './ZapDialog';
import { ZapScanPromptDialog } from './ZapScanPromptDialog';
import { GitLeaksDialog } from './GitLeaksDialog';
import { OsvDialog } from './OsvDialog';
import type { OsvScanResult } from '~/types/osv';

interface WorkspaceProps {
  chatStarted?: boolean;
  isStreaming?: boolean;
  metadata?: {
    gitUrl?: string;
  };
  updateChatMestaData?: (metadata: any) => void;
  setSelectedElement?: (element: ElementInfo | null) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

const viewTransition = { ease: cubicEasingFn };

const sliderOptions: SliderOptions<WorkbenchViewType> = {
  left: {
    value: 'code',
    text: 'Code',
  },
  middle: {
    value: 'diff',
    text: 'Diff',
  },
  right: {
    value: 'preview',
    text: 'Preview',
  },
};

const workbenchVariants = {
  closed: {
    width: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    width: 'var(--workbench-width)',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

const FileModifiedDropdown = memo(
  ({
    fileHistory,
    onSelectFile,
  }: {
    fileHistory: Record<string, FileHistory>;
    onSelectFile: (filePath: string) => void;
  }) => {
    const modifiedFiles = Object.entries(fileHistory);
    const hasChanges = modifiedFiles.length > 0;
    const [searchQuery, setSearchQuery] = useState('');

    const filteredFiles = useMemo(() => {
      return modifiedFiles.filter(([filePath]) => filePath.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [modifiedFiles, searchQuery]);

    return (
      <div className="flex items-center gap-2">
        <Popover className="relative">
          {({ open }: { open: boolean }) => (
            <>
              <Popover.Button className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 transition-colors text-bolt-elements-item-contentDefault">
                <span>File Changes</span>
                {hasChanges && (
                  <span className="w-5 h-5 rounded-full bg-accent-500/20 text-accent-500 text-xs flex items-center justify-center border border-accent-500/30">
                    {modifiedFiles.length}
                  </span>
                )}
              </Popover.Button>
              <Transition
                show={open}
                enter="transition duration-100 ease-out"
                enterFrom="transform scale-95 opacity-0"
                enterTo="transform scale-100 opacity-100"
                leave="transition duration-75 ease-out"
                leaveFrom="transform scale-100 opacity-100"
                leaveTo="transform scale-95 opacity-0"
              >
                <Popover.Panel className="absolute right-0 z-20 mt-2 w-80 origin-top-right rounded-xl bg-bolt-elements-background-depth-2 shadow-xl border border-bolt-elements-borderColor">
                  <div className="p-2">
                    <div className="relative mx-2 mb-2">
                      <input
                        type="text"
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                      <div className="absolute left-2 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary">
                        <div className="i-ph:magnifying-glass" />
                      </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto">
                      {filteredFiles.length > 0 ? (
                        filteredFiles.map(([filePath, history]) => {
                          const extension = filePath.split('.').pop() || '';
                          const language = getLanguageFromExtension(extension);

                          return (
                            <button
                              key={filePath}
                              onClick={() => onSelectFile(filePath)}
                              className="w-full px-3 py-2 text-left rounded-md hover:bg-bolt-elements-background-depth-1 transition-colors group bg-transparent"
                            >
                              <div className="flex items-center gap-2">
                                <div className="shrink-0 w-5 h-5 text-bolt-elements-textTertiary">
                                  {['typescript', 'javascript', 'jsx', 'tsx'].includes(language) && (
                                    <div className="i-ph:file-js" />
                                  )}
                                  {['css', 'scss', 'less'].includes(language) && <div className="i-ph:paint-brush" />}
                                  {language === 'html' && <div className="i-ph:code" />}
                                  {language === 'json' && <div className="i-ph:brackets-curly" />}
                                  {language === 'python' && <div className="i-ph:file-text" />}
                                  {language === 'markdown' && <div className="i-ph:article" />}
                                  {['yaml', 'yml'].includes(language) && <div className="i-ph:file-text" />}
                                  {language === 'sql' && <div className="i-ph:database" />}
                                  {language === 'dockerfile' && <div className="i-ph:cube" />}
                                  {language === 'shell' && <div className="i-ph:terminal" />}
                                  {![
                                    'typescript',
                                    'javascript',
                                    'css',
                                    'html',
                                    'json',
                                    'python',
                                    'markdown',
                                    'yaml',
                                    'yml',
                                    'sql',
                                    'dockerfile',
                                    'shell',
                                    'jsx',
                                    'tsx',
                                    'scss',
                                    'less',
                                  ].includes(language) && <div className="i-ph:file-text" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex flex-col min-w-0">
                                      <span className="truncate text-sm font-medium text-bolt-elements-textPrimary">
                                        {filePath.split('/').pop()}
                                      </span>
                                      <span className="truncate text-xs text-bolt-elements-textTertiary">
                                        {filePath}
                                      </span>
                                    </div>
                                    {(() => {
                                      // Calculate diff stats
                                      const { additions, deletions } = (() => {
                                        if (!history.originalContent) {
                                          return { additions: 0, deletions: 0 };
                                        }

                                        const normalizedOriginal = history.originalContent.replace(/\r\n/g, '\n');
                                        const normalizedCurrent =
                                          history.versions[history.versions.length - 1]?.content.replace(
                                            /\r\n/g,
                                            '\n',
                                          ) || '';

                                        if (normalizedOriginal === normalizedCurrent) {
                                          return { additions: 0, deletions: 0 };
                                        }

                                        const changes = diffLines(normalizedOriginal, normalizedCurrent, {
                                          newlineIsToken: false,
                                          ignoreWhitespace: true,
                                          ignoreCase: false,
                                        });

                                        return changes.reduce(
                                          (acc: { additions: number; deletions: number }, change: Change) => {
                                            if (change.added) {
                                              acc.additions += change.value.split('\n').length;
                                            }

                                            if (change.removed) {
                                              acc.deletions += change.value.split('\n').length;
                                            }

                                            return acc;
                                          },
                                          { additions: 0, deletions: 0 },
                                        );
                                      })();

                                      const showStats = additions > 0 || deletions > 0;

                                      return (
                                        showStats && (
                                          <div className="flex items-center gap-1 text-xs shrink-0">
                                            {additions > 0 && <span className="text-green-500">+{additions}</span>}
                                            {deletions > 0 && <span className="text-red-500">-{deletions}</span>}
                                          </div>
                                        )
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="flex flex-col items-center justify-center p-4 text-center">
                          <div className="w-12 h-12 mb-2 text-bolt-elements-textTertiary">
                            <div className="i-ph:file-dashed" />
                          </div>
                          <p className="text-sm font-medium text-bolt-elements-textPrimary">
                            {searchQuery ? 'No matching files' : 'No modified files'}
                          </p>
                          <p className="text-xs text-bolt-elements-textTertiary mt-1">
                            {searchQuery ? 'Try another search' : 'Changes will appear here as you edit'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {hasChanges && (
                    <div className="border-t border-bolt-elements-borderColor p-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(filteredFiles.map(([filePath]) => filePath).join('\n'));
                          toast('File list copied to clipboard', {
                            icon: <div className="i-ph:check-circle text-accent-500" />,
                          });
                        }}
                        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-3 transition-colors text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
                      >
                        Copy File List
                      </button>
                    </div>
                  )}
                </Popover.Panel>
              </Transition>
            </>
          )}
        </Popover>
      </div>
    );
  },
);

export const Workbench = memo(
  ({
    chatStarted,
    isStreaming,
    metadata: _metadata,
    updateChatMestaData: _updateChatMestaData,
    setSelectedElement,
    handleInputChange,
  }: WorkspaceProps) => {
    renderLogger.trace('Workbench');

    const [fileHistory, setFileHistory] = useState<Record<string, FileHistory>>({});

    // const modifiedFiles = Array.from(useStore(workbenchStore.unsavedFiles).keys());

    const hasPreview = useStore(computed(workbenchStore.previews, (previews) => previews.length > 0));
    const showWorkbench = useStore(workbenchStore.showWorkbench);
    const selectedFile = useStore(workbenchStore.selectedFile);
    const currentDocument = useStore(workbenchStore.currentDocument);
    const unsavedFiles = useStore(workbenchStore.unsavedFiles);
    const files = useStore(workbenchStore.files);
    const selectedView = useStore(workbenchStore.currentView);
    const { showChat } = useStore(chatStore);
    const canHideChat = showWorkbench || !showChat;

    const isSmallViewport = useViewport(1024);
    const streaming = useStore(streamingState);
    const { exportChat } = useChatHistory();
    const [isSyncing, setIsSyncing] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [showSemgrepDialog, setShowSemgrepDialog] = useState(false);
    const [semgrepResult, setSemgrepResult] = useState<{
      success: boolean;
      findings: any[];
      stats: { total: number; critical: number; high: number; medium: number; low: number };
      scannedFiles: number;
      scanDuration: number;
      error?: string;
    } | null>(null);
    const [isDastScanning, setIsDastScanning] = useState(false);
    const [showZapDialog, setShowZapDialog] = useState(false);
    const [showZapPrompt, setShowZapPrompt] = useState(false);
    const [zapResult, setZapResult] = useState<{
      success: boolean;
      alerts: any[];
      stats: { total: number; high: number; medium: number; low: number; info: number };
      scanDuration: number;
      targetUrl: string;
      error?: string;
    } | null>(null);
    const [isGitleaksScanning, setIsGitleaksScanning] = useState(false);
    const [showGitleaksDialog, setShowGitleaksDialog] = useState(false);
    const [gitleaksResult, setGitleaksResult] = useState<{
      success: boolean;
      findings: any[];
      stats: { total: number; critical: number; high: number; medium: number; low: number };
      scannedFiles: number;
      scanDuration: number;
      error?: string;
    } | null>(null);
    const [isOsvScanning, setIsOsvScanning] = useState(false);
    const [showOsvDialog, setShowOsvDialog] = useState(false);
    const [osvResult, setOsvResult] = useState<OsvScanResult | null>(null);

    const setSelectedView = (view: WorkbenchViewType) => {
      workbenchStore.currentView.set(view);
    };

    useEffect(() => {
      if (hasPreview) {
        setSelectedView('preview');
      }
    }, [hasPreview]);

    useEffect(() => {
      workbenchStore.setDocuments(files);
    }, [files]);

    const onEditorChange = useCallback<OnEditorChange>((update) => {
      workbenchStore.setCurrentDocumentContent(update.content);
    }, []);

    const onEditorScroll = useCallback<OnEditorScroll>((position) => {
      workbenchStore.setCurrentDocumentScrollPosition(position);
    }, []);

    const onFileSelect = useCallback((filePath: string | undefined) => {
      workbenchStore.setSelectedFile(filePath);
    }, []);

    const onFileSave = useCallback(() => {
      workbenchStore
        .saveCurrentDocument()
        .then(() => {
          // Explicitly refresh all previews after a file save
          const previewStore = usePreviewStore();
          previewStore.refreshAllPreviews();
        })
        .catch(() => {
          toast.error('Failed to update file content');
        });
    }, []);

    const onFileReset = useCallback(() => {
      workbenchStore.resetCurrentDocument();
    }, []);

    const handleSelectFile = useCallback((filePath: string) => {
      workbenchStore.setSelectedFile(filePath);
      workbenchStore.currentView.set('diff');
    }, []);

    const handleSyncFiles = useCallback(async () => {
      setIsSyncing(true);

      try {
        const directoryHandle = await window.showDirectoryPicker();
        await workbenchStore.syncFiles(directoryHandle);
        toast.success('Files synced successfully');
      } catch (error) {
        console.error('Error syncing files:', error);
        toast.error('Failed to sync files');
      } finally {
        setIsSyncing(false);
      }
    }, []);

    const handleSemgrepScan = useCallback(async () => {
      setIsScanning(true);

      try {
        console.log('[SAST] Starting scan preparation...');
        console.log('[SAST] Total files in store:', Object.keys(files).length);

        // Prepare files for scanning - only include text files with content
        const filesToScan = Object.entries(files)
          .map(([filePath, dirent]) => {
            // Skip folders
            if (!dirent || dirent.type !== 'file') {
              return null;
            }

            // Skip binary files for now (images, etc.)
            if (dirent.isBinary) {
              console.log('[SAST] Skipping binary file:', filePath);
              return null;
            }

            // Get the content
            const content = dirent.content;

            // Skip empty files
            if (!content || content.trim().length === 0) {
              console.log('[SAST] Skipping empty file:', filePath);
              return null;
            }

            // Clean the path - remove /home/project/ prefix
            const cleanPath = filePath.replace(/^\/home\/project\//, '');

            console.log('[SAST] Including file:', cleanPath, '- Size:', content.length);

            return {
              path: cleanPath,
              content,
            };
          })
          .filter((f): f is { path: string; content: string } => f !== null);

        console.log('[SAST] Files to scan:', filesToScan.length);

        if (filesToScan.length === 0) {
          toast.error('No files to scan. Please ensure you have code files in your project.');
          setIsScanning(false);

          return;
        }

        const response = await fetch('/api/semgrep-scan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ files: filesToScan }),
        });

        const result = (await response.json()) as {
          success: boolean;
          findings: any[];
          stats: { total: number; critical: number; high: number; medium: number; low: number };
          scannedFiles: number;
          scanDuration: number;
          error?: string;
          debug?: string;
        };

        console.log('[SAST] Scan result:', result);

        setSemgrepResult(result);
        setShowSemgrepDialog(true);

        if (result.success && result.stats.total > 0) {
          toast.warning(`Found ${result.stats.total} security ${result.stats.total === 1 ? 'issue' : 'issues'}`, {
            autoClose: 5000,
          });
        } else if (result.success) {
          toast.success(`No security issues found! Scanned ${result.scannedFiles} files.`, {
            autoClose: 3000,
          });
        } else {
          console.error('[SAST] Scan failed:', result.error);

          if (result.debug) {
            console.error('[SAST] Debug info:', result.debug);
          }

          toast.error(result.error || 'Scan failed');
        }
      } catch (error) {
        console.error('Error running Semgrep scan:', error);
        toast.error('Failed to run security scan');
      } finally {
        setIsScanning(false);
      }
    }, [files]);

    const handleInsertSemgrepResults = useCallback(
      (text: string) => {
        if (!handleInputChange) {
          console.warn('handleInputChange not available');
          toast.error('Could not insert into chat. Please copy the results manually.');

          return;
        }

        // Update the input via the same mechanism as handleInputChange (like web search does)
        const syntheticEvent = {
          target: { value: text },
        } as React.ChangeEvent<HTMLTextAreaElement>;

        handleInputChange(syntheticEvent);

        // Focus the textarea for better UX
        setTimeout(() => {
          const textarea =
            (document.querySelector('textarea[placeholder*="Bolt"]') as HTMLTextAreaElement) ||
            (document.querySelector('textarea[placeholder*="help"]') as HTMLTextAreaElement) ||
            (document.querySelector('textarea[placeholder*="discuss"]') as HTMLTextAreaElement);

          if (textarea) {
            textarea.focus();
            textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      },
      [handleInputChange],
    );

    const handleZapScanStart = useCallback(async (config: { autoDeploy: boolean; manualUrl?: string }) => {
      try {
        console.log('='.repeat(60));
        console.log('[DAST] Starting OWASP ZAP scan...');
        console.log('[DAST] Timestamp:', new Date().toISOString());
        console.log('[DAST] Auto-deploy:', config.autoDeploy);
        console.log('[DAST] Manual URL:', config.manualUrl || '(none)');

        // Show user-friendly notification
        if (config.autoDeploy) {
          toast.info('Auto-deploying and scanning... This may take 5-15 minutes. Please keep the browser open.', {
            autoClose: 10000,
          });
        } else {
          toast.info('Starting DAST scan... This may take 5-10 minutes. Please keep the browser open.', {
            autoClose: 8000,
          });
        }

        setIsDastScanning(true);

        console.log('[DAST] Sending scan request to API...');

        const startTime = Date.now();
        const response = await fetch('/api/zap-scan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            targetUrl: config.manualUrl || undefined,
            autoDeploy: config.autoDeploy,
          }),
        });

        const requestDuration = Date.now() - startTime;

        console.log('[DAST] API response received');
        console.log('[DAST] Request duration:', requestDuration, 'ms');
        console.log('[DAST] Response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();

          console.error('[DAST] API returned error status:', response.status);
          console.error('[DAST] Error response:', errorText);

          throw new Error(`API returned ${response.status}: ${errorText}`);
        }

        const result = (await response.json()) as {
          success: boolean;
          alerts: any[];
          stats: { total: number; high: number; medium: number; low: number; info: number };
          scanDuration: number;
          targetUrl: string;
          error?: string;
        };

        console.log('[DAST] Scan completed successfully');
        console.log('[DAST] Success:', result.success);
        console.log('[DAST] Total alerts:', result.stats?.total || 0);
        console.log('[DAST] Alert breakdown:', {
          high: result.stats?.high || 0,
          medium: result.stats?.medium || 0,
          low: result.stats?.low || 0,
          info: result.stats?.info || 0,
        });
        console.log('[DAST] Scan duration:', result.scanDuration, 'ms');
        console.log('='.repeat(60));

        // Store results and show dialog
        setZapResult(result);
        setShowZapDialog(true);

        // Show appropriate notification based on results
        if (result.success && result.stats.total > 0) {
          const criticalCount = result.stats.high || 0;
          const mediumCount = result.stats.medium || 0;

          if (criticalCount > 0) {
            toast.error(`Found ${result.stats.total} security alert(s) including ${criticalCount} high-risk!`, {
              autoClose: 8000,
            });
          } else if (mediumCount > 0) {
            toast.warning(`Found ${result.stats.total} security alert(s) including ${mediumCount} medium-risk`, {
              autoClose: 6000,
            });
          } else {
            toast.warning(`Found ${result.stats.total} security alert(s)`, {
              autoClose: 5000,
            });
          }
        } else if (result.success) {
          toast.success('No security alerts found! Your application looks secure.', {
            autoClose: 4000,
          });
        } else {
          console.error('[DAST] Scan failed with error:', result.error);

          // Show user-friendly error message
          if (result.error?.includes('Vercel is not configured')) {
            toast.error('Vercel Setup Required', {
              autoClose: false,
              closeButton: true,
            });
            toast.info('Please run: npm install -g vercel && vercel login && vercel link', {
              autoClose: 10000,
            });
          } else {
            toast.error(result.error || 'DAST scan failed. Check console for details.', {
              autoClose: 8000,
            });
          }
        }
      } catch (error: any) {
        console.error('='.repeat(60));
        console.error('[DAST] Unexpected error during scan');
        console.error('[DAST] Error type:', error?.constructor?.name);
        console.error('[DAST] Error message:', error?.message);
        console.error('[DAST] Error stack:', error?.stack);
        console.error('='.repeat(60));

        // Show user-friendly error message
        let errorMessage = 'Failed to run DAST scan. ';

        if (error?.message?.includes('fetch')) {
          errorMessage += 'Could not connect to the scan API. Please ensure the server is running.';
        } else if (error?.message?.includes('timeout')) {
          errorMessage += 'The scan took too long. Try scanning a smaller application.';
        } else if (error?.message) {
          errorMessage += error.message;
        } else {
          errorMessage += 'An unexpected error occurred. Check the console for details.';
        }

        toast.error(errorMessage, {
          autoClose: 8000,
        });
      } finally {
        setIsDastScanning(false);
        console.log('[DAST] Scan process finished');
      }
    }, []);

    const handleZapScan = useCallback(() => {
      setShowZapPrompt(true);
    }, []);

    const handleInsertZapResults = useCallback(
      (text: string) => {
        if (!handleInputChange) {
          console.warn('handleInputChange not available');
          toast.error('Could not insert into chat. Please copy the results manually.');

          return;
        }

        const syntheticEvent = {
          target: { value: text },
        } as React.ChangeEvent<HTMLTextAreaElement>;

        handleInputChange(syntheticEvent);

        setTimeout(() => {
          const textarea =
            (document.querySelector('textarea[placeholder*="Bolt"]') as HTMLTextAreaElement) ||
            (document.querySelector('textarea[placeholder*="help"]') as HTMLTextAreaElement) ||
            (document.querySelector('textarea[placeholder*="discuss"]') as HTMLTextAreaElement);

          if (textarea) {
            textarea.focus();
            textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      },
      [handleInputChange],
    );

    const handleGitleaksScan = useCallback(async () => {
      setIsGitleaksScanning(true);

      try {
        console.log('[Secrets] Starting GitLeaks scan...');
        console.log('[Secrets] Total files in store:', Object.keys(files).length);

        // Prepare files for scanning - only include text files with content (same as SAST)
        const filesToScan = Object.entries(files)
          .map(([filePath, dirent]) => {
            // Skip folders
            if (!dirent || dirent.type !== 'file') {
              return null;
            }

            // Skip binary files
            if (dirent.isBinary) {
              console.log('[Secrets] Skipping binary file:', filePath);
              return null;
            }

            // Get the content
            const content = dirent.content;

            // Skip empty files
            if (!content || content.trim().length === 0) {
              console.log('[Secrets] Skipping empty file:', filePath);
              return null;
            }

            // Clean the path - remove /home/project/ prefix
            const cleanPath = filePath.replace(/^\/home\/project\//, '');

            console.log('[Secrets] Including file:', cleanPath, '- Size:', content.length);

            return {
              path: cleanPath,
              content,
            };
          })
          .filter((f): f is { path: string; content: string } => f !== null);

        console.log('[Secrets] Files to scan:', filesToScan.length);

        if (filesToScan.length === 0) {
          toast.error('No files to scan. Please ensure you have code files in your project.');
          setIsGitleaksScanning(false);

          return;
        }

        const response = await fetch('/api/gitleaks-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: filesToScan }),
        });

        const result = (await response.json()) as {
          success: boolean;
          findings: any[];
          stats: { total: number; critical: number; high: number; medium: number; low: number };
          scannedFiles: number;
          scanDuration: number;
          error?: string;
        };

        console.log('[Secrets] Scan result:', result);

        setGitleaksResult(result);
        setShowGitleaksDialog(true);

        // Toast notifications
        if (result.success && result.stats.total > 0) {
          if (result.stats.critical > 0) {
            toast.error(`CRITICAL: Found ${result.stats.critical} exposed secret(s)! Immediate action required.`, {
              autoClose: 10000,
            });
          } else if (result.stats.high > 0) {
            toast.error(`Found ${result.stats.total} secret(s) including ${result.stats.high} high-risk!`, {
              autoClose: 8000,
            });
          } else {
            toast.warning(`Found ${result.stats.total} secret(s) in codebase`, {
              autoClose: 5000,
            });
          }
        } else if (result.success) {
          toast.success(`No secrets detected! Scanned ${result.scannedFiles} files.`, { autoClose: 3000 });
        } else {
          console.error('[Secrets] Scan failed:', result.error);
          toast.error(result.error || 'Secrets scan failed');
        }
      } catch (error: any) {
        console.error('[Secrets] Error:', error);
        toast.error('Failed to run secrets scan');
      } finally {
        setIsGitleaksScanning(false);
      }
    }, [files]);

    const handleOsvScan = useCallback(async () => {
      setIsOsvScanning(true);

      try {
        console.log('[OSV] Starting dependency scan...');
        console.log('[OSV] Total files in store:', Object.keys(files).length);

        // Filter for manifest files (package.json, requirements.txt, go.mod, etc.)
        const manifestFiles = Object.entries(files)
          .map(([filePath, dirent]) => {
            if (!dirent || dirent.type !== 'file' || dirent.isBinary) {
              return null;
            }

            const isManifest =
              /package\.json$|requirements\.txt$|go\.mod$|Cargo\.toml$|pom\.xml$|composer\.json$/i.test(filePath);

            if (!isManifest) {
              return null;
            }

            return {
              path: filePath.replace(/^\/home\/project\//, ''),
              content: dirent.content,
            };
          })
          .filter((f): f is { path: string; content: string } => f !== null);

        console.log('[OSV] Manifest files found:', manifestFiles.length);

        if (manifestFiles.length === 0) {
          toast.info('No dependency files found. Add package.json, requirements.txt, go.mod, or other manifest files.');
          setIsOsvScanning(false);

          return;
        }

        const response = await fetch('/api/osv-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: manifestFiles }),
        });

        const result: OsvScanResult = await response.json();

        console.log('[OSV] Scan result:', result);

        setOsvResult(result);
        setShowOsvDialog(true);

        if (result.success && result.stats.total > 0) {
          if (result.stats.critical > 0) {
            toast.error(`CRITICAL: Found ${result.stats.critical} critical vulnerabilities!`, { autoClose: 10000 });
          } else {
            toast.warning(
              `Found ${result.stats.total} ${result.stats.total === 1 ? 'vulnerability' : 'vulnerabilities'}`,
              {
                autoClose: 5000,
              },
            );
          }
        } else if (result.success) {
          toast.success(`No vulnerabilities found! Scanned ${result.scannedPackages} packages.`, { autoClose: 3000 });
        } else {
          console.error('[OSV] Scan failed:', result.error);
          toast.error(result.error || 'Dependency scan failed');
        }
      } catch (error: any) {
        console.error('[OSV] Error:', error);
        toast.error('Failed to run dependency scan');
      } finally {
        setIsOsvScanning(false);
      }
    }, [files]);

    return (
      chatStarted && (
        <motion.div
          initial="closed"
          animate={showWorkbench ? 'open' : 'closed'}
          variants={workbenchVariants}
          className="z-workbench"
        >
          <div
            className={classNames(
              'fixed top-[calc(var(--header-height)+1.2rem)] bottom-6 w-[var(--workbench-inner-width)] z-0 transition-[left,width] duration-200 bolt-ease-cubic-bezier',
              {
                'w-full': isSmallViewport,
                'left-0': showWorkbench && isSmallViewport,
                'left-[var(--workbench-left)]': showWorkbench,
                'left-[100%]': !showWorkbench,
              },
            )}
          >
            <div className="absolute inset-0 px-2 lg:px-4">
              <div className="h-full flex flex-col bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor shadow-[0_0_20px_rgba(0,229,255,0.06)] rounded-2xl overflow-hidden">
                <div className="flex items-center px-3 py-2 border-b border-bolt-elements-borderColor gap-1.5">
                  <button
                    className={`${showChat ? 'i-ph:sidebar-simple-fill' : 'i-ph:sidebar-simple'} text-lg text-bolt-elements-textSecondary mr-1`}
                    disabled={!canHideChat || isSmallViewport}
                    onClick={() => {
                      if (canHideChat) {
                        chatStore.setKey('showChat', !showChat);
                      }
                    }}
                  />
                  <Slider selected={selectedView} options={sliderOptions} setSelected={setSelectedView} />
                  <div className="ml-auto" />
                  {selectedView === 'code' && (
                    <div className="flex overflow-y-auto">
                      {/* Export Chat Button */}
                      <ExportChatButton exportChat={exportChat} />

                      {/* Sync Button */}
                      <div className="flex ml-2">
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger
                            disabled={isSyncing || streaming}
                            className="group relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 transition-all duration-300 hover:bg-cyan-500/15 hover:border-cyan-400/60 hover:shadow-[0_0_12px_rgba(0,229,255,0.2)] hover:text-cyan-300 active:scale-95 [&:is(:disabled,.disabled)]:cursor-not-allowed [&:is(:disabled,.disabled)]:opacity-40 [&:is(:disabled,.disabled)]:hover:shadow-none"
                          >
                            {isSyncing ? 'Syncing...' : 'Sync'}
                            <span className={classNames('i-ph:caret-down transition-transform duration-200')} />
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Content
                            className={classNames(
                              'min-w-[240px] z-[250]',
                              'bg-black/90 dark:bg-black/90 backdrop-blur-xl',
                              'rounded-xl shadow-[0_8px_32px_rgba(0,229,255,0.12)]',
                              'border border-cyan-500/20',
                              'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2',
                              'py-1.5',
                            )}
                            sideOffset={5}
                            align="end"
                          >
                            <DropdownMenu.Item
                              className="cursor-pointer flex items-center w-full px-4 py-2.5 text-sm text-gray-300 hover:text-cyan-300 hover:bg-cyan-500/10 gap-2 rounded-lg mx-1 transition-all duration-200 outline-none"
                              onClick={handleSyncFiles}
                              disabled={isSyncing}
                            >
                              <div className="flex items-center gap-2">
                                {isSyncing ? (
                                  <div className="i-ph:spinner animate-spin" />
                                ) : (
                                  <div className="i-ph:cloud-arrow-down text-cyan-400" />
                                )}
                                <span>{isSyncing ? 'Syncing...' : 'Sync Files'}</span>
                              </div>
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Root>
                      </div>

                      {/* SAST Scan Button */}
                      <div className="flex ml-1.5">
                        <button
                          onClick={handleSemgrepScan}
                          disabled={isScanning || streaming}
                          className="group relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 transition-all duration-300 hover:bg-cyan-500/15 hover:border-cyan-400/60 hover:shadow-[0_0_12px_rgba(0,229,255,0.2)] hover:text-cyan-300 active:scale-95 [&:is(:disabled,.disabled)]:cursor-not-allowed [&:is(:disabled,.disabled)]:opacity-40 [&:is(:disabled,.disabled)]:hover:shadow-none"
                        >
                          {isScanning ? (
                            <>
                              <div className="i-ph:spinner animate-spin" />
                              Scanning...
                            </>
                          ) : (
                            <>
                              <div className="i-ph:shield-check transition-transform duration-200 group-hover:scale-110" />
                              SAST Scan
                            </>
                          )}
                        </button>
                      </div>

                      {/* DAST Scan Button */}
                      <div className="flex ml-1.5">
                        <button
                          onClick={handleZapScan}
                          disabled={isDastScanning || streaming}
                          className="group relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 transition-all duration-300 hover:bg-cyan-500/15 hover:border-cyan-400/60 hover:shadow-[0_0_12px_rgba(0,229,255,0.2)] hover:text-cyan-300 active:scale-95 [&:is(:disabled,.disabled)]:cursor-not-allowed [&:is(:disabled,.disabled)]:opacity-40 [&:is(:disabled,.disabled)]:hover:shadow-none"
                        >
                          {isDastScanning ? (
                            <>
                              <div className="i-ph:spinner animate-spin" />
                              Scanning...
                            </>
                          ) : (
                            <>
                              <div className="i-ph:shield-warning transition-transform duration-200 group-hover:scale-110" />
                              DAST Scan
                            </>
                          )}
                        </button>
                      </div>

                      {/* Secrets Scan Button */}
                      <div className="flex ml-1.5">
                        <button
                          onClick={handleGitleaksScan}
                          disabled={isGitleaksScanning || streaming}
                          className="group relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 transition-all duration-300 hover:bg-cyan-500/15 hover:border-cyan-400/60 hover:shadow-[0_0_12px_rgba(0,229,255,0.2)] hover:text-cyan-300 active:scale-95 [&:is(:disabled,.disabled)]:cursor-not-allowed [&:is(:disabled,.disabled)]:opacity-40 [&:is(:disabled,.disabled)]:hover:shadow-none"
                        >
                          {isGitleaksScanning ? (
                            <>
                              <div className="i-ph:spinner animate-spin" />
                              Scanning...
                            </>
                          ) : (
                            <>
                              <div className="i-ph:lock-key transition-transform duration-200 group-hover:scale-110" />
                              Secrets Scan
                            </>
                          )}
                        </button>
                      </div>

                      {/* OSV Dependency Scan Button */}
                      <div className="flex ml-1.5">
                        <button
                          onClick={handleOsvScan}
                          disabled={isOsvScanning || streaming}
                          className="group relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 transition-all duration-300 hover:bg-cyan-500/15 hover:border-cyan-400/60 hover:shadow-[0_0_12px_rgba(0,229,255,0.2)] hover:text-cyan-300 active:scale-95 [&:is(:disabled,.disabled)]:cursor-not-allowed [&:is(:disabled,.disabled)]:opacity-40 [&:is(:disabled,.disabled)]:hover:shadow-none"
                        >
                          {isOsvScanning ? (
                            <>
                              <div className="i-ph:spinner animate-spin" />
                              Scanning...
                            </>
                          ) : (
                            <>
                              <div className="i-ph:package transition-transform duration-200 group-hover:scale-110" />
                              Dependency Scan
                            </>
                          )}
                        </button>
                      </div>

                      {/* Toggle Terminal Button */}
                      <div className="flex ml-1.5">
                        <button
                          onClick={() => {
                            workbenchStore.toggleTerminal(!workbenchStore.showTerminal.get());
                          }}
                          className="group relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 transition-all duration-300 hover:bg-cyan-500/15 hover:border-cyan-400/60 hover:shadow-[0_0_12px_rgba(0,229,255,0.2)] hover:text-cyan-300 active:scale-95"
                        >
                          <div className="i-ph:terminal transition-transform duration-200 group-hover:scale-110" />
                          Toggle Terminal
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedView === 'diff' && (
                    <FileModifiedDropdown fileHistory={fileHistory} onSelectFile={handleSelectFile} />
                  )}
                  <IconButton
                    icon="i-ph:x-circle"
                    className="-mr-1"
                    size="xl"
                    onClick={() => {
                      workbenchStore.showWorkbench.set(false);
                    }}
                  />
                </div>
                <div className="relative flex-1 overflow-hidden">
                  <View initial={{ x: '0%' }} animate={{ x: selectedView === 'code' ? '0%' : '-100%' }}>
                    <EditorPanel
                      editorDocument={currentDocument}
                      isStreaming={isStreaming}
                      selectedFile={selectedFile}
                      files={files}
                      unsavedFiles={unsavedFiles}
                      fileHistory={fileHistory}
                      onFileSelect={onFileSelect}
                      onEditorScroll={onEditorScroll}
                      onEditorChange={onEditorChange}
                      onFileSave={onFileSave}
                      onFileReset={onFileReset}
                    />
                  </View>
                  <View
                    initial={{ x: '100%' }}
                    animate={{ x: selectedView === 'diff' ? '0%' : selectedView === 'code' ? '100%' : '-100%' }}
                  >
                    <DiffView fileHistory={fileHistory} setFileHistory={setFileHistory} />
                  </View>
                  <View initial={{ x: '100%' }} animate={{ x: selectedView === 'preview' ? '0%' : '100%' }}>
                    <Preview setSelectedElement={setSelectedElement} />
                  </View>
                </div>
              </div>
            </div>
          </div>

          {/* Semgrep Dialog */}
          <SemgrepDialog
            isOpen={showSemgrepDialog}
            onClose={() => setShowSemgrepDialog(false)}
            result={semgrepResult}
            onInsertIntoPrompt={handleInsertSemgrepResults}
          />

          {/* ZAP Dialog */}
          <ZapScanPromptDialog
            isOpen={showZapPrompt}
            onClose={() => setShowZapPrompt(false)}
            onStartScan={handleZapScanStart}
          />
          <ZapDialog
            isOpen={showZapDialog}
            onClose={() => setShowZapDialog(false)}
            result={zapResult}
            onInsertIntoPrompt={handleInsertZapResults}
          />

          {/* GitLeaks Dialog */}
          <GitLeaksDialog
            isOpen={showGitleaksDialog}
            onClose={() => setShowGitleaksDialog(false)}
            result={gitleaksResult}
            onInsertIntoPrompt={handleInsertSemgrepResults}
          />

          {/* OSV Dependency Scan Dialog */}
          <OsvDialog
            isOpen={showOsvDialog}
            onClose={() => setShowOsvDialog(false)}
            result={osvResult}
            onInsertIntoPrompt={handleInsertSemgrepResults}
          />
        </motion.div>
      )
    );
  },
);

// View component for rendering content with motion transitions
interface ViewProps extends HTMLMotionProps<'div'> {
  children: JSX.Element;
}

const View = memo(({ children, ...props }: ViewProps) => {
  return (
    <motion.div className="absolute inset-0" transition={viewTransition} {...props}>
      {children}
    </motion.div>
  );
});

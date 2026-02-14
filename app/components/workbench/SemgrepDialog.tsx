import { memo, useState, useMemo } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Dialog, DialogTitle, DialogDescription, DialogButton } from '~/components/ui/Dialog';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';

interface SemgrepFinding {
  ruleId: string;
  message: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  filePath: string;
  line: number;
  column: number;
  code: string;
  fix?: string;
  cwe?: string;
  owasp?: string;
}

interface SemgrepScanResult {
  success: boolean;
  findings: SemgrepFinding[];
  stats: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  scannedFiles: number;
  scanDuration: number;
  error?: string;
  debug?: string;
}

interface SemgrepDialogProps {
  isOpen: boolean;
  onClose: () => void;
  result: SemgrepScanResult | null;
  onInsertIntoPrompt?: (text: string) => void;
}

type SeverityFilter = 'all' | 'ERROR' | 'WARNING' | 'INFO';

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'ERROR':
      return 'text-red-500';
    case 'WARNING':
      return 'text-yellow-500';
    case 'INFO':
      return 'text-blue-500';
    default:
      return 'text-gray-500';
  }
};

const getSeverityBgColor = (severity: string) => {
  switch (severity) {
    case 'ERROR':
      return 'bg-red-500/10 border-red-500/30';
    case 'WARNING':
      return 'bg-yellow-500/10 border-yellow-500/30';
    case 'INFO':
      return 'bg-blue-500/10 border-blue-500/30';
    default:
      return 'bg-gray-500/10 border-gray-500/30';
  }
};

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case 'ERROR':
      return 'i-ph:warning-circle-fill';
    case 'WARNING':
      return 'i-ph:warning-fill';
    case 'INFO':
      return 'i-ph:info-fill';
    default:
      return 'i-ph:circle-fill';
  }
};

// Extract just the filename and relative path from full path
const formatFilePath = (fullPath: string): { fileName: string; relativePath: string } => {
  // Remove temp directory prefix
  const cleanPath = fullPath.replace(/.*[\\\/]semgrep-scan-\d+[\\\/]/, '');
  const parts = cleanPath.split(/[\\\/]/);
  const fileName = parts[parts.length - 1];
  const relativePath = parts.slice(0, -1).join('/');

  return { fileName, relativePath };
};

export const SemgrepDialog = memo(({ isOpen, onClose, result, onInsertIntoPrompt }: SemgrepDialogProps) => {
  const [selectedFinding, setSelectedFinding] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  const filteredFindings = useMemo(() => {
    if (!result || severityFilter === 'all') {
      return result?.findings || [];
    }

    return result.findings.filter((f) => f.severity === severityFilter);
  }, [result, severityFilter]);

  // Group findings by rule ID to avoid duplicates
  const groupedFindings = useMemo(() => {
    const grouped = new Map<string, SemgrepFinding[]>();

    filteredFindings.forEach((finding) => {
      const key = `${finding.ruleId}-${finding.line}`;

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }

      grouped.get(key)!.push(finding);
    });

    // Take first finding from each group
    return Array.from(grouped.values()).map((group) => group[0]);
  }, [filteredFindings]);

  const handleDownloadPDF = async () => {
    if (!result) {
      return;
    }

    try {
      toast.info('Generating PDF report...', { autoClose: 2000 });

      const response = await fetch('/api/sast-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          findings: result.findings.map((f) => ({
            check_id: f.ruleId,
            path: f.filePath,
            start: { line: f.line, col: f.column || 0 },
            end: { line: f.line, col: f.column || 0 },
            extra: {
              message: f.message,
              severity: f.severity,
              metadata: {
                cwe: [],
                owasp: [],
                references: [],
              },
            },
          })),
          stats: result.stats,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sast-report-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('PDF report downloaded');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Failed to generate PDF report');
    }
  };

  const handleInsertIntoPrompt = () => {
    if (!result || !onInsertIntoPrompt) {
      return;
    }

    const markdown = `I just ran a security scan and found ${result.stats.total} ${result.stats.total === 1 ? 'issue' : 'issues'}. Please help me fix ${result.stats.total === 1 ? 'this vulnerability' : 'these vulnerabilities'}:

# 🔒 Security Scan Results

**Summary:**
- Total Issues: ${result.stats.total}
- Critical (ERROR): ${result.stats.critical}
- High (WARNING): ${result.stats.high}
- Medium (INFO): ${result.stats.medium}

## Vulnerabilities Found:

${groupedFindings
  .map((finding, index) => {
    const { fileName, relativePath } = formatFilePath(finding.filePath);
    return `### ${index + 1}. ${finding.ruleId.replace('semgrep.', '')}

**Severity:** ${finding.severity}
**File:** \`${relativePath ? relativePath + '/' : ''}${fileName}:${finding.line}\`
**Issue:** ${finding.message}${finding.cwe ? `\n**CWE:** ${finding.cwe}` : ''}${finding.owasp ? `\n**OWASP:** ${finding.owasp}` : ''}${finding.fix ? `\n**Recommended Fix:** ${finding.fix}` : ''}
${finding.code ? `\n**Code:**\n\`\`\`\n${finding.code}\n\`\`\`` : ''}
`;
  })
  .join('\n')}

Please review each vulnerability and help me implement secure fixes for all of them.`;

    onInsertIntoPrompt(markdown);
    toast.success('Results inserted into chat');
    onClose();
  };

  if (!result) {
    return null;
  }

  return (
    <RadixDialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog className="w-[90vw] max-w-5xl max-h-[90vh] flex flex-col" showCloseButton>
        <div className="flex flex-col max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="p-6 pb-4 border-b border-bolt-elements-borderColor">
            <DialogTitle className="flex items-center gap-2 mb-2">
              <div className="i-ph:shield-check text-2xl text-accent-500" />
              Security Scan Results
            </DialogTitle>
            <DialogDescription>
              Scanned {result.scannedFiles} {result.scannedFiles === 1 ? 'file' : 'files'} in{' '}
              {(result.scanDuration / 1000).toFixed(2)}s
            </DialogDescription>
          </div>

          {/* Error State */}
          {!result.success && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-2xl">
                <div className="i-ph:warning-circle text-6xl text-red-500 mb-4 mx-auto" />
                <p className="text-lg font-medium text-bolt-elements-textPrimary mb-2">Scan Failed</p>
                <p className="text-sm text-bolt-elements-textSecondary mb-4">{result.error}</p>
                {result.debug && (
                  <div className="mt-4 p-3 bg-bolt-elements-background-depth-2 rounded border border-bolt-elements-borderColor text-left">
                    <p className="text-xs font-medium text-bolt-elements-textPrimary mb-2">Debug Information:</p>
                    <pre className="text-xs text-bolt-elements-textSecondary font-mono overflow-x-auto whitespace-pre-wrap max-h-40">
                      {result.debug}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Success State */}
          {result.success && (
            <>
              {/* Stats Grid */}
              <div className="p-6 pb-4">
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-bolt-elements-background-depth-1 rounded-lg p-3 border border-bolt-elements-borderColor">
                    <div className="text-xs text-bolt-elements-textTertiary mb-1">Total</div>
                    <div className="text-2xl font-bold text-bolt-elements-textPrimary">{result.stats.total}</div>
                  </div>
                  <div
                    className={classNames(
                      'rounded-lg p-3 border',
                      result.stats.critical > 0
                        ? 'bg-red-500/10 border-red-500/30'
                        : 'bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor',
                    )}
                  >
                    <div className="text-xs text-bolt-elements-textTertiary mb-1">Critical</div>
                    <div
                      className={classNames(
                        'text-2xl font-bold',
                        result.stats.critical > 0 ? 'text-red-500' : 'text-bolt-elements-textPrimary',
                      )}
                    >
                      {result.stats.critical}
                    </div>
                  </div>
                  <div
                    className={classNames(
                      'rounded-lg p-3 border',
                      result.stats.high > 0
                        ? 'bg-yellow-500/10 border-yellow-500/30'
                        : 'bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor',
                    )}
                  >
                    <div className="text-xs text-bolt-elements-textTertiary mb-1">High</div>
                    <div
                      className={classNames(
                        'text-2xl font-bold',
                        result.stats.high > 0 ? 'text-yellow-500' : 'text-bolt-elements-textPrimary',
                      )}
                    >
                      {result.stats.high}
                    </div>
                  </div>
                  <div
                    className={classNames(
                      'rounded-lg p-3 border',
                      result.stats.medium > 0
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor',
                    )}
                  >
                    <div className="text-xs text-bolt-elements-textTertiary mb-1">Medium</div>
                    <div
                      className={classNames(
                        'text-2xl font-bold',
                        result.stats.medium > 0 ? 'text-blue-500' : 'text-bolt-elements-textPrimary',
                      )}
                    >
                      {result.stats.medium}
                    </div>
                  </div>
                </div>

                {/* Filter Tabs */}
                {result.findings.length > 0 && (
                  <div className="flex gap-2 mt-4">
                    {(['all', 'ERROR', 'WARNING', 'INFO'] as SeverityFilter[]).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setSeverityFilter(filter)}
                        className={classNames(
                          'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                          severityFilter === filter
                            ? 'bg-accent-500 text-white'
                            : 'bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2',
                        )}
                      >
                        {filter === 'all' ? 'All' : filter}
                        {filter !== 'all' && (
                          <span className="ml-1">({result.findings.filter((f) => f.severity === filter).length})</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Findings List */}
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 pb-6 modern-scrollbar">
                {groupedFindings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-8">
                    <div className="i-ph:shield-check text-6xl text-green-500 mb-4" />
                    <p className="text-lg font-medium text-bolt-elements-textPrimary mb-2">
                      {severityFilter === 'all' ? 'No Issues Found!' : `No ${severityFilter} Issues`}
                    </p>
                    <p className="text-sm text-bolt-elements-textSecondary">
                      {severityFilter === 'all'
                        ? 'Your code passed all security checks.'
                        : `Try selecting a different severity filter.`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {groupedFindings.map((finding, index) => {
                      const { fileName, relativePath } = formatFilePath(finding.filePath);
                      const isExpanded = selectedFinding === index;

                      return (
                        <div
                          key={index}
                          className={classNames(
                            'border rounded-lg p-4 transition-all cursor-pointer overflow-hidden',
                            isExpanded
                              ? 'bg-bolt-elements-item-backgroundAccent border-accent-500'
                              : 'bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor hover:bg-bolt-elements-background-depth-2',
                          )}
                          onClick={() => setSelectedFinding(isExpanded ? null : index)}
                        >
                          <div className="flex items-start gap-3 overflow-hidden">
                            <div
                              className={classNames(
                                'text-xl mt-0.5 flex-shrink-0',
                                getSeverityIcon(finding.severity),
                                getSeverityColor(finding.severity),
                              )}
                            />
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div className="flex-1 min-w-0 overflow-hidden">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-bolt-elements-textPrimary text-sm break-words overflow-wrap-anywhere">
                                      {finding.ruleId.replace('semgrep.', '')}
                                    </span>
                                    <span
                                      className={classNames(
                                        'text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0',
                                        getSeverityBgColor(finding.severity),
                                        getSeverityColor(finding.severity),
                                      )}
                                    >
                                      {finding.severity}
                                    </span>
                                  </div>
                                  <p className="text-sm text-bolt-elements-textSecondary mt-1 break-words overflow-wrap-anywhere">
                                    {finding.message}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-4 text-xs text-bolt-elements-textTertiary flex-wrap">
                                <span className="flex items-center gap-1.5 min-w-0 max-w-full" title={finding.filePath}>
                                  <div className="i-ph:file-text flex-shrink-0" />
                                  <span className="break-words overflow-wrap-anywhere">
                                    {relativePath && <span className="opacity-60">{relativePath}/</span>}
                                    <span className="font-medium">{fileName}</span>
                                    <span className="opacity-60">:{finding.line}</span>
                                  </span>
                                </span>
                                {finding.cwe && (
                                  <span className="flex items-center gap-1 flex-shrink-0">
                                    <div className="i-ph:shield-warning" />
                                    {finding.cwe}
                                  </span>
                                )}
                              </div>

                              {isExpanded && (
                                <div className="mt-3 space-y-3 border-t border-bolt-elements-borderColor pt-3 overflow-hidden">
                                  {finding.owasp && (
                                    <div className="text-xs overflow-hidden">
                                      <span className="font-medium text-bolt-elements-textPrimary">OWASP: </span>
                                      <span className="text-bolt-elements-textSecondary break-words overflow-wrap-anywhere">
                                        {finding.owasp}
                                      </span>
                                    </div>
                                  )}
                                  {finding.fix && (
                                    <div className="bg-green-500/10 border border-green-500/30 rounded p-3 overflow-hidden">
                                      <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-1.5 flex items-center gap-1.5">
                                        <div className="i-ph:lightbulb flex-shrink-0" />
                                        Suggested Fix
                                      </div>
                                      <p className="text-xs text-bolt-elements-textSecondary break-words overflow-wrap-anywhere">
                                        {finding.fix}
                                      </p>
                                    </div>
                                  )}
                                  {finding.code && (
                                    <div className="bg-bolt-elements-background-depth-2 rounded p-3 overflow-hidden">
                                      <div className="text-xs font-medium text-bolt-elements-textPrimary mb-2">
                                        Code:
                                      </div>
                                      <pre className="text-xs text-bolt-elements-textSecondary font-mono whitespace-pre-wrap break-words overflow-wrap-anywhere">
                                        {finding.code}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 p-6 pt-4 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
            <div className="flex gap-2">
              {result.success && groupedFindings.length > 0 && (
                <>
                  <DialogButton type="secondary" onClick={handleDownloadPDF}>
                    <div className="i-ph:file-pdf" />
                    Download PDF
                  </DialogButton>
                  {onInsertIntoPrompt && (
                    <DialogButton type="secondary" onClick={handleInsertIntoPrompt}>
                      <div className="i-ph:chat-circle-text" />
                      Insert into Chat
                    </DialogButton>
                  )}
                </>
              )}
            </div>
            <DialogButton type="primary" onClick={onClose}>
              Close
            </DialogButton>
          </div>
        </div>
      </Dialog>
    </RadixDialog.Root>
  );
});

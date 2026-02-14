import { memo, useState, useMemo } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Dialog, DialogTitle, DialogDescription, DialogButton } from '~/components/ui/Dialog';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';

interface GitLeaksFinding {
  ruleId: string;
  description: string;
  startLine: number;
  endLine: number;
  secret: string; // Pre-redacted from API
  file: string;
  commit: string;
  author: string;
  email: string;
  date: string;
  message: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

interface GitLeaksScanResult {
  success: boolean;
  findings: GitLeaksFinding[];
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
}

interface GitLeaksDialogProps {
  isOpen: boolean;
  onClose: () => void;
  result: GitLeaksScanResult | null;
  onInsertIntoPrompt?: (text: string) => void;
}

type SeverityFilter = 'all' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'CRITICAL':
      return 'text-red-600';
    case 'HIGH':
      return 'text-red-500';
    case 'MEDIUM':
      return 'text-yellow-500';
    case 'LOW':
      return 'text-blue-500';
    default:
      return 'text-gray-500';
  }
};

const getSeverityBgColor = (severity: string) => {
  switch (severity) {
    case 'CRITICAL':
      return 'bg-red-600/10 border-red-600/30';
    case 'HIGH':
      return 'bg-red-500/10 border-red-500/30';
    case 'MEDIUM':
      return 'bg-yellow-500/10 border-yellow-500/30';
    case 'LOW':
      return 'bg-blue-500/10 border-blue-500/30';
    default:
      return 'bg-gray-500/10 border-gray-500/30';
  }
};

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case 'CRITICAL':
      return 'i-ph:skull-fill';
    case 'HIGH':
      return 'i-ph:warning-octagon-fill';
    case 'MEDIUM':
      return 'i-ph:warning-fill';
    case 'LOW':
      return 'i-ph:info-fill';
    default:
      return 'i-ph:circle-fill';
  }
};

// Double-check redaction on client side (security layer)
function ensureRedacted(secret: string): string {
  if (!secret) {
    return '***';
  }

  // If it doesn't contain asterisks and is longer than 8 chars, it might be unredacted
  if (secret.length > 8 && !secret.includes('*')) {
    console.error('SECURITY: Unredacted secret detected! Re-redacting...');

    // Re-redact
    const first3 = secret.substring(0, 3);
    const last3 = secret.substring(secret.length - 3);

    return `${first3}${'*'.repeat(secret.length - 6)}${last3}`;
  }

  return secret;
}

// Format file path to be more readable
const formatFilePath = (fullPath: string): { fileName: string; relativePath: string } => {
  // Clean common prefixes
  const cleanPath = fullPath
    .replace(/^\/home\/project\//, '')
    .replace(/^\.\//, '')
    .replace(/\\/g, '/');

  const parts = cleanPath.split('/');
  const fileName = parts[parts.length - 1];
  const relativePath = parts.slice(0, -1).join('/');

  return { fileName, relativePath };
};

// Format commit SHA to short form
const formatCommitSha = (commit: string): string => {
  if (!commit || commit === 'uncommitted') {
    return 'uncommitted';
  }

  return commit.substring(0, 8);
};

// Format date to readable form
const formatDate = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString();
  } catch {
    return dateStr;
  }
};

export const GitLeaksDialog = memo(({ isOpen, onClose, result, onInsertIntoPrompt }: GitLeaksDialogProps) => {
  const [selectedFinding, setSelectedFinding] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  const filteredFindings = useMemo(() => {
    if (!result || severityFilter === 'all') {
      return result?.findings || [];
    }

    return result.findings.filter((f) => f.severity === severityFilter);
  }, [result, severityFilter]);

  const handleDownloadPDF = async () => {
    if (!result) {
      return;
    }

    try {
      toast.info('Generating PDF report...', { autoClose: 2000 });

      const response = await fetch('/api/gitleaks-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          findings: result.findings,
          stats: result.stats,
          scanDuration: result.scanDuration,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `secrets-scan-report-${new Date().toISOString().split('T')[0]}.pdf`;
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

    const markdown = `I found ${result.stats.total} exposed ${result.stats.total === 1 ? 'secret' : 'secrets'} in the codebase. Please help me assess the risk and remediate:

# 🔐 Secrets Scan Results

**Summary:**
- Total Secrets: ${result.stats.total}
- Critical: ${result.stats.critical}
- High: ${result.stats.high}
- Medium: ${result.stats.medium}
- Low: ${result.stats.low}

## Secrets Found:

${filteredFindings
  .map((finding, index) => {
    const { fileName, relativePath } = formatFilePath(finding.file);
    const commitSha = formatCommitSha(finding.commit);

    return `### ${index + 1}. ${finding.description}

**Severity:** ${finding.severity}
**Secret Type:** ${finding.ruleId}
**File:** \`${relativePath ? relativePath + '/' : ''}${fileName}:${finding.startLine}\`
**Redacted Secret:** \`${ensureRedacted(finding.secret)}\`
**Commit:** ${commitSha}${finding.author !== 'unknown' ? ` by ${finding.author}` : ''}

`;
  })
  .join('\n')}

Please help me:
1. Assess the security risk of these exposed secrets
2. Steps to rotate/revoke these secrets immediately
3. How to prevent future commits with secrets
4. Whether I need to clean git history or invalidate these secrets`;

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
              <div className="i-ph:lock-key text-2xl text-accent-500" />
              Secrets Scan Results
            </DialogTitle>
            <DialogDescription>
              Scanned {result.scannedFiles || 0} {result.scannedFiles === 1 ? 'file' : 'files'} in{' '}
              {(result.scanDuration / 1000).toFixed(2)}s
            </DialogDescription>
          </div>

          {/* Error State */}
          {!result.success && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-2xl">
                <div className="i-ph:warning-circle text-6xl text-red-500 mb-4 mx-auto" />
                <p className="text-lg font-medium text-bolt-elements-textPrimary mb-2">Scan Failed</p>
                <p className="text-sm text-bolt-elements-textSecondary mb-4 whitespace-pre-line">{result.error}</p>
              </div>
            </div>
          )}

          {/* Success State */}
          {result.success && (
            <>
              {/* Stats Grid */}
              <div className="p-6 pb-4">
                <div className="grid grid-cols-5 gap-3">
                  <div className="bg-bolt-elements-background-depth-1 rounded-lg p-3 border border-bolt-elements-borderColor">
                    <div className="text-xs text-bolt-elements-textTertiary mb-1">Total</div>
                    <div className="text-2xl font-bold text-bolt-elements-textPrimary">{result.stats.total}</div>
                  </div>
                  <div
                    className={classNames(
                      'rounded-lg p-3 border',
                      result.stats.critical > 0
                        ? 'bg-red-600/10 border-red-600/30'
                        : 'bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor',
                    )}
                  >
                    <div className="text-xs text-bolt-elements-textTertiary mb-1">Critical</div>
                    <div
                      className={classNames(
                        'text-2xl font-bold',
                        result.stats.critical > 0 ? 'text-red-600' : 'text-bolt-elements-textPrimary',
                      )}
                    >
                      {result.stats.critical}
                    </div>
                  </div>
                  <div
                    className={classNames(
                      'rounded-lg p-3 border',
                      result.stats.high > 0
                        ? 'bg-red-500/10 border-red-500/30'
                        : 'bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor',
                    )}
                  >
                    <div className="text-xs text-bolt-elements-textTertiary mb-1">High</div>
                    <div
                      className={classNames(
                        'text-2xl font-bold',
                        result.stats.high > 0 ? 'text-red-500' : 'text-bolt-elements-textPrimary',
                      )}
                    >
                      {result.stats.high}
                    </div>
                  </div>
                  <div
                    className={classNames(
                      'rounded-lg p-3 border',
                      result.stats.medium > 0
                        ? 'bg-yellow-500/10 border-yellow-500/30'
                        : 'bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor',
                    )}
                  >
                    <div className="text-xs text-bolt-elements-textTertiary mb-1">Medium</div>
                    <div
                      className={classNames(
                        'text-2xl font-bold',
                        result.stats.medium > 0 ? 'text-yellow-500' : 'text-bolt-elements-textPrimary',
                      )}
                    >
                      {result.stats.medium}
                    </div>
                  </div>
                  <div
                    className={classNames(
                      'rounded-lg p-3 border',
                      result.stats.low > 0
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor',
                    )}
                  >
                    <div className="text-xs text-bolt-elements-textTertiary mb-1">Low</div>
                    <div
                      className={classNames(
                        'text-2xl font-bold',
                        result.stats.low > 0 ? 'text-blue-500' : 'text-bolt-elements-textPrimary',
                      )}
                    >
                      {result.stats.low}
                    </div>
                  </div>
                </div>

                {/* Filter Tabs */}
                {result.findings.length > 0 && (
                  <div className="flex gap-2 mt-4">
                    {(['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as SeverityFilter[]).map((filter) => (
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
                {filteredFindings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-8">
                    <div className="i-ph:lock-key text-6xl text-green-500 mb-4" />
                    <p className="text-lg font-medium text-bolt-elements-textPrimary mb-2">
                      {severityFilter === 'all' ? 'No Secrets Found!' : `No ${severityFilter} Secrets`}
                    </p>
                    <p className="text-sm text-bolt-elements-textSecondary">
                      {severityFilter === 'all'
                        ? 'Your code appears clean of hardcoded secrets.'
                        : `Try selecting a different severity filter.`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredFindings.map((finding, index) => {
                      const { fileName, relativePath } = formatFilePath(finding.file);
                      const isExpanded = selectedFinding === index;
                      const redactedSecret = ensureRedacted(finding.secret);
                      const commitSha = formatCommitSha(finding.commit);

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
                                      {finding.description}
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
                                  <p className="text-xs text-bolt-elements-textSecondary mt-1 font-mono break-all">
                                    {redactedSecret}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-4 text-xs text-bolt-elements-textTertiary flex-wrap">
                                <span className="flex items-center gap-1.5 min-w-0 max-w-full" title={finding.file}>
                                  <div className="i-ph:file-text flex-shrink-0" />
                                  <span className="break-words overflow-wrap-anywhere">
                                    {relativePath && <span className="opacity-60">{relativePath}/</span>}
                                    <span className="font-medium">{fileName}</span>
                                    <span className="opacity-60">:{finding.startLine}</span>
                                  </span>
                                </span>
                                <span className="flex items-center gap-1 flex-shrink-0">
                                  <div className="i-ph:git-commit" />
                                  {commitSha}
                                </span>
                              </div>

                              {isExpanded && (
                                <div className="mt-3 space-y-3 border-t border-bolt-elements-borderColor pt-3 overflow-hidden">
                                  <div className="text-xs overflow-hidden">
                                    <span className="font-medium text-bolt-elements-textPrimary">Rule ID: </span>
                                    <span className="text-bolt-elements-textSecondary break-words overflow-wrap-anywhere">
                                      {finding.ruleId}
                                    </span>
                                  </div>
                                  {finding.author && finding.author !== 'unknown' && (
                                    <div className="text-xs overflow-hidden">
                                      <span className="font-medium text-bolt-elements-textPrimary">Author: </span>
                                      <span className="text-bolt-elements-textSecondary break-words overflow-wrap-anywhere">
                                        {finding.author}
                                        {finding.email && ` <${finding.email}>`}
                                      </span>
                                    </div>
                                  )}
                                  {finding.date && (
                                    <div className="text-xs overflow-hidden">
                                      <span className="font-medium text-bolt-elements-textPrimary">Date: </span>
                                      <span className="text-bolt-elements-textSecondary">
                                        {formatDate(finding.date)}
                                      </span>
                                    </div>
                                  )}
                                  {finding.message && (
                                    <div className="text-xs overflow-hidden">
                                      <span className="font-medium text-bolt-elements-textPrimary">
                                        Commit Message:{' '}
                                      </span>
                                      <span className="text-bolt-elements-textSecondary break-words overflow-wrap-anywhere">
                                        {finding.message}
                                      </span>
                                    </div>
                                  )}
                                  <div className="bg-red-500/10 border border-red-500/30 rounded p-3 overflow-hidden">
                                    <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1.5 flex items-center gap-1.5">
                                      <div className="i-ph:warning-fill flex-shrink-0" />
                                      Remediation Required
                                    </div>
                                    <p className="text-xs text-bolt-elements-textSecondary break-words overflow-wrap-anywhere">
                                      1. Immediately rotate/revoke this secret in the service provider
                                      <br />
                                      2. Remove the secret from code and use environment variables
                                      <br />
                                      3. Update any systems using this secret
                                      <br />
                                      4. Consider using a secrets management tool (AWS Secrets Manager, HashiCorp Vault,
                                      etc.)
                                      {finding.commit !== 'uncommitted' && (
                                        <>
                                          <br />
                                          5. This secret is in git history - consider cleaning history or treating it as
                                          compromised
                                        </>
                                      )}
                                    </p>
                                  </div>
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
              {result.success && filteredFindings.length > 0 && (
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

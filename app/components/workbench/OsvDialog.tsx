import { memo, useState, useMemo } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Dialog, DialogTitle, DialogDescription, DialogButton } from '~/components/ui/Dialog';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import type { OsvScanResult } from '~/types/osv';

interface OsvDialogProps {
  isOpen: boolean;
  onClose: () => void;
  result: OsvScanResult | null;
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
      return 'i-ph:warning-octagon-fill';
    case 'HIGH':
      return 'i-ph:warning-circle-fill';
    case 'MEDIUM':
      return 'i-ph:warning-fill';
    case 'LOW':
      return 'i-ph:info-fill';
    default:
      return 'i-ph:circle-fill';
  }
};

export const OsvDialog = memo(({ isOpen, onClose, result, onInsertIntoPrompt }: OsvDialogProps) => {
  const [selectedVuln, setSelectedVuln] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [ecosystemFilter, setEcosystemFilter] = useState<string>('all');

  // Get unique ecosystems from vulnerabilities
  const ecosystems = useMemo(() => {
    if (!result?.vulnerabilities) {
      return [];
    }

    const uniqueEcosystems = new Set(result.vulnerabilities.map((v) => v.ecosystem));

    return Array.from(uniqueEcosystems).sort();
  }, [result]);

  // Filter vulnerabilities by severity and ecosystem
  const filteredVulnerabilities = useMemo(() => {
    if (!result) {
      return [];
    }

    let filtered = result.vulnerabilities;

    if (severityFilter !== 'all') {
      filtered = filtered.filter((v) => v.severity === severityFilter);
    }

    if (ecosystemFilter !== 'all') {
      filtered = filtered.filter((v) => v.ecosystem === ecosystemFilter);
    }

    return filtered;
  }, [result, severityFilter, ecosystemFilter]);

  const handleDownloadPDF = async () => {
    if (!result) {
      return;
    }

    toast.info('PDF export for OSV scans coming soon!', { autoClose: 3000 });
  };

  const handleInsertIntoPrompt = () => {
    if (!result || !onInsertIntoPrompt) {
      return;
    }

    const markdown = `I just ran a dependency vulnerability scan and found ${result.stats.total} ${result.stats.total === 1 ? 'vulnerability' : 'vulnerabilities'}. Please help me fix ${result.stats.total === 1 ? 'this security issue' : 'these security issues'}:

# 🔒 Dependency Vulnerability Scan Results

**Summary:**
- Total Vulnerabilities: ${result.stats.total}
- Critical: ${result.stats.critical}
- High: ${result.stats.high}
- Medium: ${result.stats.medium}
- Low: ${result.stats.low}
- Scanned Packages: ${result.scannedPackages}
- Scanned Files: ${result.scannedFiles}

## Vulnerabilities Found:

${filteredVulnerabilities
  .map((vuln, index) => {
    const fixVersionsText = vuln.fixedVersions.length > 0 ? `\n**Fixed in:** ${vuln.fixedVersions.join(', ')}` : '';

    const cvssText = vuln.cvssScore ? `\n**CVSS Score:** ${vuln.cvssScore.toFixed(1)}` : '';

    const aliasesText = vuln.aliases.length > 0 ? `\n**Aliases:** ${vuln.aliases.join(', ')}` : '';

    return `### ${index + 1}. ${vuln.id}

**Package:** \`${vuln.packageName}@${vuln.version}\` (${vuln.ecosystem})
**Severity:** ${vuln.severity}${cvssText}
**File:** \`${vuln.manifestFile}\`
**Summary:** ${vuln.summary}${fixVersionsText}${aliasesText}

**References:**
${vuln.references.map((ref) => `- [${ref.type}](${ref.url})`).join('\n')}
`;
  })
  .join('\n')}

Please review each vulnerability and help me update the dependencies to secure versions.`;

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
              <div className="i-ph:package text-2xl text-cyan-500" />
              Dependency Vulnerability Scan Results
            </DialogTitle>
            <DialogDescription>
              Scanned {result.scannedPackages} {result.scannedPackages === 1 ? 'package' : 'packages'} from{' '}
              {result.scannedFiles} {result.scannedFiles === 1 ? 'file' : 'files'} in{' '}
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
                {result.vulnerabilities.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {/* Severity Filter */}
                    <div className="flex gap-2">
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
                          {filter === 'all' ? 'All Severities' : filter}
                          {filter !== 'all' && (
                            <span className="ml-1">
                              ({result.vulnerabilities.filter((v) => v.severity === filter).length})
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Ecosystem Filter */}
                    {ecosystems.length > 1 && (
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setEcosystemFilter('all')}
                          className={classNames(
                            'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                            ecosystemFilter === 'all'
                              ? 'bg-cyan-500 text-white'
                              : 'bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2',
                          )}
                        >
                          All Ecosystems
                        </button>
                        {ecosystems.map((ecosystem) => (
                          <button
                            key={ecosystem}
                            onClick={() => setEcosystemFilter(ecosystem)}
                            className={classNames(
                              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                              ecosystemFilter === ecosystem
                                ? 'bg-cyan-500 text-white'
                                : 'bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2',
                            )}
                          >
                            {ecosystem}
                            <span className="ml-1">
                              ({result.vulnerabilities.filter((v) => v.ecosystem === ecosystem).length})
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Vulnerabilities List */}
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 pb-6 modern-scrollbar">
                {filteredVulnerabilities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-8">
                    <div className="i-ph:shield-check text-6xl text-green-500 mb-4" />
                    <p className="text-lg font-medium text-bolt-elements-textPrimary mb-2">
                      {result.vulnerabilities.length === 0
                        ? 'No Vulnerabilities Found!'
                        : `No ${severityFilter !== 'all' ? severityFilter : ecosystemFilter} Vulnerabilities`}
                    </p>
                    <p className="text-sm text-bolt-elements-textSecondary">
                      {result.vulnerabilities.length === 0
                        ? 'All your dependencies are secure.'
                        : 'Try selecting a different filter.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredVulnerabilities.map((vuln, index) => {
                      const isExpanded = selectedVuln === index;

                      return (
                        <div
                          key={`${vuln.id}-${index}`}
                          className={classNames(
                            'border rounded-lg p-4 transition-all cursor-pointer overflow-hidden',
                            isExpanded
                              ? 'bg-bolt-elements-item-backgroundAccent border-accent-500'
                              : 'bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor hover:bg-bolt-elements-background-depth-2',
                          )}
                          onClick={() => setSelectedVuln(isExpanded ? null : index)}
                        >
                          <div className="flex items-start gap-3 overflow-hidden">
                            <div
                              className={classNames(
                                'text-xl mt-0.5 flex-shrink-0',
                                getSeverityIcon(vuln.severity),
                                getSeverityColor(vuln.severity),
                              )}
                            />
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div className="flex-1 min-w-0 overflow-hidden">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <a
                                      href={`https://osv.dev/vulnerability/${vuln.id}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-medium text-bolt-elements-textPrimary text-sm hover:text-accent-500 transition-colors"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {vuln.id}
                                    </a>
                                    <span
                                      className={classNames(
                                        'text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0',
                                        getSeverityBgColor(vuln.severity),
                                        getSeverityColor(vuln.severity),
                                      )}
                                    >
                                      {vuln.severity}
                                    </span>
                                    {vuln.cvssScore && (
                                      <span className="text-xs px-2 py-0.5 rounded-full border bg-purple-500/10 border-purple-500/30 text-purple-500 font-medium">
                                        CVSS {vuln.cvssScore.toFixed(1)}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-bolt-elements-textSecondary mt-1 break-words overflow-wrap-anywhere">
                                    {vuln.summary}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-4 text-xs text-bolt-elements-textTertiary flex-wrap">
                                <span className="flex items-center gap-1.5">
                                  <div className="i-ph:package flex-shrink-0" />
                                  <span className="font-mono">
                                    {vuln.packageName}@{vuln.version}
                                  </span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <div className="i-ph:cube flex-shrink-0" />
                                  {vuln.ecosystem}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <div className="i-ph:file-text flex-shrink-0" />
                                  {vuln.manifestFile}
                                </span>
                              </div>

                              {isExpanded && (
                                <div className="mt-3 space-y-3 border-t border-bolt-elements-borderColor pt-3 overflow-hidden">
                                  {vuln.fixedVersions.length > 0 && (
                                    <div className="bg-green-500/10 border border-green-500/30 rounded p-3 overflow-hidden">
                                      <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-1.5 flex items-center gap-1.5">
                                        <div className="i-ph:check-circle flex-shrink-0" />
                                        Fixed Versions Available
                                      </div>
                                      <p className="text-xs text-bolt-elements-textSecondary">
                                        Upgrade to: {vuln.fixedVersions.join(', ')}
                                      </p>
                                    </div>
                                  )}

                                  {vuln.details && (
                                    <div className="bg-bolt-elements-background-depth-2 rounded p-3 overflow-hidden">
                                      <div className="text-xs font-medium text-bolt-elements-textPrimary mb-2">
                                        Details:
                                      </div>
                                      <p className="text-xs text-bolt-elements-textSecondary whitespace-pre-wrap break-words overflow-wrap-anywhere">
                                        {vuln.details}
                                      </p>
                                    </div>
                                  )}

                                  {vuln.aliases.length > 0 && (
                                    <div className="text-xs overflow-hidden">
                                      <span className="font-medium text-bolt-elements-textPrimary">Aliases: </span>
                                      <span className="text-bolt-elements-textSecondary">
                                        {vuln.aliases.join(', ')}
                                      </span>
                                    </div>
                                  )}

                                  {vuln.references.length > 0 && (
                                    <div className="overflow-hidden">
                                      <div className="text-xs font-medium text-bolt-elements-textPrimary mb-2">
                                        References:
                                      </div>
                                      <div className="space-y-1">
                                        {vuln.references.slice(0, 5).map((ref, refIndex) => (
                                          <a
                                            key={refIndex}
                                            href={ref.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block text-xs text-accent-500 hover:underline break-words overflow-wrap-anywhere"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            [{ref.type}] {ref.url}
                                          </a>
                                        ))}
                                        {vuln.references.length > 5 && (
                                          <p className="text-xs text-bolt-elements-textTertiary">
                                            +{vuln.references.length - 5} more references
                                          </p>
                                        )}
                                      </div>
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
              {result.success && filteredVulnerabilities.length > 0 && (
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

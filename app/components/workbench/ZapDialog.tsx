import { memo, useState } from 'react';
import { toast } from 'react-toastify';

interface ZapAlert {
  id: string;
  name: string;
  riskdesc: string;
  risk: 'High' | 'Medium' | 'Low' | 'Informational';
  confidence: string;
  desc: string;
  solution: string;
  reference: string;
  cweid: string;
  wascid: string;
  instances: Array<{
    uri: string;
    method: string;
    param: string;
    attack: string;
    evidence: string;
  }>;
}

interface ZapScanResult {
  success: boolean;
  alerts: ZapAlert[];
  stats: {
    total: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  scanDuration: number;
  targetUrl: string;
  error?: string;
}

interface ZapDialogProps {
  isOpen: boolean;
  onClose: () => void;
  result: ZapScanResult | null;
  onInsertIntoPrompt?: (text: string) => void;
}

type SeverityFilter = 'all' | 'high' | 'medium' | 'low' | 'info';

export const ZapDialog = memo(({ isOpen, onClose, result, onInsertIntoPrompt }: ZapDialogProps) => {
  const [selectedAlert, setSelectedAlert] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  if (!isOpen || !result) {
    return null;
  }

  const filteredAlerts = result.alerts.filter((alert) => {
    if (severityFilter === 'all') {
      return true;
    }

    if (severityFilter === 'high') {
      return alert.risk === 'High';
    }

    if (severityFilter === 'medium') {
      return alert.risk === 'Medium';
    }

    if (severityFilter === 'low') {
      return alert.risk === 'Low';
    }

    if (severityFilter === 'info') {
      return alert.risk === 'Informational';
    }

    return true;
  });

  const handleDownloadPDF = async () => {
    if (!result) {
      return;
    }

    try {
      toast.info('Generating PDF report...', { autoClose: 2000 });

      const response = await fetch('/api/dast-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          alerts: result.alerts,
          stats: result.stats,
          targetUrl: result.targetUrl,
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
      link.download = `dast-report-${new Date().toISOString().split('T')[0]}.pdf`;
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

    let markdown = `I just ran a DAST scan on ${result.targetUrl} and found ${result.stats.total} security alert(s):\n\n`;
    markdown += `# 🛡️ DAST Scan Results\n\n`;
    markdown += `**Summary:**\n`;
    markdown += `- Total Alerts: ${result.stats.total}\n`;
    markdown += `- High Risk: ${result.stats.high}\n`;
    markdown += `- Medium Risk: ${result.stats.medium}\n`;
    markdown += `- Low Risk: ${result.stats.low}\n`;
    markdown += `- Info: ${result.stats.info}\n`;
    markdown += `- Scan Duration: ${Math.round(result.scanDuration / 1000)}s\n\n`;

    if (result.stats.high > 0) {
      markdown += `## High Risk Alerts:\n\n`;

      const highAlerts = result.alerts.filter((a) => a.risk === 'High');

      for (let i = 0; i < Math.min(highAlerts.length, 5); i++) {
        const alert = highAlerts[i];
        markdown += `### ${i + 1}. ${alert.name}\n`;
        markdown += `**Risk:** ${alert.risk} (${alert.confidence})\n`;
        markdown += `**Description:** ${alert.desc.slice(0, 200)}...\n`;
        markdown += `**Solution:** ${alert.solution.slice(0, 200)}...\n`;

        if (alert.cweid) {
          markdown += `**CWE:** ${alert.cweid}\n`;
        }

        if (alert.instances.length > 0) {
          markdown += `**Affected URL:** ${alert.instances[0].uri}\n`;
        }

        markdown += `\n`;
      }
    }

    if (result.stats.medium > 0) {
      markdown += `## Medium Risk Alerts:\n\n`;

      const mediumAlerts = result.alerts.filter((a) => a.risk === 'Medium');

      for (let i = 0; i < Math.min(mediumAlerts.length, 5); i++) {
        const alert = mediumAlerts[i];
        markdown += `### ${i + 1}. ${alert.name}\n`;
        markdown += `**Risk:** ${alert.risk} (${alert.confidence})\n`;
        markdown += `**Description:** ${alert.desc.slice(0, 200)}...\n`;
        markdown += `**Solution:** ${alert.solution.slice(0, 200)}...\n`;

        if (alert.instances.length > 0) {
          markdown += `**Affected URL:** ${alert.instances[0].uri}\n`;
        }

        markdown += `\n`;
      }
    }

    markdown += `\nPlease help me fix these security issues.`;

    onInsertIntoPrompt(markdown);
    toast.success('Results inserted into chat');
    onClose();
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'High':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'Medium':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'Low':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'Informational':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  const getRiskBadge = (risk: string) => {
    const colorClass = getRiskColor(risk);

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium border ${colorClass}`}>
        {risk === 'Informational' ? 'Info' : risk}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bolt-elements-background-depth-2 rounded-lg shadow-xl w-[90vw] max-w-5xl max-h-[90vh] flex flex-col border border-bolt-elements-borderColor">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-bolt-elements-borderColor">
          <div className="flex items-center gap-3">
            <div className="i-ph:shield-warning text-2xl text-bolt-elements-textPrimary" />
            <div>
              <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">DAST Scan Results</h2>
              <p className="text-sm text-bolt-elements-textSecondary mt-1">
                Target: {result.targetUrl} • Duration: {Math.round(result.scanDuration / 1000)}s
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
          >
            <div className="i-ph:x text-xl" />
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-5 gap-4 px-6 py-4 border-b border-bolt-elements-borderColor">
          <div className="text-center">
            <div className="text-2xl font-bold text-bolt-elements-textPrimary">{result.stats.total}</div>
            <div className="text-xs text-bolt-elements-textSecondary mt-1">Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400">{result.stats.high}</div>
            <div className="text-xs text-bolt-elements-textSecondary mt-1">High</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-400">{result.stats.medium}</div>
            <div className="text-xs text-bolt-elements-textSecondary mt-1">Medium</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-400">{result.stats.low}</div>
            <div className="text-xs text-bolt-elements-textSecondary mt-1">Low</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">{result.stats.info}</div>
            <div className="text-xs text-bolt-elements-textSecondary mt-1">Info</div>
          </div>
        </div>

        {/* Severity Filter */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
          <span className="text-sm text-bolt-elements-textSecondary">Filter:</span>
          <button
            onClick={() => setSeverityFilter('all')}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              severityFilter === 'all'
                ? 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text'
                : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
            }`}
          >
            All ({result.stats.total})
          </button>
          <button
            onClick={() => setSeverityFilter('high')}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              severityFilter === 'high'
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
            }`}
          >
            High ({result.stats.high})
          </button>
          <button
            onClick={() => setSeverityFilter('medium')}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              severityFilter === 'medium'
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
            }`}
          >
            Medium ({result.stats.medium})
          </button>
          <button
            onClick={() => setSeverityFilter('low')}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              severityFilter === 'low'
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
            }`}
          >
            Low ({result.stats.low})
          </button>
          <button
            onClick={() => setSeverityFilter('info')}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              severityFilter === 'info'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
            }`}
          >
            Info ({result.stats.info})
          </button>
        </div>

        {/* Alerts List */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 pb-6 modern-scrollbar">
          {filteredAlerts.length === 0 ? (
            <div className="text-center py-12 text-bolt-elements-textSecondary">
              <div className="i-ph:shield-check text-4xl mx-auto mb-3 text-green-400" />
              <p>No alerts found with selected filter</p>
            </div>
          ) : (
            <div className="space-y-3 pt-4">
              {filteredAlerts.map((alert, index) => (
                <div
                  key={`${alert.id}-${index}`}
                  className="border border-bolt-elements-borderColor rounded-lg p-4 bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-2 transition-colors overflow-hidden"
                >
                  <div
                    className="flex items-start justify-between cursor-pointer"
                    onClick={() => setSelectedAlert(selectedAlert === index ? null : index)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {getRiskBadge(alert.risk)}
                        <span className="text-xs text-bolt-elements-textSecondary">Confidence: {alert.confidence}</span>
                        {alert.cweid && (
                          <span className="text-xs text-bolt-elements-textSecondary">CWE-{alert.cweid}</span>
                        )}
                      </div>
                      <h3 className="font-semibold text-bolt-elements-textPrimary break-words">{alert.name}</h3>
                      <p className="text-sm text-bolt-elements-textSecondary mt-1 break-words">
                        {alert.instances.length} instance(s) found
                      </p>
                    </div>
                    <div
                      className={`i-ph:caret-down text-xl text-bolt-elements-textSecondary transition-transform ${
                        selectedAlert === index ? 'rotate-180' : ''
                      }`}
                    />
                  </div>

                  {selectedAlert === index && (
                    <div className="mt-4 space-y-4 border-t border-bolt-elements-borderColor pt-4">
                      <div>
                        <h4 className="text-sm font-semibold text-bolt-elements-textPrimary mb-2">Description</h4>
                        <p className="text-sm text-bolt-elements-textSecondary break-words overflow-wrap-anywhere">
                          {alert.desc}
                        </p>
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold text-bolt-elements-textPrimary mb-2">Solution</h4>
                        <p className="text-sm text-bolt-elements-textSecondary break-words overflow-wrap-anywhere">
                          {alert.solution}
                        </p>
                      </div>

                      {alert.reference && (
                        <div>
                          <h4 className="text-sm font-semibold text-bolt-elements-textPrimary mb-2">Reference</h4>
                          <p className="text-sm text-bolt-elements-textSecondary break-words overflow-wrap-anywhere">
                            {alert.reference}
                          </p>
                        </div>
                      )}

                      {alert.instances.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-bolt-elements-textPrimary mb-2">
                            Affected URLs ({alert.instances.length})
                          </h4>
                          <div className="space-y-2 max-h-48 overflow-y-auto modern-scrollbar">
                            {alert.instances.slice(0, 10).map((instance, idx) => (
                              <div
                                key={idx}
                                className="text-sm bg-bolt-elements-background-depth-2 rounded p-2 border border-bolt-elements-borderColor"
                              >
                                <div className="flex items-start gap-2">
                                  <span className="text-bolt-elements-textSecondary font-mono text-xs">
                                    {instance.method}
                                  </span>
                                  <span className="text-bolt-elements-textPrimary break-all flex-1">
                                    {instance.uri}
                                  </span>
                                </div>
                                {instance.param && (
                                  <div className="text-xs text-bolt-elements-textSecondary mt-1">
                                    Parameter: {instance.param}
                                  </div>
                                )}
                                {instance.evidence && (
                                  <div className="text-xs text-bolt-elements-textSecondary mt-1 font-mono bg-bolt-elements-background-depth-1 p-1 rounded break-all">
                                    {instance.evidence.slice(0, 200)}
                                    {instance.evidence.length > 200 ? '...' : ''}
                                  </div>
                                )}
                              </div>
                            ))}
                            {alert.instances.length > 10 && (
                              <div className="text-xs text-bolt-elements-textSecondary text-center py-2">
                                ... and {alert.instances.length - 10} more instances
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
          <button
            onClick={handleDownloadPDF}
            className="px-4 py-2 rounded bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 transition-colors text-sm font-medium"
          >
            <span className="flex items-center gap-2">
              <span className="i-ph:file-pdf" />
              Download PDF
            </span>
          </button>
          {onInsertIntoPrompt && (
            <button
              onClick={handleInsertIntoPrompt}
              className="px-4 py-2 rounded bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover transition-colors text-sm font-medium"
            >
              Insert into Chat
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 transition-colors text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
});

ZapDialog.displayName = 'ZapDialog';

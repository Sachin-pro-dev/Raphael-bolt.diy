import PDFDocument from 'pdfkit';

interface SemgrepFinding {
  check_id: string;
  path: string;
  start: { line: number; col: number };
  end: { line: number; col: number };
  extra: {
    message: string;
    severity: string;
    metadata?: {
      cwe?: string[];
      owasp?: string[];
      references?: string[];
    };
  };
}

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

// Helper function to get color for severity (hex format)
function getSeverityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'high':
    case 'error':
      return '#dc3545'; // Red
    case 'medium':
    case 'warning':
      return '#ffc107'; // Orange
    case 'low':
    case 'info':
      return '#0dcaf0'; // Blue
    default:
      return '#6c757d'; // Gray
  }
}

// Generate SAST (Semgrep) PDF Report
export async function generateSastPdf(
  findings: SemgrepFinding[],
  stats: { total: number; error: number; warning: number; info: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks as any)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).fillColor('#2c3e50').text('SAST Security Scan Report', { align: 'center' }).moveDown(0.5);

      doc
        .fontSize(12)
        .fillColor('#7f8c8d')
        .text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' })
        .moveDown(2);

      // Executive Summary Box
      doc.rect(50, doc.y, 495, 120).fillAndStroke('#f8f9fa', '#dee2e6');

      const summaryY = doc.y + 15;
      doc.fontSize(16).fillColor('#2c3e50').text('Executive Summary', 60, summaryY).moveDown(1);

      // Stats Grid
      const statsY = doc.y;
      const colWidth = 120;

      // Total
      doc
        .fontSize(10)
        .fillColor('#6c757d')
        .text('TOTAL FINDINGS', 70, statsY)
        .fontSize(24)
        .fillColor('#2c3e50')
        .text(stats.total.toString(), 70, statsY + 15);

      // High/Error
      doc
        .fontSize(10)
        .fillColor('#6c757d')
        .text('HIGH SEVERITY', 70 + colWidth, statsY)
        .fontSize(24)
        .fillColor(getSeverityColor('high'))
        .text(stats.error.toString(), 70 + colWidth, statsY + 15);

      // Medium/Warning
      doc
        .fontSize(10)
        .fillColor('#6c757d')
        .text('MEDIUM SEVERITY', 70 + colWidth * 2, statsY)
        .fontSize(24)
        .fillColor(getSeverityColor('medium'))
        .text(stats.warning.toString(), 70 + colWidth * 2, statsY + 15);

      // Low/Info
      doc
        .fontSize(10)
        .fillColor('#6c757d')
        .text('LOW SEVERITY', 70 + colWidth * 3, statsY)
        .fontSize(24)
        .fillColor(getSeverityColor('low'))
        .text(stats.info.toString(), 70 + colWidth * 3, statsY + 15);

      doc.y = summaryY + 105;
      doc.moveDown(2);

      // Findings Section
      doc.fontSize(18).fillColor('#2c3e50').text('Security Findings', 50).moveDown(1);

      if (findings.length === 0) {
        doc
          .fontSize(12)
          .fillColor('#28a745')
          .text('✓ No security issues found! Your code looks secure.', { align: 'center' })
          .moveDown(2);
      } else {
        // Group findings by severity
        const highFindings = findings.filter((f) => f.extra.severity === 'ERROR');
        const mediumFindings = findings.filter((f) => f.extra.severity === 'WARNING');
        const lowFindings = findings.filter((f) => f.extra.severity === 'INFO');

        const sections = [
          { title: 'High Severity Issues', findings: highFindings, color: '#dc3545' },
          { title: 'Medium Severity Issues', findings: mediumFindings, color: '#ffc107' },
          { title: 'Low Severity Issues', findings: lowFindings, color: '#17a2b8' },
        ];

        for (const section of sections) {
          if (section.findings.length === 0) {
            continue;
          }

          doc.addPage();
          doc.fontSize(16).fillColor(section.color).text(section.title, 50).moveDown(1);

          for (let i = 0; i < section.findings.length; i++) {
            const finding = section.findings[i];

            // Check if we need a new page
            if (doc.y > 700) {
              doc.addPage();
            }

            // Finding box
            const boxY = doc.y;
            const boxHeight = 150;

            doc.rect(50, boxY, 495, boxHeight).fillAndStroke('#ffffff', '#dee2e6');

            // Finding number and severity badge
            doc
              .fontSize(10)
              .fillColor(section.color)
              .text(`#${i + 1} | ${finding.extra.severity}`, 60, boxY + 10);

            // Check ID (rule name)
            doc
              .fontSize(12)
              .fillColor('#2c3e50')
              .font('Helvetica-Bold')
              .text(finding.check_id, 60, boxY + 30, { width: 475 })
              .font('Helvetica');

            // Message
            doc
              .fontSize(10)
              .fillColor('#495057')
              .text(finding.extra.message, 60, boxY + 50, { width: 475 });

            // Location
            doc
              .fontSize(9)
              .fillColor('#6c757d')
              .text(`File: ${finding.path}`, 60, boxY + 90)
              .text(`Line: ${finding.start.line}`, 60, boxY + 105);

            // CWE if available
            if (finding.extra.metadata?.cwe && finding.extra.metadata.cwe.length > 0) {
              doc.text(`CWE: ${finding.extra.metadata.cwe.join(', ')}`, 60, boxY + 120);
            }

            doc.y = boxY + boxHeight + 15;
          }
        }
      }

      // Footer on last page
      doc.addPage();
      doc
        .fontSize(14)
        .fillColor('#2c3e50')
        .text('Recommendations', 50)
        .moveDown(1)
        .fontSize(10)
        .fillColor('#495057')
        .text('• Review and fix all HIGH severity issues immediately', 60)
        .text('• Address MEDIUM severity issues before production deployment', 60)
        .text('• Consider fixing LOW severity issues for best practices', 60)
        .text('• Re-run the scan after fixing issues to verify', 60)
        .moveDown(2);

      doc
        .fontSize(9)
        .fillColor('#6c757d')
        .text('Generated by OWASP SAST Scanner', 50, 750, { align: 'center' })
        .text('Powered by Semgrep', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// Generate DAST (ZAP) PDF Report
export async function generateDastPdf(
  alerts: ZapAlert[],
  stats: { total: number; high: number; medium: number; low: number; info: number },
  targetUrl: string,
  scanDuration: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks as any)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).fillColor('#2c3e50').text('DAST Security Scan Report', { align: 'center' }).moveDown(0.5);

      doc
        .fontSize(12)
        .fillColor('#7f8c8d')
        .text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' })
        .fontSize(10)
        .text(`Target: ${targetUrl}`, { align: 'center' })
        .text(`Scan Duration: ${Math.round(scanDuration / 1000)}s`, { align: 'center' })
        .moveDown(2);

      // Executive Summary Box
      doc.rect(50, doc.y, 495, 120).fillAndStroke('#f8f9fa', '#dee2e6');

      const summaryY = doc.y + 15;
      doc.fontSize(16).fillColor('#2c3e50').text('Executive Summary', 60, summaryY).moveDown(1);

      // Stats Grid
      const statsY = doc.y;
      const colWidth = 95;

      // Total
      doc
        .fontSize(10)
        .fillColor('#6c757d')
        .text('TOTAL', 70, statsY)
        .fontSize(24)
        .fillColor('#2c3e50')
        .text(stats.total.toString(), 70, statsY + 15);

      // High
      doc
        .fontSize(10)
        .fillColor('#6c757d')
        .text('HIGH', 70 + colWidth, statsY)
        .fontSize(24)
        .fillColor(getSeverityColor('high'))
        .text(stats.high.toString(), 70 + colWidth, statsY + 15);

      // Medium
      doc
        .fontSize(10)
        .fillColor('#6c757d')
        .text('MEDIUM', 70 + colWidth * 2, statsY)
        .fontSize(24)
        .fillColor(getSeverityColor('medium'))
        .text(stats.medium.toString(), 70 + colWidth * 2, statsY + 15);

      // Low
      doc
        .fontSize(10)
        .fillColor('#6c757d')
        .text('LOW', 70 + colWidth * 3, statsY)
        .fontSize(24)
        .fillColor(getSeverityColor('low'))
        .text(stats.low.toString(), 70 + colWidth * 3, statsY + 15);

      // Info
      doc
        .fontSize(10)
        .fillColor('#6c757d')
        .text('INFO', 70 + colWidth * 4, statsY)
        .fontSize(24)
        .fillColor('#6c757d')
        .text(stats.info.toString(), 70 + colWidth * 4, statsY + 15);

      doc.y = summaryY + 105;
      doc.moveDown(2);

      // Security Alerts Section
      doc.fontSize(18).fillColor('#2c3e50').text('Security Alerts', 50).moveDown(1);

      if (alerts.length === 0) {
        doc
          .fontSize(12)
          .fillColor('#28a745')
          .text('✓ No security vulnerabilities found! Your application looks secure.', { align: 'center' })
          .moveDown(2);
      } else {
        // Group alerts by risk
        const highAlerts = alerts.filter((a) => a.risk === 'High');
        const mediumAlerts = alerts.filter((a) => a.risk === 'Medium');
        const lowAlerts = alerts.filter((a) => a.risk === 'Low');
        const infoAlerts = alerts.filter((a) => a.risk === 'Informational');

        const sections = [
          { title: 'High Risk Alerts', alerts: highAlerts, color: getSeverityColor('high') },
          { title: 'Medium Risk Alerts', alerts: mediumAlerts, color: getSeverityColor('medium') },
          { title: 'Low Risk Alerts', alerts: lowAlerts, color: getSeverityColor('low') },
          { title: 'Informational Alerts', alerts: infoAlerts, color: getSeverityColor('info') },
        ];

        for (const section of sections) {
          if (section.alerts.length === 0) {
            continue;
          }

          doc.addPage();
          doc.fontSize(16).fillColor(section.color).text(section.title, 50).moveDown(1);

          for (let i = 0; i < section.alerts.length; i++) {
            const alert = section.alerts[i];

            // Check if we need a new page
            if (doc.y > 600) {
              doc.addPage();
            }

            // Alert box
            const boxY = doc.y;
            const boxHeight = 200;

            doc.rect(50, boxY, 495, boxHeight).fillAndStroke('#ffffff', '#dee2e6');

            // Alert number and risk badge
            doc
              .fontSize(10)
              .fillColor(section.color)
              .text(`#${i + 1} | ${alert.risk.toUpperCase()} RISK`, 60, boxY + 10);

            // Alert name
            doc
              .fontSize(12)
              .fillColor('#2c3e50')
              .font('Helvetica-Bold')
              .text(alert.name, 60, boxY + 30, { width: 475 })
              .font('Helvetica');

            // Description
            doc
              .fontSize(9)
              .fillColor('#495057')
              .text(alert.desc.slice(0, 200) + (alert.desc.length > 200 ? '...' : ''), 60, boxY + 55, { width: 475 });

            // Solution
            doc
              .fontSize(9)
              .fillColor('#2c3e50')
              .font('Helvetica-Bold')
              .text('Solution:', 60, boxY + 100)
              .font('Helvetica')
              .fillColor('#495057')
              .text(alert.solution.slice(0, 200) + (alert.solution.length > 200 ? '...' : ''), 60, boxY + 115, {
                width: 475,
              });

            // Metadata
            doc
              .fontSize(8)
              .fillColor('#6c757d')
              .text(`Confidence: ${alert.confidence}`, 60, boxY + 160)
              .text(`Instances: ${alert.instances.length}`, 60, boxY + 175);

            if (alert.cweid) {
              doc.text(`CWE: ${alert.cweid}`, 200, boxY + 160);
            }

            doc.y = boxY + boxHeight + 15;
          }
        }
      }

      // Recommendations page
      doc.addPage();
      doc
        .fontSize(14)
        .fillColor('#2c3e50')
        .text('Recommendations', 50)
        .moveDown(1)
        .fontSize(10)
        .fillColor('#495057')
        .text('• Address all HIGH risk vulnerabilities immediately', 60)
        .text('• Fix MEDIUM risk issues before production deployment', 60)
        .text('• Review and consider fixing LOW risk findings', 60)
        .text('• Implement security headers and best practices', 60)
        .text('• Re-scan after implementing fixes', 60)
        .moveDown(2);

      doc
        .fontSize(9)
        .fillColor('#6c757d')
        .text('Generated by OWASP ZAP DAST Scanner', 50, 750, { align: 'center' })
        .text('Powered by OWASP ZAP', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

interface GitLeaksFinding {
  ruleId: string;
  description: string;
  startLine: number;
  endLine: number;
  secret: string; // Pre-redacted
  file: string;
  commit: string;
  author: string;
  email: string;
  date: string;
  message: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

// Generate GitLeaks (Secrets Scan) PDF Report
export async function generateGitleaksPdf(
  findings: GitLeaksFinding[],
  stats: { total: number; critical: number; high: number; medium: number; low: number },
  scanDuration: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks as any)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).fillColor('#2c3e50').text('Secrets Scan Report', { align: 'center' }).moveDown(0.5);

      doc
        .fontSize(12)
        .fillColor('#7f8c8d')
        .text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' })
        .fontSize(10)
        .text(`Scan Duration: ${(scanDuration / 1000).toFixed(2)}s`, { align: 'center' })
        .moveDown(2);

      // Executive Summary Box
      doc.rect(50, doc.y, 495, 120).fillAndStroke('#f8f9fa', '#dee2e6');

      const summaryY = doc.y + 15;
      doc.fontSize(16).fillColor('#2c3e50').text('Executive Summary', 60, summaryY).moveDown(1);

      // Stats Grid (5 columns for Total, Critical, High, Medium, Low)
      const statsY = doc.y;
      const colWidth = 95;

      // Total
      doc
        .fontSize(10)
        .fillColor('#6c757d')
        .text('TOTAL', 70, statsY)
        .fontSize(24)
        .fillColor('#2c3e50')
        .text(stats.total.toString(), 70, statsY + 15);

      // Critical
      doc
        .fontSize(10)
        .fillColor('#6c757d')
        .text('CRITICAL', 70 + colWidth, statsY)
        .fontSize(24)
        .fillColor('#dc2626')
        .text(stats.critical.toString(), 70 + colWidth, statsY + 15);

      // High
      doc
        .fontSize(10)
        .fillColor('#6c757d')
        .text('HIGH', 70 + colWidth * 2, statsY)
        .fontSize(24)
        .fillColor(getSeverityColor('high'))
        .text(stats.high.toString(), 70 + colWidth * 2, statsY + 15);

      // Medium
      doc
        .fontSize(10)
        .fillColor('#6c757d')
        .text('MEDIUM', 70 + colWidth * 3, statsY)
        .fontSize(24)
        .fillColor(getSeverityColor('medium'))
        .text(stats.medium.toString(), 70 + colWidth * 3, statsY + 15);

      // Low
      doc
        .fontSize(10)
        .fillColor('#6c757d')
        .text('LOW', 70 + colWidth * 4, statsY)
        .fontSize(24)
        .fillColor(getSeverityColor('low'))
        .text(stats.low.toString(), 70 + colWidth * 4, statsY + 15);

      doc.y = summaryY + 105;
      doc.moveDown(2);

      // Secrets Section
      doc.fontSize(18).fillColor('#2c3e50').text('Exposed Secrets', 50).moveDown(1);

      if (findings.length === 0) {
        doc
          .fontSize(12)
          .fillColor('#28a745')
          .text('✓ No secrets detected! Your code appears clean.', { align: 'center' })
          .moveDown(2);
      } else {
        // Group findings by severity
        const criticalFindings = findings.filter((f) => f.severity === 'CRITICAL');
        const highFindings = findings.filter((f) => f.severity === 'HIGH');
        const mediumFindings = findings.filter((f) => f.severity === 'MEDIUM');
        const lowFindings = findings.filter((f) => f.severity === 'LOW');

        const sections = [
          { title: 'Critical Severity Secrets', findings: criticalFindings, color: '#dc2626' },
          { title: 'High Severity Secrets', findings: highFindings, color: '#dc3545' },
          { title: 'Medium Severity Secrets', findings: mediumFindings, color: '#ffc107' },
          { title: 'Low Severity Secrets', findings: lowFindings, color: '#0dcaf0' },
        ];

        for (const section of sections) {
          if (section.findings.length === 0) {
            continue;
          }

          doc.addPage();
          doc.fontSize(16).fillColor(section.color).text(section.title, 50).moveDown(1);

          for (let i = 0; i < section.findings.length; i++) {
            const finding = section.findings[i];

            // Check if we need a new page
            if (doc.y > 650) {
              doc.addPage();
            }

            // Finding box
            const boxY = doc.y;
            const boxHeight = 180;

            doc.rect(50, boxY, 495, boxHeight).fillAndStroke('#ffffff', '#dee2e6');

            // Finding number and severity badge
            doc
              .fontSize(10)
              .fillColor(section.color)
              .text(`#${i + 1} | ${finding.severity}`, 60, boxY + 10);

            // Description
            doc
              .fontSize(12)
              .fillColor('#2c3e50')
              .font('Helvetica-Bold')
              .text(finding.description, 60, boxY + 30, { width: 475 })
              .font('Helvetica');

            // Redacted Secret (CRITICAL: Always redacted)
            doc
              .fontSize(9)
              .fillColor('#495057')
              .font('Courier')
              .text(`Secret: ${finding.secret}`, 60, boxY + 55, { width: 475 })
              .font('Helvetica');

            // File Location
            doc
              .fontSize(9)
              .fillColor('#6c757d')
              .text(`File: ${finding.file}`, 60, boxY + 75, { width: 475 })
              .text(
                `Line: ${finding.startLine}${finding.endLine !== finding.startLine ? `-${finding.endLine}` : ''}`,
                60,
                boxY + 90,
              );

            // Rule ID
            doc.text(`Rule: ${finding.ruleId}`, 60, boxY + 105);

            // Commit Info
            if (finding.commit && finding.commit !== 'uncommitted') {
              doc.text(`Commit: ${finding.commit.substring(0, 8)}`, 60, boxY + 120);
            } else {
              doc.text('Commit: uncommitted changes', 60, boxY + 120);
            }

            // Author
            if (finding.author && finding.author !== 'unknown') {
              doc.text(`Author: ${finding.author}`, 60, boxY + 135);
            }

            // Warning message
            doc
              .fontSize(8)
              .fillColor('#dc3545')
              .font('Helvetica-Bold')
              .text('⚠ IMMEDIATE ACTION REQUIRED: Rotate/revoke this secret!', 60, boxY + 155, { width: 475 })
              .font('Helvetica');

            doc.y = boxY + boxHeight + 15;
          }
        }
      }

      // Remediation Guide Page
      doc.addPage();
      doc
        .fontSize(14)
        .fillColor('#2c3e50')
        .text('Remediation Guide', 50)
        .moveDown(1)
        .fontSize(10)
        .fillColor('#495057')
        .text('Immediate Actions:', 60)
        .moveDown(0.5)
        .fontSize(9)
        .text('1. Rotate/Revoke ALL exposed secrets immediately in their respective services', 70, doc.y, {
          width: 470,
        })
        .text('2. Verify that old secrets are fully deactivated and no longer provide access', 70, doc.y + 5, {
          width: 470,
        })
        .text('3. Update all systems and applications using these secrets with new values', 70, doc.y + 10, {
          width: 470,
        })
        .moveDown(2);

      doc
        .fontSize(10)
        .fillColor('#495057')
        .text('Prevention Measures:', 60)
        .moveDown(0.5)
        .fontSize(9)
        .text('1. Use environment variables instead of hardcoding secrets', 70, doc.y, { width: 470 })
        .text('2. Add .env files to .gitignore immediately', 70, doc.y + 5, { width: 470 })
        .text('3. Use a secrets management tool (AWS Secrets Manager, HashiCorp Vault, etc.)', 70, doc.y + 10, {
          width: 470,
        })
        .text('4. Set up pre-commit hooks with GitLeaks to prevent future leaks', 70, doc.y + 15, { width: 470 })
        .text('5. Enable secret scanning in your repository (GitHub, GitLab, etc.)', 70, doc.y + 20, { width: 470 })
        .moveDown(2);

      doc
        .fontSize(10)
        .fillColor('#495057')
        .text('Git History Cleanup (if secrets were committed):', 60)
        .moveDown(0.5)
        .fontSize(9)
        .text('1. Consider all committed secrets as compromised - rotate them first', 70, doc.y, { width: 470 })
        .text('2. Use git filter-branch or BFG Repo-Cleaner to remove secrets from history', 70, doc.y + 5, {
          width: 470,
        })
        .text('3. Force push cleaned history (coordinate with team first!)', 70, doc.y + 10, { width: 470 })
        .text('4. All team members must re-clone the repository', 70, doc.y + 15, { width: 470 })
        .moveDown(2);

      doc
        .fontSize(10)
        .fillColor('#495057')
        .text('Resources:', 60)
        .moveDown(0.5)
        .fontSize(9)
        .fillColor('#0066cc')
        .text('• GitLeaks: https://github.com/gitleaks/gitleaks', 70)
        .text(
          '• Git History Cleanup: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository',
          70,
          doc.y + 5,
          { width: 470 },
        )
        .text('• Pre-commit Hooks: https://github.com/gitleaks/gitleaks#pre-commit', 70, doc.y + 10, { width: 470 });

      doc
        .fontSize(9)
        .fillColor('#6c757d')
        .text('Generated by GitLeaks Secret Scanner', 50, 750, { align: 'center' })
        .text('🔐 Keep Your Secrets Safe', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { DeployButton } from '~/components/deploy/DeployButton';

interface HeaderActionButtonsProps {
  chatStarted: boolean;
}

export function HeaderActionButtons({ chatStarted: _chatStarted }: HeaderActionButtonsProps) {
  const [activePreviewIndex] = useState(0);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];

  const shouldShowButtons = activePreview;

  return (
    <div className="flex items-center gap-2">
      {/* Deploy Button */}
      {shouldShowButtons && <DeployButton />}

      {/* Debug Tools */}
      {shouldShowButtons && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() =>
              window.open('https://github.com/stackblitz-labs/bolt.diy/issues/new?template=bug_report.yml', '_blank')
            }
            className="group relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 transition-all duration-300 hover:bg-cyan-500/15 hover:border-cyan-400/60 hover:shadow-[0_0_12px_rgba(0,229,255,0.2)] hover:text-cyan-300 active:scale-95"
            title="Report Bug"
          >
            <div className="i-ph:bug transition-transform duration-200 group-hover:scale-110" />
            <span>Report Bug</span>
          </button>
          <button
            onClick={async () => {
              try {
                const { downloadDebugLog } = await import('~/utils/debugLogger');
                await downloadDebugLog();
              } catch (error) {
                console.error('Failed to download debug log:', error);
              }
            }}
            className="group relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 transition-all duration-300 hover:bg-cyan-500/15 hover:border-cyan-400/60 hover:shadow-[0_0_12px_rgba(0,229,255,0.2)] hover:text-cyan-300 active:scale-95"
            title="Download Debug Log"
          >
            <div className="i-ph:download transition-transform duration-200 group-hover:scale-110" />
            <span>Debug Log</span>
          </button>
        </div>
      )}
    </div>
  );
}

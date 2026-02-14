import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

export const ExportChatButton = ({ exportChat }: { exportChat?: () => void }) => {
  return (
    <div className="flex">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="group relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 transition-all duration-300 hover:bg-cyan-500/15 hover:border-cyan-400/60 hover:shadow-[0_0_12px_rgba(0,229,255,0.2)] hover:text-cyan-300 active:scale-95">
          Export
          <span className={classNames('i-ph:caret-down transition-transform duration-200')} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          className={classNames(
            'z-[250]',
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
            className="cursor-pointer flex items-center w-auto px-4 py-2.5 text-sm text-gray-300 hover:text-cyan-300 hover:bg-cyan-500/10 gap-2 rounded-lg mx-1 transition-all duration-200 outline-none"
            onClick={() => {
              workbenchStore.downloadZip();
            }}
          >
            <div className="i-ph:code size-4.5 text-cyan-400"></div>
            <span>Download Code</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="cursor-pointer flex items-center w-full px-4 py-2.5 text-sm text-gray-300 hover:text-cyan-300 hover:bg-cyan-500/10 gap-2 rounded-lg mx-1 transition-all duration-200 outline-none"
            onClick={() => exportChat?.()}
          >
            <div className="i-ph:chat size-4.5 text-cyan-400"></div>
            <span>Export Chat</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  );
};

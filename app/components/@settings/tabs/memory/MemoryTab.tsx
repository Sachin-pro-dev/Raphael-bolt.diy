/**
 * Memory Tab Component
 *
 * Settings tab for configuring Mem0 memory integration
 */

import { motion } from 'framer-motion';
import { MemorySettings } from '~/components/settings/MemorySettings';

export default function MemoryTab() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <MemorySettings />
    </motion.div>
  );
}

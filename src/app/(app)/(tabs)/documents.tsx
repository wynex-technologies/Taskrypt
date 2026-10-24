import { useState } from 'react';

import { Segmented } from '@/components';
import { VaultBrowser } from '@/features/documents/components/VaultBrowser';
import { KhataBook } from '@/features/khata/components/KhataBook';

type VaultTab = 'documents' | 'khata';

export default function Documents() {
  const [tab, setTab] = useState<VaultTab>('documents');
  const tabs = (
    <Segmented<VaultTab>
      accessibilityLabel="Vault section"
      value={tab}
      onChange={setTab}
      options={[
        { value: 'documents', label: 'Documents' },
        { value: 'khata', label: 'Khata Book' },
      ]}
    />
  );
  return tab === 'documents' ? <VaultBrowser folderId={null} tabs={tabs} /> : <KhataBook tabs={tabs} />;
}

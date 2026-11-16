import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useToast } from '../../components/Toast.jsx';
import { ReportDialog } from '../../components/ReportDialog.jsx';
import { ActionMenu } from '../../components/ActionMenu.jsx';
import { IconBan, IconFlag } from '../../assets/icons.jsx';

/** Meny med Rapportera och Blockera för en annan användares profil. */
export function ProfileActions({ username }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [reporting, setReporting] = useState(false);

  const block = async () => {
    if (
      !window.confirm(
        `Blockera @${username}? Ni slutar följa varandra och ser inte varandras check-ins eller kommentarer.`
      )
    )
      return;
    try {
      await api.block(username);
      toast.show(`@${username} är blockerad. Du kan häva det i Inställningar.`);
      navigate('/', { replace: true });
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <ActionMenu
        label={`Val för @${username}`}
        items={[
          { label: 'Rapportera', icon: <IconFlag size={18} aria-hidden="true" />, onSelect: () => setReporting(true) },
          { label: 'Blockera', icon: <IconBan size={18} aria-hidden="true" />, onSelect: block, danger: true }
        ]}
      />
      {reporting && <ReportDialog type="user" target={username} onClose={() => setReporting(false)} />}
    </>
  );
}

import { useEffect, useState } from 'react';
import { disablePush, enablePush, pushState } from '../../lib/push.js';
import { useToast } from '../../components/Toast.jsx';
import { Toggle } from './Toggle.jsx';

const TYPES = [
  ['like', 'Gilla på mina check-ins'],
  ['comment', 'Kommentarer'],
  ['follow', 'Nya följare'],
  ['follow_request', 'Följförfrågningar'],
  ['follow_accepted', 'Godkända förfrågningar'],
  ['badge', 'Nya märken'],
  ['overtaken', 'När en vän går om mig på topplistan'],
  ['home_visit', 'Vänner på min hemmaflygplats'],
  ['invite_accepted', 'När någon gått med via min inbjudan'],
  ['mayor_gained', 'När jag blir borgmästare på en flygplats'],
  ['mayor_lost', 'När någon tar över som borgmästare'],
  ['challenge_completed', 'När jag klarar en månadsutmaning']
];

/** Push-notiser: slå på/av på den här enheten, och vilka typer som skickas. */
export function PushSection({ settings }) {
  const toast = useToast();
  const [state, setState] = useState('...');
  useEffect(() => {
    pushState().then(setState);
  }, []);

  const toggle = async (on) => {
    try {
      setState(on ? await enablePush() : await disablePush());
    } catch (e) {
      toast.error(e);
      setState(await pushState());
    }
  };

  const push = settings.data?.push;
  return (
    <div className="stack">
      {state === 'unsupported' && (
        <p className="muted mt-0 mb-0">
          Den här webbläsaren stöder inte push-notiser. Installera appen för att få dem.
        </p>
      )}
      {state === 'denied' && (
        <p className="muted mt-0 mb-0">Notiser är blockerade för Gatelog i webbläsarens inställningar.</p>
      )}
      {(state === 'on' || state === 'off') && (
        <div className="setting-list">
          <Toggle label="Push-notiser på den här enheten" checked={state === 'on'} onChange={toggle} />
        </div>
      )}
      {push && (
        <fieldset className="fieldset-plain setting-list">
          <legend className="field__label">Skicka notis för</legend>
          {TYPES.map(([k, label]) => (
            <Toggle key={k} label={label} checked={push[k]} onChange={(v) => settings.update({ push: { [k]: v } })} />
          ))}
        </fieldset>
      )}
    </div>
  );
}

import { useFullscreen } from '../hooks/useFullscreen'
import { FullscreenEnterIcon, FullscreenExitIcon } from './icons'

/**
 * Helskärmsknappen – samma kontroll på varje sida (landningssidan, projektsidan, taggöversikten,
 * typrumsfliken, ritningsvisaren), inte bara i ritningsvisaren, så den alltid finns tillgänglig
 * oavsett var man befinner sig i appen.
 */
export function FullscreenButton({ className = 'btn-ghost btn tap-target' }: { className?: string }) {
  const { isFullscreen, toggle } = useFullscreen()
  return (
    <button type="button" className={className} onClick={toggle} aria-label={isFullscreen ? 'Avsluta helskärm' : 'Helskärm'}>
      {isFullscreen ? <FullscreenExitIcon width={20} height={20} /> : <FullscreenEnterIcon width={20} height={20} />}
    </button>
  )
}

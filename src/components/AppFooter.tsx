import { BRAND } from '../brand'

export function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="app-footer-brand">
        <strong>{BRAND.chineseName} · {BRAND.englishName}</strong>
        <span>{BRAND.tagline}</span>
      </div>
      <div className="app-footer-meta">
        <span>作者 <b>{BRAND.author}</b></span>
        <span>{`v${BRAND.version}`}</span>
        <a href={BRAND.githubUrl} target="_blank" rel="noreferrer">GitHub</a>
      </div>
    </footer>
  )
}

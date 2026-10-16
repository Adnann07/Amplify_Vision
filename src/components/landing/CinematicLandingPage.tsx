import { useEffect, useState } from 'react'
import './CinematicLandingPage.css'

const nasaImages = {
  hero: 'https://images-assets.nasa.gov/image/carina_nebula/carina_nebula~large.jpg',
  statement: 'https://images-assets.nasa.gov/image/iss071e581260_alt/iss071e581260_alt~large.jpg',
  mission: 'https://images-assets.nasa.gov/image/iss028e016227/iss028e016227~large.jpg',
  vehicle: 'https://images-assets.nasa.gov/image/iss067e359897/iss067e359897~large.jpg',
  flight: 'https://images-assets.nasa.gov/image/iss058e024106/iss058e024106~large.jpg',
  operations: 'https://images-assets.nasa.gov/image/MSFC-202100048/MSFC-202100048~large.jpg',
  finale: 'https://images-assets.nasa.gov/image/iss058e003901/iss058e003901~large.jpg',
}

function ImageBackdrop({ src, eager = false }: { src: string; eager?: boolean }) {
  return (
    <img
      className="landing-image-backdrop"
      src={src}
      alt=""
      aria-hidden="true"
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : 'auto'}
      decoding="async"
      onError={() => console.error(`NASA landing image failed to load: ${src}`)}
    />
  )
}

const sections = [
  {
    id: 'mission',
    image: nasaImages.mission,
    label: 'Mission profile',
    title: 'Every mission starts with a why',
    body: 'Choose a destination. Define the science. Set the boundaries that will shape every decision after.',
    align: 'left',
  },
  {
    id: 'vehicle',
    image: nasaImages.vehicle,
    label: 'Spacecraft systems',
    title: 'Build for the unknown',
    body: 'Balance power, propulsion, communications and payload into a spacecraft ready to go beyond the familiar.',
    align: 'right',
  },
  {
    id: 'flight',
    image: nasaImages.flight,
    label: 'Flight sequence',
    title: 'From the pad to the planets',
    body: 'A launch is only the beginning. Transfer windows, orbital mechanics and careful timing carry your design forward.',
    align: 'left',
  },
  {
    id: 'operations',
    image: nasaImages.operations,
    label: 'Mission operations',
    title: 'Listen to the spacecraft',
    body: 'Track live telemetry, resolve changing conditions and keep your mission on course from the operations console.',
    align: 'right',
  },
] as const

function useVisibleSections() {
  const [visible, setVisible] = useState<string[]>([])
  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>('[data-flight-section]')
    const observer = new IntersectionObserver((entries) => {
      setVisible((current) => {
        const next = new Set(current)
        entries.forEach((entry) => {
          const id = (entry.target as HTMLElement).dataset.flightSection
          if (id && entry.isIntersecting) next.add(id)
        })
        return [...next]
      })
    }, { rootMargin: '250px 0px', threshold: 0.22 })
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])
  return visible
}

function useScrollVars(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const root = document.documentElement
    let frame = 0
    const update = () => {
      frame = 0
      const hero = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.7)))
      root.style.setProperty('--hero-out', hero.toFixed(3))
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
      root.style.removeProperty('--hero-out')
    }
  }, [enabled])
}

export function CinematicLandingPage({ onEnter }: { onEnter: () => void }) {
  const visible = useVisibleSections()
  const [reducedMotion, setReducedMotion] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  useScrollVars(!reducedMotion)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(preference.matches)
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  return (
    <main className="cinematic-landing">
      <header className="landing-nav">
        <a className="landing-wordmark" href="#top" aria-label="Amplify Vision home">
          <span className="landing-wordmark-symbol" aria-hidden="true">A</span>
          <span>AMPLIFY<strong>VISION</strong></span>
        </a>
        <nav className={menuOpen ? 'landing-links is-open' : 'landing-links'} aria-label="Main navigation">
          <a href="#mission" onClick={() => setMenuOpen(false)}>Mission</a>
          <a href="#vehicle" onClick={() => setMenuOpen(false)}>Spacecraft</a>
          <a href="#flight" onClick={() => setMenuOpen(false)}>Flight</a>
          <a href="#operations" onClick={() => setMenuOpen(false)}>Operations</a>
          <button className="landing-nav-cta" type="button" onClick={onEnter}>
            <span>Enter simulator</span>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 7h10M8 3l4 4-4 4" />
            </svg>
          </button>
        </nav>
        <button
          className="landing-menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span /><span />
        </button>
      </header>
      <section
        className={`landing-section landing-hero${visible.includes('top') ? ' is-visible' : ''}`}
        id="top"
        data-flight-section="top"
      >
        <ImageBackdrop src={nasaImages.hero} eager />
        <div className="landing-hero-copy">
          <h1>Make space for discovery</h1>
          <p className="landing-lede">Design a spacecraft. Shape a mission. Take your place in the story of exploration.</p>
          <button className="landing-primary-cta" type="button" onClick={onEnter}>
            <span>Begin your mission</span>
          </button>
        </div>
        <div className="landing-scroll-hint" aria-hidden="true"><i /></div>
      </section>

      <section
        className={`landing-section landing-statement${visible.includes('statement') ? ' is-visible' : ''}`}
        id="statement"
        data-flight-section="statement"
      >
        <ImageBackdrop src={nasaImages.statement} />
        <p>
          Amplify Vision is a space mission engineering simulator. Design your spacecraft,
          plan the trajectory and fly the mission from launch to arrival, all from a single operations console.
        </p>
      </section>

      {sections.map((section, index) => (
        <section
          className={`landing-section landing-story landing-story-${section.align}${visible.includes(section.id) ? ' is-visible' : ''}`}
          id={section.id}
          data-flight-section={section.id}
          key={section.id}
        >
          <ImageBackdrop src={section.image} />
          <div className="landing-story-copy">
            <p className="landing-label">{section.label}</p>
            <h2>{section.title}</h2>
            <p className="landing-story-body">{section.body}</p>
          </div>
          {index === 2 && (
            <div className="landing-stage-list" aria-label="Mission stages">
              <div><span>01</span><strong>Launch</strong><i>Establish the mission</i></div>
              <div><span>02</span><strong>Transfer</strong><i>Navigate the trajectory</i></div>
              <div><span>03</span><strong>Arrival</strong><i>Deliver on the objective</i></div>
            </div>
          )}
        </section>
      ))}

      <section
        className={`landing-section landing-finale${visible.includes('finale') ? ' is-visible' : ''}`}
        id="finale"
        data-flight-section="finale"
      >
        <ImageBackdrop src={nasaImages.finale} />
        <div className="landing-finale-copy">
          <h2>Go beyond the blueprint</h2>
          <p>Take the controls. Build your spacecraft and fly a mission of your own.</p>
          <button className="landing-primary-cta" type="button" onClick={onEnter}>
            <span>Enter the simulator</span>
          </button>
        </div>
        <footer className="landing-footer">
          <span>Amplify Vision</span><span>Space mission engineering simulator</span><span>© 2026</span>
        </footer>
      </section>
    </main>
  )
}

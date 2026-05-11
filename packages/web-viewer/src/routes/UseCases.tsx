/**
 * /use-cases — categories of artifacts you could build.
 *
 * Pinned categories, not a complete list. The grid exists to fire imagination,
 * not pitch features.
 */

import { PublicHeader, PublicFooter } from '../components/PublicChrome';
import { T } from '../publicTheme';

interface UseCase { name: string; note?: string }
interface UseCaseGroup { title: string; subtitle: string; items: UseCase[] }

const USE_CASES: UseCaseGroup[] = [
  {
    title: 'Around the house',
    subtitle: 'Self-contained, no server',
    items: [
      { name: 'Wedding invitation with RSVP' },
      { name: 'Pet records that travel with the pet' },
      { name: 'Allergy or dietary card for emergencies' },
      { name: 'Genealogy and family tree' },
      { name: 'Trip itinerary that works on the plane' },
      { name: 'Recipe card with timers and scaling' },
    ],
  },
  {
    title: 'Tradies and small business',
    subtitle: 'Self-contained, with capture',
    items: [
      { name: 'Site prestart with GPS and photos' },
      { name: 'SWMS and sign-on register' },
      { name: 'Kitchen, fence, or pool quote builder' },
      { name: 'Customer warranty and care guide' },
      { name: 'Job card and installer instructions' },
      { name: 'Product manual and troubleshooting tree' },
    ],
  },
  {
    title: 'Documents that talk to a server',
    subtitle: 'Client-view — your data, anyone’s runtime',
    items: [
      { name: 'Hospital discharge package', note: 'patient owns the doc, hospital owns the record' },
      { name: 'Student report card with drill-downs' },
      { name: 'Council rates notice with payment plan' },
      { name: 'NDIS plan, shareable to any provider' },
      { name: 'Job application or interactive CV' },
      { name: 'Gift card with live balance' },
    ],
  },
  {
    title: 'Two-or-more-people things',
    subtitle: 'Paired — keys split between artifacts',
    items: [
      { name: '6-player invite-only poker', note: 'in build' },
      { name: 'Multiplayer chess, Catan, or Uno', note: 'in build' },
      { name: 'Two-party negotiation, no leak risk' },
      { name: 'Multi-sig business approval' },
      { name: 'Therapy session walkthrough' },
      { name: 'Cooking together across countries', note: 'in build' },
    ],
  },
];

export default function UseCases() {
  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.fontSans, display: 'flex', flexDirection: 'column' }}>
      <PublicHeader mode="sub" current="/use-cases" />

      <main style={{ flex: 1, padding: '48px 28px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <h1 style={{ fontFamily: T.fontSerif, fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em', margin: 0, marginBottom: 8 }}>
            What you could make
          </h1>
          <p style={{ fontSize: 15, color: T.textMuted, lineHeight: 1.55, marginTop: 0, marginBottom: 32, maxWidth: 620 }}>
            Pinned categories, not a complete list. Anything currently emailed as a PDF or built behind a login is a candidate.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}>
            {USE_CASES.map((group) => (
              <div
                key={group.title}
                style={{
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 10,
                  padding: 18,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 2 }}>
                  {group.title}
                </div>
                <div style={{ fontSize: 12, color: T.textFaint, marginBottom: 14 }}>
                  {group.subtitle}
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {group.items.map((it) => (
                    <li key={it.name} style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.45 }}>
                      {it.name}
                      {it.note && (
                        <span style={{
                          marginLeft: 6,
                          fontSize: 11,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: T.accentSoft,
                          color: T.accent,
                        }}>
                          {it.note}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

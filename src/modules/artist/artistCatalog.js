// src/modules/artist/artistCatalog.js
// ── Bundled public catalog — what the fan page shows if the database is
//    unreachable. Public facts only: no working takes, no private links.
//    Keep in step with the seed in sql/0018_artist_hub.sql.

export const FALLBACK_CATALOG = {
  jace: {
    artist: {
      slug: 'jace',
      name: 'Jace Carter',
      tagline: 'Country storyteller for the people who keep this country running.',
      bio: 'Jace Carter sings about working people, family, community and an America with room at the table for everyone. His debut single "Build It Back Home" asks a simple question: what if rebuilding America starts closer to home?',
      genre: 'Country · Country-soul',
      label: 'Melrah Entertainment',
    },
    releases: [{
      title: 'The Hands That Hold America',
      kind: 'album',
      status: 'in-production',
      release_date: null,
      summary: 'Ten original songs about work, family, love that survives lean years, grief carried with dignity, and a country big enough for every neighbor.',
      cover_url: null,
      tracks: [
        [1, 'The Hands That Hold America', 'Opening anthem'],
        [2, 'Robbing Peter to Pay Paul', 'Lead single'],
        [3, 'Steel-Toe Saturday', 'Honky-tonk weekend release'],
        [4, 'Your Porch Light', 'Love ballad'],
        [5, 'One America, One Table', 'Community anthem'],
        [6, 'Kitchen Floor Waltz', 'Romantic waltz'],
        [7, 'Before Your Time', 'Father-daughter ballad'],
        [8, 'A Flag Needs Hands', 'Patriotism through service'],
        [9, "I'd Still Choose You", 'Lasting-love ballad'],
        [10, "Tomorrow's Got My Name on It", 'Hopeful closer'],
      ].map(([track_no, title, role]) => ({ track_no, title, role, status: 'in-production', listen_url: null })),
    }],
    videos: [
      { title: 'Build It Back Home — Official Music Video (Premium Edition)', kind: 'music-video', youtube_id: 'f9Maz5WG91s', channel: 'Pragmatic Thinking' },
    ],
  },
}

/** Artist slug for a host such as jace.morpheuscr.com, or null. */
export function artistSlugForHost(hostname) {
  const sub = String(hostname ?? '').toLowerCase().split('.')[0]
  return Object.prototype.hasOwnProperty.call(FALLBACK_CATALOG, sub) ? sub : null
}

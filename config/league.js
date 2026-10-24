// Public information only. Never put credentials or OAuth tokens here.
// Keep stable IDs unchanged when renaming a team. Yahoo IDs are filled in later.
export const league = {
  name: 'The League',
  tournamentName: 'Midseason Championship',
  leagueId: '748802',
  leagueUrl: 'https://football.fantasysports.yahoo.com/f1/748802',
  season: 2026,
  quarterfinalWeek: 8,
  tiebreaker: 'points-through-week-7', // or 'commissioner'
  teams: [
    { id: 'donna', yahooTeamId: '', name: "Donna's Nice Team", logoUrl: '', color: '#b6a4ed', initials: 'DN' },
    { id: 'power', yahooTeamId: '', name: 'Power Bottoms', logoUrl: '', color: '#f0a096', initials: 'PB' },
    { id: 'tommy', yahooTeamId: '', name: 'Tommyboy', logoUrl: '', color: '#94c4ec', initials: 'TB' },
    { id: 'sassy', yahooTeamId: '', name: 'Sassy Backtalk', logoUrl: '', color: '#e6a7d1', initials: 'SB' },
    { id: 'pollo', yahooTeamId: '', name: 'El Pollo Loco', logoUrl: '', color: '#e9bf70', initials: 'PL' },
    { id: 'sledge', yahooTeamId: '', name: 'Sledgehammer', logoUrl: '', color: '#91bca2', initials: 'SH' },
    { id: 'watt', yahooTeamId: '', name: 'Turn Down For Watt', logoUrl: '', color: '#d4dc8c', initials: 'TW' },
    { id: 'panthers', yahooTeamId: '', name: 'The Sex Panthers', logoUrl: '', color: '#a8b4d1', initials: 'SP' }
  ],
  schedule: [
    { week: 7, teamA: 'pollo', teamB: 'donna' },
    { week: 7, teamA: 'sassy', teamB: 'power' },
    { week: 7, teamA: 'sledge', teamB: 'panthers' },
    { week: 7, teamA: 'tommy', teamB: 'watt' },
    { week: 8, teamA: 'pollo', teamB: 'power' },
    { week: 8, teamA: 'donna', teamB: 'panthers' },
    { week: 8, teamA: 'sassy', teamB: 'tommy' },
    { week: 8, teamA: 'sledge', teamB: 'watt' }
  ]
};

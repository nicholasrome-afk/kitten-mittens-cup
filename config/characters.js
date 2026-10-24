// Cosmetic identities keyed by the existing stable team IDs. Keeping this outside
// saved tournament state lets portraits update without resetting a locked bracket.
// Yahoo names remain in league.js / saved data and are shown in parentheses.
export const characters = {
  donna: { characterName: 'Sweet Dee', initials: 'SD', logoUrl: './assets/avatars/sweet-dee.jpg', portraitPosition: '50% 30%' },
  power: { characterName: 'Mac', initials: 'M', logoUrl: './assets/avatars/mac.jpg', portraitPosition: '50% 30%', yahooName: 'Power Bottoms', previousYahooNames: ['The Power Buns'] },
  tommy: { characterName: 'The Lawyer', initials: 'TL', logoUrl: './assets/avatars/the-lawyer.jpg', portraitCrop: { width: 383, left: -141, top: -10 } },
  pollo: { characterName: 'Rex', initials: 'R', logoUrl: './assets/avatars/rex.jpg', portraitCrop: { width: 433, left: -67, top: -17 } },
  sassy: { characterName: 'Luther', initials: 'LM', logoUrl: './assets/avatars/luther.jpg', portraitCrop: { width: 190, left: -49, top: -25 } },
  sledge: { characterName: 'Frank Reynolds', initials: 'FR', logoUrl: './assets/avatars/frank-reynolds.jpg', portraitPosition: '50% 30%' },
  watt: { characterName: 'Charlie', initials: 'C', logoUrl: './assets/avatars/charlie.jpg', portraitPosition: '50% 30%' },
  panthers: { characterName: 'D.E.N.N.I.S.', initials: 'DR', logoUrl: './assets/avatars/dennis.jpg', portraitPosition: '50% 30%' }
};

export function characterForTeam(team) {
  const profile = characters[team?.id] || {};
  const yahooName = profile.previousYahooNames?.includes(team?.name) ? profile.yahooName : team?.name;
  return { ...team, ...profile, yahooName,
    characterName: team?.characterName?.trim() || profile.characterName,
    logoUrl: team?.logoUrl?.trim() || profile.logoUrl,
    initials: team?.initials?.trim() || profile.initials
  };
}

export function displayTeamName(team) {
  if (!team) return 'To be decided';
  const profile = characterForTeam(team);
  return profile.characterName ? `${profile.characterName} (${profile.yahooName})` : team.name;
}

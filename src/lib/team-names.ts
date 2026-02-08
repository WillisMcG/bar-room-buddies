const adjectives = [
  'Fuzzy', 'Angry', 'Sneaky', 'Turbo', 'Cosmic', 'Funky', 'Spicy',
  'Wobbly', 'Electric', 'Sassy', 'Rowdy', 'Slippery', 'Rusty',
  'Mighty', 'Sketchy', 'Greasy', 'Lucky', 'Crooked', 'Dusty',
  'Wild', 'Tipsy', 'Loaded', 'Dirty', 'Reckless', 'Twisted',
  'Feisty', 'Janky', 'Busted', 'Gritty', 'Scrappy',
  'Savage', 'Chunky', 'Crusty', 'Shady', 'Wicked',
];

const nouns = [
  'Pockets', 'Scratchers', 'Rail Riders', 'Cue Tips', 'Break Artists',
  'Table Sharks', 'Corner Pockets', 'Slop Shots', 'Chalk Dusters',
  'Side Pockets', 'Bank Shots', 'Run Outs', 'Rack Attackers',
  'Felt Burners', 'Ball Bashers', 'Masse Masters', 'Kick Shots',
  'English Spinners', 'Safety Players', 'Eight Ballers',
  'Cue Sticks', 'Bridge Hands', 'Diamond Cutters', 'Bar Flies',
  'Hustlers', 'Underdogs', 'Hot Shots', 'Night Owls',
  'Last Calls', 'Long Shots', 'Sharp Shooters', 'Chalk Monsters',
];

export function generateTeamName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `The ${adj} ${noun}`;
}
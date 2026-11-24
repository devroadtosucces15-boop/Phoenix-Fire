// Every leaderboard the bot can show: one list used by the slash command's choices, the stat picker under the board, the titles and the cards.
// kind 'sql' boards come from the stored player lines, kind 'ev' boards from EA's decoded event counters.
export const BOARD_LIST = [
  { key: 'rating', label: 'Average rating', title: 'Best average rating (3+ games)' },
  { key: 'goals', label: 'Goals', title: 'Top scorers' },
  { key: 'assists', label: 'Assists', title: 'Most assists' },
  { key: 'ga', label: 'Goals + assists', title: 'Goals + assists' },
  { key: 'motm', label: 'Man of the match', title: 'Most man of the match' },
  { key: 'games', label: 'Appearances', title: 'Most appearances' },
  { key: 'shots', label: 'Shots', title: 'Most shots' },
  { key: 'saves', label: 'Saves', title: 'Most saves' },
  { key: 'tackles', label: 'Tackles won', title: 'Most tackles won' },
  { key: 'passes', label: 'Passes completed', title: 'Most passes completed' },
  { key: 'ints', label: 'Interceptions · event data', title: 'Most interceptions' },
  { key: 'won', label: 'Possession won · event data', title: 'Most possession won' },
  { key: 'aer', label: 'Aerial duels won · event data', title: 'Most aerial duels won' },
  { key: 'fwd', label: 'Forward passes · event data', title: 'Most forward passes' },
  { key: 'thru', label: 'Through passes · event data', title: 'Most through passes' },
  { key: 'drib', label: 'Dribbles completed · event data', title: 'Most dribbles completed' },
  { key: 'sot', label: 'Shots on target · event data', title: 'Most shots on target' },
];
export const BOARD_KEYS = BOARD_LIST.map((b) => b.key);
export const BOARD_TITLE = Object.fromEntries(BOARD_LIST.map((b) => [b.key, b.title]));

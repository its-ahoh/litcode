export const SPOKEN_LANGUAGES = [
  'English',
  'Chinese',
  'Japanese',
  'Korean',
  'Spanish',
] as const;

export type SpokenLanguage = (typeof SPOKEN_LANGUAGES)[number];
export type ResponseLanguage = 'auto' | SpokenLanguage;
export type VideoLanguage = 'all' | SpokenLanguage;

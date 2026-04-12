import { Note, PasswordOptions } from '../types';

export const generatePassword = (options: PasswordOptions): string => {
  const small = 'abcdefghijklmnopqrstuvwxyz';
  const capital = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+~`|}{[]:;?><,./-';
  const similar = 'O0Il1';

  const ambiguous = '{}[]()/\\\'"`~,;:.<>';

  let charset = '';
  if (options.includeSmall) charset += small;
  if (options.includeCapital) charset += capital;
  if (options.includeNumbers) charset += numbers;
  if (options.includeSpecial) charset += special;

  if (options.excludeConfusing) {
    charset = charset.split('').filter(char => !similar.includes(char) && !ambiguous.includes(char)).join('');
  }

  if (charset === '') return '';

  let password = '';
  for (let i = 0; i < options.length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

export const COLORS = [
  'bg-white dark:bg-zinc-900',
  'bg-red-100 dark:bg-red-900/30',
  'bg-orange-100 dark:bg-orange-900/30',
  'bg-yellow-100 dark:bg-yellow-900/30',
  'bg-green-100 dark:bg-green-900/30',
  'bg-teal-100 dark:bg-teal-900/30',
  'bg-blue-100 dark:bg-blue-900/30',
  'bg-purple-100 dark:bg-purple-900/30',
  'bg-pink-100 dark:bg-pink-900/30',
];

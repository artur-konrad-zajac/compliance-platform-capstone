export const generateShortId = () => {
  const consonants = 'bcdfghjklmnpqrstvwxyz';
  const vowels = 'aeiou';
  let id = '';
  for (let i = 0; i < 3; i++) {
    id += consonants[Math.floor(Math.random() * consonants.length)];
    id += vowels[Math.floor(Math.random() * vowels.length)];
  }
  return id;
};

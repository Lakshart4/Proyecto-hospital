// Contraseña inicial de un Empleado nuevo (Req. 5.12, 14.5; diseño: "aleatoria de 12 caracteres").
//
// Se genera con `crypto.randomInt` (aleatoriedad criptográfica) a partir de un alfabeto sin caracteres
// ambiguos (sin I, l, 1, O, o ni 0) y contiene al menos una mayúscula, una minúscula y un dígito.
// Con 56 símbolos y 12 posiciones hay unos 69 bits de entropía. La unicidad frente a las contraseñas
// iniciales pendientes se comprueba en el servicio contra sus hashes; esta función no guarda nada.

import { randomInt } from 'node:crypto';

export const INITIAL_PASSWORD_LENGTH = 12;

export const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const LOWERCASE = 'abcdefghijkmnpqrstuvwxyz';
export const DIGITS = '23456789';
const ALL = UPPERCASE + LOWERCASE + DIGITS;

const pick = (alphabet: string): string => alphabet[randomInt(alphabet.length)] as string;

export function generateInitialPassword(): string {
  const chars = [pick(UPPERCASE), pick(LOWERCASE), pick(DIGITS)];
  while (chars.length < INITIAL_PASSWORD_LENGTH) chars.push(pick(ALL));
  // Fisher-Yates con aleatoriedad criptográfica, para que los tres caracteres obligatorios no queden al inicio.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join('');
}

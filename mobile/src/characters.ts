import catalog from '../../shared/characters.json';
import type { CharacterId } from './characterIds';
export type { CharacterId } from './characterIds';
export { isCharacterId } from './characterIds';
export const characters = catalog as { id: CharacterId; name: string; image: string }[];
const images = {
  eric: require('../assets/characters/eric.png'),
  harvey: require('../assets/characters/harvey.png'),
  eber: require('../assets/characters/eber.png'),
};
export function characterById(id: CharacterId) {
  const metadata = characters.find(c => c.id === id)!;
  return { ...metadata, source: images[id] };
}

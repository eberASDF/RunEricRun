export type CharacterId = 'eric' | 'harvey' | 'eber';
export const isCharacterId = (id: unknown): id is CharacterId => ['eric', 'harvey', 'eber'].includes(id as string);
